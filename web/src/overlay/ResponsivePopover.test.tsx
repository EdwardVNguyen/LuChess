import { Button } from '@mantine/core'
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { describe, expect, it } from 'vitest'
import { ResponsivePopover } from './ResponsivePopover'
import type { OverlaySize } from './useOverlaySize'
import { renderWithTheme } from './testUtils'

function Example({ size }: { size: OverlaySize }) {
  const [opened, setOpened] = useState(false)
  return (
    <ResponsivePopover
      size={size}
      opened={opened}
      onClose={() => setOpened(false)}
      target={
        <Button onClick={() => setOpened(true)}>Save to folder</Button>
      }
      label="Save to folder"
    >
      <p>Opening ideas</p>
    </ResponsivePopover>
  )
}

const sizes: OverlaySize[] = ['mobile', 'tablet', 'desktop']

describe.each(sizes)('ResponsivePopover at %s', (size) => {
  it('closes on Esc and returns focus to the trigger', async () => {
    const user = userEvent.setup()
    renderWithTheme(<Example size={size} />)

    const trigger = screen.getByRole('button', { name: 'Save to folder' })
    await user.click(trigger)

    const dialog = await screen.findByRole('dialog', { name: 'Save to folder' })
    expect(dialog).toBeInTheDocument()

    await user.keyboard('{Escape}')

    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Save to folder' })).not.toBeInTheDocument())
    expect(trigger).toHaveFocus()
  })

  it('shows its label and content', async () => {
    const user = userEvent.setup()
    renderWithTheme(<Example size={size} />)

    await user.click(screen.getByRole('button', { name: 'Save to folder' }))

    expect(await screen.findByRole('dialog', { name: 'Save to folder' })).toBeInTheDocument()
    expect(screen.getByText('Opening ideas')).toBeInTheDocument()
  })

  it('anchors to the trigger only on desktop', async () => {
    const user = userEvent.setup()
    renderWithTheme(<Example size={size} />)

    const trigger = screen.getByRole('button', { name: 'Save to folder' })
    await user.click(trigger)
    await screen.findByRole('dialog', { name: 'Save to folder' })

    const isModal = document.querySelector('[data-modal-content]') !== null
    expect(isModal).toBe(size === 'tablet')
    expect(trigger.getAttribute('aria-expanded') === 'true').toBe(size === 'desktop')
  })
})
