import assert from 'node:assert/strict'
import test from 'node:test'
import {
  SIZE, PLAYER_STEP_MS, GHOST_STEP_MS, WARNING_MS, GHOST_RADIUS,
  generateMaze, createGame, keyOf, movePlayer, advanceGame,
  retryGame, elapsedMs, ghostPosition,
} from '../src/game.ts'

function seeded(seed) {
  return () => {
    seed += 0x6D2B79F5
    let value = Math.imul(seed ^ seed >>> 15, 1 | seed)
    value ^= value + Math.imul(value ^ value >>> 7, 61 | value)
    return ((value ^ value >>> 14) >>> 0) / 4294967296
  }
}
function direction(a, b) {
  return b[0] < a[0] ? 'up' : b[0] > a[0] ? 'down' : b[1] < a[1] ? 'left' : 'right'
}
function fixture() {
  const walls = Array.from({ length: SIZE }, () => Array(SIZE).fill(false))
  return {
    walls, start: [5, 3], exit: [SIZE - 1, 9], solution: [],
    ghosts: [{ home: [5, 5], route: [[5, 5], [5, 4], [5, 5], [5, 6]] }],
  }
}

test('1,000 random mazes have connected exits and remain completable with active patrols', () => {
  const starts = new Set(), exits = new Set()
  for (let seed = 1; seed <= 1000; seed++) {
    const maze = generateMaze(seeded(seed))
    assert.equal(maze.start[0], 0)
    assert.equal(maze.exit[0], SIZE - 1)
    starts.add(maze.start[1]); exits.add(maze.exit[1])
    assert.ok(maze.solution.length > SIZE - 1)
    assert.deepEqual(maze.solution[0], maze.start)
    assert.deepEqual(maze.solution.at(-1), maze.exit)
    assert.ok(maze.ghosts.length > 0)
    const safe = new Set(maze.solution.map(keyOf))
    for (const ghost of maze.ghosts) {
      for (let i = 0; i < ghost.route.length; i++) {
        const pos = ghost.route[i], next = ghost.route[(i + 1) % ghost.route.length]
        assert.equal(maze.walls[pos[0]][pos[1]], false)
        assert.equal(Math.abs(pos[0] - next[0]) + Math.abs(pos[1] - next[1]), 1)
        assert.ok(Math.abs(pos[0] - ghost.home[0]) <= GHOST_RADIUS)
        assert.ok(Math.abs(pos[1] - ghost.home[1]) <= GHOST_RADIUS)
        assert.equal(safe.has(keyOf(pos)), false)
      }
    }
    let game = createGame(maze), now = 1000
    for (let i = 1; i < maze.solution.length; i++) {
      game = advanceGame(game, direction(maze.solution[i - 1], maze.solution[i]), now)
      now += PLAYER_STEP_MS + 16
    }
    assert.equal(game.status, 'won', `seed ${seed}`)
    assert.equal(game.lives, 3)
  }
  assert.ok(starts.size >= 8)
  assert.ok(exits.size >= 8)
})

test('movement is rate-limited, blocked by walls, and starts the timer only on a valid step', () => {
  const maze = fixture()
  maze.walls[4][3] = true
  let game = createGame(maze)
  assert.equal(movePlayer(game, 'up', 100), game)
  assert.equal(elapsedMs(game, 9999), 0)
  game = movePlayer(game, 'down', 200)
  assert.equal(game.startedAt, 200)
  assert.deepEqual(game.player, [6, 3])
  assert.equal(movePlayer(game, 'down', 201), game)
  game = movePlayer(game, 'right', 200 + PLAYER_STEP_MS)
  assert.deepEqual(game.player, [6, 4])
  assert.equal(elapsedMs(game, 1200), 1000)
})

test('adjacent ghosts reveal and freeze for a full second, then can catch the player', () => {
  let game = movePlayer(createGame(fixture()), 'right', 100)
  assert.equal(game.ghosts[0].warningUntil, 100 + WARNING_MS)
  assert.ok(game.revealed.has(keyOf([5, 5])))
  const revealed = new Set(game.revealed)
  game = advanceGame(game, null, 100 + WARNING_MS - 1)
  assert.deepEqual(ghostPosition(game, 0), [5, 5])
  assert.equal(game.lives, 3)
  game = advanceGame(game, null, 100 + WARNING_MS)
  assert.equal(game.lives, 2)
  assert.deepEqual(game.player, game.maze.start)
  assert.equal(game.startedAt, 100)
  for (const key of revealed) assert.ok(game.revealed.has(key))
})

test('a patrol arriving next to a stationary player also provides the full warning', () => {
  const maze = fixture()
  maze.ghosts[0].route = [[5, 6], [5, 5], [5, 4], [5, 5]]
  let game = movePlayer(createGame(maze), 'right', 100)
  game = advanceGame(game, null, 1100)
  assert.deepEqual(ghostPosition(game, 0), [5, 5])
  assert.equal(game.ghosts[0].warningUntil, 2100)
  game = advanceGame(game, null, 2099)
  assert.equal(game.lives, 3)
  game = advanceGame(game, null, 2100)
  assert.equal(game.lives, 2)
})

test('player can use the warning second to retreat safely', () => {
  let game = movePlayer(createGame(fixture()), 'right', 100)
  game = advanceGame(game, 'left', 300)
  game = advanceGame(game, null, 1100)
  assert.equal(game.lives, 3)
  assert.deepEqual(game.player, [5, 3])
})

test('three collisions end the attempt; retry preserves the maze and adds 15% revealed', () => {
  let game = createGame(fixture())
  for (let i = 0; i < 3; i++) {
    const now = 100 + i * 3000
    game = movePlayer(game, 'right', now)
    game = movePlayer(game, 'right', now + WARNING_MS)
    assert.equal(game.lives, 2 - i)
  }
  assert.equal(game.status, 'lost')
  const frozenTime = elapsedMs(game, 10000)
  assert.equal(elapsedMs(game, 20000), frozenTime)
  assert.equal(advanceGame(game, 'down', 30000), game)
  const retry = retryGame(game, seeded(42))
  assert.equal(retry.maze, game.maze)
  assert.equal(retry.lives, 3)
  assert.equal(retry.status, 'ready')
  assert.equal(retry.startedAt, null)
  assert.equal(retry.revealed.size - game.revealed.size, Math.ceil(SIZE * SIZE * 0.15))
  for (const key of game.revealed) assert.ok(retry.revealed.has(key))
  let allRevealed = retry
  for (let i = 0; i < 10; i++) allRevealed = retryGame(allRevealed, seeded(i))
  assert.equal(allRevealed.revealed.size, SIZE * SIZE)
})

test('winning freezes the timer and all movement', () => {
  const maze = fixture()
  maze.start = [SIZE - 2, 9]
  let game = movePlayer(createGame(maze), 'left', 100)
  game = movePlayer(game, 'right', 500)
  game = movePlayer(game, 'down', 1000)
  assert.equal(game.status, 'won')
  assert.equal(elapsedMs(game, 9000), 900)
  assert.equal(advanceGame(game, 'up', 10000), game)
})

test('patrol cadence remains faster than player movement despite frame rounding', () => {
  const maze = fixture()
  maze.ghosts[0].route = [[10, 10], [10, 11]]
  let game = movePlayer(createGame(maze), 'down', 0)
  let steps = 0
  for (let now = 16; now <= 10000; now += 16) {
    const previousIndex = game.ghosts[0].index
    game = advanceGame(game, null, now)
    if (game.ghosts[0].index !== previousIndex) steps++
  }
  const expected = Math.floor((10000 - WARNING_MS) / GHOST_STEP_MS) + 1
  assert.ok(Math.abs(steps - expected) <= 1, `Expected approximately ${expected} steps, got ${steps}`)
})


test('held movement cannot run into a warned ghost before the reaction second expires', () => {
  let game = movePlayer(createGame(fixture()), 'right', 100)
  for (let now = 260; now < 1100; now += 16) {
    game = advanceGame(game, 'right', now)
    assert.equal(game.lives, 3)
    assert.deepEqual(game.player, [5, 4])
  }
  game = advanceGame(game, 'left', 1099)
  game = advanceGame(game, null, 1100)
  assert.equal(game.lives, 3)
})
