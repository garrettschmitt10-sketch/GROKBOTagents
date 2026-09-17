import { cardById } from "./engine/cards";
import { Match } from "./engine/match";
import { snapDeploy } from "./engine/pathing";
import {
  ARENA_H,
  ARENA_W,
  MAX_ELIXIR,
  clamp,
  type Difficulty,
  type FloatingText,
  type MatchEvent,
  type Particle,
} from "./engine/types";
import { Sfx } from "./view/audio";
import {
  drawArena,
  drawCardArt,
  layoutCam,
  screenToWorld,
  worldToScreen,
  type ViewCam,
} from "./view/draw";

const canvas = document.querySelector<HTMLCanvasElement>("#arena")!;
const ctx = canvas.getContext("2d")!;
const sfx = new Sfx();

const menuEl = document.querySelector("#menu")!;
const howtoEl = document.querySelector("#howto")!;
const endEl = document.querySelector("#end")!;
const handEl = document.querySelector("#hand")!;
const elixirFill = document.querySelector<HTMLElement>("#elixir-fill")!;
const elixirCount = document.querySelector("#elixir-count")!;
const elixirPips = document.querySelector("#elixir-pips")!;
const timerEl = document.querySelector("#timer")!;
const modeChip = document.querySelector("#mode-chip")!;
const nextArt = document.querySelector<HTMLCanvasElement>("#next-art")!;
const toastsEl = document.querySelector("#toasts")!;
const startBtn = document.querySelector("#start-btn")!;
const howtoBtn = document.querySelector("#howto-btn")!;
const howtoClose = document.querySelector("#howto-close")!;
const rematchBtn = document.querySelector("#rematch-btn")!;
const menuBtn = document.querySelector("#menu-btn")!;
const endTitle = document.querySelector("#end-title")!;
const endSub = document.querySelector("#end-sub")!;
const endScore = document.querySelector("#end-score")!;
const endEyebrow = document.querySelector("#end-eyebrow")!;

elixirPips.innerHTML = Array.from({ length: 10 }, () => "<span></span>").join("");

let difficulty: Difficulty = "normal";
let match: Match | null = null;
let selected = -1;
let dragFromHand = false;
let pointerWorld: { x: number; y: number } | null = null;
let cam: ViewCam = { x: 0, y: 0, s: 1 };
let particles: Particle[] = [];
let floaters: FloatingText[] = [];
let last = performance.now();
let playing = false;
let shake = 0;
let doubleAnnounced = false;
let idlePreview: Match | null = null;
let dragOrigin = { x: 0, y: 0 };
let towerSfxAt = 0;
let lastNextCard = "";
let lastHudKey = "";
let lastCanvasW = 0;
let lastCanvasH = 0;
let lastDpr = 0;
let denyAt = 0;

document.querySelectorAll<HTMLButtonElement>(".diff-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    sfx.unlock();
    sfx.click();
    difficulty = btn.dataset.diff === "easy" ? "easy" : "normal";
    document.querySelectorAll(".diff-btn").forEach((b) => b.classList.toggle("active", b === btn));
  });
});

startBtn.addEventListener("click", () => {
  sfx.unlock();
  sfx.click();
  beginMatch();
});
howtoBtn.addEventListener("click", () => {
  sfx.unlock();
  sfx.click();
  howtoEl.classList.remove("hidden");
});
howtoClose.addEventListener("click", () => {
  sfx.click();
  howtoEl.classList.add("hidden");
});
rematchBtn.addEventListener("click", () => {
  sfx.click();
  beginMatch();
});
menuBtn.addEventListener("click", () => {
  sfx.click();
  playing = false;
  match = null;
  endEl.classList.add("hidden");
  menuEl.classList.remove("hidden");
});

function beginMatch(): void {
  match = new Match({ difficulty });
  selected = -1;
  dragFromHand = false;
  particles = [];
  floaters = [];
  playing = true;
  doubleAnnounced = false;
  lastNextCard = "";
  lastHudKey = "";
  menuEl.classList.add("hidden");
  howtoEl.classList.add("hidden");
  endEl.classList.add("hidden");
  renderHand(true);
  toast(difficulty === "easy" ? "Dustfront holds the far bank." : "Dustfront takes the crossing.");
}

function paintCard(btn: HTMLButtonElement, id: string, index: number): void {
  const card = cardById(id);
  btn.dataset.index = String(index);
  btn.dataset.card = id;
  btn.className = `card ${card.rarity}`;
  const nameEl = btn.querySelector(".name");
  const roleEl = btn.querySelector(".role");
  const costEl = btn.querySelector(".cost");
  if (nameEl) nameEl.textContent = card.name;
  if (roleEl) roleEl.textContent = card.subtitle;
  if (costEl) costEl.textContent = String(card.cost);
  const cnv = btn.querySelector("canvas");
  if (cnv) drawCardArt(cnv.getContext("2d")!, id, cnv.width, cnv.height);
}

function renderHand(force = false): void {
  if (!match) return;
  const ids = match.player.hand;
  const existing = [...handEl.querySelectorAll<HTMLButtonElement>(".card")];
  if (!force && existing.length === ids.length) {
    ids.forEach((id, i) => {
      const btn = existing[i];
      if (!btn) return;
      if (btn.dataset.card !== id) paintCard(btn, id, i);
      else btn.dataset.index = String(i);
    });
    refreshHandState();
    paintNext();
    return;
  }
  handEl.innerHTML = "";
  ids.forEach((id, i) => {
    const card = cardById(id);
    const btn = document.createElement("button");
    btn.type = "button";
    btn.innerHTML = `<canvas width="160" height="110"></canvas>
      <div class="cost">${card.cost}</div>
      <div class="meta"><div class="name">${card.name}</div><div class="role">${card.subtitle}</div></div>`;
    paintCard(btn, id, i);
    btn.addEventListener("pointerdown", (ev) => onCardDown(ev, i));
    handEl.appendChild(btn);
  });
  refreshHandState();
  paintNext();
}

function paintNext(): void {
  if (!match) return;
  if (match.player.nextCard === lastNextCard) return;
  lastNextCard = match.player.nextCard;
  const nextCtx = nextArt.getContext("2d");
  if (nextCtx) drawCardArt(nextCtx, lastNextCard, nextArt.width, nextArt.height);
}

function refreshHandState(): void {
  if (!match) return;
  handEl.querySelectorAll<HTMLButtonElement>(".card").forEach((btn) => {
    const i = Number(btn.dataset.index);
    const id = match!.player.hand[i];
    if (!id) return;
    const card = cardById(id);
    btn.classList.toggle("selected", selected === i);
    btn.classList.toggle("disabled", match!.player.elixir < card.cost);
  });
}

function denyCard(index: number): void {
  const now = performance.now();
  if (now - denyAt < 380) return;
  denyAt = now;
  toast("Need more Supply");
  const btn = handEl.querySelector<HTMLButtonElement>(`.card[data-index="${index}"]`);
  if (!btn) return;
  btn.classList.remove("denied");
  void btn.offsetWidth;
  btn.classList.add("denied");
  window.setTimeout(() => btn.classList.remove("denied"), 420);
}

function onCardDown(ev: PointerEvent, index: number): void {
  if (!match || match.ended) return;
  sfx.unlock();
  const id = match.player.hand[index];
  if (!id) return;
  if (match.player.elixir < cardById(id).cost) {
    denyCard(index);
    return;
  }
  if (selected === index && !dragFromHand) {
    selected = -1;
    refreshHandState();
    return;
  }
  selected = index;
  dragFromHand = true;
  dragOrigin = { x: ev.clientX, y: ev.clientY };
  (ev.currentTarget as HTMLElement).setPointerCapture?.(ev.pointerId);
  refreshHandState();
}

function canvasPoint(ev: PointerEvent | MouseEvent): { x: number; y: number } {
  const r = canvas.getBoundingClientRect();
  const scaleX = canvas.width / r.width;
  const scaleY = canvas.height / r.height;
  return { x: (ev.clientX - r.left) * scaleX, y: (ev.clientY - r.top) * scaleY };
}

function overCanvas(ev: PointerEvent | MouseEvent): boolean {
  const r = canvas.getBoundingClientRect();
  return ev.clientX >= r.left && ev.clientX <= r.right && ev.clientY >= r.top && ev.clientY <= r.bottom;
}

canvas.addEventListener("pointerdown", (ev) => {
  if (!match || !playing) return;
  sfx.unlock();
  const p = canvasPoint(ev);
  pointerWorld = screenToWorld(cam, p.x, p.y);
  if (selected >= 0 && !dragFromHand) tryDeploy(pointerWorld.x, pointerWorld.y);
});

canvas.addEventListener("pointermove", (ev) => {
  const p = canvasPoint(ev);
  pointerWorld = screenToWorld(cam, p.x, p.y);
});

window.addEventListener("pointermove", (ev) => {
  if (!dragFromHand) return;
  const p = canvasPoint(ev);
  pointerWorld = screenToWorld(cam, p.x, p.y);
});

window.addEventListener("pointerup", (ev) => {
  if (!dragFromHand || !match) {
    dragFromHand = false;
    return;
  }
  const p = canvasPoint(ev);
  const w = screenToWorld(cam, p.x, p.y);
  if (overCanvas(ev) || inArena(w.x, w.y)) {
    tryDeploy(w.x, w.y, true);
  } else {
    const dx = ev.clientX - dragOrigin.x;
    const dy = ev.clientY - dragOrigin.y;
    if (dx * dx + dy * dy > 1600) {
      selected = -1;
      refreshHandState();
    }
  }
  dragFromHand = false;
});

window.addEventListener("pointercancel", () => {
  dragFromHand = false;
});

window.addEventListener("keydown", (ev) => {
  if (!match || !playing) return;
  if (ev.key === "Escape") {
    selected = -1;
    refreshHandState();
  }
  const n = Number(ev.key);
  if (n >= 1 && n <= 4) {
    selected = n - 1;
    refreshHandState();
  }
});

function inArena(x: number, y: number): boolean {
  return x >= -0.35 && x <= ARENA_W + 0.35 && y >= -0.35 && y <= ARENA_H + 0.35;
}

function tryDeploy(x: number, y: number, fromDrag = false): void {
  if (!match || selected < 0 || match.ended) return;
  const id = match.player.hand[selected];
  if (!id) return;
  if (!inArena(x, y)) {
    if (fromDrag) {
      selected = -1;
      refreshHandState();
    }
    return;
  }
  const snapped = snapDeploy(0, id, x, y, match.unlocksFor(0));
  const px = snapped?.x ?? x;
  const py = snapped?.y ?? y;
  const ok = match.tryPlay(0, selected, px, py);
  if (ok) {
    sfx.deploy();
    selected = -1;
    renderHand();
  } else if (!match.legalPlay(0, id, px, py)) {
    toast("Can't drop that there");
  } else {
    denyCard(selected);
  }
}

function toast(text: string): void {
  const el = document.createElement("div");
  el.className = "toast";
  el.textContent = text;
  toastsEl.appendChild(el);
  window.setTimeout(() => el.remove(), 1800);
}

function resize(): void {
  const stage = document.querySelector("#stage")!;
  const rect = canvas.getBoundingClientRect();
  const dpr = Math.min(2.2, window.devicePixelRatio || 1);
  const w = Math.max(320, rect.width || stage.clientWidth);
  const h = Math.max(420, rect.height);
  if (w === lastCanvasW && h === lastCanvasH && dpr === lastDpr) return;
  lastCanvasW = w;
  lastCanvasH = h;
  lastDpr = dpr;
  canvas.width = Math.floor(w * dpr);
  canvas.height = Math.floor(h * dpr);
  cam = layoutCam(canvas.width, canvas.height);
}

window.addEventListener("resize", resize);
new ResizeObserver(() => resize()).observe(canvas.parentElement ?? canvas);
resize();

function fmtTime(match: Match): string {
  const t = match.overtime ? match.overtimeLeft : match.timeLeft;
  const s = Math.max(0, Math.ceil(t));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${r.toString().padStart(2, "0")}`;
}

function updateHud(): void {
  if (!match) return;
  const e = match.player.elixir;
  const floorE = Math.floor(e);
  const tier = match.elixirTier();
  const key = `${floorE}|${(e * 20) | 0}|${selected}|${fmtTime(match)}|${tier}|${match.overtime ? 1 : 0}|${match.player.crowns}|${match.bot.crowns}|${match.player.hand.join(",")}`;
  if (key === lastHudKey) return;
  lastHudKey = key;
  elixirCount.textContent = String(floorE);
  elixirFill.style.width = `${(e / MAX_ELIXIR) * 100}%`;
  elixirFill.parentElement?.classList.toggle("capped", e >= MAX_ELIXIR - 0.02);
  timerEl.textContent = fmtTime(match);
  if (match.overtime) {
    modeChip.className = "overtime";
    modeChip.textContent = "Overtime · Triple";
  } else if (tier === "double") {
    modeChip.className = "double";
    modeChip.textContent = "Double Supply";
  } else {
    modeChip.className = "";
    modeChip.textContent = "Single Supply";
  }
  paintCrowns("enemy-crowns", match.bot.crowns);
  paintCrowns("player-crowns", match.player.crowns);
  refreshHandState();
  paintNext();
}

function paintCrowns(id: string, n: number): void {
  document.querySelectorAll(`#${id} .crown`).forEach((el, i) => {
    el.classList.toggle("on", i < n);
  });
}

function burst(x: number, y: number, color: string, n = 12, kind: Particle["kind"] = "spark"): void {
  for (let i = 0; i < n; i++) {
    const a = (Math.PI * 2 * i) / n + Math.random() * 0.4;
    const sp = kind === "debris" ? 1.6 + Math.random() * 1.8 : kind === "smoke" ? 0.6 + Math.random() * 1.1 : 1.5 + Math.random() * 3.2;
    particles.push({
      x,
      y,
      vx: Math.cos(a) * sp,
      vy: Math.sin(a) * sp - (kind === "smoke" ? 0.8 : 0),
      life: kind === "smoke" ? 0.55 + Math.random() * 0.25 : 0.32 + Math.random() * 0.32,
      maxLife: 0.7,
      size: kind === "smoke" ? 0.22 + Math.random() * 0.14 : kind === "debris" ? 0.1 + Math.random() * 0.08 : 0.07 + Math.random() * 0.1,
      color,
      kind,
    });
  }
}

function handleEvents(events: MatchEvent[]): void {
  for (const ev of events) {
    if (ev.type === "spawn") burst(ev.x, ev.y, ev.team === 0 ? "#6fa8dc" : "#c4a35a", 10, "ring");
    if (ev.type === "death") {
      burst(ev.x, ev.y, "rgba(180,180,170,0.9)", 8, "smoke");
      burst(ev.x, ev.y, "#6a5a3a", 5, "debris");
    }
    if (ev.type === "hit") {
      floaters.push({
        x: ev.x,
        y: ev.y,
        text: String(ev.amount),
        color: ev.crit ? "#e8a040" : "#f2efe6",
        life: 0.55,
        maxLife: 0.55,
        vy: -1.8,
      });
      if (ev.amount > 90) sfx.hit();
    }
    if (ev.type === "spell") {
      sfx.spell(ev.cardId === "smoke" ? "smoke" : "barrage");
      burst(ev.x, ev.y, ev.cardId === "smoke" ? "#c8c4b4" : "#d45a20", 10, ev.cardId === "smoke" ? "smoke" : "spark");
    }
    if (ev.type === "freeze") burst(ev.x, ev.y, "#c8c4b4", 8, "smoke");
    if (ev.type === "tower-hit") {
      shake = Math.max(shake, 0.12);
      const tnow = performance.now();
      if (tnow - towerSfxAt > 160) {
        sfx.tower();
        towerSfxAt = tnow;
      }
    }
    if (ev.type === "double" && !doubleAnnounced) {
      doubleAnnounced = true;
      toast("Double Supply!");
    }
    if (ev.type === "overtime") {
      toast("Overtime — Strongpoints must fall!");
      sfx.overtime();
    }
    if (ev.type === "triple") toast("Triple Supply!");
    if (ev.type === "king-awake") toast(ev.team === 0 ? "Your Strongpoint is live!" : "Enemy Strongpoint is live!");
    if (ev.type === "end") showEnd(ev.winner);
  }
}

function showEnd(winner: "player" | "bot" | "draw"): void {
  if (!match) return;
  playing = false;
  endEl.classList.remove("hidden");
  endTitle.classList.remove("win", "lose", "draw");
  if (winner === "player") {
    endTitle.textContent = "Victory";
    endTitle.classList.add("win");
    endEyebrow.textContent = "Riverwatch holds the crossing";
    endSub.textContent = "The Dustfront Strongpoint is down. The river is yours.";
    sfx.win();
  } else if (winner === "bot") {
    endTitle.textContent = "Defeat";
    endTitle.classList.add("lose");
    endEyebrow.textContent = "Dustfront takes the lane";
    endSub.textContent = "Your Strongpoint has fallen. Restock Supply and try again.";
    sfx.lose();
  } else {
    endTitle.textContent = "Stalemate";
    endTitle.classList.add("draw");
    endEyebrow.textContent = "The river holds";
    endSub.textContent = "Neither bank claimed the crossing.";
  }
  endScore.innerHTML = `<span>Watch ${match.player.crowns}</span><span>Dust ${match.bot.crowns}</span>`;
}

function tickParticles(dt: number): void {
  for (const p of particles) {
    p.life -= dt;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    if (p.kind === "smoke") {
      p.vy -= 0.8 * dt;
      p.size += dt * 0.35;
    } else {
      p.vy += 2.2 * dt;
    }
  }
  particles = particles.filter((p) => p.life > 0);
  for (const f of floaters) {
    f.life -= dt;
    f.y += f.vy * dt;
    f.vy += 1.2 * dt;
  }
  floaters = floaters.filter((f) => f.life > 0);
  shake = Math.max(0, shake - dt * 1.4);
}

function drawParticles(): void {
  ctx.save();
  ctx.translate(cam.x, cam.y);
  ctx.scale(cam.s, cam.s);
  for (const p of particles) {
    const a = clamp(p.life / p.maxLife, 0, 1);
    ctx.globalAlpha = a;
    ctx.fillStyle = p.color;
    if (p.kind === "ring") {
      ctx.strokeStyle = p.color;
      ctx.lineWidth = 0.07;
      ctx.beginPath();
      ctx.arc(p.x, p.y, (1 - a) * 1.0 + 0.16, 0, Math.PI * 2);
      ctx.stroke();
    } else if (p.kind === "smoke") {
      ctx.fillStyle = "rgba(180,180,170,0.55)";
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      ctx.fill();
    } else if (p.kind === "debris") {
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(Math.atan2(p.vy, p.vx));
      ctx.fillRect(-p.size, -p.size * 0.4, p.size * 2, p.size * 0.8);
      ctx.restore();
    } else {
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.textAlign = "center";
  ctx.font = "0.55px Barlow, sans-serif";
  for (const f of floaters) {
    ctx.globalAlpha = clamp(f.life / f.maxLife, 0, 1);
    ctx.fillStyle = f.color;
    ctx.fillText(f.text, f.x, f.y);
  }
  ctx.restore();
}

function drawIdleArena(t: number): void {
  if (!idlePreview) idlePreview = new Match({ difficulty: "easy", seed: 7 });
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  drawArena(ctx, idlePreview, cam, t, null);
}

function frame(now: number): void {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  const t = now / 1000;
  if (canvas.width < 10) resize();

  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  if (match && (playing || match.ended)) {
    if (playing) match.update(dt);
    handleEvents(match.drainEvents());
    tickParticles(dt);
    updateHud();
    const sx = shake ? (Math.random() - 0.5) * 8 * shake : 0;
    const sy = shake ? (Math.random() - 0.5) * 8 * shake : 0;
    ctx.save();
    ctx.translate(sx, sy);
    const hover =
      selected >= 0 && pointerWorld && match.player.hand[selected]
        ? {
            x: pointerWorld.x,
            y: pointerWorld.y,
            valid: Boolean(
              snapDeploy(0, match.player.hand[selected]!, pointerWorld.x, pointerWorld.y, match.unlocksFor(0)),
            ),
            cardId: match.player.hand[selected]!,
          }
        : null;
    drawArena(ctx, match, cam, t, hover);
    if (hover && cardById(hover.cardId).kind !== "spell") {
      const snapped = snapDeploy(0, hover.cardId, hover.x, hover.y, match.unlocksFor(0));
      const gx = snapped?.x ?? hover.x;
      const gy = snapped?.y ?? hover.y;
      const ghost = worldToScreen(cam, gx, gy);
      ctx.globalAlpha = 0.55;
      ctx.beginPath();
      ctx.arc(ghost.x, ghost.y, 0.5 * cam.s, 0, Math.PI * 2);
      ctx.fillStyle = hover.valid ? "#6fa8dc" : "#c45a3a";
      ctx.fill();
      ctx.globalAlpha = 1;
    }
    ctx.restore();
    ctx.save();
    ctx.translate(sx, sy);
    drawParticles();
    ctx.restore();
  } else {
    drawIdleArena(t);
  }

  requestAnimationFrame(frame);
}

requestAnimationFrame(frame);
