import { Loader } from '@mantine/core'
import { AuthLayout } from './auth/AuthLayout'
import styles from './Loading.module.css'

// A screen that is still loading: its code (while a route's chunk is fetched)
// or what it shows (while the Session is being restored).
export function PageLoading() {
  return (
    <div className={styles.centered}>
      <Loader aria-label="Loading" />
    </div>
  )
}

// The auth pages' loading state, as on Verify email: the layout, with a loader in the panel.
export function AuthLoading() {
  return (
    <AuthLayout>
      <Loader aria-label="Loading" color="var(--cn-panel-tan)" mx="auto" display="block" />
    </AuthLayout>
  )
}
