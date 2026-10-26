# Labyrinth

A fog-of-war maze game built with React, TypeScript, and Vite.

## Run locally

```sh
npm install
npm run dev -- --host 127.0.0.1
```

Open the local URL printed by Vite. The black title screen opens the game with **[Play]**.

## Play

- Move with **WASD**, **arrow keys**, or the directional buttons on touch screens. Hold a direction for continuous movement; the most recently pressed direction takes priority.
- Start at a random entrance on the top edge and find the green exit on the bottom edge. Exploring permanently reveals the surrounding eight squares.
- Ghosts patrol corridors at 1.05 times the player's speed. Their patrols stay within six rows and six columns of their home tile, including diagonal offsets. When a ghost becomes adjacent, its tile is revealed and it pauses for a full second. Entering its square is blocked during the warning so held movement cannot waste your reaction time. After the warning, touching the ghost costs a life.
- Start with three lives. A hit returns you and the patrols to their starting positions while retaining your exploration and elapsed time. After three hits, retry the same maze with three lives, a fresh timer, and an additional 15% of all maze cells revealed (capped at the full maze), or generate a new maze.
- The timer starts on the first successful movement and freezes at the exit or game over. Returning home and pressing Play starts a fresh maze.

## Generation and fairness

A randomized depth-first carving algorithm connects the maze, with extra corridor connections for detours. A breadth-first search finds a complete entrance-to-exit route. Ghost patrols are generated in connected corridor regions outside that reserved route and within their radius. This guarantees a route that patrols cannot obstruct; the route is not shown to the player.

The game engine is in `src/game.ts`, independent of the UI. The locally bundled Press Start 2P font is licensed under the SIL Open Font License; see `public/fonts/OFL.txt`.

## Verify

Requires Node 22.13 or newer for the TypeScript test runner.

```sh
npm test
npm run lint
npm run build
```

Tests verify 1,000 seeded mazes with active patrols, legal patrol steps and range, movement timing, warnings, collisions, lives, retries, and completion timing.

## Race, Endurance, and personal scores

The home page offers **Play**, **Race**, **Endurance**, and **Personal Leaderboard**.

- **Race:** choose 2, 3, or 5 minutes. The countdown starts on the first valid movement. Exiting a maze immediately generates the next, preserving the clock and remaining lives. The run ends at the deadline or on the third hit. A deadline takes priority over movement on the same frame.
- **Endurance:** the same sequence with no time limit. Elapsed time is recorded, but only losing all three lives ends the run.
- **Progression:** the generator checks shortest-solution length and turns, increasing both requirements until the fixed board's difficulty ceiling (121 path cells and 32 turns). Extra corridor connections decrease as difficulty rises. Ghost speed increases by 0.05× per completed maze, capped at 1.3×. The one-second warning and unblocked solution guarantee remain in every mode.
- **Restart:** in Race and Endurance, the shuffle control starts a fresh run; it cannot skip a maze while retaining the score. Try Again also resets completed mazes, lives, and time. Normal Play retains its assisted same-maze retry.
- **Scores:** completed attempts, including zero-maze losses, offer an optional Save Score button. Entries include mode, selected Race duration, completed mazes, elapsed time, outcome, date, and normal-mode reveal assistance. Scores use the browser's local storage under `labyrinth.scores.v1`; they stay on that browser and origin. Race leaderboards are split by duration. Rankings prioritize completed mazes, then shorter elapsed times. Storage errors are shown without claiming the score was saved.

## GitHub Pages deployment

The workflow in `.github/workflows/deploy.yml` tests, lints, builds, and deploys the game on pushes to `main`. In the GitHub repository's **Settings → Pages**, set the publishing source to **GitHub Actions**. The workflow automatically uses the repository's Pages base path, including asset and font URLs.

To check a project-path build locally:

```sh
npm run build -- --base /labyrinth/
npm run preview
```

Visit the preview server's `/labyrinth/` path. A live deployment has its own browser-local leaderboard; localhost scores do not transfer to the public site.
