import { MantineProvider } from '@mantine/core'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState, type ReactNode } from 'react'
import { describe, expect, it } from 'vitest'
import { theme } from '../theme'
import { AuthPasswordField, AuthTextField } from './AuthForm'

function Password({ error }: { error?: string }) {
  const [value, setValue] = useState('')
  return <AuthPasswordField label="Password" hint="10 to 128 characters." error={error} value={value} onChange={setValue} />
}

function renderIn(ui: ReactNode) {
  return render(
    <MantineProvider theme={theme} env="test">
      {ui}
    </MantineProvider>,
  )
}

describe('AuthTextField', () => {
  it('has a visible label and links its hint with aria-describedby', () => {
    renderIn(<AuthTextField label="Display name" hint="Shown to others. Must be unique." value="" onChange={() => {}} />)

    const input = screen.getByLabelText('Display name')
    expect(input).toHaveAccessibleDescription('Shown to others. Must be unique.')
    expect(input).not.toHaveAttribute('aria-invalid')
  })

  it('shows an error in the hint’s place', () => {
    renderIn(
      <AuthTextField
        label="Display name"
        hint="Shown to others. Must be unique."
        error="Display name must be 2 to 32 characters with no control characters"
        value=""
        onChange={() => {}}
      />,
    )

    const input = screen.getByLabelText('Display name')
    expect(input).toHaveAccessibleDescription('Display name must be 2 to 32 characters with no control characters')
    expect(input).toHaveAttribute('aria-invalid', 'true')
    expect(screen.queryByText('Shown to others. Must be unique.')).not.toBeInTheDocument()
  })
})

describe('AuthPasswordField', () => {
  it('shows and hides the password with a toggle button', async () => {
    const user = userEvent.setup()
    renderIn(<Password />)

    const input = screen.getByLabelText('Password')
    expect(input).toHaveAttribute('type', 'password')
    expect(input).toHaveAccessibleDescription('10 to 128 characters.')

    await user.click(screen.getByRole('button', { name: 'Show password' }))
    expect(input).toHaveAttribute('type', 'text')
    const hide = screen.getByRole('button', { name: 'Hide password' })
    expect(hide).toHaveAttribute('aria-pressed', 'true')

    await user.click(hide)
    expect(input).toHaveAttribute('type', 'password')
    expect(screen.getByRole('button', { name: 'Show password' })).toHaveAttribute('aria-pressed', 'false')
  })
})
