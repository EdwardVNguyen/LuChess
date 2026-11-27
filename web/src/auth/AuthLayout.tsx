import { Link } from '@tanstack/react-router'
import type { ReactNode } from 'react'
import photo from './auth-tal-1964.webp'
import styles from './AuthLayout.module.css'

const PHOTO_SOURCE =
  'https://commons.wikimedia.org/wiki/File:Interzonaal_fide_schaaktoernooi_in_GAK_gebouw,_Tal_in_die_concentratie_te_midden,_Bestanddeelnr_916-4754.jpg'

type Props = {
  children: ReactNode
  /** The serif line over the photo. Hidden on mobile. */
  quote?: string
  /** A small line at the bottom of the form panel. */
  footer?: ReactNode
}

// The shared layout of the auth pages (design/pages/login.html, signup.html):
// a dark form panel beside a photo on desktop, and below a band of it on
// tablet and mobile. The panel is dark in every theme (docs/adr/0012). There
// is no site header; the logo links back to Home.
export function AuthLayout({ children, quote, footer }: Props) {
  return (
    <div className={styles.auth}>
      <div className={styles.panel}>
        <Link to="/" className={styles.logo}>
          <img src="/favicon.svg" alt="" className={styles.logoMark} />
          <span className={styles.wordmark}>LuChess</span>
        </Link>
        <div className={styles.body}>{children}</div>
        {footer && <p className={styles.footer}>{footer}</p>}
      </div>
      <aside className={styles.art}>
        <img
          src={photo}
          alt="Mikhail Tal deep in thought at the 1964 Amsterdam Interzonal"
          className={styles.photo}
        />
        <div className={styles.caption}>
          {quote && <p className={styles.quote}>{quote}</p>}
          <p className={styles.credit}>
            Mikhail Tal, Amsterdam Interzonal 1964 · Photo: <a href={PHOTO_SOURCE}>Harry Pot for Anefo</a>, CC0, via
            Wikimedia Commons
          </p>
        </div>
      </aside>
    </div>
  )
}
