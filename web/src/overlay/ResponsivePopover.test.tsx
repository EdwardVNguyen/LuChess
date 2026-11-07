import { Button } from '@mantine/core'
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { describe, expect, it } from 'vitest'
import { ResponsivePopover } from './ResponsivePopover'
import { renderWithTheme } from './testUtils'

// jsdom reports every `matchMedia` query as unmatched (src/testSetup.ts), so
// this renders the mobile shape: a bottom sheet (Drawer). The desktop
// (Popover) and tablet (Modal) shapes reuse the same opened/onClose/Esc
// handling Mantine provides, exercised directly in the other overlay tests.
function Example() {
  const [opened, setOpened] = useState(false)
  return (
    <ResponsivePopover
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

describe('ResponsivePopover', () => {
  it('closes on Esc and returns focus to the trigger', async () => {
    const user = userEvent.setup()
    renderWithTheme(<Example />)

    const trigger = screen.getByRole('button', { name: 'Save to folder' })
    await user.click(trigger)

    const dialog = await screen.findByRole('dialog', { name: 'Save to folder' })
    expect(dialog).toBeInTheDocument()

    await user.keyboard('{Escape}')

    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Save to folder' })).not.toBeInTheDocument())
    expect(trigger).toHaveFocus()
  })
})
