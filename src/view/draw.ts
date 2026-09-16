import { cardById } from "../engine/cards";
import { bankOf, inRiver, onBridge } from "../engine/pathing";
import {
  ARENA_H,
  ARENA_W,
  BRIDGES,
  RIVER_BOT,
  RIVER_TOP,
  clamp,
  type Entity,
  type Projectile,
  type Team,
} from "../engine/types";
import type { Match } from "../engine/match";

export interface ViewCam {
  x: number;
  y: number;
  s: number;
}

export function layoutCam(cw: number, ch: number): ViewCam {
  const padX = cw * 0.07;
  const padTop = ch * 0.015;
  const padBot = ch * 0.012;
  const s = Math.min((cw - padX * 2) / ARENA_W, (ch - padTop - padBot) / ARENA_H);
  const x = (cw - ARENA_W * s) / 2;
  const y = padTop + (ch - padTop - padBot - ARENA_H * s) / 2;
  return { x, y, s };
}

export function worldToScreen(cam: ViewCam, x: number, y: number): { x: number; y: number } {
  return { x: cam.x + x * cam.s, y: cam.y + y * cam.s };
}

export function screenToWorld(cam: ViewCam, x: number, y: number): { x: number; y: number } {
  return { x: (x - cam.x) / cam.s, y: (y - cam.y) / cam.s };
}

const teamGlow = (team: Team) => (team === 0 ? "#3ee0c5" : "#ff6b7a");

export function drawArena(
  ctx: CanvasRenderingContext2D,
  match: Match,
  cam: ViewCam,
  t: number,
  hover: { x: number; y: number; valid: boolean; cardId: string | null } | null,
): void {
  const { s } = cam;
  ctx.save();
  ctx.translate(cam.x, cam.y);
  ctx.scale(s, s);

  roundRect(ctx, -0.35, -0.35, ARENA_W + 0.7, ARENA_H + 0.7, 0.7);
  ctx.fillStyle = "#0b1c24";
  ctx.fill();
  ctx.strokeStyle = "#d7b56a";
  ctx.lineWidth = 0.18;
  ctx.stroke();

  const g = ctx.createLinearGradient(0, 0, 0, ARENA_H);
  g.addColorStop(0, "#2a1630");
  g.addColorStop(0.46, "#173246");
  g.addColorStop(0.5, "#1a3e52");
  g.addColorStop(0.54, "#14362c");
  g.addColorStop(1, "#102c28");
  roundRect(ctx, 0, 0, ARENA_W, ARENA_H, 0.45);
  ctx.fillStyle = g;
  ctx.fill();

  ctx.save();
  ctx.beginPath();
  roundRect(ctx, 0, 0, ARENA_W, ARENA_H, 0.45);
  ctx.clip();

  for (let row = 0; row < ARENA_H; row++) {
    for (let col = 0; col < ARENA_W; col++) {
      if ((row + col) % 2 === 0) continue;
      const north = row < RIVER_TOP;
      ctx.fillStyle = north ? "rgba(80, 30, 70, 0.18)" : "rgba(20, 70, 60, 0.16)";
      ctx.fillRect(col, row, 1, 1);
    }
  }

  ctx.fillStyle = "rgba(255,255,255,0.035)";
  ctx.fillRect(ARENA_W * 0.5 - 0.04, 0.4, 0.08, ARENA_H - 0.8);

  drawRiver(ctx, t);
  drawBridges(ctx);
  drawPads(ctx, match);

  if (hover?.cardId) {
    drawDeployHint(ctx, match, { ...hover, cardId: hover.cardId });
  }

  const sorted = match.entities.slice().sort((a, b) => a.y - b.y || a.id - b.id);
  for (const e of sorted) {
    if (e.kind === "tower") drawTower(ctx, e, t);
  }
  for (const e of sorted) {
    if (e.kind === "building") drawBuilding(ctx, e, t, match.now);
  }
  for (const e of sorted) {
    if (e.kind === "troop") drawTroop(ctx, e, t, match.now);
  }
  for (const e of sorted) {
    if (e.kind === "spell") drawSpellMarker(ctx, e, match.now);
  }
  for (const p of match.projectiles) drawProjectile(ctx, p, t);
  for (const e of sorted) {
    if (e.kind === "tower" || e.kind === "building" || e.kind === "troop") drawHealth(ctx, e);
  }

  ctx.restore();

  ctx.strokeStyle = "rgba(255, 220, 140, 0.55)";
  ctx.lineWidth = 0.08;
  roundRect(ctx, 0.08, 0.08, ARENA_W - 0.16, ARENA_H - 0.16, 0.4);
  ctx.stroke();
  ctx.restore();
}

function drawRiver(ctx: CanvasRenderingContext2D, t: number): void {
  const y = RIVER_TOP;
  const h = RIVER_BOT - RIVER_TOP;
  const rg = ctx.createLinearGradient(0, y, 0, y + h);
  rg.addColorStop(0, "#1c5c88");
  rg.addColorStop(0.5, "#3ad0e8");
  rg.addColorStop(1, "#1c5c88");
  ctx.fillStyle = rg;
  ctx.fillRect(0, y, ARENA_W, h);
  ctx.globalAlpha = 0.35;
  ctx.strokeStyle = "#b7f6ff";
  ctx.lineWidth = 0.06;
  for (let i = 0; i < 6; i++) {
    ctx.beginPath();
    const yy = y + 0.22 + i * 0.24;
    for (let x = 0; x <= ARENA_W; x += 0.25) {
      const oy = Math.sin(x * 1.3 + t * 2.2 + i) * 0.08;
      if (x === 0) ctx.moveTo(x, yy + oy);
      else ctx.lineTo(x, yy + oy);
    }
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
}

function drawBridges(ctx: CanvasRenderingContext2D): void {
  for (const b of BRIDGES) {
    const x = b.x1;
    const w = b.x2 - b.x1;
    const y = RIVER_TOP - 0.18;
    const h = RIVER_BOT - RIVER_TOP + 0.36;
    roundRect(ctx, x, y, w, h, 0.18);
    ctx.fillStyle = "#6a4a32";
    ctx.fill();
    ctx.strokeStyle = "#d7b08a";
    ctx.lineWidth = 0.08;
    ctx.stroke();
    ctx.fillStyle = "#8a6242";
    const planks = 8;
    for (let i = 0; i < planks; i++) {
      ctx.fillRect(x + 0.1, y + 0.12 + i * (h / planks), w - 0.2, h / planks - 0.08);
    }
    ctx.fillStyle = "#c9a227";
    ctx.fillRect(x + 0.12, y + 0.06, 0.12, h - 0.12);
    ctx.fillRect(x + w - 0.24, y + 0.06, 0.12, h - 0.12);
  }
}

function drawPads(ctx: CanvasRenderingContext2D, match: Match): void {
  for (const e of match.entities) {
    if (e.kind !== "tower") continue;
    ctx.beginPath();
    ctx.ellipse(e.x, e.y + e.radius * 0.55, e.radius * 1.25, e.radius * 0.55, 0, 0, Math.PI * 2);
    ctx.fillStyle = e.team === 0 ? "rgba(62,224,197,0.16)" : "rgba(255,107,122,0.16)";
    ctx.fill();
  }
}

function drawDeployHint(
  ctx: CanvasRenderingContext2D,
  match: Match,
  hover: { x: number; y: number; valid: boolean; cardId: string },
): void {
  const card = cardById(hover.cardId);
  ctx.save();
  if (card.kind === "spell") {
    ctx.globalAlpha = 0.18;
    ctx.fillStyle = hover.valid ? "#3ee0c5" : "#ff5a6a";
    ctx.beginPath();
    ctx.arc(hover.x, hover.y, card.spellRadius, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 0.7;
    ctx.strokeStyle = hover.valid ? "#3ee0c5" : "#ff5a6a";
    ctx.lineWidth = 0.08;
    ctx.stroke();
  } else {
    const unlock = match.unlocksFor(0);
    ctx.globalAlpha = 0.14;
    ctx.fillStyle = "#3ee0c5";
    ctx.fillRect(0.15, RIVER_BOT, ARENA_W - 0.3, ARENA_H - RIVER_BOT - 1.2);
    if (unlock.left) ctx.fillRect(0.15, 6.4, ARENA_W * 0.5 - 0.15, RIVER_TOP - 6.4);
    if (unlock.right) ctx.fillRect(ARENA_W * 0.5, 6.4, ARENA_W * 0.5 - 0.15, RIVER_TOP - 6.4);
    ctx.globalAlpha = 0.9;
    ctx.beginPath();
    ctx.arc(hover.x, hover.y, card.radius + 0.15, 0, Math.PI * 2);
    ctx.strokeStyle = hover.valid ? "#e8fff8" : "#ff8a96";
    ctx.lineWidth = 0.1;
    ctx.stroke();
    ctx.globalAlpha = 0.35;
    ctx.fillStyle = hover.valid ? "#3ee0c5" : "#ff5a6a";
    ctx.fill();
  }
  ctx.restore();
}

function drawTower(ctx: CanvasRenderingContext2D, e: Entity, t: number): void {
  const king = e.towerSlot === "king";
  const glow = teamGlow(e.team);
  ctx.save();
  ctx.translate(e.x, e.y);
  if (e.dying > 0) ctx.globalAlpha = Math.max(0, e.dying);

  ctx.beginPath();
  ctx.ellipse(0, e.radius * 0.7, e.radius * 0.95, e.radius * 0.32, 0, 0, Math.PI * 2);
  ctx.fillStyle = "rgba(0,0,0,0.28)";
  ctx.fill();

  const bodyH = king ? 2.15 : 1.65;
  const bodyW = king ? 1.55 : 1.2;
  roundRect(ctx, -bodyW / 2, -bodyH + 0.4, bodyW, bodyH, 0.18);
  const bg = ctx.createLinearGradient(0, -bodyH, 0, 0.5);
  bg.addColorStop(0, king ? "#efe0a8" : "#d5e6f4");
  bg.addColorStop(1, e.team === 0 ? "#2d6a62" : "#6a2d44");
  ctx.fillStyle = bg;
  ctx.fill();
  ctx.strokeStyle = glow;
  ctx.lineWidth = 0.08;
  ctx.stroke();

  ctx.fillStyle = glow;
  ctx.globalAlpha = e.active ? 0.85 : 0.25;
  ctx.beginPath();
  ctx.arc(0, -bodyH + 0.55, king ? 0.32 : 0.22, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 1;
  ctx.fillStyle = "#1a2430";
  roundRect(ctx, -bodyW * 0.22, -0.15, bodyW * 0.44, 0.55, 0.08);
  ctx.fill();

  if (king) {
    ctx.fillStyle = "#f6d56a";
    ctx.beginPath();
    ctx.moveTo(0, -bodyH - 0.15);
    ctx.lineTo(0.28, -bodyH + 0.28);
    ctx.lineTo(-0.28, -bodyH + 0.28);
    ctx.closePath();
    ctx.fill();
  }

  if (!e.active && king) {
    ctx.fillStyle = "rgba(0,0,0,0.28)";
    roundRect(ctx, -bodyW / 2, -bodyH + 0.4, bodyW, bodyH, 0.18);
    ctx.fill();
  }

  const pulse = 0.5 + Math.sin(t * 3 + e.id) * 0.15;
  ctx.strokeStyle = `rgba(255,255,255,${e.active ? pulse * 0.25 : 0.05})`;
  ctx.lineWidth = 0.05;
  ctx.beginPath();
  ctx.arc(0, 0.1, e.radius + 0.15, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}

function drawBuilding(ctx: CanvasRenderingContext2D, e: Entity, t: number, now: number): void {
  ctx.save();
  ctx.translate(e.x, e.y);
  if (now < e.deployUntil) {
    const k = 1 - (e.deployUntil - now) / 0.85;
    ctx.translate(0, (1 - k) * -1.2);
    ctx.globalAlpha = Math.max(0.2, k);
  }
  if (e.dying > 0) ctx.globalAlpha = Math.max(0, e.dying * 3);
  ctx.beginPath();
  ctx.ellipse(0, 0.45, 0.7, 0.28, 0, 0, Math.PI * 2);
  ctx.fillStyle = "rgba(0,0,0,0.3)";
  ctx.fill();
  const glow = teamGlow(e.team);
  ctx.rotate(Math.PI / 6);
  hexPath(ctx, 0, -0.15, 0.62);
  ctx.fillStyle = "#2a2150";
  ctx.fill();
  ctx.strokeStyle = glow;
  ctx.lineWidth = 0.08;
  ctx.stroke();
  ctx.rotate(-Math.PI / 6);
  ctx.fillStyle = e.color;
  ctx.beginPath();
  ctx.moveTo(0, -0.95);
  ctx.lineTo(0.22, -0.2);
  ctx.lineTo(-0.22, -0.2);
  ctx.closePath();
  ctx.fill();
  ctx.beginPath();
  ctx.arc(0, -0.15, 0.18 + Math.sin(t * 6) * 0.03, 0, Math.PI * 2);
  ctx.fillStyle = "#fff";
  ctx.fill();
  if (now < e.frozenUntil) frostOverlay(ctx, 0.7);
  ctx.restore();
}

function drawTroop(ctx: CanvasRenderingContext2D, e: Entity, t: number, now: number): void {
  ctx.save();
  ctx.translate(e.x, e.y);
  const deploying = now < e.deployUntil;
  if (deploying) {
    const k = 1 - (e.deployUntil - now) / 0.7;
    ctx.translate(0, (1 - clamp(k, 0, 1)) * -1.4);
    ctx.globalAlpha = clamp(k + 0.2, 0.2, 1);
  }
  if (e.dying > 0) {
    ctx.globalAlpha = Math.max(0, e.dying / 0.28);
    ctx.scale(1 + (0.28 - e.dying) * 1.4, 1 + (0.28 - e.dying) * 1.4);
  }
  const walk = e.speed > 0 && now >= e.deployUntil && now >= e.frozenUntil ? Math.sin(e.bob) * 0.06 : 0;
  ctx.translate(0, walk);

  ctx.beginPath();
  ctx.ellipse(0, e.radius * 0.85, e.radius * 0.9, e.radius * 0.35, 0, 0, Math.PI * 2);
  ctx.fillStyle = "rgba(0,0,0,0.28)";
  ctx.fill();

  ctx.rotate(e.facing + Math.PI / 2);
  const id = e.cardId;
  if (id === "ironhide") drawIronhide(ctx, e);
  else if (id === "ashblade") drawAshblade(ctx, e);
  else if (id === "boltbow") drawBoltbow(ctx, e);
  else if (id === "cinderpot") drawCinderpot(ctx, e);
  else drawSparklet(ctx, e);

  if (now < e.frozenUntil) frostOverlay(ctx, e.radius + 0.15);
  ctx.restore();
  void t;
}

function drawIronhide(ctx: CanvasRenderingContext2D, e: Entity): void {
  const g = teamGlow(e.team);
  roundRect(ctx, -0.5, -0.45, 1.0, 0.95, 0.18);
  ctx.fillStyle = "#8d97ad";
  ctx.fill();
  ctx.strokeStyle = g;
  ctx.lineWidth = 0.07;
  ctx.stroke();
  roundRect(ctx, -0.62, -0.15, 0.28, 0.7, 0.08);
  ctx.fillStyle = "#cfd6e6";
  ctx.fill();
  ctx.fillStyle = "#1b2430";
  ctx.fillRect(-0.18, -0.18, 0.14, 0.16);
  ctx.fillRect(0.06, -0.18, 0.14, 0.16);
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(0, -0.55, 0.16, 0, Math.PI * 2);
  ctx.fill();
}

function drawAshblade(ctx: CanvasRenderingContext2D, e: Entity): void {
  const g = teamGlow(e.team);
  ctx.beginPath();
  ctx.moveTo(0, -0.55);
  ctx.lineTo(0.38, 0.15);
  ctx.lineTo(0, 0.48);
  ctx.lineTo(-0.38, 0.15);
  ctx.closePath();
  ctx.fillStyle = "#d9a24a";
  ctx.fill();
  ctx.strokeStyle = g;
  ctx.lineWidth = 0.07;
  ctx.stroke();
  ctx.fillStyle = "#f4f0e4";
  ctx.fillRect(-0.05, -0.85, 0.1, 0.55);
  ctx.beginPath();
  ctx.moveTo(-0.05, -0.85);
  ctx.lineTo(0.18, -0.62);
  ctx.lineTo(0.05, -0.5);
  ctx.closePath();
  ctx.fill();
}

function drawBoltbow(ctx: CanvasRenderingContext2D, e: Entity): void {
  const g = teamGlow(e.team);
  ctx.beginPath();
  ctx.arc(0, 0, 0.38, 0, Math.PI * 2);
  ctx.fillStyle = "#2f8a62";
  ctx.fill();
  ctx.strokeStyle = g;
  ctx.lineWidth = 0.07;
  ctx.stroke();
  ctx.strokeStyle = "#d9ffe8";
  ctx.lineWidth = 0.07;
  ctx.beginPath();
  ctx.arc(0, -0.05, 0.42, -Math.PI * 0.8, -Math.PI * 0.2);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(0, -0.05);
  ctx.lineTo(0, -0.62);
  ctx.stroke();
}

function drawCinderpot(ctx: CanvasRenderingContext2D, e: Entity): void {
  const g = teamGlow(e.team);
  ctx.beginPath();
  ctx.arc(0, 0.05, 0.42, 0, Math.PI * 2);
  ctx.fillStyle = "#c45a32";
  ctx.fill();
  ctx.strokeStyle = g;
  ctx.lineWidth = 0.07;
  ctx.stroke();
  ctx.fillStyle = "#ffd27a";
  ctx.beginPath();
  ctx.arc(-0.08, -0.38, 0.16, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#ff7a3c";
  ctx.beginPath();
  ctx.arc(0.12, -0.48, 0.1, 0, Math.PI * 2);
  ctx.fill();
}

function drawSparklet(ctx: CanvasRenderingContext2D, e: Entity): void {
  const g = teamGlow(e.team);
  ctx.beginPath();
  ctx.arc(0, 0, 0.26, 0, Math.PI * 2);
  ctx.fillStyle = "#9be7ff";
  ctx.fill();
  ctx.strokeStyle = g;
  ctx.lineWidth = 0.06;
  ctx.stroke();
  ctx.fillStyle = "#fff";
  ctx.beginPath();
  ctx.arc(-0.05, -0.05, 0.07, 0, Math.PI * 2);
  ctx.fill();
}

function drawSpellMarker(ctx: CanvasRenderingContext2D, e: Entity, now: number): void {
  const card = cardById(e.cardId!);
  const k = clamp(1 - e.attackCd / Math.max(0.05, card.spellDelay), 0, 1);
  ctx.save();
  ctx.translate(e.x, e.y);
  ctx.globalAlpha = 0.35 + k * 0.4;
  ctx.beginPath();
  ctx.arc(0, 0, card.spellRadius * (0.75 + k * 0.25), 0, Math.PI * 2);
  ctx.strokeStyle = card.color;
  ctx.lineWidth = 0.1;
  ctx.stroke();
  ctx.fillStyle = card.color;
  ctx.globalAlpha = 0.12 + k * 0.15;
  ctx.fill();
  ctx.restore();
  void now;
}

function drawProjectile(ctx: CanvasRenderingContext2D, p: Projectile, t: number): void {
  ctx.save();
  ctx.translate(p.x, p.y);
  ctx.fillStyle = p.color;
  ctx.shadowColor = p.color;
  ctx.shadowBlur = 12;
  ctx.beginPath();
  ctx.arc(0, 0, p.radius, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
  void t;
}

function drawHealth(ctx: CanvasRenderingContext2D, e: Entity): void {
  if (e.hp <= 0) return;
  const w = e.kind === "tower" ? (e.towerSlot === "king" ? 2.1 : 1.7) : Math.max(0.7, e.radius * 2.2);
  const h = e.kind === "tower" ? 0.16 : 0.11;
  const y = e.kind === "tower" ? - (e.towerSlot === "king" ? 2.05 : 1.55) : -e.radius - 0.38;
  const pct = clamp(e.hp / e.maxHp, 0, 1);
  ctx.save();
  ctx.translate(e.x, e.y);
  roundRect(ctx, -w / 2, y, w, h, 0.05);
  ctx.fillStyle = "rgba(0,0,0,0.55)";
  ctx.fill();
  roundRect(ctx, -w / 2, y, w * pct, h, 0.05);
  ctx.fillStyle = pct > 0.45 ? teamGlow(e.team) : "#ffb347";
  ctx.fill();
  ctx.restore();
}

function frostOverlay(ctx: CanvasRenderingContext2D, r: number): void {
  ctx.save();
  ctx.globalAlpha = 0.45;
  ctx.strokeStyle = "#d7f6ff";
  ctx.lineWidth = 0.06;
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, Math.PI * 2);
  ctx.stroke();
  ctx.fillStyle = "rgba(180, 230, 255, 0.25)";
  ctx.fill();
  ctx.restore();
}

function hexPath(ctx: CanvasRenderingContext2D, x: number, y: number, r: number): void {
  ctx.beginPath();
  for (let i = 0; i < 6; i++) {
    const a = (Math.PI / 3) * i - Math.PI / 6;
    const px = x + Math.cos(a) * r;
    const py = y + Math.sin(a) * r;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
}

export function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): void {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

export function drawCardArt(
  ctx: CanvasRenderingContext2D,
  cardId: string,
  w: number,
  h: number,
  team: Team = 0,
): void {
  const card = cardById(cardId);
  ctx.clearRect(0, 0, w, h);
  const bg = ctx.createLinearGradient(0, 0, 0, h);
  bg.addColorStop(0, shade(card.color, 0.25));
  bg.addColorStop(1, "#101820");
  roundRect(ctx, 0, 0, w, h, 10);
  ctx.fillStyle = bg;
  ctx.fill();
  ctx.save();
  ctx.translate(w / 2, h * 0.52);
  ctx.scale(Math.min(w, h) / 2.4, Math.min(w, h) / 2.4);
  const fake: Entity = {
    id: 0,
    team,
    kind: card.kind === "building" ? "building" : "troop",
    cardId,
    name: card.name,
    x: 0,
    y: 0,
    hp: 1,
    maxHp: 1,
    radius: 0.4,
    flying: false,
    speed: 0,
    range: 0,
    damage: 0,
    hitSpeed: 1,
    splash: 0,
    sight: 0,
    attackCd: 0,
    targetId: null,
    frozenUntil: 0,
    deployUntil: 0,
    lifetime: 0,
    age: 0,
    facing: -Math.PI / 2,
    bob: 0,
    towerSlot: null,
    active: true,
    dying: 0,
    color: card.color,
  };
  if (card.kind === "spell") {
    ctx.beginPath();
    ctx.arc(0, 0, 0.55, 0, Math.PI * 2);
    ctx.fillStyle = card.color;
    ctx.globalAlpha = 0.85;
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.strokeStyle = "#fff";
    ctx.lineWidth = 0.06;
    ctx.stroke();
  } else if (card.kind === "building") {
    drawBuilding(ctx, fake, 0, 99);
  } else if (cardId === "ironhide") drawIronhide(ctx, fake);
  else if (cardId === "ashblade") drawAshblade(ctx, fake);
  else if (cardId === "boltbow") drawBoltbow(ctx, fake);
  else if (cardId === "cinderpot") drawCinderpot(ctx, fake);
  else drawSparklet(ctx, fake);
  ctx.restore();
}

function shade(hex: string, k: number): string {
  const n = parseInt(hex.slice(1), 16);
  const r = ((n >> 16) & 255) * k;
  const g = ((n >> 8) & 255) * k;
  const b = (n & 255) * k;
  return `rgb(${r | 0},${g | 0},${b | 0})`;
}

export { inRiver, onBridge, bankOf };
