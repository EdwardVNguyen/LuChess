import { Loader } from '@mantine/core'
import { AuthCard } from './AuthCard'
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

// The auth pages' loading state, as on Verify email: the card, with a loader in it.
export function AuthLoading() {
  return (
    <AuthCard>
      <Loader aria-label="Loading" mx="auto" />
    </AuthCard>
  )
}
