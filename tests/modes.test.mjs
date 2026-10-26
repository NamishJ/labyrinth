import assert from 'node:assert/strict'
import test from 'node:test'
import { createGame, createRun, advanceGame, movePlayer, generateChallengeMaze, countTurns, ghostSpeed, elapsedMs, SIZE, keyOf } from '../src/game.ts'
import { readScores, saveScore, scoreFromGame, rankScores, SCORE_KEY } from '../src/leaderboard.ts'
function seeded(seed) {
  return () => {
    seed += 0x6D2B79F5
    let n = Math.imul(seed ^ seed >>> 15, 1 | seed)
    n ^= n + Math.imul(n ^ n >>> 7, 61 | n)
    return ((n ^ n >>> 14) >>> 0) / 4294967296
  }
}
function nearExit(mode = 'race', minutes = 3) {
  const game = createGame()
  return { ...game, mode, raceMinutes: minutes, status: 'running', startedAt: 100, lives: 2, player: [SIZE - 2, game.maze.exit[1]], ghosts: game.ghosts.map(g => ({ ...g, nextMoveAt: 999999 })) }
}

test('race durations wait for the first move and expire at the exact selected deadline', () => {
  for (const minutes of [2, 3, 5]) {
    let game = createRun('race', minutes)
    game = advanceGame(game, null, 900000)
    assert.equal(game.status, 'ready')
    assert.equal(elapsedMs(game, 900000), 0)
    game = movePlayer(game, 'down', 900100)
    assert.equal(game.startedAt, 900100)
    const end = 900100 + minutes * 60000
    game = advanceGame(game, null, end - 1)
    assert.equal(game.status, 'running')
    game = advanceGame(game, null, end + 1234)
    assert.equal(game.status, 'lost')
    assert.equal(game.endReason, 'timeout')
    assert.equal(game.endedAt, end)
    assert.equal(elapsedMs(game, end + 100000), minutes * 60000)
  }
})

test('exits immediately advance race and endurance, preserving lives and the run clock', () => {
  for (const mode of ['race', 'endurance']) {
    const game = nearExit(mode)
    const next = movePlayer(game, 'down', 1000)
    assert.equal(next.status, 'running')
    assert.equal(next.solved, 1)
    assert.equal(next.lives, 2)
    assert.equal(next.startedAt, 100)
    assert.equal(next.endedAt, null)
    assert.notEqual(next.maze, game.maze)
    assert.deepEqual(next.player, next.maze.start)
    assert.ok(next.revealed.size < 10)
    assert.equal(ghostSpeed(next), 1.1)
    assert.equal(elapsedMs(next, 2000), 1900)
  }
})

test('deadline wins over an exit or a held-key move on the same frame', () => {
  const game = nearExit('race', 2)
  const expired = movePlayer(game, 'down', 120100)
  assert.equal(expired.endReason, 'timeout')
  assert.equal(expired.solved, 0)
  assert.equal(expired.maze, game.maze)
  assert.equal(advanceGame(expired, 'down', 999999), expired)
})

test('endurance has no deadline; ghost speed caps at 1.3', () => {
  const game = nearExit('endurance')
  assert.equal(advanceGame(game, null, 999999999).status, 'running')
  assert.equal(ghostSpeed({ ...game, solved: 5 }), 1.3)
  assert.equal(ghostSpeed({ ...game, solved: 500 }), 1.3)
  assert.equal(ghostSpeed({ ...game, mode: 'normal', solved: 5 }), 1.05)
})

test('challenge progression increases shortest-route turns and length up to its ceiling', () => {
  for (let seed = 1; seed <= 40; seed++) {
    const random = seeded(seed)
    let previous
    for (let level = 0; level < 12; level++) {
      const maze = generateChallengeMaze(level, previous, random)
      assert.ok(maze.solution.length >= Math.min(121, (previous?.solution.length ?? 25) + 8), `length seed ${seed} level ${level}`)
      assert.ok(countTurns(maze.solution) >= Math.min(32, (previous ? countTurns(previous.solution) : 5) + 3), `turns seed ${seed} level ${level}`)
      const safe = new Set(maze.solution.map(keyOf))
      assert.ok(maze.ghosts.length)
      for (const ghost of maze.ghosts) for (const position of ghost.route) assert.equal(safe.has(keyOf(position)), false)
      previous = maze
    }
  }
})

test('scores persist by mode and race duration, deduplicate, and rank by solved then time', () => {
  const data = new Map()
  const storage = { getItem: key => data.get(key) ?? null, setItem: (key, value) => data.set(key, value) }
  assert.deepEqual(readScores(storage), [])
  assert.throws(() => scoreFromGame(createGame()))
  const game = { ...nearExit('race', 5), status: 'lost', endedAt: 300100, endReason: 'timeout', solved: 4 }
  const score = scoreFromGame(game)
  saveScore(storage, score)
  saveScore(storage, score)
  assert.equal(readScores(storage).length, 1)
  assert.equal(readScores(storage)[0].raceMinutes, 5)
  assert.equal(readScores(storage)[0].elapsed, 300000)
  const faster = { ...score, id: 'faster', elapsed: 200000 }
  const more = { ...score, id: 'more', solved: 5 }
  saveScore(storage, faster); saveScore(storage, more)
  assert.deepEqual(rankScores(readScores(storage)).map(s => s.id), ['more', 'faster', score.id])
  data.set(SCORE_KEY, JSON.stringify([score, { bad: true }, { ...score, elapsed: -1 }]))
  assert.equal(readScores(storage).length, 1)
})

test('unavailable or corrupt storage fails visibly instead of overwriting saved data', () => {
  const game = { ...nearExit(), status: 'lost', endedAt: 1000, endReason: 'lives' }
  const score = scoreFromGame(game)
  const broken = { getItem: () => '{broken', setItem: () => assert.fail('Must not overwrite unreadable data') }
  assert.throws(() => saveScore(broken, score))
  const full = { getItem: () => '[]', setItem: () => { throw new Error('Quota exceeded') } }
  assert.throws(() => saveScore(full, score))
})

test('all three modes end on the third hit and fresh challenge attempts reset the run', () => {
  for (const mode of ['normal', 'race', 'endurance']) {
    let game = { ...createGame(), mode, solved: mode === 'normal' ? 0 : 2 }
    const walls = Array.from({ length: SIZE }, () => Array(SIZE).fill(false))
    const maze = { walls, start: [5, 3], exit: [20, 9], solution: [], ghosts: [{ home: [5, 5], route: [[5, 5], [5, 4]] }] }
    game = { ...game, maze, player: maze.start, ghosts: [{ index: 0, nextMoveAt: 1000, warningUntil: 0, encounter: false }] }
    for (let i = 0; i < 3; i++) {
      game = movePlayer(game, 'right', 100 + i * 3000)
      game = movePlayer(game, 'right', 1100 + i * 3000)
    }
    assert.equal(game.status, 'lost')
    assert.equal(game.endReason, 'lives')
    assert.equal(game.mode, mode)
    assert.equal(game.solved, mode === 'normal' ? 0 : 2)
    const next = createRun(mode, 5)
    assert.equal(next.lives, 3)
    assert.equal(next.solved, 0)
    assert.equal(next.startedAt, null)
    assert.equal(next.raceMinutes, 5)
  }
})
