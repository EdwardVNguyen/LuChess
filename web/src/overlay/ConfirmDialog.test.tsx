import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { ConfirmDialog } from './ConfirmDialog'
import { renderWithTheme } from './testUtils'

describe('ConfirmDialog', () => {
  it('shows the title and message, and confirms or cancels', async () => {
    const user = userEvent.setup()
    const onConfirm = vi.fn()
    const onClose = vi.fn()

    renderWithTheme(
      <ConfirmDialog
        size="mobile"
        opened
        onClose={onClose}
        title="Delete account"
        message="This permanently deletes your account."
        confirmLabel="Delete account"
        onConfirm={onConfirm}
        destructive
      />,
    )

    expect(await screen.findByRole('dialog', { name: 'Delete account' })).toBeInTheDocument()
    expect(screen.getByText('This permanently deletes your account.')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Delete account' }))
    expect(onConfirm).toHaveBeenCalledOnce()

    await user.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(onClose).toHaveBeenCalledOnce()
  })

  it('passes the size through to the shared surface', async () => {
    renderWithTheme(
      <ConfirmDialog
        size="tablet"
        opened
        onClose={() => {}}
        title="Delete account"
        message="This permanently deletes your account."
        confirmLabel="Delete account"
        onConfirm={() => {}}
      />,
    )

    await screen.findByRole('dialog', { name: 'Delete account' })
    expect(document.querySelector('[data-modal-content]')).not.toBeNull()
  })
})
