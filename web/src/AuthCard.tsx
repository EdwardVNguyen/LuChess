import { Card, Stack } from '@mantine/core'
import type { ReactNode } from 'react'
import styles from './AuthCard.module.css'

// The shared shape of the auth pages (login, sign up, verify email, resend
// verification): a centred card on paper, since these have no design of
// their own (web/AGENTS.md).
export function AuthCard({ children }: { children: ReactNode }) {
  return (
    <div className={styles.wrapper}>
      <Card className={styles.card}>
        <Stack>{children}</Stack>
      </Card>
    </div>
  )
}
