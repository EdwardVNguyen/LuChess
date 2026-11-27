import { Loader } from '@mantine/core'
import { Link } from '@tanstack/react-router'
import { useId, useState, type ButtonHTMLAttributes, type ReactNode } from 'react'
import styles from './AuthForm.module.css'

// The pieces the auth pages are built from, on the dark form panel
// (design/pages/login.html, signup.html, styles.css): a serif title, visible
// labels, 52px fields with their hint or error underneath, and tan buttons.

/** The page's serif h1, and the line under it (e.g. "New here? Create an account"). */
export function AuthTitle({ children, lead }: { children: ReactNode; lead?: ReactNode }) {
  return (
    <div className={styles.heading}>
      <h1 className={styles.title}>{children}</h1>
      {lead && <p className={styles.lead}>{lead}</p>}
    </div>
  )
}

/** The panel's content below the title: a column with the form's spacing. */
export function AuthStack({ children }: { children: ReactNode }) {
  return <div className={styles.stack}>{children}</div>
}

export function AuthForm({ onSubmit, children }: { onSubmit: () => void; children: ReactNode }) {
  return (
    <form
      className={styles.stack}
      onSubmit={(e) => {
        e.preventDefault()
        onSubmit()
      }}
    >
      {children}
    </form>
  )
}

/** Body text on the panel; `quiet` for a secondary line. */
export function AuthText({ children, quiet = false }: { children: ReactNode; quiet?: boolean }) {
  return <p className={quiet ? styles.quiet : styles.text}>{children}</p>
}

/** A small link aligned to the form's right edge, e.g. "Forgot password?". */
export function AuthRowEnd({ children }: { children: ReactNode }) {
  return <div className={styles.rowEnd}>{children}</div>
}

type Tone = 'error' | 'warning' | 'success'

/** A message about the whole form, readable on the dark panel. */
export function AuthAlert({ tone, children }: { tone: Tone; children: ReactNode }) {
  return (
    <div className={styles.alert} data-tone={tone} role={tone === 'success' ? 'status' : 'alert'}>
      {children}
    </div>
  )
}

type FieldProps = {
  label: string
  value: string
  onChange: (value: string) => void
  onBlur?: () => void
  /** Shown under the field, and replaced there by `error`. */
  hint?: string
  error?: string
  autoComplete?: string
  placeholder?: string
}

// A visible label, the input, and the hint or the error in one spot under it,
// linked to the input with aria-describedby.
function FieldShell({
  label,
  hint,
  error,
  children,
}: Pick<FieldProps, 'label' | 'hint' | 'error'> & {
  children: (ids: { input: string; describedBy: string | undefined }) => ReactNode
}) {
  const id = useId()
  const message = error ?? hint
  const messageId = `${id}-message`
  return (
    <div className={styles.field}>
      <label htmlFor={id} className={styles.label}>
        {label}
      </label>
      {children({ input: id, describedBy: message ? messageId : undefined })}
      {message && (
        <span id={messageId} className={error ? styles.error : styles.hint}>
          {message}
        </span>
      )}
    </div>
  )
}

export function AuthTextField({ type = 'text', ...props }: FieldProps & { type?: 'text' | 'email' }) {
  return (
    <FieldShell label={props.label} hint={props.hint} error={props.error}>
      {({ input, describedBy }) => (
        <input
          id={input}
          className={styles.input}
          type={type}
          value={props.value}
          onChange={(e) => props.onChange(e.currentTarget.value)}
          onBlur={props.onBlur}
          autoComplete={props.autoComplete}
          placeholder={props.placeholder}
          aria-describedby={describedBy}
          aria-invalid={props.error ? true : undefined}
        />
      )}
    </FieldShell>
  )
}

/** A password field with a 44×44 show/hide button inside its right edge. */
export function AuthPasswordField(props: FieldProps) {
  const [shown, setShown] = useState(false)
  return (
    <FieldShell label={props.label} hint={props.hint} error={props.error}>
      {({ input, describedBy }) => (
        <span className={styles.passwordWrap}>
          <input
            id={input}
            className={`${styles.input} ${styles.passwordInput}`}
            type={shown ? 'text' : 'password'}
            value={props.value}
            onChange={(e) => props.onChange(e.currentTarget.value)}
            onBlur={props.onBlur}
            autoComplete={props.autoComplete}
            aria-describedby={describedBy}
            aria-invalid={props.error ? true : undefined}
          />
          <button
            type="button"
            className={styles.passwordToggle}
            aria-pressed={shown}
            aria-label={shown ? 'Hide password' : 'Show password'}
            onClick={() => setShown((s) => !s)}
          >
            {shown ? <EyeOffIcon /> : <EyeIcon />}
          </button>
        </span>
      )}
    </FieldShell>
  )
}

type ButtonProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'className'> & {
  /** `primary` is the full-width tan button; `secondary` is outlined. */
  variant?: 'primary' | 'secondary'
  loading?: boolean
}

export function AuthButton({ variant = 'primary', loading = false, disabled, children, ...rest }: ButtonProps) {
  return (
    <button
      type="button"
      {...rest}
      className={variant === 'primary' ? styles.primary : styles.secondary}
      disabled={disabled || loading}
      data-loading={loading || undefined}
      aria-busy={loading || undefined}
    >
      <span className={styles.buttonLabel}>{children}</span>
      {loading && <Loader className={styles.buttonLoader} size="sm" color="currentColor" />}
    </button>
  )
}

/** A link that looks like an AuthButton. */
export function AuthButtonLink({
  to,
  variant = 'primary',
  children,
}: {
  to: '/login' | '/forgot-password'
  variant?: 'primary' | 'secondary'
  children: ReactNode
}) {
  return (
    <Link to={to} className={variant === 'primary' ? styles.primary : styles.secondary}>
      {children}
    </Link>
  )
}

function EyeIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
      <path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  )
}

function EyeOffIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
      <path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z" />
      <circle cx="12" cy="12" r="3" />
      <path d="M4 4l16 16" strokeLinecap="round" />
    </svg>
  )
}
