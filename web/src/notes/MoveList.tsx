import { UnstyledButton } from '@mantine/core'
import type { Game } from '../chess/chess'
import styles from './Notes.module.css'

type Props = {
  game: Game
  ply: number
  onPlyChange: (ply: number) => void
}

// The main line as running text: a move number before each White move (and
// before Black's first if Black starts), each move a button that jumps the
// board there. Comments and Bodies arrive with #8.
export function MoveList({ game, ply, onPlyChange }: Props) {
  const moves = game.plies.slice(1)
  if (moves.length === 0) {
    return <p className={styles.noMoves}>No moves yet. This note studies the position alone.</p>
  }

  return (
    <p className={styles.moves}>
      {moves.map((move, i) => {
        const number =
          move.color === 'w' ? `${move.moveNumber}.` : i === 0 ? `${move.moveNumber}…` : null
        return (
          <span key={move.index} className={styles.moveGroup}>
            {number && <span className={styles.moveNumber}>{number}</span>}
            <UnstyledButton
              className={styles.move}
              aria-current={move.index === ply ? 'step' : undefined}
              onClick={() => onPlyChange(move.index)}
            >
              {move.san}
            </UnstyledButton>
          </span>
        )
      })}
    </p>
  )
}
