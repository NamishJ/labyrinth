import { memo } from 'react'
import styles from './MazeCell.module.css'

export type CellType = 'floor' | 'wall' | 'player' | 'ghost' | 'exit' | 'start'
type Props = { type: CellType; isVisible: boolean; warning: boolean }

const MazeCell = memo(function MazeCell({ type, isVisible, warning }: Props) {
  return (
    <div className={`${styles.cell} ${isVisible ? styles[type] : styles.fog} ${warning ? styles.warning : ''}`}>
      {isVisible && type === 'ghost' && <svg viewBox="0 0 12 12" aria-hidden="true"><path fill="currentColor" d="M4 1h4v1h2v2h1v7H9V9H7v2H5V9H3v2H1V4h1V2h2z"/><path fill="#111217" d="M3 4h2v3H3zm4 0h2v3H7z"/></svg>}
      {isVisible && type === 'player' && <span className={styles.playerMark} />}
      {isVisible && type === 'exit' && <svg viewBox="0 0 12 12" aria-hidden="true"><path fill="currentColor" d="M2 1h8v10H2zm2 2v6h4V3z"/><path fill="currentColor" d="M5 5h2v2H5z"/></svg>}
      {isVisible && type === 'start' && <span className={styles.startMark} />}
    </div>
  )
})
export default MazeCell
