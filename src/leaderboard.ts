import type { Game, GameMode, RaceMinutes } from './game.ts'
import { elapsedMs } from './game.ts'

export const SCORE_KEY = 'labyrinth.scores.v1'
export interface Score {
  id: string
  mode: GameMode
  raceMinutes: RaceMinutes | null
  solved: number
  elapsed: number
  retries: number
  date: string
  outcome: 'exit' | 'lives' | 'timeout'
}
export interface ScoreStorage { getItem(key: string): string | null; setItem(key: string, value: string): void }

export function readScores(storage: ScoreStorage): Score[] {
  const value: unknown = JSON.parse(storage.getItem(SCORE_KEY) ?? '[]')
  if (!Array.isArray(value)) throw new Error('Invalid leaderboard data')
  return value.filter((score): score is Score => {
    if (!score || typeof score !== 'object') return false
    const s = score as Partial<Score>
    return typeof s.id === 'string' && ['normal', 'race', 'endurance'].includes(s.mode ?? '') &&
      (s.mode === 'race' ? [2, 3, 5].includes(s.raceMinutes ?? 0) : s.raceMinutes === null) &&
      Number.isInteger(s.solved) && s.solved! >= 0 && typeof s.elapsed === 'number' && Number.isFinite(s.elapsed) && s.elapsed >= 0 &&
      Number.isInteger(s.retries) && s.retries! >= 0 && typeof s.date === 'string' && Number.isFinite(Date.parse(s.date)) &&
      ['exit', 'lives', 'timeout'].includes(s.outcome ?? '')
  })
}
export function scoreFromGame(game: Game): Score {
  if (game.endedAt === null || !game.endReason) throw new Error('Finish the run before saving')
  return {
    id: crypto.randomUUID(), mode: game.mode, raceMinutes: game.mode === 'race' ? game.raceMinutes : null,
    solved: game.solved, elapsed: elapsedMs(game, game.endedAt), retries: game.retries,
    date: new Date().toISOString(), outcome: game.endReason,
  }
}
export function saveScore(storage: ScoreStorage, score: Score): Score[] {
  const scores = readScores(storage)
  if (!scores.some(item => item.id === score.id)) scores.push(score)
  storage.setItem(SCORE_KEY, JSON.stringify(scores))
  return scores
}
export function rankScores(scores: Score[]): Score[] {
  return [...scores].sort((a, b) => b.solved - a.solved || a.elapsed - b.elapsed || b.date.localeCompare(a.date))
}
