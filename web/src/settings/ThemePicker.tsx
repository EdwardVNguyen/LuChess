import { Radio } from '@mantine/core'
import { THEME_CHOICES, useTheme, type ThemeChoice, type ThemeName } from '../theme'
import styles from './Settings.module.css'

const LABELS: Record<ThemeChoice, { title: string; description: string }> = {
  warm: { title: 'Warm paper', description: 'Cream paper with dark ink and oxblood links.' },
  night: { title: 'Night', description: 'Deep navy with pale text and blue links.' },
  cool: { title: 'Cool paper', description: 'An off-white page with slate ink and deep blue links.' },
  system: { title: 'Match system', description: 'Night when your device is in dark mode, Cool paper when it is light.' },
}

// The theme picker (docs/adr/0008), laid out like the design's article view
// choice (Settings.dc.html): a card per option with a small picture of the
// page in that theme. The choice applies at once and is saved on this device.
export function ThemePicker() {
  const { choice, setChoice } = useTheme()

  return (
    <section className={styles.section} aria-labelledby="theme">
      <h2 id="theme" className={styles.heading}>
        Theme
      </h2>
      <Radio.Group value={choice} onChange={(value) => setChoice(value as ThemeChoice)} aria-labelledby="theme">
        <div className={styles.themes}>
          {THEME_CHOICES.map((option) => (
            <Radio.Card
              key={option}
              value={option}
              className={styles.themeCard}
              aria-label={LABELS[option].title}
              aria-describedby={`theme-${option}`}
            >
              {option === 'system' ? (
                <div className={styles.previewSplit} aria-hidden="true">
                  <Preview theme="night" />
                  <Preview theme="cool" />
                </div>
              ) : (
                <Preview theme={option} />
              )}
              <div className={styles.themeLabel}>
                <Radio.Indicator className={styles.themeIndicator} />
                <div className={styles.themeText}>
                  <span className={styles.themeTitle}>{LABELS[option].title}</span>
                  <span id={`theme-${option}`} className={styles.themeDescription}>
                    {LABELS[option].description}
                  </span>
                </div>
              </div>
            </Radio.Card>
          ))}
        </div>
      </Radio.Group>
      <p className={styles.explanation}>Saved on this device, so it applies whether or not you are logged in.</p>
    </section>
  )
}

/** A tiny page drawn in `theme`'s colours: a header, a sidebar, a title, lines of writing and a link. */
function Preview({ theme }: { theme: ThemeName }) {
  return (
    <div className={styles.preview} data-cn-theme={theme} aria-hidden="true">
      <div className={styles.previewHeader} />
      <div className={styles.previewBody}>
        <div className={styles.previewSidebar} />
        <div className={styles.previewPage}>
          <div className={styles.previewTitle} />
          <div className={styles.previewLine} />
          <div className={`${styles.previewLine} ${styles.previewShort}`} />
          <div className={styles.previewLink} />
        </div>
      </div>
    </div>
  )
}
