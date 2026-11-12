import { Box, SegmentedControl, Stack, Text, Title } from '@mantine/core'
import { useNavigate, useSearch } from '@tanstack/react-router'
import { useState } from 'react'
import { gameFromMoves, parsePgn, plyLabel, START_FEN, type LegalMove } from '../chess/chess'
import { fischerSpassky1972Game6 } from '../chess/fixtures'
import type { Drawing } from '../chess/pgn'
import { Board } from './Board'

const sample = parsePgn(fischerSpassky1972Game6)
if (!sample.ok) throw new Error(sample.error)
const game = sample.value

export type DevBoardMode = 'view' | 'play' | 'setup'

// Dev-only page exercising the shared Board's three modes (#24), so the
// screenshot harness can show each at 1440, 834 and 390px. The board sits in
// a column about as wide as the Note screen's: 360px, or full width on mobile.
export function DevBoard() {
  const { mode, fen } = useSearch({ from: '/dev/board' })
  const navigate = useNavigate({ from: '/dev/board' })

  return (
    <Stack gap="lg" p="md">
      <Title order={1}>Board</Title>
      <SegmentedControl
        w={{ base: '100%', sm: 360 }}
        value={mode}
        onChange={(value) => navigate({ search: { mode: value as DevBoardMode } })}
        data={[
          { value: 'view', label: 'View' },
          { value: 'play', label: 'Play' },
          { value: 'setup', label: 'Set up' },
        ]}
      />
      <Box w={{ base: '100%', sm: 360 }}>
        {mode === 'view' && <ViewDemo />}
        {mode === 'play' && <PlayDemo startFen={fen ?? START_FEN} />}
        {mode === 'setup' && <SetupDemo />}
      </Box>
    </Stack>
  )
}

// Drawings (#77) are kept per Ply here, as a Note keeps them per Move.
function ViewDemo() {
  const [ply, setPly] = useState(20)
  const [drawings, setDrawings] = useState<ReadonlyMap<number, Drawing[]>>(new Map())
  return (
    <Stack gap="md">
      <Board
        mode="view"
        game={game}
        ply={ply}
        onPlyChange={setPly}
        drawings={drawings.get(ply) ?? []}
        onDrawingsChange={(next) => setDrawings(new Map(drawings).set(ply, next))}
      />
      <Text size="sm" c="dimmed">
        Right-drag to draw an arrow, right-click for a circle. Hold Shift, Alt or both for another colour. Left-click to clear.
      </Text>
    </Stack>
  )
}

// `?fen=` starts play from another position, e.g. one with a pawn about to promote.
function PlayDemo({ startFen }: { startFen: string }) {
  const [moves, setMoves] = useState<LegalMove[]>([])
  const played = gameFromMoves(
    startFen,
    moves.map((move) => move.san),
  )
  const plies = played.ok ? played.value.plies : []

  return (
    <Stack gap="md">
      <Board mode="play" fen={startFen} moves={moves} onMove={(move) => setMoves([...moves, move])} />
      <Text size="sm" c="dimmed">
        {plies.length > 1 ? plies.slice(1).map(plyLabel).join(' ') : 'Drag or click a piece to play a move.'}
      </Text>
    </Stack>
  )
}

function SetupDemo() {
  const [fen, setFen] = useState('4k3/8/8/8/8/8/4P3/4K3 w - - 0 1')
  return <Board mode="setup" fen={fen} onFenChange={setFen} />
}
