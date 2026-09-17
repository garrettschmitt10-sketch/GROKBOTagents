# Iron River Front

A vertical-arena real-time card duel you can play in the browser. You command **Riverwatch** against a **Dustfront** bot across a flooded no-man’s-land split by a muddy river and two timber bridges.

Spend Supply, drop your squad, and take the rival Strongpoint before the clock runs out.

This is an original game inspired by lane-push card battles. It does not use Clash Royale / Supercell names, logos, or assets. Factions, cards, and insignia are fictional — no real national flags or banned military emblems.

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

1. Choose **Easy** or **Normal** opposition, then **Take the Crossing**.
2. You hold **4 cards**. Playing one draws the next from an 8-card deck.
3. **Supply** regenerates over time (max 10). Every card has a Supply cost.
4. Tap a card, then tap **your half of the arena** — or drag the card onto the field. Near-miss drops **snap** onto the nearest legal ground. Unaffordable cards shake and flash.
5. Spells (**Barrage**, **Smoke**) can be aimed anywhere, including the enemy half.
6. Troops walk toward the nearest threat, cross the river on the two bridges, and auto-attack.
7. Destroy the enemy **Strongpoint** to win. If the 3:00 timer ends, the side with more bunker / objective takedowns wins. Tied stars go to a 1:00 overtime with triple Supply.

### Controls

| Input | Action |
| --- | --- |
| Click / tap a card, then the arena | Deploy (snaps to legal ground) |
| Drag a card onto the arena | Deploy on release, even on a short drag |
| Tap the selected card again | Cancel selection |
| Drag off the field | Cancel |
| Keys `1`–`4` | Select hand slot |
| `Esc` | Cancel selection |
| Mouse or touch | Same rules on desktop and mobile |

You and the bot use the same Supply regen, card costs, and deploy rules. The bot does not cheat.

## The deck

| Card | Cost | Role |
| --- | --- | --- |
| Scouts | 2 | Melee swarm |
| Bayonet | 3 | Melee fighter |
| Marksman | 3 | Ranged |
| Smoke | 3 | Delay spell |
| Mortar | 4 | Splash attacker |
| Barrage | 4 | Area damage spell |
| Ironhide | 5 | Tank |
| Pillbox | 5 | Defensive building |

Last minute of the match is **Double Supply**. Overtime is **Triple Supply**.

## Project layout

- `src/engine/` — match simulation, cards, pathing, bot
- `src/view/` — canvas drawing and sound
- `src/main.ts` — menu, HUD, input, game loop
- `index.html` / `src/style.css` — shell UI
