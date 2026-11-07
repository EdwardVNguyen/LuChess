import type { ReactNode } from 'react'
import styles from './Page.module.css'

// A plain, centred page body for screens without their own layout yet, such
// as the placeholder home page. Pages with a real design (Note, Settings)
// lay themselves out instead of using this.
export function Page({ children }: { children: ReactNode }) {
  return <div className={styles.page}>{children}</div>
}
