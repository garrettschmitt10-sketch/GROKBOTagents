import type { Team } from "../engine/types";

const NAMES = [
  "scout_watch",
  "scout_watch_walk",
  "scout_dust",
  "scout_dust_walk",
  "bayonet_watch",
  "bayonet_watch_walk",
  "bayonet_dust",
  "bayonet_dust_walk",
  "marksman_watch",
  "marksman_dust",
  "ironhide_watch",
  "ironhide_dust",
  "mortar_watch",
  "mortar_watch_recoil",
  "mortar_dust",
  "pillbox_watch",
  "pillbox_dust",
  "bunker_watch",
  "bunker_dust",
  "hq_watch",
  "hq_dust",
  "mud_tile",
  "vfx_smoke",
  "vfx_burst",
  "prop_trees",
] as const;

export type SpriteId = (typeof NAMES)[number];

const images = new Map<string, HTMLImageElement>();
const failed = new Set<string>();
let boot: Promise<void> | null = null;
let loaded = 0;

export function spritesReady(): boolean {
  return loaded >= NAMES.length - failed.size && loaded > 0;
}

export function getSprite(id: string): HTMLImageElement | null {
  if (failed.has(id)) return null;
  const img = images.get(id);
  if (img && img.complete && img.naturalWidth > 0) return img;
  return null;
}

export function teamTag(team: Team): "watch" | "dust" {
  return team === 0 ? "watch" : "dust";
}

export function preloadSprites(): Promise<void> {
  if (boot) return boot;
  boot = Promise.all(
    NAMES.map(
      (name) =>
        new Promise<void>((resolve) => {
          const img = new Image();
          img.decoding = "async";
          img.onload = () => {
            images.set(name, img);
            loaded += 1;
            resolve();
          };
          img.onerror = () => {
            failed.add(name);
            loaded += 1;
            resolve();
          };
          img.src = `./sprites/${name}.png`;
        }),
    ),
  ).then(() => undefined);
  return boot;
}

preloadSprites();
