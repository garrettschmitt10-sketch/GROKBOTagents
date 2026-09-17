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

const WATCH = "#6fa8dc";
const DUST = "#c4a35a";
const BRASS = "#c9a227";
const WATCH_DEEP = "#1a3348";
const DUST_DEEP = "#3a2e14";
const WATCH_MID = "#3d6f94";
const DUST_MID = "#8a6b2e";

export function layoutCam(cw: number, ch: number): ViewCam {
  const padX = cw * 0.05;
  const padTop = ch * 0.01;
  const padBot = ch * 0.018;
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

const teamGlow = (team: Team) => (team === 0 ? WATCH : DUST);
const teamDeep = (team: Team) => (team === 0 ? WATCH_DEEP : DUST_DEEP);
const teamMid = (team: Team) => (team === 0 ? WATCH_MID : DUST_MID);

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

  drawOuterFrame(ctx);

  ctx.save();
  ctx.beginPath();
  roundRect(ctx, 0, 0, ARENA_W, ARENA_H, 0.38);
  ctx.clip();

  drawMudFloor(ctx, t);
  drawLaneMarks(ctx);
  drawRiver(ctx, t);
  drawBridges(ctx);
  drawPads(ctx, match);

  if (hover?.cardId) {
    drawDeployHint(ctx, match, { ...hover, cardId: hover.cardId });
  }

  const sorted = match.entities.slice().sort((a, b) => a.y - b.y || a.id - b.id);
  for (const e of sorted) if (e.kind === "tower") drawTower(ctx, e);
  for (const e of sorted) if (e.kind === "building") drawBuilding(ctx, e, t, match.now);
  for (const e of sorted) if (e.kind === "troop") drawTroop(ctx, e, t, match.now);
  for (const e of sorted) if (e.kind === "spell") drawSpellMarker(ctx, e, t);
  for (const p of match.projectiles) drawProjectile(ctx, p);
  for (const e of sorted) {
    if (e.kind === "tower" || e.kind === "building" || e.kind === "troop") drawHealth(ctx, e);
  }

  ctx.restore();
  ctx.restore();
}

function drawOuterFrame(ctx: CanvasRenderingContext2D): void {
  roundRect(ctx, -0.55, -0.55, ARENA_W + 1.1, ARENA_H + 1.1, 0.55);
  ctx.fillStyle = "#12140f";
  ctx.fill();

  roundRect(ctx, -0.34, -0.34, ARENA_W + 0.68, ARENA_H + 0.68, 0.46);
  ctx.strokeStyle = BRASS;
  ctx.globalAlpha = 0.55;
  ctx.lineWidth = 0.1;
  ctx.stroke();
  ctx.globalAlpha = 1;

  roundRect(ctx, 0, 0, ARENA_W, ARENA_H, 0.38);
  ctx.fillStyle = "#1a1c16";
  ctx.fill();
}

function drawMudFloor(ctx: CanvasRenderingContext2D, t: number): void {
  const field = ctx.createLinearGradient(0, 0, 0, ARENA_H);
  field.addColorStop(0, "#323428");
  field.addColorStop(0.14, "#2a2e24");
  field.addColorStop(0.48, "#23261e");
  field.addColorStop(0.52, "#2c2a20");
  field.addColorStop(1, "#25281f");
  ctx.fillStyle = field;
  ctx.fillRect(0, 0, ARENA_W, ARENA_H);

  const dusk = ctx.createLinearGradient(0, 0, 0, 5.8);
  dusk.addColorStop(0, "rgba(48, 50, 58, 0.62)");
  dusk.addColorStop(1, "rgba(26, 28, 22, 0)");
  ctx.fillStyle = dusk;
  ctx.fillRect(0, 0, ARENA_W, 5.8);

  ctx.fillStyle = "rgba(180,180,170,0.16)";
  for (let i = 0; i < 5; i++) {
    const sx = 1.4 + i * 3.4;
    const sy = 1.15 + Math.sin(t * 0.12 + i) * 0.12;
    ctx.beginPath();
    ctx.ellipse(sx, sy, 2.2, 0.58, -0.1, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.strokeStyle = "rgba(18, 20, 14, 0.55)";
  ctx.lineWidth = 0.07;
  for (let i = 0; i < 11; i++) {
    const y = 3.6 + i * 2.35;
    if (y > RIVER_TOP - 0.7 && y < RIVER_BOT + 0.7) continue;
    ctx.beginPath();
    ctx.moveTo(0.3, y);
    for (let x = 0.3; x < ARENA_W; x += 0.45) {
      ctx.lineTo(x, y + ((x * 7 + i * 13) % 5) * 0.05 - 0.1);
    }
    ctx.stroke();
  }

  ctx.fillStyle = "rgba(12, 14, 10, 0.42)";
  for (let i = 0; i < 36; i++) {
    const sx = 0.5 + ((i * 53) % 172) / 10;
    const sy = 0.7 + ((i * 97) % 304) / 10;
    if (sy > RIVER_TOP - 0.2 && sy < RIVER_BOT + 0.2) continue;
    ctx.beginPath();
    ctx.ellipse(sx, sy, 0.22 + (i % 3) * 0.07, 0.12 + (i % 2) * 0.05, 0.2, 0, Math.PI * 2);
    ctx.fill();
  }

  for (let row = 0; row < ARENA_H; row++) {
    for (let col = 0; col < ARENA_W; col++) {
      if ((row + col) % 3) continue;
      const north = row < RIVER_TOP;
      ctx.fillStyle = north ? "rgba(196, 163, 90, 0.06)" : "rgba(111, 168, 220, 0.055)";
      ctx.fillRect(col, row, 1, 1);
    }
  }

  drawWire(ctx, RIVER_TOP - 0.55);
  drawWire(ctx, RIVER_BOT + 0.55);
}

function drawWire(ctx: CanvasRenderingContext2D, y: number): void {
  ctx.save();
  ctx.strokeStyle = "rgba(90, 88, 78, 0.7)";
  ctx.lineWidth = 0.045;
  ctx.beginPath();
  ctx.moveTo(0.2, y);
  for (let x = 0.2; x < ARENA_W; x += 0.55) {
    ctx.lineTo(x + 0.22, y - 0.16);
    ctx.lineTo(x + 0.55, y);
  }
  ctx.stroke();
  ctx.strokeStyle = "rgba(60, 58, 48, 0.55)";
  ctx.lineWidth = 0.03;
  for (let x = 0.4; x < ARENA_W; x += 1.1) {
    ctx.beginPath();
    ctx.moveTo(x, y - 0.18);
    ctx.lineTo(x + 0.12, y + 0.1);
    ctx.moveTo(x + 0.08, y - 0.16);
    ctx.lineTo(x - 0.06, y + 0.08);
    ctx.stroke();
  }
  ctx.restore();
}

function drawLaneMarks(ctx: CanvasRenderingContext2D): void {
  ctx.save();
  ctx.globalAlpha = 0.28;
  ctx.setLineDash([0.28, 0.22]);
  ctx.lineWidth = 0.07;
  for (const x of [3.8, 14.2]) {
    ctx.strokeStyle = "#cbb98a";
    ctx.beginPath();
    ctx.moveTo(x, 2.6);
    ctx.lineTo(x, RIVER_TOP - 0.2);
    ctx.moveTo(x, RIVER_BOT + 0.2);
    ctx.lineTo(x, ARENA_H - 2.6);
    ctx.stroke();
  }
  ctx.setLineDash([]);
  ctx.globalAlpha = 0.22;
  ctx.strokeStyle = BRASS;
  ctx.lineWidth = 0.05;
  for (const cx of [3.8, 9, 14.2]) {
    for (const cy of [11.2, 20.8]) {
      ctx.beginPath();
      ctx.arc(cx, cy, 0.2, 0, Math.PI * 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(cx - 0.32, cy);
      ctx.lineTo(cx + 0.32, cy);
      ctx.moveTo(cx, cy - 0.32);
      ctx.lineTo(cx, cy + 0.32);
      ctx.stroke();
    }
  }
  ctx.restore();
}

function drawRiver(ctx: CanvasRenderingContext2D, t: number): void {
  const y = RIVER_TOP;
  const h = RIVER_BOT - RIVER_TOP;

  ctx.fillStyle = "rgba(18, 22, 20, 0.55)";
  ctx.fillRect(0, y - 0.28, ARENA_W, h + 0.56);

  const rg = ctx.createLinearGradient(0, y, 0, y + h);
  rg.addColorStop(0, "#2a3438");
  rg.addColorStop(0.18, "#3a4a52");
  rg.addColorStop(0.5, "#6a8490");
  rg.addColorStop(0.82, "#3a4a52");
  rg.addColorStop(1, "#2a3438");
  ctx.fillStyle = rg;
  ctx.fillRect(0, y, ARENA_W, h);

  ctx.fillStyle = "rgba(8, 10, 8, 0.35)";
  ctx.fillRect(0, y, ARENA_W, 0.12);
  ctx.fillRect(0, y + h - 0.12, ARENA_W, 0.12);

  ctx.globalAlpha = 0.45;
  ctx.strokeStyle = "#d8e4e8";
  ctx.lineWidth = 0.04;
  for (let i = 0; i < 4; i++) {
    ctx.beginPath();
    const yy = y + 0.28 + i * 0.32;
    for (let x = 0; x <= ARENA_W; x += 0.22) {
      const oy = Math.sin(x * 1.05 + t * 1.6 + i * 0.8) * 0.08;
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
    const y = RIVER_TOP - 0.22;
    const h = RIVER_BOT - RIVER_TOP + 0.44;

    ctx.fillStyle = "rgba(20, 18, 12, 0.45)";
    roundRect(ctx, x - 0.1, y - 0.06, w + 0.2, h + 0.12, 0.08);
    ctx.fill();

    const plank = ctx.createLinearGradient(x, y, x + w, y);
    plank.addColorStop(0, "#4a4030");
    plank.addColorStop(0.5, "#6a5c44");
    plank.addColorStop(1, "#3e3628");
    roundRect(ctx, x, y, w, h, 0.08);
    ctx.fillStyle = plank;
    ctx.fill();
    ctx.strokeStyle = "#2a2418";
    ctx.lineWidth = 0.06;
    ctx.stroke();

    ctx.strokeStyle = "rgba(18, 16, 12, 0.55)";
    ctx.lineWidth = 0.045;
    for (let i = 1; i < 5; i++) {
      ctx.beginPath();
      ctx.moveTo(x + 0.08, y + (h * i) / 5);
      ctx.lineTo(x + w - 0.08, y + (h * i) / 5);
      ctx.stroke();
    }

    ctx.fillStyle = "#8a8070";
    ctx.fillRect(x + 0.06, y + 0.05, 0.1, h - 0.1);
    ctx.fillRect(x + w - 0.16, y + 0.05, 0.1, h - 0.1);

    ctx.fillStyle = BRASS;
    for (let i = 0; i < 4; i++) {
      const ry = y + 0.22 + i * (h - 0.4) / 3;
      ctx.beginPath();
      ctx.arc(x + 0.11, ry, 0.045, 0, Math.PI * 2);
      ctx.arc(x + w - 0.11, ry, 0.045, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.strokeStyle = "#cbb98a";
    ctx.lineWidth = 0.04;
    ctx.beginPath();
    ctx.moveTo(x + 0.18, y + 0.08);
    ctx.lineTo(x + 0.18, y + h - 0.08);
    ctx.moveTo(x + w - 0.18, y + 0.08);
    ctx.lineTo(x + w - 0.18, y + h - 0.08);
    ctx.stroke();

    ctx.fillStyle = "#6a5a3a";
    roundRect(ctx, x - 0.12, y - 0.08, 0.34, 0.22, 0.04);
    ctx.fill();
    roundRect(ctx, x + w - 0.22, y - 0.08, 0.34, 0.22, 0.04);
    ctx.fill();
    roundRect(ctx, x - 0.12, y + h - 0.14, 0.34, 0.22, 0.04);
    ctx.fill();
    roundRect(ctx, x + w - 0.22, y + h - 0.14, 0.34, 0.22, 0.04);
    ctx.fill();
  }
}

function drawPads(ctx: CanvasRenderingContext2D, match: Match): void {
  for (const e of match.entities) {
    if (e.kind !== "tower") continue;
    const king = e.towerSlot === "king";
    ctx.save();
    ctx.translate(e.x, e.y);
    ctx.beginPath();
    ctx.ellipse(0, e.radius * 0.62, e.radius * (king ? 1.55 : 1.18), e.radius * (king ? 0.58 : 0.42), 0, 0, Math.PI * 2);
    ctx.fillStyle = e.team === 0 ? "rgba(111,168,220,0.14)" : "rgba(196,163,90,0.14)";
    ctx.fill();
    ctx.strokeStyle = e.team === 0 ? "rgba(111,168,220,0.28)" : "rgba(196,163,90,0.28)";
    ctx.lineWidth = 0.05;
    ctx.stroke();
    ctx.restore();
  }
}

function drawDeployHint(
  ctx: CanvasRenderingContext2D,
  match: Match,
  hover: { x: number; y: number; valid: boolean; cardId: string },
): void {
  const card = cardById(hover.cardId);
  ctx.save();
  const col = hover.valid ? WATCH : "#c45a3a";
  if (card.kind === "spell") {
    ctx.globalAlpha = 0.16;
    ctx.fillStyle = col;
    ctx.beginPath();
    ctx.arc(hover.x, hover.y, card.spellRadius, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 0.9;
    ctx.strokeStyle = col;
    ctx.lineWidth = 0.1;
    ctx.setLineDash([0.2, 0.12]);
    ctx.stroke();
    ctx.setLineDash([]);
  } else {
    const unlock = match.unlocksFor(0);
    ctx.globalAlpha = 0.16;
    ctx.fillStyle = WATCH;
    ctx.fillRect(0.15, RIVER_BOT, ARENA_W - 0.3, ARENA_H - RIVER_BOT - 1.05);
    if (unlock.left) ctx.fillRect(0.15, 6.4, ARENA_W * 0.5 - 0.15, RIVER_TOP - 6.4);
    if (unlock.right) ctx.fillRect(ARENA_W * 0.5, 6.4, ARENA_W * 0.5 - 0.15, RIVER_TOP - 6.4);
    ctx.globalAlpha = 0.95;
    ctx.beginPath();
    ctx.arc(hover.x, hover.y, card.radius + 0.28, 0, Math.PI * 2);
    ctx.strokeStyle = hover.valid ? "#e8f0f6" : "#e07050";
    ctx.lineWidth = 0.09;
    ctx.stroke();
    ctx.globalAlpha = 0.32;
    ctx.fillStyle = col;
    ctx.fill();
    if (!hover.valid) {
      ctx.globalAlpha = 0.85;
      ctx.strokeStyle = "#e07050";
      ctx.lineWidth = 0.07;
      ctx.beginPath();
      ctx.moveTo(hover.x - 0.28, hover.y - 0.28);
      ctx.lineTo(hover.x + 0.28, hover.y + 0.28);
      ctx.moveTo(hover.x + 0.28, hover.y - 0.28);
      ctx.lineTo(hover.x - 0.28, hover.y + 0.28);
      ctx.stroke();
    }
  }
  ctx.restore();
}

function drawTower(ctx: CanvasRenderingContext2D, e: Entity): void {
  const king = e.towerSlot === "king";
  const glow = teamGlow(e.team);
  ctx.save();
  ctx.translate(e.x, e.y);
  if (e.dying > 0) ctx.globalAlpha = Math.max(0, e.dying);

  const bodyW = king ? 2.55 : 1.62;
  const wallH = king ? 1.35 : 0.82;

  ctx.beginPath();
  ctx.ellipse(0, 0.58, bodyW * 0.78, king ? 0.42 : 0.3, 0, 0, Math.PI * 2);
  ctx.fillStyle = "rgba(0,0,0,0.4)";
  ctx.fill();

  const sand = ctx.createLinearGradient(0, -wallH, 0, 0.55);
  sand.addColorStop(0, "#d4c49a");
  sand.addColorStop(0.35, teamMid(e.team));
  sand.addColorStop(1, teamDeep(e.team));

  roundRect(ctx, -bodyW * 0.5, -wallH * 0.55, bodyW, wallH + 0.55, 0.1);
  ctx.fillStyle = sand;
  ctx.fill();
  ctx.strokeStyle = glow;
  ctx.lineWidth = king ? 0.1 : 0.08;
  ctx.stroke();

  ctx.fillStyle = "#6e5c38";
  const rows = king ? 3 : 2;
  const bags = king ? 8 : 5;
  for (let r = 0; r < rows; r++) {
    for (let i = 0; i < bags - (r % 2); i++) {
      const bw = bodyW / bags;
      const bx = -bodyW * 0.48 + i * bw + (r % 2 ? bw * 0.35 : 0);
      const by = 0.18 - r * 0.2;
      roundRect(ctx, bx, by, bw - 0.04, 0.18, 0.05);
      ctx.fill();
    }
  }

  ctx.fillStyle = teamDeep(e.team);
  roundRect(ctx, -bodyW * 0.18, king ? -0.42 : -0.22, bodyW * 0.36, king ? 0.28 : 0.2, 0.03);
  ctx.fill();
  ctx.fillStyle = e.active ? glow : "rgba(0,0,0,0.45)";
  ctx.globalAlpha = e.active ? 0.95 : 0.28;
  ctx.fillRect(-bodyW * 0.14, king ? -0.34 : -0.16, bodyW * 0.28, 0.08);
  ctx.globalAlpha = 1;

  const mastX = king ? 0.55 : 0.36;
  const mastTop = king ? -1.55 : -0.92;
  ctx.strokeStyle = "#8a8070";
  ctx.lineWidth = king ? 0.09 : 0.07;
  ctx.beginPath();
  ctx.moveTo(mastX, -0.1);
  ctx.lineTo(mastX, mastTop);
  ctx.stroke();
  ctx.strokeStyle = glow;
  ctx.lineWidth = 0.04;
  ctx.beginPath();
  ctx.moveTo(mastX, mastTop);
  ctx.lineTo(mastX + 0.42, mastTop + 0.38);
  ctx.lineTo(mastX, mastTop + 0.52);
  ctx.stroke();

  ctx.fillStyle = glow;
  ctx.beginPath();
  ctx.moveTo(-0.04, king ? -0.58 : -0.36);
  ctx.lineTo(king ? 0.62 : 0.42, king ? -0.82 : -0.52);
  ctx.lineTo(king ? 0.62 : 0.42, king ? -0.42 : -0.26);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = BRASS;
  ctx.lineWidth = 0.045;
  ctx.stroke();

  if (!e.active && king) {
    ctx.fillStyle = "rgba(10, 12, 8, 0.4)";
    roundRect(ctx, -bodyW * 0.5, -wallH * 0.55, bodyW, wallH + 0.55, 0.1);
    ctx.fill();
  }
  ctx.restore();
}

function drawBuilding(ctx: CanvasRenderingContext2D, e: Entity, t: number, now: number): void {
  ctx.save();
  ctx.translate(e.x, e.y);
  if (now < e.deployUntil) {
    const k = 1 - (e.deployUntil - now) / 0.42;
    ctx.translate(0, (1 - clamp(k, 0, 1)) * -0.7);
    ctx.globalAlpha = Math.max(0.2, k);
    ctx.scale(0.82 + clamp(k, 0, 1) * 0.18, 0.82 + clamp(k, 0, 1) * 0.18);
  }
  if (e.dying > 0) {
    ctx.globalAlpha = Math.max(0, e.dying * 3);
    drawDeathPuff(ctx, e, 1 - clamp(e.dying / 0.28, 0, 1));
    ctx.restore();
    return;
  }

  ctx.beginPath();
  ctx.ellipse(0, 0.42, 0.78, 0.24, 0, 0, Math.PI * 2);
  ctx.fillStyle = "rgba(0,0,0,0.32)";
  ctx.fill();
  drawPillbox(ctx, e, t);

  if (justStruck(e, now)) {
    ctx.fillStyle = "rgba(255,255,255,0.28)";
    ctx.beginPath();
    ctx.arc(0, 0, 0.7, 0, Math.PI * 2);
    ctx.fill();
  }
  if (now < e.frozenUntil) smokeOverlay(ctx, 0.75);
  ctx.restore();
}

function drawPillbox(ctx: CanvasRenderingContext2D, e: Entity, t = 0): void {
  const glow = teamGlow(e.team);
  ctx.beginPath();
  for (let i = 0; i < 6; i++) {
    const a = (Math.PI / 3) * i - Math.PI / 6;
    const px = Math.cos(a) * 0.7;
    const py = Math.sin(a) * 0.42 + 0.08;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
  const g = ctx.createLinearGradient(0, -0.5, 0, 0.5);
  g.addColorStop(0, "#cbb98a");
  g.addColorStop(0.45, e.color);
  g.addColorStop(1, teamDeep(e.team));
  ctx.fillStyle = g;
  ctx.fill();
  ctx.strokeStyle = glow;
  ctx.lineWidth = 0.08;
  ctx.stroke();

  ctx.fillStyle = teamDeep(e.team);
  ctx.fillRect(-0.28, -0.08, 0.56, 0.12);
  ctx.fillStyle = glow;
  ctx.globalAlpha = 0.75 + Math.sin(t * 5) * 0.15;
  ctx.fillRect(-0.2, -0.05, 0.4, 0.05);
  ctx.globalAlpha = 1;

  ctx.strokeStyle = "#8a8070";
  ctx.lineWidth = 0.07;
  ctx.beginPath();
  ctx.moveTo(0.18, -0.12);
  ctx.lineTo(0.18, -0.72);
  ctx.stroke();
  ctx.strokeStyle = glow;
  ctx.lineWidth = 0.03;
  ctx.beginPath();
  ctx.moveTo(0.18, -0.72);
  ctx.lineTo(0.38, -0.52);
  ctx.stroke();
}

function drawDeathPuff(ctx: CanvasRenderingContext2D, e: Entity, k: number): void {
  const n = e.kind === "building" || e.radius > 0.55 ? 7 : 5;
  ctx.globalAlpha = 0.85 * (1 - k * 0.4);
  for (let i = 0; i < n; i++) {
    const a = (Math.PI * 2 * i) / n + e.id * 0.4;
    const d = 0.12 + k * (0.45 + (i % 3) * 0.12);
    ctx.beginPath();
    ctx.arc(Math.cos(a) * d, Math.sin(a) * d - k * 0.2, 0.14 + (i % 3) * 0.05, 0, Math.PI * 2);
    ctx.fillStyle = i % 2 === 0 ? "rgba(160,155,140,0.7)" : teamMid(e.team);
    ctx.fill();
  }
  ctx.fillStyle = "#5a5040";
  for (let i = 0; i < 4; i++) {
    const a = (Math.PI * 2 * i) / 4 + 0.3;
    ctx.fillRect(Math.cos(a) * k * 0.55 - 0.04, Math.sin(a) * k * 0.4 - 0.04, 0.08, 0.08);
  }
}

function justStruck(e: Entity, now: number): boolean {
  return now >= e.deployUntil && e.attackCd > e.hitSpeed - 0.16;
}

function drawTroop(ctx: CanvasRenderingContext2D, e: Entity, t: number, now: number): void {
  ctx.save();
  ctx.translate(e.x, e.y);
  const deploying = now < e.deployUntil;
  if (deploying) {
    const span = Math.max(0.18, cardById(e.cardId ?? "scouts").deployTime);
    const k = 1 - (e.deployUntil - now) / span;
    ctx.translate(0, (1 - clamp(k, 0, 1)) * -0.85);
    ctx.globalAlpha = clamp(k + 0.2, 0.2, 1);
  }
  if (e.dying > 0) {
    drawDeathPuff(ctx, e, 1 - clamp(e.dying / 0.28, 0, 1));
    ctx.restore();
    return;
  }
  const idle = now >= e.deployUntil && now >= e.frozenUntil;
  const walk = idle && e.speed > 0 ? Math.sin(e.bob) * 0.05 : Math.sin(t * 3 + e.id) * 0.018;
  ctx.translate(0, walk);
  if (justStruck(e, now)) ctx.scale(1.08, 1.08);

  ctx.beginPath();
  ctx.ellipse(0, e.radius * 0.9, e.radius * 0.95, e.radius * 0.32, 0, 0, Math.PI * 2);
  ctx.fillStyle = "rgba(0,0,0,0.32)";
  ctx.fill();

  ctx.save();
  ctx.rotate(e.facing + Math.PI / 2);
  const id = e.cardId;
  if (id === "ironhide") drawIronhide(ctx, e);
  else if (id === "bayonet") drawBayonet(ctx, e);
  else if (id === "marksman") drawMarksman(ctx, e);
  else if (id === "mortar") drawMortar(ctx, e);
  else drawScout(ctx, e);

  if (justStruck(e, now)) {
    ctx.globalAlpha = 0.4;
    ctx.fillStyle = "#fff";
    ctx.beginPath();
    ctx.arc(0, 0, e.radius + 0.1, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();

  if (now < e.frozenUntil) smokeOverlay(ctx, e.radius + 0.18);
  ctx.restore();
}

function rimFill(
  ctx: CanvasRenderingContext2D,
  e: Entity,
  path: () => void,
): void {
  const g = ctx.createLinearGradient(-0.4, -0.5, 0.4, 0.55);
  g.addColorStop(0, "#d8d2c4");
  g.addColorStop(0.45, e.color);
  g.addColorStop(1, teamDeep(e.team));
  path();
  ctx.fillStyle = g;
  ctx.fill();
  ctx.strokeStyle = teamGlow(e.team);
  ctx.lineWidth = 0.08;
  ctx.stroke();
}

function helmet(ctx: CanvasRenderingContext2D, e: Entity, x: number, y: number, s = 1): void {
  ctx.beginPath();
  ctx.ellipse(x, y, 0.16 * s, 0.11 * s, 0, Math.PI, 0);
  ctx.fillStyle = teamMid(e.team);
  ctx.fill();
  ctx.strokeStyle = teamGlow(e.team);
  ctx.lineWidth = 0.04 * s;
  ctx.stroke();
  ctx.fillStyle = teamDeep(e.team);
  ctx.fillRect(x - 0.17 * s, y - 0.02 * s, 0.34 * s, 0.05 * s);
}

function drawScout(ctx: CanvasRenderingContext2D, e: Entity): void {
  rimFill(ctx, e, () => {
    ctx.beginPath();
    ctx.ellipse(0, 0.16, 0.18, 0.24, 0, 0, Math.PI * 2);
  });
  helmet(ctx, e, 0, -0.14, 1.15);
  ctx.strokeStyle = teamGlow(e.team);
  ctx.lineWidth = 0.055;
  ctx.beginPath();
  ctx.moveTo(0.1, 0.04);
  ctx.lineTo(0.32, -0.22);
  ctx.stroke();
}

function drawBayonet(ctx: CanvasRenderingContext2D, e: Entity): void {
  ctx.fillStyle = "#e8e0cc";
  ctx.beginPath();
  ctx.moveTo(0.02, -1.18);
  ctx.lineTo(0.14, -0.18);
  ctx.lineTo(-0.08, -0.14);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = BRASS;
  ctx.lineWidth = 0.055;
  ctx.stroke();
  rimFill(ctx, e, () => {
    ctx.beginPath();
    ctx.moveTo(-0.32, 0.52);
    ctx.lineTo(-0.24, -0.12);
    ctx.lineTo(0.24, -0.12);
    ctx.lineTo(0.34, 0.52);
    ctx.closePath();
  });
  helmet(ctx, e, 0, -0.26, 1.4);
}

function drawMarksman(ctx: CanvasRenderingContext2D, e: Entity): void {
  rimFill(ctx, e, () => {
    ctx.beginPath();
    ctx.ellipse(-0.06, 0.22, 0.32, 0.18, -0.4, 0, Math.PI * 2);
  });
  helmet(ctx, e, -0.18, 0.02, 1.05);
  ctx.strokeStyle = teamDeep(e.team);
  ctx.lineWidth = 0.11;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(-0.12, 0.12);
  ctx.lineTo(0.78, -0.08);
  ctx.stroke();
  ctx.strokeStyle = teamGlow(e.team);
  ctx.lineWidth = 0.05;
  ctx.beginPath();
  ctx.moveTo(-0.12, 0.12);
  ctx.lineTo(0.78, -0.08);
  ctx.stroke();
  ctx.strokeStyle = BRASS;
  ctx.lineWidth = 0.06;
  ctx.beginPath();
  ctx.moveTo(0.34, -0.2);
  ctx.lineTo(0.34, 0.08);
  ctx.stroke();
  ctx.fillStyle = teamGlow(e.team);
  ctx.fillRect(0.7, -0.14, 0.14, 0.08);
}

function drawIronhide(ctx: CanvasRenderingContext2D, e: Entity): void {
  const glow = teamGlow(e.team);
  const steel = ctx.createLinearGradient(-0.7, -0.6, 0.7, 0.6);
  steel.addColorStop(0, "#d8d2c4");
  steel.addColorStop(0.45, "#8a9080");
  steel.addColorStop(1, teamDeep(e.team));
  roundRect(ctx, -0.72, -0.12, 1.44, 0.78, 0.08);
  ctx.fillStyle = steel;
  ctx.fill();
  ctx.strokeStyle = glow;
  ctx.lineWidth = 0.09;
  ctx.stroke();
  ctx.fillStyle = teamDeep(e.team);
  for (let i = 0; i < 5; i++) {
    ctx.fillRect(-0.68 + i * 0.28, 0.52, 0.2, 0.16);
  }
  roundRect(ctx, -0.32, -0.48, 0.64, 0.42, 0.08);
  ctx.fillStyle = "#6a7064";
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = glow;
  ctx.fillRect(-0.04, -0.92, 0.08, 0.48);
  ctx.fillRect(-0.18, -0.38, 0.12, 0.1);
  ctx.fillRect(0.06, -0.38, 0.12, 0.1);
}

function drawMortar(ctx: CanvasRenderingContext2D, e: Entity): void {
  rimFill(ctx, e, () => {
    ctx.beginPath();
    ctx.ellipse(0, 0.28, 0.46, 0.28, 0, 0, Math.PI * 2);
  });
  ctx.strokeStyle = teamDeep(e.team);
  ctx.lineWidth = 0.2;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(0.02, 0.18);
  ctx.lineTo(0.48, -0.62);
  ctx.stroke();
  ctx.strokeStyle = teamGlow(e.team);
  ctx.lineWidth = 0.08;
  ctx.beginPath();
  ctx.moveTo(0.02, 0.18);
  ctx.lineTo(0.48, -0.62);
  ctx.stroke();
  ctx.fillStyle = BRASS;
  ctx.beginPath();
  ctx.arc(0.52, -0.7, 0.1, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#e8a040";
  ctx.beginPath();
  ctx.arc(0.62, -0.86, 0.06, 0, Math.PI * 2);
  ctx.fill();
  helmet(ctx, e, -0.22, 0.08, 0.95);
}

function drawSpellMarker(ctx: CanvasRenderingContext2D, e: Entity, t: number): void {
  const card = cardById(e.cardId!);
  const k = clamp(1 - e.attackCd / Math.max(0.05, card.spellDelay), 0, 1);
  const haze = card.id === "smoke";
  ctx.save();
  ctx.translate(e.x, e.y);
  const beat = 0.88 + 0.12 * Math.max(0, Math.sin(k * Math.PI * 5));
  const r = card.spellRadius * (0.42 + k * 0.58);

  if (k < 0.78) {
    ctx.globalAlpha = 0.16 + k * 0.22;
    ctx.fillStyle = haze ? "rgba(180,180,170,0.55)" : "#d45a20";
    ctx.beginPath();
    ctx.arc(0, 0, r * beat, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 0.85;
    ctx.strokeStyle = haze ? "#c8c4b4" : "#e8a040";
    ctx.lineWidth = 0.12;
    if (haze) ctx.setLineDash([0.22, 0.14]);
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
    if (haze) {
      ctx.strokeStyle = "rgba(200,198,180,0.55)";
      ctx.lineWidth = 0.05;
      for (let i = 0; i < 6; i++) {
        const a = (Math.PI * 2 * i) / 6 + t * 0.4;
        ctx.beginPath();
        ctx.moveTo(Math.cos(a) * 0.15, Math.sin(a) * 0.15);
        ctx.lineTo(Math.cos(a) * r * 0.7, Math.sin(a) * r * 0.7);
        ctx.stroke();
      }
      ctx.fillStyle = "rgba(200,198,180,0.7)";
      ctx.beginPath();
      ctx.ellipse(0, -0.15 - k * 0.2, 0.28 + k * 0.15, 0.4 + k * 0.25, 0, 0, Math.PI * 2);
      ctx.fill();
    } else {
      ctx.strokeStyle = "#e8a040";
      ctx.lineWidth = 0.07;
      ctx.beginPath();
      ctx.arc(0, 0, r * 0.55, 0, Math.PI * 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(0, 0, r * 0.22, 0, Math.PI * 2);
      ctx.stroke();
      ctx.strokeStyle = "#f2efe6";
      ctx.beginPath();
      ctx.moveTo(-0.28, 0);
      ctx.lineTo(0.28, 0);
      ctx.moveTo(0, -0.28);
      ctx.lineTo(0, 0.28);
      ctx.stroke();
    }
  } else {
    const pop = (k - 0.78) / 0.22;
    if (haze) {
      ctx.globalAlpha = 0.5 * (1 - pop * 0.3);
      ctx.fillStyle = "rgba(180,180,170,0.7)";
      ctx.beginPath();
      ctx.arc(0, 0, card.spellRadius * (0.8 + pop * 0.25), 0, Math.PI * 2);
      ctx.fill();
    } else {
      ctx.globalAlpha = 0.55 * (1 - pop * 0.3);
      ctx.fillStyle = "#d45a20";
      ctx.beginPath();
      ctx.arc(0, 0, card.spellRadius * (0.7 + pop * 0.25), 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#e8a040";
      ctx.beginPath();
      for (let i = 0; i < 10; i++) {
        const a = (Math.PI * 2 * i) / 10;
        const rr = i % 2 === 0 ? card.spellRadius * (0.95 + pop * 0.12) : card.spellRadius * 0.42;
        const px = Math.cos(a) * rr;
        const py = Math.sin(a) * rr;
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = "#f2efe6";
      ctx.lineWidth = 0.08;
      ctx.stroke();
    }
  }
  ctx.restore();
}

function drawProjectile(ctx: CanvasRenderingContext2D, p: Projectile): void {
  ctx.save();
  ctx.translate(p.x, p.y);
  const ang = Math.atan2(p.ty - p.y, p.tx - p.x);
  ctx.rotate(ang);
  ctx.fillStyle = p.color;
  ctx.beginPath();
  ctx.ellipse(0, 0, p.radius * 2.2, p.radius * 0.7, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#f2efe6";
  ctx.beginPath();
  ctx.arc(0.05, 0, p.radius * 0.45, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawHealth(ctx: CanvasRenderingContext2D, e: Entity): void {
  if (e.hp <= 0) return;
  const w = e.kind === "tower" ? (e.towerSlot === "king" ? 2.25 : 1.82) : Math.max(0.78, e.radius * 2.3);
  const h = e.kind === "tower" ? 0.18 : 0.12;
  const y = e.kind === "tower" ? -(e.towerSlot === "king" ? 2.55 : 1.45) : -e.radius - 0.42;
  const pct = clamp(e.hp / e.maxHp, 0, 1);
  ctx.save();
  ctx.translate(e.x, e.y);
  roundRect(ctx, -w / 2 - 0.04, y - 0.03, w + 0.08, h + 0.06, 0.05);
  ctx.fillStyle = "rgba(12, 14, 10, 0.75)";
  ctx.fill();
  ctx.strokeStyle = "rgba(201, 162, 39, 0.4)";
  ctx.lineWidth = 0.03;
  ctx.stroke();
  roundRect(ctx, -w / 2, y, w * pct, h, 0.04);
  ctx.fillStyle = pct > 0.4 ? teamGlow(e.team) : "#c4783a";
  ctx.fill();
  if (e.kind === "tower") {
    ctx.fillStyle = "rgba(242,239,230,0.85)";
    ctx.font = "0.28px sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(String(Math.max(0, Math.round(e.hp))), 0, y + h * 0.55);
  }
  ctx.restore();
}

function smokeOverlay(ctx: CanvasRenderingContext2D, r: number): void {
  ctx.save();
  ctx.globalAlpha = 0.5;
  ctx.strokeStyle = "#c8c4b4";
  ctx.lineWidth = 0.06;
  ctx.setLineDash([0.16, 0.1]);
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, Math.PI * 2);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.fillStyle = "rgba(180,180,170,0.32)";
  ctx.fill();
  ctx.restore();
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
  const bg = ctx.createLinearGradient(0, 0, w, h);
  bg.addColorStop(0, shade(card.color, 0.55));
  bg.addColorStop(0.5, shade(card.color, 0.22));
  bg.addColorStop(1, "#16180f");
  roundRect(ctx, 0, 0, w, h, 6);
  ctx.fillStyle = bg;
  ctx.fill();

  ctx.save();
  ctx.beginPath();
  roundRect(ctx, 0, 0, w, h, 6);
  ctx.clip();
  ctx.strokeStyle = "rgba(201,162,39,0.18)";
  ctx.lineWidth = 6;
  ctx.beginPath();
  ctx.moveTo(-8, h * 0.75);
  ctx.lineTo(w * 0.65, -8);
  ctx.stroke();
  ctx.restore();

  ctx.save();
  ctx.translate(w / 2, h * 0.56);
  ctx.scale(Math.min(w, h) / 2.55, Math.min(w, h) / 2.55);
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
    if (cardId === "smoke") {
      ctx.fillStyle = "rgba(180,180,170,0.55)";
      ctx.beginPath();
      ctx.ellipse(0, -0.15, 0.38, 0.55, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "#c8c4b4";
      ctx.lineWidth = 0.07;
      ctx.setLineDash([0.12, 0.08]);
      ctx.beginPath();
      ctx.arc(0, 0.15, 0.62, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
    } else {
      ctx.strokeStyle = "#e8a040";
      ctx.lineWidth = 0.07;
      ctx.beginPath();
      ctx.arc(0, 0, 0.7, 0, Math.PI * 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(0, 0, 0.42, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = "#d45a20";
      ctx.beginPath();
      for (let i = 0; i < 8; i++) {
        const a = (Math.PI * 2 * i) / 8 - Math.PI / 2;
        const rr = i % 2 === 0 ? 0.38 : 0.16;
        const px = Math.cos(a) * rr;
        const py = Math.sin(a) * rr;
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.closePath();
      ctx.fill();
    }
  } else if (card.kind === "building") {
    drawPillbox(ctx, fake, 1);
  } else if (cardId === "ironhide") drawIronhide(ctx, fake);
  else if (cardId === "bayonet") drawBayonet(ctx, fake);
  else if (cardId === "marksman") drawMarksman(ctx, fake);
  else if (cardId === "mortar") drawMortar(ctx, fake);
  else {
    ctx.save();
    ctx.translate(0, 0.08);
    ctx.save();
    ctx.translate(-0.28, 0.18);
    ctx.scale(0.78, 0.78);
    drawScout(ctx, fake);
    ctx.restore();
    ctx.save();
    ctx.translate(0.28, 0.18);
    ctx.scale(0.78, 0.78);
    drawScout(ctx, fake);
    ctx.restore();
    ctx.save();
    ctx.translate(0, -0.22);
    drawScout(ctx, fake);
    ctx.restore();
    ctx.restore();
  }
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
