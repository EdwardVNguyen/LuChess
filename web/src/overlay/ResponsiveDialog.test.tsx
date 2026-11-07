import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { describe, expect, it } from 'vitest'
import { ResponsiveDialog } from './ResponsiveDialog'
import { renderWithTheme } from './testUtils'

// Wraps the dialog with the trigger that opens it, like a real caller would,
// so closing it can return focus there.
function Example() {
  const [opened, setOpened] = useState(false)
  return (
    <>
      <button onClick={() => setOpened(true)}>Open</button>
      <ResponsiveDialog
        opened={opened}
        onClose={() => setOpened(false)}
        title="New folder"
        confirmLabel="Create folder"
        onConfirm={() => {}}
      >
        <p>Folder name</p>
      </ResponsiveDialog>
    </>
  )
}

describe('ResponsiveDialog', () => {
  it('closes on Esc and returns focus to the trigger', async () => {
    const user = userEvent.setup()
    renderWithTheme(<Example />)

    const trigger = screen.getByRole('button', { name: 'Open' })
    await user.click(trigger)

    const dialog = await screen.findByRole('dialog', { name: 'New folder' })
    expect(dialog).toBeInTheDocument()

    await user.keyboard('{Escape}')

    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'New folder' })).not.toBeInTheDocument())
    expect(trigger).toHaveFocus()
  })

  it('is labelled by its title and offers Cancel and the primary action', async () => {
    const user = userEvent.setup()
    renderWithTheme(<Example />)

    await user.click(screen.getByRole('button', { name: 'Open' }))

    const dialog = await screen.findByRole('dialog', { name: 'New folder' })
    expect(dialog).toHaveAccessibleName('New folder')
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Create folder' })).toBeInTheDocument()
  })
})
