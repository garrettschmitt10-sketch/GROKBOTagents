import { cardById } from "./engine/cards";
import { Match } from "./engine/match";
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
let dragMoved = false;
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
  dragMoved = false;
  particles = [];
  floaters = [];
  playing = true;
  doubleAnnounced = false;
  menuEl.classList.add("hidden");
  howtoEl.classList.add("hidden");
  endEl.classList.add("hidden");
  renderHand();
  toast(difficulty === "easy" ? "Dusk Court watches the sky-lane." : "Dusk Court takes the duskglass field.");
}

function renderHand(): void {
  if (!match) return;
  const nextCtx = nextArt.getContext("2d")!;
  drawCardArt(nextCtx, match.player.nextCard, nextArt.width, nextArt.height);
  handEl.innerHTML = "";
  match.player.hand.forEach((id, i) => {
    const card = cardById(id);
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = `card ${card.rarity}`;
    btn.dataset.index = String(i);
    btn.innerHTML = `<canvas width="160" height="110"></canvas>
      <div class="cost">${card.cost}</div>
      <div class="meta"><div class="name">${card.name}</div><div class="role">${card.subtitle}</div></div>`;
    const cnv = btn.querySelector("canvas")!;
    drawCardArt(cnv.getContext("2d")!, id, cnv.width, cnv.height);
    btn.addEventListener("pointerdown", (ev) => onCardDown(ev, i));
    handEl.appendChild(btn);
  });
  refreshHandState();
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

function onCardDown(ev: PointerEvent, index: number): void {
  if (!match || match.ended) return;
  sfx.unlock();
  const id = match.player.hand[index];
  if (!id) return;
  if (match.player.elixir < cardById(id).cost) {
    toast("Need more Aether");
    return;
  }
  selected = index;
  dragFromHand = true;
  dragMoved = false;
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
  const dx = ev.clientX - dragOrigin.x;
  const dy = ev.clientY - dragOrigin.y;
  if (dx * dx + dy * dy > 220) dragMoved = true;
  const p = canvasPoint(ev);
  pointerWorld = screenToWorld(cam, p.x, p.y);
});

window.addEventListener("pointerup", (ev) => {
  if (!dragFromHand || !match) {
    dragFromHand = false;
    return;
  }
  if (dragMoved) {
    const p = canvasPoint(ev);
    const w = screenToWorld(cam, p.x, p.y);
    tryDeploy(w.x, w.y, true);
  }
  dragFromHand = false;
  dragMoved = false;
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
  return x >= -0.2 && x <= ARENA_W + 0.2 && y >= -0.2 && y <= ARENA_H + 0.2;
}

function tryDeploy(x: number, y: number, fromDrag = false): void {
  if (!match || selected < 0 || match.ended) return;
  const id = match.player.hand[selected];
  if (!id) return;
  if (!inArena(x, y)) {
    if (fromDrag) selected = -1;
    refreshHandState();
    return;
  }
  const ok = match.tryPlay(0, selected, x, y);
  if (ok) {
    sfx.deploy();
    selected = -1;
    renderHand();
  } else if (!match.legalPlay(0, id, x, y)) {
    toast("Can't drop that there");
  } else {
    toast("Need more Aether");
  }
}

function toast(text: string): void {
  const el = document.createElement("div");
  el.className = "toast";
  el.textContent = text;
  toastsEl.appendChild(el);
  window.setTimeout(() => el.remove(), 2400);
}

function resize(): void {
  const stage = document.querySelector("#stage")!;
  const rect = canvas.getBoundingClientRect();
  const dpr = Math.min(2.2, window.devicePixelRatio || 1);
  const w = Math.max(320, rect.width || stage.clientWidth);
  const h = Math.max(420, rect.height);
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
  elixirCount.textContent = String(Math.floor(e));
  elixirFill.style.width = `${(e / MAX_ELIXIR) * 100}%`;
  elixirFill.parentElement?.classList.toggle("capped", e >= MAX_ELIXIR - 0.02);
  timerEl.textContent = fmtTime(match);
  const tier = match.elixirTier();
  if (match.overtime) {
    modeChip.className = "overtime";
    modeChip.textContent = "Overtime · Triple";
  } else if (tier === "double") {
    modeChip.className = "double";
    modeChip.textContent = "Double Aether";
  } else {
    modeChip.className = "";
    modeChip.textContent = "Single Aether";
  }
  paintCrowns("enemy-crowns", match.bot.crowns);
  paintCrowns("player-crowns", match.player.crowns);
  refreshHandState();
  const nextId = match.player.nextCard;
  const nextCtx = nextArt.getContext("2d");
  if (nextCtx) drawCardArt(nextCtx, nextId, nextArt.width, nextArt.height);
}

function paintCrowns(id: string, n: number): void {
  document.querySelectorAll(`#${id} .crown`).forEach((el, i) => {
    el.classList.toggle("on", i < n);
  });
}

function burst(x: number, y: number, color: string, n = 12, kind: Particle["kind"] = "spark"): void {
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2;
    const sp = 1.5 + Math.random() * 4;
    particles.push({
      x,
      y,
      vx: Math.cos(a) * sp,
      vy: Math.sin(a) * sp,
      life: 0.35 + Math.random() * 0.4,
      maxLife: 0.7,
      size: 0.08 + Math.random() * 0.12,
      color,
      kind,
    });
  }
}

function handleEvents(events: MatchEvent[]): void {
  for (const ev of events) {
    if (ev.type === "spawn") burst(ev.x, ev.y, ev.team === 0 ? "#5cf6d5" : "#ff6b9a", 14, "ring");
    if (ev.type === "death") burst(ev.x, ev.y, "#f4d78a", 22, "burst");
    if (ev.type === "hit") {
      floaters.push({
        x: ev.x,
        y: ev.y,
        text: String(ev.amount),
        color: ev.crit ? "#ffb0f3" : "#fff6d4",
        life: 0.7,
        maxLife: 0.7,
        vy: -1.6,
      });
      if (ev.amount > 90) sfx.hit();
    }
    if (ev.type === "spell") {
      sfx.spell(ev.cardId === "frostbind" ? "frostbind" : "riftburst");
      burst(ev.x, ev.y, ev.cardId === "frostbind" ? "#8ee7ff" : "#ff5ad5", 22, "burst");
    }
    if (ev.type === "freeze") burst(ev.x, ev.y, "#d7f6ff", 18, "frost");
    if (ev.type === "tower-hit") {
      shake = Math.max(shake, 0.14);
      const tnow = performance.now();
      if (tnow - towerSfxAt > 160) {
        sfx.tower();
        towerSfxAt = tnow;
      }
    }
    if (ev.type === "play" && ev.team === 1) toast(`Dusk Court plays ${ev.name}`);
    if (ev.type === "double" && !doubleAnnounced) {
      doubleAnnounced = true;
      toast("Double Aether!");
    }
    if (ev.type === "overtime") {
      toast("Overtime — Crownspires must fall!");
      sfx.overtime();
    }
    if (ev.type === "triple") toast("Triple Aether!");
    if (ev.type === "king-awake") toast(ev.team === 0 ? "Your Crownspire awakens!" : "Enemy Crownspire awakens!");
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
    endEyebrow.textContent = "Aurora Keep holds the courts";
    endSub.textContent = "The Dusk Court Crownspire shatters into starlight.";
    sfx.win();
  } else if (winner === "bot") {
    endTitle.textContent = "Defeat";
    endTitle.classList.add("lose");
    endEyebrow.textContent = "Duskglass claims the lane";
    endSub.textContent = "Your Crownspire has fallen. Gather Aether and try again.";
    sfx.lose();
  } else {
    endTitle.textContent = "Stalemate";
    endTitle.classList.add("draw");
    endEyebrow.textContent = "The starlight river holds";
    endSub.textContent = "Neither keep claimed the duskglass courts.";
  }
  endScore.innerHTML = `<span>You ${match.player.crowns}</span><span>Dusk ${match.bot.crowns}</span>`;
}

function tickParticles(dt: number): void {
  for (const p of particles) {
    p.life -= dt;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.vy += 2.2 * dt;
  }
  particles = particles.filter((p) => p.life > 0);
  for (const f of floaters) {
    f.life -= dt;
    f.y += f.vy * dt;
    f.vy += 1.2 * dt;
  }
  floaters = floaters.filter((f) => f.life > 0);
  shake = Math.max(0, shake - dt);
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
      ctx.arc(p.x, p.y, (1 - a) * 1.1 + 0.18, 0, Math.PI * 2);
      ctx.stroke();
    } else if (p.kind === "frost") {
      ctx.strokeStyle = p.color;
      ctx.lineWidth = 0.05;
      ctx.beginPath();
      ctx.moveTo(p.x, p.y);
      ctx.lineTo(p.x + p.vx * 0.04, p.y + p.vy * 0.04);
      ctx.stroke();
    } else {
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.textAlign = "center";
  ctx.font = "0.55px Trebuchet MS";
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
    const sx = shake ? (Math.random() - 0.5) * 10 * shake : 0;
    const sy = shake ? (Math.random() - 0.5) * 10 * shake : 0;
    ctx.save();
    ctx.translate(sx, sy);
    const hover =
      selected >= 0 && pointerWorld && match.player.hand[selected]
        ? {
            x: pointerWorld.x,
            y: pointerWorld.y,
            valid: match.legalPlay(0, match.player.hand[selected]!, pointerWorld.x, pointerWorld.y),
            cardId: match.player.hand[selected]!,
          }
        : null;
    drawArena(ctx, match, cam, t, hover);
    if (hover && cardById(hover.cardId).kind !== "spell") {
      const ghost = worldToScreen(cam, hover.x, hover.y);
      ctx.globalAlpha = 0.55;
      ctx.beginPath();
      ctx.arc(ghost.x, ghost.y, 0.5 * cam.s, 0, Math.PI * 2);
      ctx.fillStyle = hover.valid ? "#5cf6d5" : "#ff6b9a";
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

