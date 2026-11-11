import { Button, Group, Loader, PasswordInput, Text } from '@mantine/core'
import { useMutation } from '@tanstack/react-query'
import { Link, useNavigate } from '@tanstack/react-router'
import { useState } from 'react'
import { ApiError } from '../api'
import { api } from '../apiClient'
import { errorMessage } from '../errors'
import { ConfirmDialog, useOverlaySize } from '../overlay'
import { useSession } from '../session'
import styles from './Settings.module.css'
import { ThemePicker } from './ThemePicker'

// Settings (design/screenshots/Settings*.png). v1 has the theme, for
// everyone (docs/adr/0008), and deleting the account (#12).
export function SettingsPage() {
  const { state } = useSession()

  return (
    <div className={styles.page}>
      <h1 className={styles.title}>Settings</h1>
      {/* The theme is saved on the device, so Guests can choose one too. */}
      <ThemePicker />
      {state.status === 'restoring' && (
        <div className={styles.centered}>
          <Loader aria-label="Loading" />
        </div>
      )}
      {/* The shell already shows the restore error with a Retry button. */}
      {state.status === 'authenticated' && <DeleteAccountSection />}
      {state.status === 'guest' && (
        <section className={styles.section} aria-labelledby="account">
          <h2 id="account" className={styles.heading}>
            Account
          </h2>
          <p className={styles.explanation}>Log in to manage your account.</p>
          <Group>
            <Button component={Link} to="/login">
              Log in
            </Button>
          </Group>
        </section>
      )}
    </div>
  )
}

// Answers that are about what was typed, shown on the password field rather
// than in the confirm dialog: a wrong or missing password, or too many tries.
function isAboutThePassword(error: unknown) {
  return error instanceof ApiError && [400, 403, 429].includes(error.status)
}

function DeleteAccountSection() {
  const { authorized, forget } = useSession()
  const navigate = useNavigate()
  const size = useOverlaySize()
  const [password, setPassword] = useState('')
  const [passwordError, setPasswordError] = useState<string | null>(null)
  const [confirming, setConfirming] = useState(false)

  const remove = useMutation({
    mutationFn: (password: string) => authorized((token) => api.deleteAccount(token, password)),
    onSuccess: async () => {
      // The server has ended every Session; this browser only has to catch up.
      forget()
      await navigate({ to: '/' })
    },
    onError: (error) => {
      if (!isAboutThePassword(error)) return
      setConfirming(false)
      setPasswordError(errorMessage(error))
    },
  })

  function askToConfirm() {
    if (password === '') {
      setPasswordError('Enter your password')
      return
    }
    setPasswordError(null)
    remove.reset()
    setConfirming(true)
  }

  return (
    <section className={styles.section} aria-labelledby="delete-account">
      <h2 id="delete-account" className={styles.heading}>
        Delete account
      </h2>
      <p className={styles.explanation}>
        Your account, your notes and folders, and everything written in them are deleted for good, and you are logged
        out everywhere. This cannot be undone.
      </p>
      <form
        className={styles.form}
        onSubmit={(e) => {
          e.preventDefault()
          askToConfirm()
        }}
      >
        <PasswordInput
          className={styles.password}
          label="Your password"
          autoComplete="current-password"
          value={password}
          onChange={(e) => {
            setPassword(e.currentTarget.value)
            setPasswordError(null)
          }}
          error={passwordError}
        />
        <Button type="submit" variant="outline" className={styles.submit}>
          Delete account
        </Button>
      </form>

      <ConfirmDialog
        size={size}
        opened={confirming}
        onClose={() => {
          if (!remove.isPending) setConfirming(false)
        }}
        title="Delete your account?"
        message={
          <>
            Your notes, folders and everything written in them will be deleted, and you will be logged out everywhere.
            This cannot be undone.
            {remove.isError && !isAboutThePassword(remove.error) && (
              <Text component="span" display="block" c="accent" size="sm" mt="sm" role="alert">
                {errorMessage(remove.error)}
              </Text>
            )}
          </>
        }
        confirmLabel="Delete account"
        onConfirm={() => remove.mutate(password)}
        confirmLoading={remove.isPending}
        destructive
      />
    </section>
  )
}
