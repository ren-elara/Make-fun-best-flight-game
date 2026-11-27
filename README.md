[![Make the best flight game](https://make.fun/badge/best-flight-game-20261126-0057.svg)](https://make.fun/bounty/best-flight-game-20261126-0057)
[![rank](https://make.fun/badge/best-flight-game-20261126-0057/ren-elara/Make-fun-best-flight-game/rank.svg)](https://make.fun/bounty/best-flight-game-20261126-0057)
[![reward](https://make.fun/badge/best-flight-game-20261126-0057/ren-elara/Make-fun-best-flight-game/reward.svg)](https://make.fun/bounty/best-flight-game-20261126-0057)

# AURELIA / Storm Courier

Carry the last light home. Fly an original twin-boom courier through a sculpted island chain, recover a stranded weather crew, and land at Lantern Field before your fuel runs out. Three contracts progress from a daylight relay to a low rescue pass and a night approach. A software 3D renderer keeps the game playable on machines without WebGL.

## Play

Open `game/index.html` directly in desktop Chrome, or serve it:

```sh
npm start
```

Visit `http://127.0.0.1:4173`. Every asset, script, and sound is generated locally; the game has no network dependency and no build step. Select a contract and press **Launch sortie** or **Enter**. The briefing describes each route and its landing requirements.

| Control | Action |
| --- | --- |
| Arrow keys | Pitch and bank (up climbs) |
| W / S | Increase / decrease throttle |
| A / D | Rudder; fine heading correction |
| Click flight view / M | Toggle mouse steering |
| G | Landing gear |
| B | Wheel brakes; hold after touchdown |
| V | Chase / close chase camera |
| P / Escape | Pause / resume |
| R | Restart current contract |
| 1 / 2 / 3 | Choose a contract from the briefing |

Fly through the illuminated gates in order. Rescue requires a slow, low pass; after pickup, keep the wings level and speed below 58 m/s so the crew reaches home safely. Lower the gear for landing, align with runway heading 000°, keep speed below 57 m/s and descent below 4.5 m/s at touchdown, then brake to a stop. Fuel, crew safety, hull integrity, stall warning, vertical speed, a heading tape, and a route map support decisions throughout the sortie. Best scores are saved locally when browser storage is available.

## Build the hand-in

Use Node.js 22.18 or later. The entrypoint uses only the Node standard library and the unchanged official `vendor/makefun-game.ts` helper:

```sh
MAKEFUN_OUTPUT_DIR=out node main.ts
```

`out/` receives `game/`, four real browser screenshots, and a byte-reproducible `dossier.json`. The local Alpine Node binary was compiled without TypeScript support: use `MAKEFUN_OUTPUT_DIR=out npm run build` there. Development scripts use `tsx` for that reason; the competition runtime needs no installed packages. The kit stays in `best-flight-game-20261126-0057-kit/`, excluded locally from Git.

## Verify

```sh
npm ci
npm test
npm run verify
npm run test:browser
npm run capture
gitleaks detect --source . --no-git --redact
```

Browser checks use a local Chromium (`CHROMIUM_PATH`, default `/usr/bin/chromium`) through Playwright. They exercise launch, keyboard and mouse input, pause, restart, mission selection, resize, and file-based offline play. Capture uses actual in-game contract starts, including the night landing approach; images are unedited browser renders at 1280 × 800. Build verification checks the helper against the kit when present, local references, screenshot limits, dossier bytes, two clean output trees, and a fresh source copy with no installed dependencies (using the development TypeScript loader outside that copy).

Simulation tests cover gate crossings, stall and fuel behavior, rescue conditions, terrain collisions, runway alignment, hard landings, stopped rollout, and deterministic fixed-step controls. The competition's sealed judge and transcript authorship checks run separately on make.fun; local tests do not claim a judge score or transcript percentage.

The secret scan retains the default rules. `.gitleaksignore` lists 19 individually reviewed false-positive fingerprints in the unchanged, ignored kit CLI: environment-variable names and JavaScript property expressions. No application path or credential rule is broadly excluded.

The older token dashboard sources are retained for history; the flight entrypoint does not load them. MIT licensed.
