export type Position = readonly [number, number]
export type GameMode = 'normal' | 'race' | 'endurance'
export type RaceMinutes = 2 | 3 | 5
export type Direction = 'up' | 'down' | 'left' | 'right'
export const SIZE = 21
export const PLAYER_STEP_MS = 160
export const GHOST_STEP_MS = PLAYER_STEP_MS / 1.05
export const WARNING_MS = 1000
export const GHOST_RADIUS = 6
const DELTAS: Record<Direction, Position> = {
  up: [-1, 0], down: [1, 0], left: [0, -1], right: [0, 1],
}
export const keyOf = ([row, col]: Position) => row * SIZE + col
export const samePosition = (a: Position, b: Position) => keyOf(a) === keyOf(b)
const distance = (a: Position, b: Position) => Math.max(Math.abs(a[0] - b[0]), Math.abs(a[1] - b[1]))
export const neighbors = ([row, col]: Position): Position[] => Object.values(DELTAS)
  .map(([dr, dc]): Position => [row + dr, col + dc])
  .filter(([r, c]) => r >= 0 && c >= 0 && r < SIZE && c < SIZE)

export interface GhostDefinition { home: Position; route: Position[] }
export interface Maze {
  walls: boolean[][]
  start: Position
  exit: Position
  solution: Position[]
  ghosts: GhostDefinition[]
}
export interface Ghost {
  index: number
  nextMoveAt: number
  warningUntil: number
  encounter: boolean
}
export interface Game {
  mode: GameMode
  raceMinutes: RaceMinutes
  solved: number
  endReason: 'exit' | 'lives' | 'timeout' | null
  maze: Maze
  player: Position
  revealed: Set<number>
  ghosts: Ghost[]
  lives: number
  status: 'ready' | 'running' | 'won' | 'lost'
  startedAt: number | null
  endedAt: number | null
  lastPlayerMoveAt: number
  hitUntil: number
  retries: number
}

function shuffled<T>(items: readonly T[], random: () => number): T[] {
  const result = [...items]
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1))
    ;[result[i], result[j]] = [result[j], result[i]]
  }
  return result
}

export function findPath(walls: boolean[][], start: Position, exit: Position): Position[] {
  const queue: Position[] = [start]
  const parent = new Map<number, Position | null>([[keyOf(start), null]])
  for (let i = 0; i < queue.length; i++) {
    const current = queue[i]
    if (samePosition(current, exit)) {
      const path: Position[] = []
      let step: Position | null = current
      while (step) { path.push(step); step = parent.get(keyOf(step)) ?? null }
      return path.reverse()
    }
    for (const next of neighbors(current)) {
      if (!walls[next[0]][next[1]] && !parent.has(keyOf(next))) {
        parent.set(keyOf(next), current)
        queue.push(next)
      }
    }
  }
  return []
}

export function generateMaze(random: () => number = Math.random, difficulty = 0): Maze {
  const walls = Array.from({ length: SIZE }, () => Array<boolean>(SIZE).fill(true))
  const startCol = 1 + 2 * Math.floor(random() * ((SIZE - 1) / 2))
  const exitCol = 1 + 2 * Math.floor(random() * ((SIZE - 1) / 2))
  const start: Position = [0, startCol]
  const exit: Position = [SIZE - 1, exitCol]
  const stack: Position[] = [[1, startCol]]
  walls[1][startCol] = false
  while (stack.length) {
    const [r, c] = stack[stack.length - 1]
    const options = shuffled(Object.values(DELTAS), random)
      .map(([dr, dc]): Position => [r + dr * 2, c + dc * 2])
      .filter(([nr, nc]) => nr > 0 && nc > 0 && nr < SIZE - 1 && nc < SIZE - 1 && walls[nr][nc])
    if (!options.length) { stack.pop(); continue }
    const next = options[0]
    walls[(r + next[0]) / 2][(c + next[1]) / 2] = false
    walls[next[0]][next[1]] = false
    stack.push(next)
  }
  // Extra connections allow detours and escape routes through the corridors.
  const shortcuts: Position[] = []
  for (let r = 1; r < SIZE - 1; r++) {
    for (let c = 1; c < SIZE - 1; c++) {
      if (walls[r][c] && ((r % 2 === 0) !== (c % 2 === 0))) shortcuts.push([r, c])
    }
  }
  for (const [r, c] of shuffled(shortcuts, random).slice(0, Math.max(0, 18 - difficulty * 3))) walls[r][c] = false
  walls[start[0]][start[1]] = false
  walls[exit[0]][exit[1]] = false
  const solution = findPath(walls, start, exit)
  // Preserve one complete, permanently unblocked route, even when patrols are faster.
  const reserved = new Set(solution.map(keyOf))
  const candidates: Position[] = []
  for (let r = 1; r < SIZE - 1; r++) {
    for (let c = 1; c < SIZE - 1; c++) {
      if (!walls[r][c] && !reserved.has(keyOf([r, c]))) candidates.push([r, c])
    }
  }
  const ghosts: GhostDefinition[] = []
  for (const home of shuffled(candidates, random)) {
    if (ghosts.length === 4) break
    if (reserved.has(keyOf(home)) || distance(home, start) < 4) continue
    const seen = new Set<number>()
    const route: Position[] = [home]
    function visit(current: Position) {
      seen.add(keyOf(current))
      for (const next of shuffled(neighbors(current), random)) {
        if (walls[next[0]][next[1]] || seen.has(keyOf(next)) || reserved.has(keyOf(next)) || distance(home, next) > GHOST_RADIUS) continue
        route.push(next)
        visit(next)
        route.push(current)
      }
    }
    visit(home)
    if (seen.size < 3) continue
    route.pop() // Last-to-first is also one legal corridor step.
    ghosts.push({ home, route })
    for (const key of seen) reserved.add(key)
  }
  return { walls, start, exit, solution, ghosts }
}

export function countTurns(path: Position[]): number {
  let turns = 0
  for (let i = 2; i < path.length; i++) {
    if (path[i][0] - path[i - 1][0] !== path[i - 1][0] - path[i - 2][0] ||
        path[i][1] - path[i - 1][1] !== path[i - 1][1] - path[i - 2][1]) turns++
  }
  return turns
}

export function generateChallengeMaze(level: number, previous?: Maze, random: () => number = Math.random): Maze {
  // A fixed-size board has a finite complexity ceiling. Increase actual shortest
  // path length and turns until that ceiling, then keep the challenge there.
  const minLength = Math.min(121, (previous?.solution.length ?? 25) + 8)
  const minTurns = Math.min(32, (previous ? countTurns(previous.solution) : 5) + 3)
  let best = generateMaze(random, level)
  const quality = (maze: Maze) => Math.min(maze.solution.length / minLength, countTurns(maze.solution) / minTurns)
  for (let attempt = 0; attempt < 400; attempt++) {
    if (quality(best) >= 1 && best.ghosts.length) return best
    const candidate = generateMaze(random, level + Math.floor(attempt / 30))
    if (candidate.ghosts.length && quality(candidate) > quality(best)) best = candidate
  }
  return best
}

export function ghostSpeed(game: Game): number {
  return game.mode === 'normal' ? 1.05 : Math.min(1.3, 1.05 + game.solved * 0.05)
}

export function createRun(mode: GameMode = 'normal', raceMinutes: RaceMinutes = 3): Game {
  return { ...createGame(mode === 'normal' ? generateMaze() : generateChallengeMaze(0)), mode, raceMinutes }
}

function checkDeadline(game: Game, now: number): Game {
  if (game.mode !== 'race' || game.status !== 'running' || game.startedAt === null) return game
  const deadline = game.startedAt + game.raceMinutes * 60000
  return now >= deadline ? { ...game, status: 'lost', endedAt: deadline, endReason: 'timeout' } : game
}

function completeMaze(game: Game, now: number): Game {
  if (game.mode === 'normal') return { ...game, solved: 1, status: 'won', endedAt: now, endReason: 'exit' }
  const maze = generateChallengeMaze(game.solved + 1, game.maze)
  return {
    ...createGame(maze), mode: game.mode, raceMinutes: game.raceMinutes,
    solved: game.solved + 1, lives: game.lives, startedAt: game.startedAt,
    status: 'running', lastPlayerMoveAt: now, ghosts: freshGhosts(maze, now),
  }
}

export function revealAround(revealed: Set<number>, [row, col]: Position): Set<number> {
  const next = new Set(revealed)
  for (let dr = -1; dr <= 1; dr++) {
    for (let dc = -1; dc <= 1; dc++) {
      const r = row + dr, c = col + dc
      if (r >= 0 && c >= 0 && r < SIZE && c < SIZE) next.add(keyOf([r, c]))
    }
  }
  return next
}

const freshGhosts = (maze: Maze, now: number): Ghost[] => maze.ghosts.map(() => ({
  index: 0, nextMoveAt: now + WARNING_MS, warningUntil: 0, encounter: false,
}))
export function createGame(maze: Maze = generateMaze()): Game {
  return {
    mode: 'normal', raceMinutes: 3, solved: 0, endReason: null,
    maze, player: maze.start, revealed: revealAround(new Set(), maze.start),
    ghosts: freshGhosts(maze, 0), lives: 3, status: 'ready', startedAt: null,
    endedAt: null, lastPlayerMoveAt: -Infinity, hitUntil: 0, retries: 0,
  }
}
export const ghostPosition = (game: Game, index: number): Position => game.maze.ghosts[index].route[game.ghosts[index].index]

function warnNearby(game: Game, now: number): Game {
  let changed = false
  const revealed = new Set(game.revealed)
  const ghosts = game.ghosts.map((ghost, i) => {
    const position = ghostPosition(game, i)
    const near = distance(position, game.player) <= 1
    if (near) revealed.add(keyOf(position))
    if (near && !ghost.encounter) {
      changed = true
      return { ...ghost, encounter: true, warningUntil: now + WARNING_MS, nextMoveAt: now + WARNING_MS }
    }
    if (distance(position, game.player) > 2 && ghost.encounter) {
      changed = true
      return { ...ghost, encounter: false }
    }
    return ghost
  })
  return changed || revealed.size !== game.revealed.size ? { ...game, ghosts, revealed } : game
}

function caught(game: Game, now: number): Game {
  const lives = game.lives - 1
  if (lives === 0) return { ...game, lives, status: 'lost', endedAt: now, endReason: 'lives' }
  return {
    ...game, lives, player: game.maze.start, ghosts: freshGhosts(game.maze, now),
    revealed: revealAround(game.revealed, game.maze.start),
    lastPlayerMoveAt: now + 350, hitUntil: now + 1800,
  }
}

export function movePlayer(game: Game, direction: Direction, now: number): Game {
  game = checkDeadline(game, now)
  if (game.status === 'lost' || game.status === 'won' || now - game.lastPlayerMoveAt < PLAYER_STEP_MS) return game
  const [dr, dc] = DELTAS[direction]
  const next: Position = [game.player[0] + dr, game.player[1] + dc]
  if (next[0] < 0 || next[1] < 0 || next[0] >= SIZE || next[1] >= SIZE || game.maze.walls[next[0]][next[1]]) return game
  // Holding a key must not consume the promised reaction second. A warned
  // ghost blocks entry until its warning expires, allowing the player to turn.
  const targetGhost = game.ghosts.findIndex((_, i) => samePosition(next, ghostPosition(game, i)))
  if (targetGhost !== -1 && now < game.ghosts[targetGhost].warningUntil) return game
  let updated: Game = {
    ...game, player: next, revealed: revealAround(game.revealed, next),
    lastPlayerMoveAt: now, status: 'running', startedAt: game.startedAt ?? now,
    ghosts: game.status === 'ready' ? freshGhosts(game.maze, now) : game.ghosts,
  }
  if (updated.ghosts.some((_, i) => samePosition(next, ghostPosition(updated, i)))) return caught(updated, now)
  if (samePosition(next, game.maze.exit)) return completeMaze(updated, now)
  updated = warnNearby(updated, now)
  return updated
}

export function advanceGame(game: Game, direction: Direction | null, now: number): Game {
  game = checkDeadline(game, now)
  let updated = direction ? movePlayer(game, direction, now) : game
  if (updated.status !== 'running') return updated
  updated = warnNearby(updated, now)
  for (let i = 0; i < updated.ghosts.length; i++) {
    const ghost = updated.ghosts[i]
    if (now < ghost.nextMoveAt || now < ghost.warningUntil) continue
    const stepMs = PLAYER_STEP_MS / ghostSpeed(updated)
    const route = updated.maze.ghosts[i].route
    const nextIndex = (ghost.index + 1) % route.length
    const ghosts = [...updated.ghosts]
    ghosts[i] = {
      ...ghost, index: nextIndex,
      // Keep fractional cadence instead of rounding every step to the next frame.
      nextMoveAt: now - ghost.nextMoveAt > stepMs ? now + stepMs : ghost.nextMoveAt + stepMs,
    }
    updated = { ...updated, ghosts }
    if (samePosition(route[nextIndex], updated.player)) return caught(updated, now)
    updated = warnNearby(updated, now)
  }
  return updated
}

export function retryGame(game: Game, random: () => number = Math.random): Game {
  const hidden = Array.from({ length: SIZE * SIZE }, (_, i) => i).filter(key => !game.revealed.has(key))
  const revealed = new Set(game.revealed)
  for (const key of shuffled(hidden, random).slice(0, Math.ceil(SIZE * SIZE * 0.15))) revealed.add(key)
  return { ...createGame(game.maze), revealed, retries: game.retries + 1 }
}

export function elapsedMs(game: Game, now: number): number {
  return game.startedAt === null ? 0 : Math.max(0, (game.endedAt ?? now) - game.startedAt)
}
export function formatTime(ms: number): string {
  const seconds = Math.floor(ms / 1000)
  return `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}.${Math.floor(ms / 100) % 10}`
}
