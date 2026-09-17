import { describe, expect, it } from "vitest";
import { CARDS, cardById, DECK_IDS } from "./cards";
import { Match } from "./match";
import { deployAllowed, snapDeploy } from "./pathing";
import { ARENA_H, HAND_SIZE, MAX_ELIXIR } from "./types";

describe("Iron River match engine", () => {
  it("starts with a 4-card hand from an 8-card deck", () => {
    const m = new Match({ difficulty: "normal", seed: 42 });
    expect(m.player.hand).toHaveLength(HAND_SIZE);
    expect(m.bot.hand).toHaveLength(HAND_SIZE);
    const all = [...m.player.hand, ...m.player.queue];
    expect(all.sort()).toEqual([...DECK_IDS].sort());
    expect(new Set(all).size).toBe(8);
  });

  it("keeps the original Supply costs", () => {
    const costs: Record<string, number> = {
      scouts: 2,
      bayonet: 3,
      marksman: 3,
      smoke: 3,
      mortar: 4,
      barrage: 4,
      ironhide: 5,
      pillbox: 5,
    };
    for (const card of CARDS) {
      expect(card.cost).toBe(costs[card.id]);
    }
  });

  it("refuses plays that cost more Supply than available", () => {
    const m = new Match({ difficulty: "normal", seed: 1 });
    m.player.elixir = 1;
    const idx = m.player.hand.findIndex((id) => cardById(id).cost >= 3);
    expect(idx).toBeGreaterThanOrEqual(0);
    const ok = m.tryPlay(0, idx, 9, 22);
    expect(ok).toBe(false);
    expect(m.player.elixir).toBe(1);
  });

  it("cycles the played card to the back of the queue", () => {
    const m = new Match({ difficulty: "normal", seed: 9 });
    m.player.elixir = 10;
    const played = m.player.hand[0]!;
    const incoming = m.player.queue[0];
    expect(m.tryPlay(0, 0, 9, 22)).toBe(true);
    expect(m.player.hand[0]).toBe(incoming);
    expect(m.player.queue.at(-1)).toBe(played);
  });

  it("keeps ground troops off the river except on bridges", () => {
    expect(deployAllowed(0, "bayonet", 9, 16, { left: false, right: false })).toBe(false);
    expect(deployAllowed(0, "bayonet", 3.8, 20, { left: false, right: false })).toBe(true);
    expect(deployAllowed(0, "barrage", 9, 8, { left: false, right: false })).toBe(true);
    expect(deployAllowed(0, "bayonet", 4, 8, { left: false, right: false })).toBe(false);
    expect(deployAllowed(0, "bayonet", 4, 8, { left: true, right: false })).toBe(true);
  });

  it("snaps near-miss drops onto legal ground", () => {
    const snapped = snapDeploy(0, "bayonet", 9, 16.4, { left: false, right: false });
    expect(snapped).not.toBeNull();
    expect(deployAllowed(0, "bayonet", snapped!.x, snapped!.y, { left: false, right: false })).toBe(true);
    expect(snapped!.y).toBeGreaterThan(16.85);
  });

  it("lets the bot spend Supply under the same rules", () => {
    const m = new Match({ difficulty: "normal", seed: 77 });
    m.bot.elixir = 10;
    const cheap = m.bot.hand.findIndex((id) => cardById(id).kind !== "spell");
    const ok = m.tryPlay(1, cheap, 4.2, 11.5);
    expect(ok).toBe(true);
    expect(m.bot.elixir).toBeLessThan(10);
  });

  it("simulates a full match without NaNs or Supply overflow", () => {
    const m = new Match({ difficulty: "normal", seed: 1234 });
    for (let i = 0; i < 240 * 30; i++) m.update(1 / 30);
    expect(m.ended).toBe(true);
    expect(m.winner).toMatch(/player|bot|draw/);
    expect(m.player.elixir).toBeGreaterThanOrEqual(0);
    expect(m.player.elixir).toBeLessThanOrEqual(MAX_ELIXIR + 1e-6);
    expect(m.bot.elixir).toBeLessThanOrEqual(MAX_ELIXIR + 1e-6);
    for (const e of m.entities) {
      expect(Number.isFinite(e.x)).toBe(true);
      expect(Number.isFinite(e.y)).toBe(true);
      expect(e.y).toBeGreaterThanOrEqual(-1);
      expect(e.y).toBeLessThanOrEqual(ARENA_H + 1);
    }
  });

  it("has the bot spend Supply and field units", () => {
    const m = new Match({ difficulty: "normal", seed: 99 });
    let botPlays = 0;
    for (let i = 0; i < 30 * 20; i++) {
      m.update(1 / 30);
      botPlays += m.drainEvents().filter((e) => e.type === "play" && e.team === 1).length;
    }
    expect(botPlays).toBeGreaterThan(0);
    expect(m.bot.elixir).toBeLessThan(MAX_ELIXIR);
  });
});
