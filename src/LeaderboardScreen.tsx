import { useState } from 'react'
import { formatTime } from './game'
import { rankScores, readScores } from './leaderboard'
import type { GameMode, RaceMinutes } from './game'

export default function Leaderboard({ onHome }: { onHome: () => void }) {
  const [mode, setMode] = useState<GameMode>('normal')
  const [minutes, setMinutes] = useState<RaceMinutes>(3)
  const [data] = useState(() => {
    try { return { scores: readScores(localStorage), error: '' } }
    catch { return { scores: [], error: 'Your saved leaderboard could not be read. Browser storage may be unavailable.' } }
  })
  const scores = rankScores(data.scores.filter(score => score.mode === mode && (mode !== 'race' || score.raceMinutes === minutes)))
  return <main className="leaderboard-screen">
    <div className="leaderboard-shell">
      <button className="text-button" onClick={onHome}>← Return home</button>
      <p className="eyebrow">YOUR OWN RECORDS TO BEAT</p>
      <h1 className="pixel">Personal Leaderboard</h1>
      <p className="leaderboard-note">Saved on this browser. Most mazes first; fastest time breaks ties.</p>
      <div className="mode-tabs" aria-label="Leaderboard mode">
        {(['normal', 'race', 'endurance'] as GameMode[]).map(item => <button key={item} aria-pressed={mode === item} onClick={() => setMode(item)}>{item === 'normal' ? 'Play' : item === 'race' ? 'Race' : 'Endurance'}</button>)}
      </div>
      {mode === 'race' && <div className="duration-tabs" aria-label="Race duration">
        {([2, 3, 5] as RaceMinutes[]).map(value => <button key={value} aria-pressed={minutes === value} onClick={() => setMinutes(value)}>{value} minutes</button>)}
      </div>}
      {data.error ? <p role="alert">{data.error}</p> : !scores.length ? <p className="empty-scores">No saved runs yet. Finish a run and choose “Save score.”</p> : <div className="score-table-wrap"><table className="score-table">
        <thead><tr><th>#</th><th>Mazes</th><th>Time</th><th>Result</th><th>Date</th></tr></thead>
        <tbody>{scores.map((score, i) => <tr key={score.id}><td>{i + 1}</td><td>{score.solved}</td><td>{formatTime(score.elapsed)}</td><td>{score.outcome === 'exit' ? 'Escaped' : score.outcome === 'timeout' ? 'Time up' : 'No lives'}{score.retries > 0 && <small>Reveal-assisted retry</small>}</td><td>{new Date(score.date).toLocaleDateString()}<small>{new Date(score.date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</small></td></tr>)}</tbody>
      </table></div>}
    </div>
  </main>
}
