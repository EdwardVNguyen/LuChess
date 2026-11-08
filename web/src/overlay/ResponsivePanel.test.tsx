import { Button } from '@mantine/core'
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { describe, expect, it } from 'vitest'
import { ResponsivePanel } from './ResponsivePanel'
import type { OverlaySize } from './useOverlaySize'
import { renderWithTheme } from './testUtils'

function Example({ size }: { size: OverlaySize }) {
  const [opened, setOpened] = useState(false)
  return (
    <>
      <Button onClick={() => setOpened(true)}>Find</Button>
      <ResponsivePanel size={size} opened={opened} onClose={() => setOpened(false)} label="Find a note">
        <input aria-label="Query" data-autofocus />
      </ResponsivePanel>
    </>
  )
}

const sizes: OverlaySize[] = ['mobile', 'tablet', 'desktop']

describe.each(sizes)('ResponsivePanel at %s', (size) => {
  it('is named by its label and closes on Esc, returning focus', async () => {
    const user = userEvent.setup()
    renderWithTheme(<Example size={size} />)
    const trigger = screen.getByRole('button', { name: 'Find' })
    await user.click(trigger)

    expect(await screen.findByRole('dialog', { name: 'Find a note' })).toBeInTheDocument()
    await user.keyboard('{Escape}')

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(trigger).toHaveFocus()
  })
})

describe('ResponsivePanel on mobile', () => {
  it('closes with Cancel', async () => {
    const user = userEvent.setup()
    renderWithTheme(<Example size="mobile" />)
    await user.click(screen.getByRole('button', { name: 'Find' }))

    await user.click(await screen.findByRole('button', { name: 'Cancel' }))

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  })
})
