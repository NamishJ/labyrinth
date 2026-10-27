import { useEffect, useRef, useState } from 'react'
import type { PointerEvent } from 'react'
import './App.css'
import MazeCell from './MazeCell'
import Leaderboard from './LeaderboardScreen'
import { saveScore, scoreFromGame } from './leaderboard'
import type { Score } from './leaderboard'
import type { CellType } from './MazeCell'
import { advanceGame, createGame, createRun, ghostSpeed, elapsedMs, formatTime, ghostPosition, keyOf, movePlayer, retryGame, samePosition, SIZE } from './game'
import type { Direction, Position, GameMode, RaceMinutes } from './game'

const KEYS: Record<string, Direction> = {
  arrowup: 'up', w: 'up', arrowdown: 'down', s: 'down',
  arrowleft: 'left', a: 'left', arrowright: 'right', d: 'right',
}
function Icon({ kind }: { kind: 'home' | 'shuffle' }) {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
    {kind === 'home' ? <path d="m3 11 9-8 9 8M5 10v11h5v-7h4v7h5V10" /> : <><path d="M3 6h3c5 0 7 12 12 12h3M3 18h3c2 0 4-3 6-6s4-6 6-6h3"/><path d="m17 2 4 4-4 4m0 4 4 4-4 4"/></>}
  </svg>
}
function Heart({ filled }: { filled: boolean }) {
  return <svg className={`heart ${filled ? 'filled' : ''}`} viewBox="0 0 12 11" aria-hidden="true"><path d="M1 1h3v1h1v1h2V2h1V1h3v1h1v4h-1v1h-1v1H9v1H8v1H7v1H5v-1H4V9H3V8H2V7H1V6H0V2h1z" fill="currentColor"/></svg>
}

function App() {
  const [screen, setScreen] = useState<'home' | 'game' | 'race-options' | 'leaderboard'>('home')
  const [game, setGame] = useState(createGame)
  const [saved, setSaved] = useState(false)
  const [saveError, setSaveError] = useState('')
  const scoreRef = useRef<Score | null>(null)
  const [clock, setClock] = useState(0)
  const heldKeys = useRef<string[]>([])
  const pointerDirection = useRef<Direction | null>(null)
  const swipe = useRef<{ pointerId: number; x: number; y: number } | null>(null)
  const boardRef = useRef<HTMLDivElement>(null)
  const resultRef = useRef<HTMLButtonElement>(null)

  function clearInput() { heldKeys.current = []; pointerDirection.current = null; swipe.current = null }
  function newMaze(mode: GameMode = game.mode, minutes: RaceMinutes = game.raceMinutes) {
    clearInput()
    setSaved(false)
    setSaveError('')
    scoreRef.current = null
    setGame(createRun(mode, minutes))
    setClock(performance.now())
    setScreen('game')
    requestAnimationFrame(() => boardRef.current?.focus({ preventScroll: true }))
  }
  function retry() {
    if (game.mode !== 'normal') { newMaze(); return }
    clearInput()
    setSaved(false)
    setSaveError('')
    scoreRef.current = null
    setGame(previous => retryGame(previous))
    setClock(performance.now())
    requestAnimationFrame(() => boardRef.current?.focus({ preventScroll: true }))
  }

  function saveRun() {
    if (saved) return
    try {
      scoreRef.current ??= scoreFromGame(game)
      saveScore(localStorage, scoreRef.current)
      setSaved(true)
      setSaveError('')
    } catch {
      setSaveError('Could not save. Check that browser storage is available, then try again.')
    }
  }

  useEffect(() => {
    if (game.status === 'won' || game.status === 'lost') {
      heldKeys.current = []
      pointerDirection.current = null
      swipe.current = null
      resultRef.current?.focus()
    }
  }, [game.status])

  useEffect(() => {
    if (screen !== 'game') return
    const resetInput = () => { heldKeys.current = []; pointerDirection.current = null; swipe.current = null }
    const down = (event: KeyboardEvent) => {
      const key = event.key.toLowerCase()
      const direction = KEYS[key]
      if (!direction || event.altKey || event.ctrlKey || event.metaKey) return
      if (event.target instanceof HTMLElement && event.target.closest('button, summary, input, textarea')) return
      event.preventDefault()
      if (event.repeat) return
      heldKeys.current = [...heldKeys.current.filter(item => item !== key), key]
      setGame(previous => movePlayer(previous, direction, performance.now()))
    }
    const up = (event: KeyboardEvent) => {
      heldKeys.current = heldKeys.current.filter(key => key !== event.key.toLowerCase())
    }
    window.addEventListener('keydown', down)
    window.addEventListener('keyup', up)
    window.addEventListener('blur', resetInput)
    document.addEventListener('visibilitychange', resetInput)
    const interval = window.setInterval(() => {
      if (document.hidden) return
      const now = performance.now()
      const key = heldKeys.current[heldKeys.current.length - 1]
      const direction = pointerDirection.current ?? KEYS[key] ?? null
      setGame(previous => advanceGame(previous, direction, now))
      setClock(now)
    }, 16)
    return () => {
      clearInterval(interval)
      resetInput()
      window.removeEventListener('keydown', down)
      window.removeEventListener('keyup', up)
      window.removeEventListener('blur', resetInput)
      document.removeEventListener('visibilitychange', resetInput)
    }
  }, [screen])

  useEffect(() => {
    if (screen !== 'game') return
    const root = document.documentElement
    root.classList.add('game-active')

    // React touch listeners may be passive. Use a native, non-passive listener
    // so Safari cannot turn a gameplay swipe into page scrolling or bounce.
    // Touch events keep their original target even if a finger leaves the maze.
    const preventGameplayScroll = (event: TouchEvent) => {
      if (event.target instanceof Element &&
          event.target.closest('.maze, .direction-button') && event.cancelable) {
        event.preventDefault()
      }
    }
    document.addEventListener('touchmove', preventGameplayScroll, { passive: false, capture: true })
    return () => {
      root.classList.remove('game-active')
      document.removeEventListener('touchmove', preventGameplayScroll, true)
    }
  }, [screen])

  function startSwipe(event: PointerEvent<HTMLDivElement>) {
    if (!event.isPrimary || event.button !== 0 || game.status === 'won' || game.status === 'lost') return
    event.preventDefault()
    event.currentTarget.focus({ preventScroll: true })
    event.currentTarget.setPointerCapture(event.pointerId)
    swipe.current = { pointerId: event.pointerId, x: event.clientX, y: event.clientY }
    pointerDirection.current = null
  }

  function moveSwipe(event: PointerEvent<HTMLDivElement>) {
    const gesture = swipe.current
    if (!gesture || event.pointerId !== gesture.pointerId) return
    if (event.cancelable) event.preventDefault()
    const dx = event.clientX - gesture.x
    const dy = event.clientY - gesture.y
    // Ignore taps and finger jitter. Once a direction is chosen, holding the
    // finger down uses the same movement cadence as holding an arrow key.
    if (Math.max(Math.abs(dx), Math.abs(dy)) < 18) return
    const direction: Direction = Math.abs(dx) > Math.abs(dy)
      ? dx > 0 ? 'right' : 'left'
      : dy > 0 ? 'down' : 'up'
    swipe.current = { ...gesture, x: event.clientX, y: event.clientY }
    pointerDirection.current = direction
    const now = performance.now()
    setGame(previous => movePlayer(previous, direction, now))
  }

  function endSwipe(event: PointerEvent<HTMLDivElement>) {
    if (event.pointerId !== swipe.current?.pointerId) return
    swipe.current = null
    pointerDirection.current = null
  }

  if (screen === 'leaderboard') return <Leaderboard onHome={() => setScreen('home')}/>

  if (screen === 'race-options') return <main className="home-screen"><div className="race-options">
    <p className="eyebrow">HOW FAR CAN YOU GO?</p>
    <h1 className="pixel">Race</h1>
    <p>Choose your time. Solve as many mazes as you can.</p>
    <div className="race-durations">{([2, 3, 5] as RaceMinutes[]).map(minutes => <button key={minutes} className="duration-button" onClick={() => newMaze('race', minutes)}><span className="pixel">{minutes}</span><span>MINUTES</span></button>)}</div>
    <p className="race-help">Three lives for the whole run. The countdown starts on your first move.</p>
    <button className="text-button" onClick={() => setScreen('home')}>← Return home</button>
  </div></main>

  if (screen === 'home') {
    return <main className="home-screen">
      <div className="home-content">
        <p className="eyebrow home-eyebrow">A WAY OUT IS WAITING.</p>
        <h1 className="home-title pixel">Labyrinth</h1>
        <div className="home-modes">
          <button className="play-button pixel" onClick={() => newMaze('normal')}>[Play]</button>
          <button className="play-button pixel" onClick={() => setScreen('race-options')}>[Race]</button>
          <button className="play-button pixel" onClick={() => newMaze('endurance')}>[Endurance]</button>
        </div>
        <button className="leaderboard-button pixel" onClick={() => setScreen('leaderboard')}>[Personal Leaderboard]</button>
      </div>
      <p className="home-footer">STEP INTO THE UNKNOWN</p>
    </main>
  }

  const ghostCells = new Map(game.ghosts.map((ghost, i) => [keyOf(ghostPosition(game, i)), ghost]))
  const warning = game.ghosts.some(ghost => ghost.warningUntil > clock)
  const finished = game.status === 'won' || game.status === 'lost'
  const explored = Math.round(game.revealed.size / (SIZE * SIZE) * 100)
  const message = game.status === 'ready' ? 'Your first step starts the clock.'
    : game.hitUntil > clock ? 'Caught. Back at the entrance — keep going.'
    : warning ? 'Ghost nearby. Move away!'
    : 'Find the green exit on the bottom edge.'

  return <main className="game-screen">
    <div className="game-shell">
      <header className="game-header">
        <nav className="header-actions" aria-label="Game navigation">
          <button className="icon-button" title="Return home" aria-label="Return home" onClick={() => { clearInput(); setScreen('home') }}><Icon kind="home"/></button>
          <button className="icon-button" title={game.mode === 'normal' ? 'Generate a new maze' : 'Restart run'} aria-label={game.mode === 'normal' ? 'Generate a new maze' : 'Restart run'} onClick={() => newMaze()}><Icon kind="shuffle"/></button>
        </nav>
        <h1 className="game-title pixel">Labyrinth</h1>
        <span className="header-label">{game.mode === 'normal' ? 'FIND YOUR WAY' : game.mode === 'race' ? `RACE · ${game.raceMinutes} MIN` : 'ENDURANCE'}</span>
      </header>
      <div className="board-meta"><span>{game.mode === 'normal' ? 'THE UNKNOWN' : `MAZE ${game.solved + 1} · ${game.solved} SOLVED`}</span><span>{explored}% REVEALED</span></div>
      <div className={`board-frame ${game.hitUntil > clock ? 'was-caught' : ''}`}>
        <div className="maze" ref={boardRef} tabIndex={0} role="group" aria-label="Maze. Swipe, or use arrow keys or W A S D to move. Swipe and hold to keep moving; lift to stop. Find the exit on the bottom row." onPointerDown={startSwipe} onPointerMove={moveSwipe} onPointerUp={endSwipe} onPointerCancel={endSwipe} onLostPointerCapture={endSwipe} style={{ gridTemplateColumns: `repeat(${SIZE}, 1fr)` }}>
          {game.maze.walls.flatMap((row, r) => row.map((wall, c) => {
            const position: Position = [r, c]
            const key = keyOf(position)
            const ghost = ghostCells.get(key)
            let type: CellType = wall ? 'wall' : 'floor'
            if (samePosition(position, game.maze.start)) type = 'start'
            if (samePosition(position, game.maze.exit)) type = 'exit'
            if (ghost) type = 'ghost'
            if (samePosition(position, game.player)) type = 'player'
            return <MazeCell key={key} type={type} isVisible={game.revealed.has(key)} warning={!!ghost && ghost.warningUntil > clock}/>
          }))}
        </div>
        {finished && <section className="result-overlay" role="dialog" aria-modal="true" aria-labelledby="result-title" onKeyDown={event => {
          if (event.key === 'Tab') {
            const buttons = event.currentTarget.querySelectorAll('button')
            if (event.shiftKey && document.activeElement === buttons[0]) { event.preventDefault(); buttons[buttons.length - 1].focus() }
            else if (!event.shiftKey && document.activeElement === buttons[buttons.length - 1]) { event.preventDefault(); buttons[0].focus() }
          }
        }}>
          <div className="result-card">
            <p className="eyebrow">{game.mode === 'normal' ? 'YOUR JOURNEY THROUGH THE DARK' : game.mode === 'race' ? `RACE · ${game.raceMinutes} MINUTES` : 'ENDURANCE'}</p>
            <h2 id="result-title" className="pixel">{game.status === 'won' ? 'You escaped.' : game.endReason === 'timeout' ? "Time’s up." : 'Lost in the dark.'}</h2>
            <p>{game.solved} {game.solved === 1 ? 'maze' : 'mazes'} solved · {formatTime(elapsedMs(game, clock))}</p>
            <div className="save-score">
              <p>{saved ? 'Score saved to your personal leaderboard.' : 'Save this run to your personal leaderboard?'}</p>
              <button ref={resultRef} className="save-button" aria-disabled={saved} onClick={saveRun}>{saved ? '✓ Saved' : 'Save score'}</button>
              {saveError && <p className="save-error" role="alert">{saveError}</p>}
            </div>
            {game.mode === 'normal' ? <>
              {game.status === 'lost' && <button className="primary-button" onClick={retry}>Retry this maze <span>+15% revealed</span></button>}
              <button className={game.status === 'won' ? 'primary-button' : 'secondary-button'} onClick={() => newMaze()}>Generate a new maze</button>
            </> : <button className="primary-button" onClick={retry}>Try again</button>}
            <button className="text-button" onClick={() => { clearInput(); setScreen('home') }}>Return home</button>
          </div>
        </section>}
      </div>
      <div className="game-stats">
        <div className="lives-stat"><span className="stat-label">LIVES</span><div className="hearts" aria-label={`${game.lives} of 3 lives remaining`}>{[0, 1, 2].map(i => <Heart key={i} filled={i < game.lives}/>)}</div></div>
        <div className="timer-stat"><span className="stat-label">{game.mode === 'race' ? 'LEFT' : 'TIME'}</span><span className="timer pixel" aria-label={`${game.mode === 'race' ? 'Time remaining' : 'Elapsed time'} ${formatTime(game.mode === 'race' ? Math.max(0, game.raceMinutes * 60000 - elapsedMs(game, clock)) : elapsedMs(game, clock))}`}>{formatTime(game.mode === 'race' ? Math.max(0, game.raceMinutes * 60000 - elapsedMs(game, clock)) : elapsedMs(game, clock))}</span></div>
      </div>
      <p className={`game-message ${warning ? 'danger' : ''}`} role="status">{finished ? (game.status === 'won' ? 'Exit reached.' : game.endReason === 'timeout' ? 'Time is up.' : 'No lives remaining.') : message}</p>
      <div className="game-instructions"><span><kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> <span className="or">/</span> <kbd>↑</kbd><kbd>←</kbd><kbd>↓</kbd><kbd>→</kbd> to move</span><span className="exit-legend"><i/> Bottom edge = exit</span></div>
      <p className="swipe-hint">Swipe the maze to move · Hold to keep going · Lift to stop</p>
      <div className="touch-controls" aria-label="Movement controls">
        {(['up', 'left', 'down', 'right'] as Direction[]).map((direction, i) => <button key={direction} className={`direction-button direction-${direction}`} aria-label={`Move ${direction}`} disabled={finished} onPointerDown={event => {
          event.preventDefault()
          event.currentTarget.setPointerCapture(event.pointerId)
          pointerDirection.current = direction
          setGame(previous => movePlayer(previous, direction, performance.now()))
        }} onPointerUp={() => { pointerDirection.current = null }} onPointerCancel={() => { pointerDirection.current = null }} onLostPointerCapture={() => { pointerDirection.current = null }} onClick={event => {
          if (event.detail === 0) setGame(previous => movePlayer(previous, direction, performance.now()))
        }}>{['↑', '←', '↓', '→'][i]}</button>)}
      </div>
      <details className="rules"><summary>How the ghosts work</summary><p>Ghosts patrol corridors within six squares of their starting point in every direction. They move {ghostSpeed(game).toFixed(2)}× your speed, but pause for one second when they first get next to you. Use that moment to retreat; movement into its square is blocked during the warning. After the warning, touching a ghost costs a life; explored tiles stay revealed. {game.mode === 'normal' ? 'After three hits, retry the same maze with another 15% revealed and three fresh lives.' : 'Your three lives are shared across the entire run. Each exit immediately leads to a harder maze, with ghost speed rising to 1.3×. Difficulty eventually caps on this board, but every maze remains solvable.'}</p></details>
    </div>
  </main>
}
export default App
