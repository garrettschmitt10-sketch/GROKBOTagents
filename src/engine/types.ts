export type Team = 0 | 1;
export type Difficulty = "easy" | "normal";
export type CardKind = "troop" | "building" | "spell";
export type EntityKind = "troop" | "building" | "tower" | "spell";

export const ARENA_W = 18;
export const ARENA_H = 32;
export const RIVER_TOP = 15.15;
export const RIVER_BOT = 16.85;
export const MATCH_SECONDS = 180;
export const OVERTIME_SECONDS = 60;
export const MAX_ELIXIR = 10;
export const START_ELIXIR = 5;
export const ELIXIR_PERIOD = 2.8;
export const HAND_SIZE = 4;
export const DECK_SIZE = 8;

export const BRIDGES = [
  { x1: 2.05, x2: 5.55, cx: 3.8 },
  { x1: 12.45, x2: 15.95, cx: 14.2 },
] as const;

export interface CardDef {
  id: string;
  name: string;
  subtitle: string;
  cost: number;
  kind: CardKind;
  role: string;
  desc: string;
  color: string;
  accent: string;
  rarity: "common" | "rare" | "epic";
  hp: number;
  damage: number;
  hitSpeed: number;
  speed: number;
  range: number;
  radius: number;
  splash: number;
  count: number;
  flying: boolean;
  lifetime: number;
  deployTime: number;
  spellRadius: number;
  spellDelay: number;
  freezeDuration: number;
  towerDamageRatio: number;
  sight: number;
}

export interface Entity {
  id: number;
  team: Team;
  kind: EntityKind;
  cardId: string | null;
  name: string;
  x: number;
  y: number;
  hp: number;
  maxHp: number;
  radius: number;
  flying: boolean;
  speed: number;
  range: number;
  damage: number;
  hitSpeed: number;
  splash: number;
  sight: number;
  attackCd: number;
  targetId: number | null;
  frozenUntil: number;
  deployUntil: number;
  lifetime: number;
  age: number;
  facing: number;
  bob: number;
  towerSlot: "king" | "left" | "right" | null;
  active: boolean;
  dying: number;
  color: string;
}

export interface Projectile {
  id: number;
  team: Team;
  x: number;
  y: number;
  targetId: number;
  speed: number;
  damage: number;
  splash: number;
  color: string;
  homing: boolean;
  tx: number;
  ty: number;
  radius: number;
}

export interface FloatingText {
  x: number;
  y: number;
  text: string;
  color: string;
  life: number;
  maxLife: number;
  vy: number;
}

export interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  size: number;
  color: string;
  kind: "spark" | "ring" | "burst" | "frost";
}

export type MatchEvent =
  | { type: "spawn"; x: number; y: number; team: Team; cardId: string }
  | { type: "death"; x: number; y: number; team: Team; flying: boolean }
  | { type: "hit"; x: number; y: number; amount: number; crit: boolean }
  | { type: "spell"; x: number; y: number; cardId: string }
  | { type: "freeze"; x: number; y: number; radius: number }
  | { type: "tower-hit"; team: Team }
  | { type: "king-awake"; team: Team }
  | { type: "play"; team: Team; name: string }
  | { type: "elixir-max"; team: Team }
  | { type: "overtime" }
  | { type: "double" }
  | { type: "triple" }
  | { type: "end"; winner: "player" | "bot" | "draw" };

export interface SideState {
  team: Team;
  elixir: number;
  hand: string[];
  queue: string[];
  crowns: number;
  nextCard: string;
}

export interface MatchConfig {
  difficulty: Difficulty;
  seed?: number;
}

export function dist(ax: number, ay: number, bx: number, by: number): number {
  const dx = ax - bx;
  const dy = ay - by;
  return Math.hypot(dx, dy);
}

export function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

export function teamName(team: Team): string {
  return team === 0 ? "Aurora Keep" : "Dusk Court";
}
