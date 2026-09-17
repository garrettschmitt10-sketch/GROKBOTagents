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

const AURORA = "#5cf6d5";
const DUSK = "#ff6b9a";
const GOLD = "#f4d78a";

export function layoutCam(cw: number, ch: number): ViewCam {
  const padX = cw * 0.055;
  const padTop = ch * 0.012;
  const padBot = ch * 0.01;
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

const teamGlow = (team: Team) => (team === 0 ? AURORA : DUSK);
const teamDeep = (team: Team) => (team === 0 ? "#0c3d3a" : "#3a1028");
const teamMid = (team: Team) => (team === 0 ? "#1a7a72" : "#8a2a4e");

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

  drawOuterFrame(ctx, t);

  ctx.save();
  ctx.beginPath();
  roundRect(ctx, 0, 0, ARENA_W, ARENA_H, 0.5);
  ctx.clip();

  drawCourtFloor(ctx, t);
  drawLaneRunes(ctx, t);
  drawRiver(ctx, t);
  drawBridges(ctx, t);
  drawPads(ctx, match, t);

  if (hover?.cardId) {
    drawDeployHint(ctx, match, { ...hover, cardId: hover.cardId });
  }

  const sorted = match.entities.slice().sort((a, b) => a.y - b.y || a.id - b.id);
  for (const e of sorted) if (e.kind === "tower") drawTower(ctx, e, t);
  for (const e of sorted) if (e.kind === "building") drawBuilding(ctx, e, t, match.now);
  for (const e of sorted) if (e.kind === "troop") drawTroop(ctx, e, t, match.now);
  for (const e of sorted) if (e.kind === "spell") drawSpellMarker(ctx, e, t);
  for (const p of match.projectiles) drawProjectile(ctx, p, t);
  for (const e of sorted) {
    if (e.kind === "tower" || e.kind === "building" || e.kind === "troop") drawHealth(ctx, e);
  }

  ctx.restore();
  ctx.restore();
}

function drawOuterFrame(ctx: CanvasRenderingContext2D, t: number): void {
  roundRect(ctx, -0.55, -0.55, ARENA_W + 1.1, ARENA_H + 1.1, 0.85);
  const rim = ctx.createLinearGradient(0, 0, ARENA_W, ARENA_H);
  rim.addColorStop(0, "#1a3d48");
  rim.addColorStop(0.5, "#2a1a38");
  rim.addColorStop(1, "#1a3d48");
  ctx.fillStyle = rim;
  ctx.fill();

  roundRect(ctx, -0.38, -0.38, ARENA_W + 0.76, ARENA_H + 0.76, 0.72);
  ctx.strokeStyle = GOLD;
  ctx.globalAlpha = 0.55 + Math.sin(t * 1.4) * 0.12;
  ctx.lineWidth = 0.12;
  ctx.stroke();
  ctx.globalAlpha = 1;

  roundRect(ctx, 0, 0, ARENA_W, ARENA_H, 0.5);
  ctx.fillStyle = "#07101c";
  ctx.fill();
}

function drawCourtFloor(ctx: CanvasRenderingContext2D, t: number): void {
  const sky = ctx.createLinearGradient(0, 0, 0, ARENA_H);
  sky.addColorStop(0, "#1a0c28");
  sky.addColorStop(0.42, "#122038");
  sky.addColorStop(0.5, "#16324a");
  sky.addColorStop(0.58, "#0e2a32");
  sky.addColorStop(1, "#071e24");
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, ARENA_W, ARENA_H);

  ctx.globalAlpha = 0.55;
  const aurora = ctx.createLinearGradient(0, 0, ARENA_W, ARENA_H * 0.45);
  aurora.addColorStop(0, "rgba(255, 90, 140, 0.18)");
  aurora.addColorStop(0.5, "rgba(90, 220, 255, 0.08)");
  aurora.addColorStop(1, "rgba(80, 255, 210, 0.16)");
  ctx.fillStyle = aurora;
  ctx.beginPath();
  ctx.moveTo(0, 2);
  for (let x = 0; x <= ARENA_W; x += 0.4) {
    ctx.lineTo(x, 3.2 + Math.sin(x * 0.45 + t * 0.35) * 1.1);
  }
  ctx.lineTo(ARENA_W, 0);
  ctx.lineTo(0, 0);
  ctx.fill();
  ctx.globalAlpha = 1;

  for (let i = 0; i < 16; i++) {
    const sx = ((i * 47) % 180) / 10;
    const sy = ((i * 31) % 310) / 10;
    const tw = 0.35 + 0.65 * (0.5 + 0.5 * Math.sin(t * 2.2 + i));
    ctx.globalAlpha = 0.15 + tw * 0.45;
    ctx.fillStyle = i % 3 === 0 ? GOLD : "#e8f6ff";
    ctx.beginPath();
    ctx.arc(sx, sy, 0.04 + (i % 4) * 0.015, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;

  for (let row = 0; row < ARENA_H; row++) {
    for (let col = 0; col < ARENA_W; col++) {
      if ((row + col) % 2) continue;
      const north = row < RIVER_TOP;
      ctx.fillStyle = north ? "rgba(140, 40, 90, 0.07)" : "rgba(30, 110, 100, 0.07)";
      ctx.fillRect(col, row, 1, 1);
    }
  }

  const vein = ctx.createLinearGradient(0, 0, ARENA_W, ARENA_H);
  vein.addColorStop(0, "rgba(92, 246, 213, 0.06)");
  vein.addColorStop(1, "rgba(255, 107, 154, 0.06)");
  ctx.strokeStyle = vein;
  ctx.lineWidth = 0.035;
  for (let i = 0; i < 7; i++) {
    ctx.beginPath();
    ctx.moveTo(i * 2.6, 0);
    ctx.bezierCurveTo(i * 2.6 + 1.5, 10, i * 2.6 - 1, 22, i * 2.6 + 0.8, ARENA_H);
    ctx.stroke();
  }
}

function drawLaneRunes(ctx: CanvasRenderingContext2D, t: number): void {
  ctx.save();
  ctx.globalAlpha = 0.22 + Math.sin(t * 1.6) * 0.06;
  for (const x of [3.8, 14.2]) {
    const lg = ctx.createLinearGradient(x, 1.6, x, ARENA_H - 1.6);
    lg.addColorStop(0, DUSK);
    lg.addColorStop(0.5, "#9ad8ff");
    lg.addColorStop(1, AURORA);
    ctx.strokeStyle = lg;
    ctx.lineWidth = 0.18;
    ctx.beginPath();
    ctx.moveTo(x, 2.4);
    ctx.lineTo(x, RIVER_TOP - 0.15);
    ctx.moveTo(x, RIVER_BOT + 0.15);
    ctx.lineTo(x, ARENA_H - 2.4);
    ctx.stroke();
  }
  ctx.globalAlpha = 0.18;
  ctx.fillStyle = GOLD;
  for (const cx of [3.8, 9, 14.2]) {
    for (const cy of [11.2, 20.8]) {
      ctx.beginPath();
      ctx.arc(cx, cy, 0.22, 0, Math.PI * 2);
      ctx.strokeStyle = GOLD;
      ctx.lineWidth = 0.05;
      ctx.stroke();
    }
  }
  ctx.restore();
}

function drawRiver(ctx: CanvasRenderingContext2D, t: number): void {
  const y = RIVER_TOP;
  const h = RIVER_BOT - RIVER_TOP;

  ctx.fillStyle = "rgba(20, 180, 220, 0.18)";
  ctx.fillRect(0, y - 0.35, ARENA_W, h + 0.7);

  const rg = ctx.createLinearGradient(0, y, 0, y + h);
  rg.addColorStop(0, "#123a62");
  rg.addColorStop(0.35, "#2ec7e8");
  rg.addColorStop(0.5, "#b8fbff");
  rg.addColorStop(0.65, "#5a8cff");
  rg.addColorStop(1, "#123a62");
  ctx.fillStyle = rg;
  ctx.fillRect(0, y, ARENA_W, h);

  ctx.globalAlpha = 0.55;
  ctx.strokeStyle = "#e8ffff";
  ctx.lineWidth = 0.045;
  for (let i = 0; i < 5; i++) {
    ctx.beginPath();
    const yy = y + 0.22 + i * 0.28;
    for (let x = 0; x <= ARENA_W; x += 0.2) {
      const oy = Math.sin(x * 1.15 + t * 2.4 + i * 0.9) * 0.1;
      if (x === 0) ctx.moveTo(x, yy + oy);
      else ctx.lineTo(x, yy + oy);
    }
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
  for (let i = 0; i < 10; i++) {
    const px = (i * 1.9 + t * 0.6) % ARENA_W;
    const py = y + 0.35 + Math.sin(t * 3 + i) * 0.4;
    ctx.globalAlpha = 0.35 + Math.sin(t * 5 + i) * 0.25;
    ctx.fillStyle = "#fff";
    ctx.beginPath();
    ctx.arc(px, py, 0.07, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

function drawBridges(ctx: CanvasRenderingContext2D, t: number): void {
  for (const b of BRIDGES) {
    const x = b.x1;
    const w = b.x2 - b.x1;
    const y = RIVER_TOP - 0.22;
    const h = RIVER_BOT - RIVER_TOP + 0.44;

    ctx.fillStyle = "rgba(80, 220, 255, 0.12)";
    roundRect(ctx, x - 0.12, y - 0.08, w + 0.24, h + 0.16, 0.22);
    ctx.fill();

    const glass = ctx.createLinearGradient(x, y, x + w, y + h);
    glass.addColorStop(0, "rgba(180, 230, 255, 0.35)");
    glass.addColorStop(0.5, "rgba(90, 140, 190, 0.55)");
    glass.addColorStop(1, "rgba(180, 230, 255, 0.3)");
    roundRect(ctx, x, y, w, h, 0.16);
    ctx.fillStyle = glass;
    ctx.fill();
    ctx.strokeStyle = GOLD;
    ctx.lineWidth = 0.07;
    ctx.stroke();

    ctx.strokeStyle = "rgba(255,255,255,0.18)";
    ctx.lineWidth = 0.035;
    for (let i = 1; i < 4; i++) {
      ctx.beginPath();
      ctx.moveTo(x + 0.12, y + (h * i) / 4);
      ctx.lineTo(x + w - 0.12, y + (h * i) / 4);
      ctx.stroke();
    }

    const sweep = ((t * 1.15) % 1.4) - 0.2;
    ctx.save();
    ctx.beginPath();
    roundRect(ctx, x, y, w, h, 0.16);
    ctx.clip();
    const sg = ctx.createLinearGradient(x, y + sweep * h, x + w, y + sweep * h + 0.55);
    sg.addColorStop(0, "rgba(255,255,255,0)");
    sg.addColorStop(0.5, "rgba(255,255,255,0.55)");
    sg.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = sg;
    ctx.fillRect(x, y + sweep * h - 0.15, w, 0.55);
    ctx.restore();

    ctx.fillStyle = GOLD;
    ctx.globalAlpha = 0.9;
    ctx.fillRect(x + 0.08, y + 0.06, 0.12, h - 0.12);
    ctx.fillRect(x + w - 0.2, y + 0.06, 0.12, h - 0.12);
    ctx.globalAlpha = 1;
  }
}

function drawPads(ctx: CanvasRenderingContext2D, match: Match, t: number): void {
  for (const e of match.entities) {
    if (e.kind !== "tower") continue;
    const king = e.towerSlot === "king";
    ctx.save();
    ctx.translate(e.x, e.y);
    ctx.beginPath();
    ctx.ellipse(0, e.radius * 0.62, e.radius * (king ? 1.7 : 1.25), e.radius * (king ? 0.68 : 0.5), 0, 0, Math.PI * 2);
    const pulse = king ? 0.22 + Math.sin(t * 2.1 + e.id) * 0.06 : 0.1;
    ctx.fillStyle = e.team === 0 ? `rgba(92,246,213,${pulse})` : `rgba(255,107,154,${pulse})`;
    ctx.fill();
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
  const col = hover.valid ? AURORA : DUSK;
  if (card.kind === "spell") {
    ctx.globalAlpha = 0.16;
    ctx.fillStyle = col;
    ctx.beginPath();
    ctx.arc(hover.x, hover.y, card.spellRadius, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 0.85;
    ctx.strokeStyle = col;
    ctx.lineWidth = 0.1;
    ctx.setLineDash([0.18, 0.12]);
    ctx.stroke();
    ctx.setLineDash([]);
  } else {
    const unlock = match.unlocksFor(0);
    ctx.globalAlpha = 0.12;
    ctx.fillStyle = AURORA;
    ctx.fillRect(0.15, RIVER_BOT, ARENA_W - 0.3, ARENA_H - RIVER_BOT - 1.2);
    if (unlock.left) ctx.fillRect(0.15, 6.4, ARENA_W * 0.5 - 0.15, RIVER_TOP - 6.4);
    if (unlock.right) ctx.fillRect(ARENA_W * 0.5, 6.4, ARENA_W * 0.5 - 0.15, RIVER_TOP - 6.4);
    ctx.globalAlpha = 0.9;
    ctx.beginPath();
    ctx.arc(hover.x, hover.y, card.radius + 0.22, 0, Math.PI * 2);
    ctx.strokeStyle = hover.valid ? "#e8fff8" : "#ff8a96";
    ctx.lineWidth = 0.08;
    ctx.stroke();
    ctx.globalAlpha = 0.28;
    ctx.fillStyle = col;
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

  const bodyH = king ? 2.95 : 1.62;
  const bodyW = king ? 2.15 : 1.18;

  ctx.beginPath();
  ctx.ellipse(0, 0.58, bodyW * 0.7, king ? 0.42 : 0.28, 0, 0, Math.PI * 2);
  ctx.fillStyle = "rgba(0,0,0,0.4)";
  ctx.fill();

  if (king) {
    ctx.globalAlpha = e.active ? 0.55 : 0.12;
    ctx.strokeStyle = glow;
    ctx.lineWidth = 0.14;
    ctx.beginPath();
    ctx.arc(0, -0.35, 1.55, 0, Math.PI * 2);
    ctx.stroke();
    ctx.globalAlpha = e.active ? 0.22 : 0.05;
    ctx.fillStyle = glow;
    ctx.fill();
    ctx.globalAlpha = 1;
  }

  const baseG = ctx.createLinearGradient(0, -bodyH, 0, 0.55);
  baseG.addColorStop(0, king ? "#fff6c8" : "#dceaf6");
  baseG.addColorStop(0.28, glow);
  baseG.addColorStop(1, teamDeep(e.team));

  if (king) {
    ctx.beginPath();
    ctx.moveTo(-bodyW * 0.58, 0.5);
    ctx.lineTo(-bodyW * 0.48, -0.15);
    ctx.lineTo(-bodyW * 0.22, -bodyH + 0.7);
    ctx.lineTo(0, -bodyH + 0.18);
    ctx.lineTo(bodyW * 0.22, -bodyH + 0.7);
    ctx.lineTo(bodyW * 0.48, -0.15);
    ctx.lineTo(bodyW * 0.58, 0.5);
    ctx.closePath();
    ctx.fillStyle = baseG;
    ctx.fill();
    ctx.strokeStyle = GOLD;
    ctx.lineWidth = 0.1;
    ctx.stroke();

    ctx.fillStyle = teamMid(e.team);
    ctx.beginPath();
    ctx.moveTo(-bodyW * 0.62, 0.22);
    ctx.lineTo(-bodyW * 0.38, -bodyH * 0.35);
    ctx.lineTo(-bodyW * 0.22, 0.4);
    ctx.closePath();
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(bodyW * 0.62, 0.22);
    ctx.lineTo(bodyW * 0.38, -bodyH * 0.35);
    ctx.lineTo(bodyW * 0.22, 0.4);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = GOLD;
    ctx.beginPath();
    ctx.moveTo(0, -bodyH - 0.38);
    ctx.lineTo(0.38, -bodyH + 0.22);
    ctx.lineTo(0.14, -bodyH + 0.08);
    ctx.lineTo(0, -bodyH + 0.42);
    ctx.lineTo(-0.14, -bodyH + 0.08);
    ctx.lineTo(-0.38, -bodyH + 0.22);
    ctx.closePath();
    ctx.fill();
  } else {
    ctx.beginPath();
    ctx.moveTo(-bodyW * 0.5, 0.4);
    ctx.lineTo(-bodyW * 0.22, -bodyH + 0.55);
    ctx.lineTo(0, -bodyH + 0.28);
    ctx.lineTo(bodyW * 0.22, -bodyH + 0.55);
    ctx.lineTo(bodyW * 0.5, 0.4);
    ctx.closePath();
    ctx.fillStyle = baseG;
    ctx.fill();
    ctx.strokeStyle = glow;
    ctx.lineWidth = 0.06;
    ctx.stroke();
    ctx.fillStyle = GOLD;
    ctx.beginPath();
    ctx.moveTo(0, -bodyH - 0.02);
    ctx.lineTo(0.16, -bodyH + 0.22);
    ctx.lineTo(-0.16, -bodyH + 0.22);
    ctx.closePath();
    ctx.fill();
  }

  ctx.fillStyle = teamMid(e.team);
  roundRect(ctx, -bodyW * 0.14, king ? 0.02 : -0.06, bodyW * 0.28, king ? 0.48 : 0.4, 0.07);
  ctx.fill();
  ctx.fillStyle = e.active ? glow : "rgba(0,0,0,0.35)";
  ctx.globalAlpha = e.active ? 0.95 : 0.3;
  ctx.beginPath();
  ctx.arc(0, king ? 0.22 : 0.1, king ? 0.16 : 0.1, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 1;

  if (!e.active && king) {
    ctx.fillStyle = "rgba(4, 8, 16, 0.38)";
    ctx.beginPath();
    ctx.moveTo(-bodyW * 0.58, 0.5);
    ctx.lineTo(0, -bodyH + 0.18);
    ctx.lineTo(bodyW * 0.58, 0.5);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();
  void t;
}

function drawBuilding(ctx: CanvasRenderingContext2D, e: Entity, t: number, now: number): void {
  ctx.save();
  ctx.translate(e.x, e.y);
  if (now < e.deployUntil) {
    const k = 1 - (e.deployUntil - now) / 0.85;
    ctx.translate(0, (1 - k) * -1.4);
    ctx.globalAlpha = Math.max(0.15, k);
    ctx.scale(0.7 + k * 0.3, 0.7 + k * 0.3);
  }
  if (e.dying > 0) {
    ctx.globalAlpha = Math.max(0, e.dying * 3);
    drawShatter(ctx, e, 1 - clamp(e.dying / 0.28, 0, 1));
    ctx.restore();
    return;
  }

  ctx.beginPath();
  ctx.ellipse(0, 0.48, 0.78, 0.28, 0, 0, Math.PI * 2);
  ctx.fillStyle = "rgba(0,0,0,0.32)";
  ctx.fill();

  const glow = teamGlow(e.team);
  const g = ctx.createLinearGradient(0, -1.1, 0, 0.4);
  g.addColorStop(0, "#f0e8ff");
  g.addColorStop(0.4, e.color);
  g.addColorStop(1, teamDeep(e.team));

  ctx.beginPath();
  ctx.moveTo(0, -1.15);
  ctx.lineTo(0.42, -0.15);
  ctx.lineTo(0.28, 0.42);
  ctx.lineTo(-0.28, 0.42);
  ctx.lineTo(-0.42, -0.15);
  ctx.closePath();
  ctx.fillStyle = g;
  ctx.fill();
  ctx.strokeStyle = glow;
  ctx.lineWidth = 0.07;
  ctx.stroke();

  ctx.fillStyle = "#fff";
  ctx.globalAlpha = 0.8 + Math.sin(t * 6) * 0.2;
  ctx.beginPath();
  ctx.arc(0, -0.22, 0.16, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 0.35;
  ctx.strokeStyle = glow;
  ctx.lineWidth = 0.05;
  ctx.beginPath();
  ctx.arc(0, -0.22, 0.38 + Math.sin(t * 4) * 0.04, 0, Math.PI * 2);
  ctx.stroke();
  ctx.globalAlpha = 1;

  if (justStruck(e, now)) {
    ctx.fillStyle = "rgba(255,255,255,0.35)";
    ctx.fill();
  }
  if (now < e.frozenUntil) frostOverlay(ctx, 0.75);
  ctx.restore();
}

function drawShatter(ctx: CanvasRenderingContext2D, e: Entity, k: number): void {
  const n = e.kind === "building" || e.radius > 0.55 ? 6 : 5;
  const glow = teamGlow(e.team);
  ctx.globalAlpha = 1 - k * 0.15;
  for (let i = 0; i < n; i++) {
    const a = (Math.PI * 2 * i) / n + e.id * 0.7;
    const d = (0.18 + (i % 3) * 0.08) + k * (0.55 + (i % 2) * 0.25);
    const cx = Math.cos(a) * d;
    const cy = Math.sin(a) * d - k * 0.15;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(a + k * 1.8);
    ctx.beginPath();
    const s = e.radius * (0.45 + (i % 3) * 0.12);
    ctx.moveTo(0, -s);
    ctx.lineTo(s * 0.55, s * 0.7);
    ctx.lineTo(-s * 0.7, s * 0.35);
    ctx.closePath();
    ctx.fillStyle = i % 2 === 0 ? glow : GOLD;
    ctx.fill();
    ctx.strokeStyle = "#fff";
    ctx.globalAlpha = 0.55;
    ctx.lineWidth = 0.04;
    ctx.stroke();
    ctx.restore();
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
    const k = 1 - (e.deployUntil - now) / 0.7;
    ctx.translate(0, (1 - clamp(k, 0, 1)) * -1.55);
    ctx.globalAlpha = clamp(k + 0.15, 0.15, 1);
  }
  if (e.dying > 0) {
    drawShatter(ctx, e, 1 - clamp(e.dying / 0.28, 0, 1));
    ctx.restore();
    return;
  }
  const idle = now >= e.deployUntil && now >= e.frozenUntil;
  const walk = idle && e.speed > 0 ? Math.sin(e.bob) * 0.07 : Math.sin(t * 3 + e.id) * 0.025;
  ctx.translate(0, walk);
  if (justStruck(e, now)) ctx.scale(1.12, 1.12);

  ctx.beginPath();
  ctx.ellipse(0, e.radius * 0.9, e.radius * 0.95, e.radius * 0.34, 0, 0, Math.PI * 2);
  ctx.fillStyle = "rgba(0,0,0,0.32)";
  ctx.fill();

  ctx.save();
  ctx.rotate(e.facing + Math.PI / 2);
  const id = e.cardId;
  if (id === "ironhide") drawIronhide(ctx, e);
  else if (id === "ashblade") drawAshblade(ctx, e);
  else if (id === "boltbow") drawBoltbow(ctx, e);
  else if (id === "cinderpot") drawCinderpot(ctx, e);
  else drawSparklet(ctx, e, t);

  if (justStruck(e, now)) {
    ctx.globalAlpha = 0.45;
    ctx.fillStyle = "#fff";
    ctx.beginPath();
    ctx.arc(0, 0, e.radius + 0.12, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();

  if (now < e.frozenUntil) frostOverlay(ctx, e.radius + 0.18);
  ctx.restore();
}

function drawIronhide(ctx: CanvasRenderingContext2D, e: Entity): void {
  const g = teamGlow(e.team);
  const steel = ctx.createLinearGradient(-0.7, -0.8, 0.8, 0.7);
  steel.addColorStop(0, "#f4f7ff");
  steel.addColorStop(0.45, "#9aa8c4");
  steel.addColorStop(1, teamDeep(e.team));
  ctx.beginPath();
  ctx.moveTo(-0.72, 0.58);
  ctx.lineTo(-0.58, -0.22);
  ctx.lineTo(-0.22, -0.48);
  ctx.lineTo(0.22, -0.48);
  ctx.lineTo(0.58, -0.22);
  ctx.lineTo(0.72, 0.58);
  ctx.closePath();
  ctx.fillStyle = steel;
  ctx.fill();
  ctx.strokeStyle = g;
  ctx.lineWidth = 0.09;
  ctx.stroke();
  ctx.fillStyle = "#d8e2f4";
  ctx.beginPath();
  ctx.moveTo(-0.92, -0.08);
  ctx.lineTo(-0.42, -0.32);
  ctx.lineTo(-0.38, 0.5);
  ctx.lineTo(-0.88, 0.55);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = g;
  ctx.lineWidth = 0.07;
  ctx.stroke();
  roundRect(ctx, 0.42, -0.18, 0.42, 0.78, 0.06);
  ctx.fillStyle = "#cfd8ea";
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = teamDeep(e.team);
  roundRect(ctx, -0.28, -0.78, 0.56, 0.38, 0.06);
  ctx.fill();
  ctx.strokeStyle = g;
  ctx.stroke();
  ctx.fillStyle = g;
  roundRect(ctx, -0.18, -0.68, 0.14, 0.12, 0.02);
  ctx.fill();
  roundRect(ctx, 0.04, -0.68, 0.14, 0.12, 0.02);
  ctx.fill();
}

function drawAshblade(ctx: CanvasRenderingContext2D, e: Entity): void {
  const g = teamGlow(e.team);
  ctx.beginPath();
  ctx.moveTo(0, -1.22);
  ctx.lineTo(0.16, -0.18);
  ctx.lineTo(0, 0.08);
  ctx.lineTo(-0.16, -0.18);
  ctx.closePath();
  ctx.fillStyle = "#fff4d2";
  ctx.fill();
  ctx.strokeStyle = GOLD;
  ctx.lineWidth = 0.07;
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(-0.08, -0.22);
  ctx.lineTo(0.08, -0.22);
  ctx.lineTo(0.12, 0.08);
  ctx.lineTo(-0.12, 0.08);
  ctx.closePath();
  ctx.fillStyle = "#c9a227";
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(0, -0.42);
  ctx.lineTo(0.28, 0.18);
  ctx.lineTo(0, 0.62);
  ctx.lineTo(-0.28, 0.18);
  ctx.closePath();
  const body = ctx.createLinearGradient(0, -0.4, 0, 0.6);
  body.addColorStop(0, "#ffe7a0");
  body.addColorStop(1, teamDeep(e.team));
  ctx.fillStyle = body;
  ctx.fill();
  ctx.strokeStyle = g;
  ctx.lineWidth = 0.07;
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(0, -0.62);
  ctx.lineTo(0.18, -0.38);
  ctx.lineTo(-0.18, -0.38);
  ctx.closePath();
  ctx.fillStyle = g;
  ctx.fill();
}

function drawBoltbow(ctx: CanvasRenderingContext2D, e: Entity): void {
  const g = teamGlow(e.team);
  ctx.beginPath();
  ctx.moveTo(-0.22, -0.28);
  ctx.lineTo(0.22, -0.12);
  ctx.lineTo(0.12, 0.48);
  ctx.lineTo(-0.28, 0.38);
  ctx.closePath();
  const body = ctx.createLinearGradient(-0.2, -0.3, 0.2, 0.5);
  body.addColorStop(0, "#d9ffe8");
  body.addColorStop(1, teamDeep(e.team));
  ctx.fillStyle = body;
  ctx.fill();
  ctx.strokeStyle = g;
  ctx.lineWidth = 0.07;
  ctx.stroke();
  ctx.strokeStyle = "#f4fff8";
  ctx.lineWidth = 0.13;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.arc(0.08, -0.08, 0.62, -Math.PI * 0.72, Math.PI * 0.08);
  ctx.stroke();
  ctx.strokeStyle = GOLD;
  ctx.lineWidth = 0.05;
  ctx.beginPath();
  ctx.moveTo(-0.12, -0.55);
  ctx.lineTo(0.42, -0.55);
  ctx.stroke();
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.moveTo(0.05, -0.95);
  ctx.lineTo(0.16, -0.55);
  ctx.lineTo(-0.05, -0.55);
  ctx.closePath();
  ctx.fill();
  ctx.fillRect(-0.03, -0.55, 0.08, 0.7);
}

function drawCinderpot(ctx: CanvasRenderingContext2D, e: Entity): void {
  const g = teamGlow(e.team);
  ctx.strokeStyle = g;
  ctx.lineWidth = 0.1;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.arc(-0.48, 0.02, 0.22, Math.PI * 0.15, Math.PI * 1.7);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(0.48, 0.02, 0.22, -Math.PI * 0.7, Math.PI * 0.85);
  ctx.stroke();
  const pot = ctx.createLinearGradient(0, -0.25, 0, 0.62);
  pot.addColorStop(0, "#ffd7a0");
  pot.addColorStop(0.4, "#d45a30");
  pot.addColorStop(1, teamDeep(e.team));
  ctx.beginPath();
  ctx.moveTo(-0.55, -0.12);
  ctx.lineTo(-0.62, 0.18);
  ctx.quadraticCurveTo(-0.5, 0.68, 0, 0.72);
  ctx.quadraticCurveTo(0.5, 0.68, 0.62, 0.18);
  ctx.lineTo(0.55, -0.12);
  ctx.closePath();
  ctx.fillStyle = pot;
  ctx.fill();
  ctx.strokeStyle = g;
  ctx.lineWidth = 0.08;
  ctx.stroke();
  roundRect(ctx, -0.58, -0.22, 1.16, 0.18, 0.06);
  ctx.fillStyle = "#ffb070";
  ctx.fill();
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(-0.16, -0.28);
  ctx.lineTo(0, -0.82);
  ctx.lineTo(0.16, -0.28);
  ctx.closePath();
  ctx.fillStyle = "#ffd27a";
  ctx.fill();
  ctx.fillStyle = "#ff6a2a";
  ctx.beginPath();
  ctx.moveTo(-0.08, -0.3);
  ctx.lineTo(0.02, -0.62);
  ctx.lineTo(0.1, -0.3);
  ctx.closePath();
  ctx.fill();
}

function drawSparklet(ctx: CanvasRenderingContext2D, e: Entity, t: number): void {
  const g = teamGlow(e.team);
  ctx.save();
  ctx.rotate(t * 2);
  ctx.beginPath();
  for (let i = 0; i < 8; i++) {
    const a = (Math.PI * 2 * i) / 8;
    const r = i % 2 === 0 ? 0.32 : 0.14;
    const px = Math.cos(a) * r;
    const py = Math.sin(a) * r;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
  ctx.fillStyle = "#c8f6ff";
  ctx.fill();
  ctx.strokeStyle = g;
  ctx.lineWidth = 0.05;
  ctx.stroke();
  ctx.restore();
  ctx.fillStyle = "#fff";
  ctx.beginPath();
  ctx.arc(0, 0, 0.09, 0, Math.PI * 2);
  ctx.fill();
}

function drawSpellMarker(ctx: CanvasRenderingContext2D, e: Entity, t: number): void {
  const card = cardById(e.cardId!);
  const k = clamp(1 - e.attackCd / Math.max(0.05, card.spellDelay), 0, 1);
  const frost = card.id === "frostbind";
  ctx.save();
  ctx.translate(e.x, e.y);
  const beat = 0.85 + 0.15 * Math.max(0, Math.sin(k * Math.PI * 6));
  const r = card.spellRadius * (0.42 + k * 0.58);

  if (k < 0.78) {
    ctx.globalAlpha = 0.18 + k * 0.28;
    ctx.fillStyle = frost ? "#8ee7ff" : "#ff5ad5";
    ctx.beginPath();
    ctx.arc(0, 0, r * beat, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 0.75;
    ctx.strokeStyle = frost ? "#d7f6ff" : "#ffb0f3";
    ctx.lineWidth = 0.14;
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.stroke();
    ctx.globalAlpha = 1;
    ctx.fillStyle = "#fff";
    ctx.beginPath();
    ctx.arc(0, 0, 0.18 + k * 0.22, 0, Math.PI * 2);
    ctx.fill();
    if (frost) {
      ctx.strokeStyle = "#e8fbff";
      ctx.lineWidth = 0.06;
      for (let i = 0; i < 6; i++) {
        const a = (Math.PI * 2 * i) / 6 + t;
        ctx.beginPath();
        ctx.moveTo(Math.cos(a) * 0.12, Math.sin(a) * 0.12);
        ctx.lineTo(Math.cos(a) * r * 0.72, Math.sin(a) * r * 0.72);
        ctx.stroke();
      }
    } else {
      ctx.save();
      ctx.rotate(t * 2);
      ctx.fillStyle = "rgba(255,255,255,0.85)";
      ctx.beginPath();
      for (let i = 0; i < 8; i++) {
        const a = (Math.PI * 2 * i) / 8;
        const rr = i % 2 === 0 ? 0.28 + k * 0.2 : 0.1;
        const px = Math.cos(a) * rr;
        const py = Math.sin(a) * rr;
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }
  } else {
    const pop = (k - 0.78) / 0.22;
    ctx.globalAlpha = 0.55 * (1 - pop * 0.35);
    ctx.fillStyle = frost ? "#c8f4ff" : "#ff8ae8";
    ctx.beginPath();
    ctx.arc(0, 0, card.spellRadius * (0.85 + pop * 0.25), 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 0.95;
    ctx.strokeStyle = "#fff";
    ctx.lineWidth = 0.16;
    ctx.beginPath();
    ctx.arc(0, 0, card.spellRadius * (0.7 + pop * 0.3), 0, Math.PI * 2);
    ctx.stroke();
    ctx.lineWidth = 0.08;
    const spokes = frost ? 8 : 10;
    for (let i = 0; i < spokes; i++) {
      const a = (Math.PI * 2 * i) / spokes;
      ctx.beginPath();
      ctx.moveTo(Math.cos(a) * 0.2, Math.sin(a) * 0.2);
      ctx.lineTo(Math.cos(a) * card.spellRadius * (0.95 + pop * 0.15), Math.sin(a) * card.spellRadius * (0.95 + pop * 0.15));
      ctx.stroke();
    }
    ctx.fillStyle = "#fff";
    ctx.globalAlpha = 0.9;
    ctx.beginPath();
    ctx.arc(0, 0, 0.35 + pop * 0.25, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

function drawProjectile(ctx: CanvasRenderingContext2D, p: Projectile, t: number): void {
  ctx.save();
  ctx.translate(p.x, p.y);
  const ang = Math.atan2(p.ty - p.y, p.tx - p.x);
  ctx.rotate(ang);
  ctx.fillStyle = p.color;
  ctx.shadowColor = p.color;
  ctx.shadowBlur = 16;
  ctx.beginPath();
  ctx.ellipse(0, 0, p.radius * 2.4, p.radius * 0.85, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#fff";
  ctx.shadowBlur = 0;
  ctx.beginPath();
  ctx.arc(0.04, 0, p.radius * 0.55, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
  void t;
}

function drawHealth(ctx: CanvasRenderingContext2D, e: Entity): void {
  if (e.hp <= 0) return;
  const w = e.kind === "tower" ? (e.towerSlot === "king" ? 2.25 : 1.82) : Math.max(0.78, e.radius * 2.3);
  const h = e.kind === "tower" ? 0.18 : 0.12;
  const y = e.kind === "tower" ? -(e.towerSlot === "king" ? 2.85 : 1.55) : -e.radius - 0.42;
  const pct = clamp(e.hp / e.maxHp, 0, 1);
  ctx.save();
  ctx.translate(e.x, e.y);
  roundRect(ctx, -w / 2 - 0.04, y - 0.03, w + 0.08, h + 0.06, 0.07);
  ctx.fillStyle = "rgba(6, 10, 16, 0.72)";
  ctx.fill();
  ctx.strokeStyle = "rgba(244, 215, 138, 0.45)";
  ctx.lineWidth = 0.035;
  ctx.stroke();
  roundRect(ctx, -w / 2, y, w * pct, h, 0.05);
  ctx.fillStyle = pct > 0.4 ? teamGlow(e.team) : "#ffb347";
  ctx.fill();
  if (e.kind === "tower") {
    ctx.fillStyle = "rgba(255,255,255,0.72)";
    ctx.font = "0.28px sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(String(Math.max(0, Math.round(e.hp))), 0, y + h * 0.55);
  }
  ctx.restore();
}

function frostOverlay(ctx: CanvasRenderingContext2D, r: number): void {
  ctx.save();
  ctx.globalAlpha = 0.5;
  ctx.strokeStyle = "#d7f6ff";
  ctx.lineWidth = 0.07;
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, Math.PI * 2);
  ctx.stroke();
  ctx.fillStyle = "rgba(180, 230, 255, 0.28)";
  ctx.fill();
  ctx.strokeStyle = "rgba(255,255,255,0.55)";
  ctx.lineWidth = 0.03;
  for (let i = 0; i < 6; i++) {
    const a = (i * Math.PI) / 3;
    ctx.beginPath();
    ctx.moveTo(Math.cos(a) * 0.08, Math.sin(a) * 0.08);
    ctx.lineTo(Math.cos(a) * r * 0.85, Math.sin(a) * r * 0.85);
    ctx.stroke();
  }
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
  bg.addColorStop(0.45, shade(card.color, 0.22));
  bg.addColorStop(1, "#070d16");
  roundRect(ctx, 0, 0, w, h, 8);
  ctx.fillStyle = bg;
  ctx.fill();

  ctx.save();
  ctx.beginPath();
  roundRect(ctx, 0, 0, w, h, 8);
  ctx.clip();
  ctx.strokeStyle = "rgba(255,255,255,0.12)";
  ctx.lineWidth = 8;
  ctx.beginPath();
  ctx.moveTo(-10, h * 0.7);
  ctx.lineTo(w * 0.7, -10);
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
    ctx.fillStyle = card.color;
    if (cardId === "frostbind") {
      ctx.strokeStyle = "#e8fbff";
      ctx.lineWidth = 0.08;
      for (let i = 0; i < 6; i++) {
        const a = (Math.PI * 2 * i) / 6;
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(Math.cos(a) * 0.7, Math.sin(a) * 0.7);
        ctx.stroke();
      }
      ctx.beginPath();
      ctx.moveTo(0, -0.42);
      ctx.lineTo(0.36, 0.22);
      ctx.lineTo(-0.36, 0.22);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = "#fff";
      ctx.stroke();
    } else {
      ctx.beginPath();
      for (let i = 0; i < 8; i++) {
        const a = (Math.PI * 2 * i) / 8 - Math.PI / 2;
        const rr = i % 2 === 0 ? 0.72 : 0.28;
        const px = Math.cos(a) * rr;
        const py = Math.sin(a) * rr;
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = "#fff";
      ctx.lineWidth = 0.06;
      ctx.stroke();
    }
  } else if (card.kind === "building") {
    drawBuilding(ctx, fake, 1, 99);
  } else if (cardId === "ironhide") drawIronhide(ctx, fake);
  else if (cardId === "ashblade") drawAshblade(ctx, fake);
  else if (cardId === "boltbow") drawBoltbow(ctx, fake);
  else if (cardId === "cinderpot") drawCinderpot(ctx, fake);
  else drawSparklet(ctx, fake, 1);
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
