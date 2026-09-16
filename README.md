# Aetherlane

A vertical-arena real-time card duel you can play in the browser. You command **Aurora Keep** against a **Dusk Court** bot. Spend Aether, drop keepers, and shatter the rival Crownspire before the rift timer closes.

This is an original game inspired by lane-push card battles. It does not use Clash Royale / Supercell names, logos, or assets.

## Run locally

```bash
npm install
npm run dev
```

Then open the URL Vite prints (usually `http://localhost:5173`).

### Production build (static hosting)

```bash
npm run build
npm run preview
```

The `dist/` folder can be served by any static host. Paths are relative (`base: "./"`), so it also works from a subfolder or `file://` with a local server.

### Tests

```bash
npm test
```

## How to play

1. Choose **Easy** or **Normal** bot mind, then **Start Match**.
2. You hold **4 cards**. Playing one draws the next from an 8-card deck.
3. **Aether** regenerates over time (max 10). Every card has an Aether cost.
4. Tap a card, then tap **your half of the arena** — or drag the card onto the field.
5. Spells (**Riftburst**, **Frostbind**) can be aimed anywhere, including the enemy half.
6. Troops walk toward the nearest threat, cross the river on the two bridges, and auto-attack.
7. Destroy the enemy **Crownspire** to win. If the 3:00 timer ends, the side with more lantern / crown takedowns wins. Tied crowns go to a 1:00 overtime with triple Aether.

### Controls

| Input | Action |
| --- | --- |
| Click / tap a card, then the arena | Deploy |
| Drag a card onto the arena | Deploy |
| Keys `1`–`4` | Select hand slot |
| `Esc` | Cancel selection |
| Mouse or touch | Same rules on desktop and mobile |

You and the bot use the same Aether regen, card costs, and deploy rules. The bot does not cheat.

## The deck

| Card | Cost | Role |
| --- | --- | --- |
| Sparklets | 2 | Melee swarm |
| Ashblade | 3 | Melee fighter |
| Boltbow | 3 | Ranged |
| Frostbind | 3 | Freeze spell |
| Cinderpot | 4 | Splash attacker |
| Riftburst | 4 | Area damage spell |
| Ironhide | 5 | Tank |
| Ward Spire | 5 | Defensive building |

Last minute of the match is **Double Aether**. Overtime is **Triple Aether**.

## Project layout

- `src/engine/` — match simulation, cards, pathing, bot
- `src/view/` — canvas drawing and sound
- `src/main.ts` — menu, HUD, input, game loop
- `index.html` / `src/style.css` — shell UI
