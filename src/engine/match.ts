import { cardById, DECK_IDS } from "./cards";
import { deployAllowed, distEntity, ownBank, stepPosition, steerToward, type Unlock } from "./pathing";
import {
  ARENA_W,
  ELIXIR_PERIOD,
  HAND_SIZE,
  MATCH_SECONDS,
  MAX_ELIXIR,
  OVERTIME_SECONDS,
  START_ELIXIR,
  clamp,
  dist,
  type Difficulty,
  type Entity,
  type MatchConfig,
  type MatchEvent,
  type Projectile,
  type SideState,
  type Team,
} from "./types";

class Rng {
  private s: number;
  constructor(seed = Date.now() % 1e9) {
    this.s = seed >>> 0 || 1;
  }
  next(): number {
    this.s = (1664525 * this.s + 1013904223) >>> 0;
    return this.s / 0x100000000;
  }
  pick<T>(arr: T[]): T {
    return arr[Math.floor(this.next() * arr.length)]!;
  }
  shuffle<T>(arr: T[]): T[] {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(this.next() * (i + 1));
      [a[i], a[j]] = [a[j]!, a[i]!];
    }
    return a;
  }
  range(lo: number, hi: number): number {
    return lo + this.next() * (hi - lo);
  }
}

function towerTemplate(
  id: number,
  team: Team,
  slot: "king" | "left" | "right",
): Entity {
  const south = team === 0;
  const isKing = slot === "king";
  const x = slot === "left" ? 3.55 : slot === "right" ? 14.45 : 9;
  const y = south ? (isKing ? 29.15 : 25.05) : isKing ? 2.85 : 6.95;
  const hp = isKing ? 4200 : 2480;
  return {
    id,
    team,
    kind: "tower",
    cardId: null,
    name: isKing ? "Crownspire" : slot === "left" ? "West Lantern" : "East Lantern",
    x,
    y,
    hp,
    maxHp: hp,
    radius: isKing ? 1.35 : 1.05,
    flying: false,
    speed: 0,
    range: isKing ? 7.0 : 7.6,
    damage: isKing ? 98 : 92,
    hitSpeed: isKing ? 1.0 : 0.8,
    splash: 0.35,
    sight: isKing ? 7.2 : 7.8,
    attackCd: 0.4,
    targetId: null,
    frozenUntil: 0,
    deployUntil: 0,
    lifetime: 0,
    age: 0,
    facing: south ? -Math.PI / 2 : Math.PI / 2,
    bob: 0,
    towerSlot: slot,
    active: !isKing,
    dying: 0,
    color: isKing ? "#f4d27a" : "#d7ecff",
  };
}

function makeSide(team: Team, rng: Rng): SideState {
  const shuffled = rng.shuffle(DECK_IDS);
  const hand = shuffled.slice(0, HAND_SIZE);
  const queue = shuffled.slice(HAND_SIZE);
  return {
    team,
    elixir: START_ELIXIR,
    hand,
    queue,
    crowns: 0,
    nextCard: queue[0]!,
  };
}

export class Match {
  readonly difficulty: Difficulty;
  readonly rng: Rng;
  timeLeft = MATCH_SECONDS;
  overtimeLeft = 0;
  overtime = false;
  elapsed = 0;
  ended = false;
  winner: "player" | "bot" | "draw" | null = null;
  entities: Entity[] = [];
  projectiles: Projectile[] = [];
  events: MatchEvent[] = [];
  player: SideState;
  bot: SideState;
  now = 0;
  nextId = 1;
  announcedDouble = false;
  announcedTriple = false;
  private acc = 0;
  private botDelay = 0;
  private botIntent: { index: number; x: number; y: number; at: number } | null = null;
  private botLane: 0 | 1 = 0;
  private botEvalAt = 0;

  constructor(cfg: MatchConfig) {
    this.difficulty = cfg.difficulty;
    this.rng = new Rng(cfg.seed);
    this.player = makeSide(0, this.rng);
    this.bot = makeSide(1, this.rng);
    const towers: Entity[] = [];
    for (const team of [0, 1] as Team[]) {
      for (const slot of ["king", "left", "right"] as const) {
        towers.push(towerTemplate(this.nextId++, team, slot));
      }
    }
    this.entities.push(...towers);
    this.botLane = this.rng.next() < 0.5 ? 0 : 1;
    this.botDelay = this.difficulty === "easy" ? 1.4 : 0.7;
  }

  side(team: Team): SideState {
    return team === 0 ? this.player : this.bot;
  }

  elixirRate(): number {
    if (this.overtime) return 3 / ELIXIR_PERIOD;
    if (this.timeLeft <= 60) return 2 / ELIXIR_PERIOD;
    return 1 / ELIXIR_PERIOD;
  }

  elixirTier(): "single" | "double" | "triple" {
    if (this.overtime) return "triple";
    if (this.timeLeft <= 60) return "double";
    return "single";
  }

  unlocksFor(team: Team): Unlock {
    const enemy = team === 0 ? 1 : 0;
    return {
      left: !this.aliveTower(enemy, "left"),
      right: !this.aliveTower(enemy, "right"),
    };
  }

  aliveTower(team: Team, slot: "king" | "left" | "right"): Entity | null {
    return (
      this.entities.find(
        (e) => e.kind === "tower" && e.team === team && e.towerSlot === slot && e.hp > 0 && e.dying <= 0,
      ) ?? null
    );
  }

  living(): Entity[] {
    return this.entities.filter((e) => e.hp > 0 && e.dying <= 0);
  }

  emit(ev: MatchEvent): void {
    this.events.push(ev);
  }

  drainEvents(): MatchEvent[] {
    const e = this.events;
    this.events = [];
    return e;
  }

  update(dt: number): void {
    if (this.ended) return;
    this.acc += Math.min(dt, 0.12);
    const step = 1 / 30;
    while (this.acc >= step && !this.ended) {
      this.tick(step);
      this.acc -= step;
    }
  }

  private tick(dt: number): void {
    this.now += dt;
    this.elapsed += dt;
    this.advanceClock(dt);
    this.regenElixir(dt);
    this.thinkBot(dt);
    this.updateEntities(dt);
    this.updateProjectiles(dt);
    this.separate();
    this.reap();
    this.refreshCrowns();
    this.checkEnd();
  }

  private advanceClock(dt: number): void {
    if (this.overtime) {
      this.overtimeLeft = Math.max(0, this.overtimeLeft - dt);
      if (!this.announcedTriple) {
        this.announcedTriple = true;
        this.emit({ type: "triple" });
      }
      return;
    }
    this.timeLeft = Math.max(0, this.timeLeft - dt);
    if (this.timeLeft <= 60 && !this.announcedDouble) {
      this.announcedDouble = true;
      this.emit({ type: "double" });
    }
  }

  private regenElixir(dt: number): void {
    const rate = this.elixirRate() * dt;
    for (const side of [this.player, this.bot]) {
      const was = side.elixir;
      side.elixir = Math.min(MAX_ELIXIR, side.elixir + rate);
      if (was < MAX_ELIXIR - 0.02 && side.elixir >= MAX_ELIXIR) {
        this.emit({ type: "elixir-max", team: side.team });
      }
    }
  }

  tryPlay(team: Team, handIndex: number, x: number, y: number): boolean {
    if (this.ended) return false;
    const side = this.side(team);
    const id = side.hand[handIndex];
    if (!id) return false;
    const card = cardById(id);
    if (side.elixir < card.cost - 0.001) return false;
    if (!deployAllowed(team, id, x, y, this.unlocksFor(team))) return false;

    side.elixir -= card.cost;
    const played = side.hand[handIndex]!;
    side.queue.push(played);
    const next = side.queue.shift()!;
    side.hand[handIndex] = next;
    side.nextCard = side.queue[0]!;

    this.emit({ type: "play", team, name: card.name });
    this.spawnCard(team, id, x, y);
    return true;
  }

  spawnCard(team: Team, cardId: string, x: number, y: number): void {
    const card = cardById(cardId);
    if (card.kind === "spell") {
      this.spawnSpell(team, cardId, x, y);
      return;
    }
    const count = Math.max(1, card.count);
    const spread = count > 1 ? 0.55 : 0;
    for (let i = 0; i < count; i++) {
      const ang = (Math.PI * 2 * i) / count + (team === 0 ? 0.2 : 1.1);
      const sx = x + Math.cos(ang) * spread;
      const sy = y + Math.sin(ang) * spread * 0.7;
      this.entities.push(this.makeUnit(team, cardId, sx, sy));
    }
    this.emit({ type: "spawn", x, y, team, cardId });
  }

  private makeUnit(team: Team, cardId: string, x: number, y: number): Entity {
    const card = cardById(cardId);
    const pos = { x, y };
    return {
      id: this.nextId++,
      team,
      kind: card.kind === "building" ? "building" : "troop",
      cardId,
      name: card.name,
      x: pos.x,
      y: pos.y,
      hp: card.hp,
      maxHp: card.hp,
      radius: card.radius,
      flying: card.flying,
      speed: card.speed,
      range: card.range,
      damage: card.damage,
      hitSpeed: card.hitSpeed,
      splash: card.splash,
      sight: card.sight,
      attackCd: 0.12,
      targetId: null,
      frozenUntil: 0,
      deployUntil: this.now + card.deployTime,
      lifetime: card.lifetime,
      age: 0,
      facing: team === 0 ? -Math.PI / 2 : Math.PI / 2,
      bob: this.rng.range(0, Math.PI * 2),
      towerSlot: null,
      active: true,
      dying: 0,
      color: card.color,
    };
  }

  private spawnSpell(team: Team, cardId: string, x: number, y: number): void {
    const card = cardById(cardId);
    this.entities.push({
      id: this.nextId++,
      team,
      kind: "spell",
      cardId,
      name: card.name,
      x,
      y,
      hp: 1,
      maxHp: 1,
      radius: card.spellRadius,
      flying: true,
      speed: 0,
      range: 0,
      damage: card.damage,
      hitSpeed: 0,
      splash: card.spellRadius,
      sight: 0,
      attackCd: card.spellDelay,
      targetId: null,
      frozenUntil: 0,
      deployUntil: 0,
      lifetime: card.spellDelay + 0.05,
      age: 0,
      facing: 0,
      bob: 0,
      towerSlot: null,
      active: true,
      dying: 0,
      color: card.color,
    });
    this.emit({ type: "spell", x, y, cardId });
  }

  private updateEntities(dt: number): void {
    for (const e of this.entities) {
      if (e.hp <= 0 && e.dying > 0) {
        e.dying -= dt;
        continue;
      }
      if (e.hp <= 0) continue;
      e.age += dt;
      e.bob += dt * (e.kind === "troop" ? 8 : 3);
      if (e.kind === "spell") {
        this.tickSpell(e, dt);
        continue;
      }
      if (e.lifetime > 0 && e.kind === "building") {
        e.lifetime -= dt;
        if (e.lifetime <= 0) {
          this.kill(e);
          continue;
        }
      }
      if (this.now < e.deployUntil) continue;
      if (this.now < e.frozenUntil) continue;
      if (e.kind === "tower" && !e.active) continue;

      const target = this.acquire(e);
      if (!target) continue;
      const gap = distEntity(e, target);
      const inRange = gap <= e.range + target.radius * 0.55;
      e.facing = Math.atan2(target.y - e.y, target.x - e.x);

      if (inRange) {
        e.attackCd -= dt;
        if (e.attackCd <= 0) {
          e.attackCd = e.hitSpeed;
          this.performAttack(e, target);
        }
      } else if (e.speed > 0) {
        const aim = steerToward(e, target.x, target.y);
        const d = dist(e.x, e.y, aim.x, aim.y) || 1;
        const sp = e.speed * dt;
        const nx = e.x + ((aim.x - e.x) / d) * sp;
        const ny = e.y + ((aim.y - e.y) / d) * sp;
        const stepped = stepPosition(e, nx, ny);
        e.x = stepped.x;
        e.y = stepped.y;
        e.facing = Math.atan2(aim.y - e.y, aim.x - e.x);
      }
    }
  }

  private tickSpell(e: Entity, dt: number): void {
    e.attackCd -= dt;
    if (e.attackCd > 0) return;
    const card = cardById(e.cardId!);
    const ratio = card.towerDamageRatio;
    for (const t of this.living()) {
      if (t.team === e.team) continue;
      if (t.kind === "spell") continue;
      if (dist(e.x, e.y, t.x, t.y) <= card.spellRadius + t.radius * 0.4) {
        const dmg = t.kind === "tower" ? card.damage * ratio : card.damage;
        this.hurt(t, dmg, true);
        if (card.freezeDuration > 0 && t.kind !== "tower") {
          t.frozenUntil = Math.max(t.frozenUntil, this.now + card.freezeDuration);
        }
      }
    }
    if (card.freezeDuration > 0) {
      this.emit({ type: "freeze", x: e.x, y: e.y, radius: card.spellRadius });
    }
    e.hp = 0;
    e.dying = 0.05;
  }

  private acquire(e: Entity): Entity | null {
    if (e.targetId != null) {
      const cur = this.entities.find((o) => o.id === e.targetId && o.hp > 0 && o.dying <= 0);
      if (cur && distEntity(e, cur) <= e.sight + 1.8) return cur;
    }
    let best: Entity | null = null;
    let bestD = Infinity;
    for (const o of this.entities) {
      if (o.team === e.team || o.hp <= 0 || o.dying > 0) continue;
      if (o.kind === "spell") continue;
      if (o.kind === "tower" && !o.active) continue;
      const d = distEntity(e, o);
      const troop = o.kind === "troop" || o.kind === "building";
      if (troop && d <= e.sight + o.radius) {
        if (d < bestD) {
          bestD = d;
          best = o;
        }
      }
    }
    if (best) {
      e.targetId = best.id;
      return best;
    }
    let tower: Entity | null = null;
    let td = Infinity;
    for (const o of this.entities) {
      if (o.kind !== "tower" || o.team === e.team || o.hp <= 0) continue;
      if (!o.active && o.towerSlot === "king") {
        const princessDown = !this.aliveTower(o.team, "left") || !this.aliveTower(o.team, "right");
        if (!princessDown) continue;
      }
      const d = distEntity(e, o);
      if (d < td) {
        td = d;
        tower = o;
      }
    }
    e.targetId = tower?.id ?? null;
    return tower;
  }

  private performAttack(e: Entity, target: Entity): void {
    const melee = e.range < 1.15;
    if (melee) {
      this.impact(e.team, target.x, target.y, e.damage, e.splash, target.id);
    } else {
      this.projectiles.push({
        id: this.nextId++,
        team: e.team,
        x: e.x + Math.cos(e.facing) * e.radius * 0.8,
        y: e.y + Math.sin(e.facing) * e.radius * 0.8,
        targetId: target.id,
        speed: e.kind === "tower" ? 11 : e.splash > 0 ? 6.5 : 9.5,
        damage: e.damage,
        splash: e.splash,
        color: e.kind === "tower" ? "#fff1a8" : e.color,
        homing: true,
        tx: target.x,
        ty: target.y,
        radius: e.splash > 0 ? 0.22 : 0.14,
      });
    }
  }

  private updateProjectiles(dt: number): void {
    const keep: Projectile[] = [];
    for (const p of this.projectiles) {
      const t = this.entities.find((e) => e.id === p.targetId && e.hp > 0);
      if (t && p.homing) {
        p.tx = t.x;
        p.ty = t.y;
      }
      const d = dist(p.x, p.y, p.tx, p.ty);
      const step = p.speed * dt;
      if (d <= step + 0.12) {
        this.impact(p.team, p.tx, p.ty, p.damage, p.splash, p.targetId);
        continue;
      }
      p.x += ((p.tx - p.x) / d) * step;
      p.y += ((p.ty - p.y) / d) * step;
      keep.push(p);
    }
    this.projectiles = keep;
  }

  private impact(
    team: Team,
    x: number,
    y: number,
    damage: number,
    splash: number,
    primaryId: number,
  ): void {
    if (splash > 0.05) {
      for (const e of this.living()) {
        if (e.team === team || e.kind === "spell") continue;
        const d = dist(x, y, e.x, e.y);
        if (d <= splash + e.radius * 0.5) {
          const fall = clamp(1 - (d / (splash + 0.01)) * 0.35, 0.65, 1);
          this.hurt(e, damage * fall, false);
        }
      }
    } else {
      const t = this.entities.find((e) => e.id === primaryId && e.hp > 0);
      if (t && t.team !== team) this.hurt(t, damage, false);
    }
  }

  private hurt(e: Entity, amount: number, spell: boolean): void {
    if (e.hp <= 0) return;
    const dmg = Math.max(1, Math.round(amount));
    e.hp -= dmg;
    this.emit({ type: "hit", x: e.x, y: e.y - e.radius, amount: dmg, crit: spell });
    if (e.kind === "tower") {
      this.emit({ type: "tower-hit", team: e.team });
      if (e.towerSlot === "king" && !e.active) {
        e.active = true;
        this.emit({ type: "king-awake", team: e.team });
      }
    }
    if (e.hp <= 0) this.kill(e);
  }

  private kill(e: Entity): void {
    if (e.dying > 0 || e.hp < -999) return;
    e.hp = 0;
    e.dying = e.kind === "tower" ? 0.9 : 0.28;
    this.emit({ type: "death", x: e.x, y: e.y, team: e.team, flying: e.flying });
    if (e.kind === "tower") {
      const attacker = (e.team === 0 ? 1 : 0) as Team;
      const side = this.side(attacker);
      if (e.towerSlot === "king") {
        side.crowns = 3;
      } else {
        side.crowns = Math.min(3, side.crowns + 1);
        const king = this.aliveTower(e.team, "king");
        if (king && !king.active) {
          king.active = true;
          this.emit({ type: "king-awake", team: e.team });
        }
      }
    }
  }

  private separate(): void {
    const troops = this.entities.filter(
      (e) => e.kind === "troop" && e.hp > 0 && e.dying <= 0 && this.now >= e.deployUntil,
    );
    for (let i = 0; i < troops.length; i++) {
      const a = troops[i]!;
      for (let j = i + 1; j < troops.length; j++) {
        const b = troops[j]!;
        if (a.flying !== b.flying) continue;
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const d = Math.hypot(dx, dy) || 0.0001;
        const min = a.radius + b.radius + 0.08;
        if (d < min) {
          const push = ((min - d) / 2) * 0.55;
          const nx = dx / d;
          const ny = dy / d;
          a.x -= nx * push;
          a.y -= ny * push;
          b.x += nx * push;
          b.y += ny * push;
        }
      }
    }
  }

  private reap(): void {
    this.entities = this.entities.filter((e) => !(e.hp <= 0 && e.dying <= 0));
  }

  private refreshCrowns(): void {
    for (const team of [0, 1] as Team[]) {
      const other = (team === 0 ? 1 : 0) as Team;
      let c = 0;
      if (!this.aliveTower(other, "left")) c++;
      if (!this.aliveTower(other, "right")) c++;
      if (!this.aliveTower(other, "king")) c = 3;
      this.side(team).crowns = c;
    }
  }

  private checkEnd(): void {
    const pKing = this.aliveTower(0, "king");
    const bKing = this.aliveTower(1, "king");
    if (!pKing || !bKing) {
      this.finish(!pKing && !bKing ? "draw" : pKing ? "player" : "bot");
      return;
    }
    if (!this.overtime && this.timeLeft <= 0) {
      if (this.player.crowns === this.bot.crowns) {
        this.overtime = true;
        this.overtimeLeft = OVERTIME_SECONDS;
        this.emit({ type: "overtime" });
        return;
      }
      this.finish(this.player.crowns > this.bot.crowns ? "player" : "bot");
      return;
    }
    if (this.overtime && this.overtimeLeft <= 0) {
      if (this.player.crowns !== this.bot.crowns) {
        this.finish(this.player.crowns > this.bot.crowns ? "player" : "bot");
        return;
      }
      const php = this.towerHp(0);
      const bhp = this.towerHp(1);
      if (Math.abs(php - bhp) < 8) this.finish("draw");
      else this.finish(php > bhp ? "player" : "bot");
    }
  }

  towerHp(team: Team): number {
    return this.entities
      .filter((e) => e.kind === "tower" && e.team === team && e.hp > 0)
      .reduce((s, e) => s + e.hp, 0);
  }

  private finish(winner: "player" | "bot" | "draw"): void {
    this.ended = true;
    this.winner = winner;
    this.emit({ type: "end", winner });
  }

  legalPlay(team: Team, cardId: string, x: number, y: number): boolean {
    return deployAllowed(team, cardId, x, y, this.unlocksFor(team));
  }

  private thinkBot(dt: number): void {
    this.botDelay = Math.max(0, this.botDelay - dt);
    if (this.botDelay > 0) return;
    const now = this.now;
    if (this.botIntent && now >= this.botIntent.at) {
      const ok = this.tryPlay(1, this.botIntent.index, this.botIntent.x, this.botIntent.y);
      this.botIntent = null;
      if (!ok) this.botEvalAt = 0;
    }
    const interval = this.difficulty === "easy" ? 0.48 : 0.22;
    if (now < this.botEvalAt) return;
    this.botEvalAt = now + interval;
    if (this.botIntent) return;
    const intent = this.chooseBotPlay() ?? this.spendFallback();
    if (!intent) return;
    const react = this.difficulty === "easy" ? this.rng.range(0.55, 1.15) : this.rng.range(0.18, 0.42);
    this.botIntent = { ...intent, at: now + react };
  }

  private chooseBotPlay(): { index: number; x: number; y: number } | null {
    const side = this.bot;
    const easy = this.difficulty === "easy";
    if (easy && this.rng.next() < 0.12) return null;

    type Cand = { index: number; x: number; y: number; score: number };
    const cands: Cand[] = [];
    const threats = this.living().filter((e) => e.team === 0 && e.kind !== "tower" && e.kind !== "spell");
    const ours = this.living().filter((e) => e.team === 1 && e.kind !== "tower" && e.kind !== "spell");

    const threatScore = (t: Entity): number => {
      const lantern = this.closestFriendlyTower(1, t.x, t.y);
      const prox = lantern ? 1 / (0.6 + distEntity(t, lantern)) : 0.05;
      const dps = t.damage / Math.max(0.4, t.hitSpeed);
      const tank = t.maxHp / 400;
      return (dps * 1.2 + tank * 8 + (t.kind === "building" ? 6 : 0)) * prox * 18;
    };

    for (let i = 0; i < HAND_SIZE; i++) {
      const id = side.hand[i]!;
      const card = cardById(id);
      if (side.elixir < card.cost) continue;

      if (card.kind === "spell") {
        const spot = this.bestSpellSpot(id);
        if (spot && spot.score > 28) {
          cands.push({ index: i, x: spot.x, y: spot.y, score: spot.score - card.cost * 4 });
        }
        continue;
      }

      for (const t of threats) {
        const ts = threatScore(t);
        if (ts < 6) continue;
        const counter = this.counterWeight(id, t);
        if (counter <= 0) continue;
        const place = this.defendPlace(id, t);
        if (!place) continue;
        cands.push({
          index: i,
          x: place.x,
          y: place.y,
          score: ts * counter - card.cost * 5 + (ownBank(0) === "south" && t.y < 16 ? 8 : 0),
        });
      }

      const tank = ours.find((u) => u.cardId === "ironhide" || u.maxHp > 900);
      if (tank && (card.role.includes("ranged") || card.role.includes("splash") || card.id === "ashblade")) {
        const behind = clamp(tank.y - 1.6, 1.6, 14.8);
        const x = clamp(tank.x + this.rng.range(-0.4, 0.4), 1.2, ARENA_W - 1.2);
        if (this.legalPlay(1, id, x, behind)) {
          cands.push({ index: i, x, y: behind, score: 36 + side.elixir * 2 - card.cost });
        }
      }

      const pushNeed = threats.filter((t) => t.y < RIVER_LIKE).length === 0 || side.elixir >= (easy ? 8.2 : 6.4);
      if (pushNeed && (card.kind === "troop" || card.kind === "building")) {
        const place = this.pushPlace(id);
        if (place) {
          const pref =
            card.id === "ironhide" ? 28 : card.id === "boltbow" || card.id === "cinderpot" ? 16 : card.id === "ashblade" ? 14 : card.id === "sparklets" ? 11 : 9;
          cands.push({
            index: i,
            ...place,
            score: pref + side.elixir * 3 - card.cost * 3 + (side.elixir >= 9 ? 18 : 0),
          });
        }
      }

      if (side.elixir >= 9.15) {
        const place = this.pushPlace(id) ?? this.cyclePlace(id);
        if (place) cands.push({ index: i, ...place, score: 25 - card.cost * 2 });
      }
    }

    cands.sort((a, b) => b.score - a.score);
    const best = cands[0];
    if (!best || best.score < (easy ? 12 : 8)) return null;
    if (easy && this.rng.next() < 0.22) {
      const ox = best.x;
      const oy = best.y;
      best.x = clamp(best.x + this.rng.range(-1.4, 1.4), 1, ARENA_W - 1);
      best.y = clamp(best.y + this.rng.range(-1.0, 1.0), 1.4, 15.0);
      if (!this.legalPlay(1, side.hand[best.index]!, best.x, best.y)) {
        best.x = ox;
        best.y = oy;
      }
    }
    return { index: best.index, x: best.x, y: best.y };
  }

  private spendFallback(): { index: number; x: number; y: number } | null {
    if (this.bot.elixir < 6.4) return null;
    let bestI = -1;
    let bestCost = 99;
    for (let i = 0; i < HAND_SIZE; i++) {
      const id = this.bot.hand[i]!;
      const card = cardById(id);
      if (card.kind === "spell") continue;
      if (this.bot.elixir >= card.cost && card.cost < bestCost) {
        bestCost = card.cost;
        bestI = i;
      }
    }
    if (bestI < 0) return null;
    const id = this.bot.hand[bestI]!;
    const place = this.pushPlace(id) ?? this.cyclePlace(id);
    return place ? { index: bestI, ...place } : null;
  }

  private closestFriendlyTower(team: Team, x: number, y: number): Entity | null {
    let best: Entity | null = null;
    let d = Infinity;
    for (const t of this.entities) {
      if (t.kind !== "tower" || t.team !== team || t.hp <= 0) continue;
      const dd = dist(t.x, t.y, x, y);
      if (dd < d) {
        d = dd;
        best = t;
      }
    }
    return best;
  }

  private counterWeight(cardId: string, threat: Entity): number {
    const c = cardById(cardId);
    const swarm = (threat.cardId === "sparklets" || threat.radius < 0.32) && threat.kind === "troop";
    const tanky = threat.maxHp >= 900;
    if (c.id === "cinderpot" || c.id === "riftburst") return swarm ? 2.4 : tanky ? 0.7 : 1.2;
    if (c.id === "sparklets") return tanky ? 2.1 : swarm ? 0.4 : 1.0;
    if (c.id === "wardspire") return tanky ? 2.3 : 1.3;
    if (c.id === "ashblade") return threat.range > 2 ? 1.8 : 1.1;
    if (c.id === "frostbind") return tanky || threat.kind === "building" ? 1.6 : 0.9;
    if (c.id === "ironhide") return 0.7;
    if (c.id === "boltbow") return swarm ? 0.5 : 1.15;
    return 1;
  }

  private defendPlace(cardId: string, threat: Entity): { x: number; y: number } | null {
    const card = cardById(cardId);
    const tower = this.closestFriendlyTower(1, threat.x, threat.y);
    const tx = tower ? tower.x * 0.35 + threat.x * 0.65 : threat.x;
    const ty = tower ? tower.y * 0.45 + threat.y * 0.55 : threat.y + 1.2;
    let x = tx;
    let y = ty;
    if (card.kind === "building") {
      x = clamp(threat.x + (threat.x < 9 ? 1.1 : -1.1), 2.2, ARENA_W - 2.2);
      y = clamp(Math.min(threat.y, 12.5) + 1.8, 4.2, 14.6);
    } else if (card.range > 2) {
      y = clamp(Math.min(threat.y - 1.8, 13.2), 2.4, 14.7);
      x = clamp(threat.x, 1.3, ARENA_W - 1.3);
    } else {
      x = clamp(threat.x + this.rng.range(-0.5, 0.5), 1.2, ARENA_W - 1.2);
      y = clamp(threat.y - 0.4, 1.8, 14.8);
    }
    y = Math.min(y, 14.9);
    if (!this.legalPlay(1, cardId, x, y)) {
      x = clamp(threat.x, 2, 16);
      y = 12.2;
    }
    if (!this.legalPlay(1, cardId, x, y)) return null;
    return { x, y };
  }

  private pushPlace(cardId: string): { x: number; y: number } | null {
    const left = this.aliveTower(0, "left");
    const right = this.aliveTower(0, "right");
    if (this.rng.next() < 0.12) this.botLane = this.botLane === 0 ? 1 : 0;
    if (!left) this.botLane = 0;
    else if (!right) this.botLane = 1;
    const laneX = this.botLane === 0 ? 4.1 : 13.9;
    const card = cardById(cardId);
    let y = card.id === "ironhide" || card.kind === "building" ? 13.4 : 11.6;
    if (card.kind === "building") y = 10.2;
    const x = laneX + this.rng.range(-0.5, 0.5);
    if (this.legalPlay(1, cardId, x, y)) return { x, y };
    if (this.legalPlay(1, cardId, laneX, 11.5)) return { x: laneX, y: 11.5 };
    return null;
  }

  private cyclePlace(cardId: string): { x: number; y: number } | null {
    const x = this.botLane === 0 ? 4.3 : 13.7;
    const y = 11.8;
    if (this.legalPlay(1, cardId, x, y)) return { x, y };
    return this.legalPlay(1, cardId, 9, 12) ? { x: 9, y: 12 } : null;
  }

  private bestSpellSpot(cardId: string): { x: number; y: number; score: number } | null {
    const card = cardById(cardId);
    const enemies = this.living().filter((e) => e.team === 0 && e.kind !== "spell");
    if (enemies.length === 0) return null;
    let best: { x: number; y: number; score: number } | null = null;
    for (const e of enemies) {
      let score = 0;
      for (const o of enemies) {
        if (dist(e.x, e.y, o.x, o.y) <= card.spellRadius + o.radius) {
          score += o.kind === "tower" ? 10 : o.maxHp > 900 ? 16 : o.radius < 0.33 ? 9 : 12;
          if (o.kind !== "tower" && o.y > 15) score += 6;
        }
      }
      if (card.id === "frostbind" && e.maxHp > 800) score += 10;
      if (!best || score > best.score) best = { x: e.x, y: e.y, score };
    }
    return best;
  }
}

const RIVER_LIKE = 16.2;
