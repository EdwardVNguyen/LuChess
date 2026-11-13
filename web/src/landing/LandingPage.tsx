import { Accordion } from '@mantine/core'
import { Link } from '@tanstack/react-router'
import { useState } from 'react'
import { Board } from '../board'
import { heroGame, heroPly } from './heroGame'
import styles from './Landing.module.css'
import noteScreen from './note-screen.webp'
import { SECTIONS } from './sections'

// The landing page for Guests (#42), from design/screens/HomeLoggedOut*.dc.html
// rewritten for v1 (docs/adr/0001): no Articles, Read or Play, and the
// hero's board and cards show the page's own game, not sample data.
export function LandingPage() {
  return (
    <div className={styles.page}>
      <Hero />
      <HowItWorks />
      <Method />
      <Faq />
      <SignUpBand />
      <Footer />
    </div>
  )
}

function Hero() {
  return (
    <section className={styles.hero} aria-labelledby="landing-title">
      <div className={`${styles.container} ${styles.heroGrid}`}>
        <div className={styles.heroCopy}>
          <p className={styles.eyebrow}>Chess, written like a book</p>
          <h1 id="landing-title" className={styles.title}>
            Remember chess the way you remember a good story.
          </h1>
          <p className={styles.lede}>
            LuChess links every game you study to the ideas behind it. Write about the moves that mattered, link
            each game to the openings and ideas it reminds you of, and build your own web of notes.
          </p>
          <div className={styles.actions}>
            <Link to="/signup" className={styles.primary}>
              Sign up free
            </Link>
            <Link to="/try" className={styles.secondary}>
              Try as a Guest
            </Link>
          </div>
        </div>
        <HeroNote />
      </div>
    </section>
  )
}

// A Note on the shared Board, linked to two other Notes. The board can be
// stepped through like any Note's.
function HeroNote() {
  const [ply, setPly] = useState(heroPly)
  return (
    <div className={styles.heroNote}>
      <svg className={styles.threads} viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
        <path d="M50 50 C 30 40, 24 24, 22 8" />
        <path d="M50 50 C 72 60, 80 76, 80 92" />
      </svg>
      <div className={`${styles.linkCard} ${styles.linkCardTop}`}>
        <span className={styles.cardLabel}>Concept</span>
        <span className={styles.linkName}>Isolated queen’s pawn</span>
      </div>
      <div className={styles.noteCard}>
        <span className={styles.cardLabel}>Club night, round 3</span>
        <Board mode="view" game={heroGame} ply={ply} onPlyChange={setPly} />
      </div>
      <div className={`${styles.linkCard} ${styles.linkCardBottom}`}>
        <span className={styles.cardLabel}>Opening</span>
        <span className={styles.linkName}>Tarrasch Defense</span>
      </div>
    </div>
  )
}

const STEPS = [
  {
    title: 'Write',
    text: 'Paste a game or set up a position. Comment on the moves that mattered, and write about where the game is heading.',
  },
  {
    title: 'Link',
    text: 'Type [[ to link a note to the openings, ideas and endgames it reminds you of.',
  },
  {
    title: 'Find it again',
    text: 'Every note lists the notes that link back to it, so one idea leads you to each game where it came up.',
  },
]

function HowItWorks() {
  return (
    <section id={SECTIONS.howItWorks} className={`${styles.section} ${styles.sunk}`} aria-labelledby="how-title">
      <div className={styles.container}>
        <div className={styles.sectionHead}>
          <p className={styles.eyebrow}>How it works</p>
          <h2 id="how-title" className={styles.heading}>
            Write&nbsp;it. Link&nbsp;it. Find it&nbsp;again.
          </h2>
        </div>
        <ol className={styles.steps}>
          {STEPS.map((step, index) => (
            <li key={step.title} className={styles.step}>
              <span className={styles.stepNumber} aria-hidden="true">
                {index + 1}
              </span>
              <h3 className={styles.stepTitle}>{step.title}</h3>
              <p className={styles.stepText}>{step.text}</p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  )
}

const POINTS = [
  'One note for each game or position, named however you like',
  'Links between notes, and the links back, shown beside every note',
  'Short comments that capture one big idea, not a wall of moves',
]

function Method() {
  return (
    <section className={styles.section} aria-labelledby="method-title">
      <div className={`${styles.container} ${styles.featureGrid}`}>
        <div className={styles.featureCopy}>
          <p className={styles.eyebrow}>Luhmann’s method</p>
          <h2 id="method-title" className={styles.heading}>
            Ideas stick when they connect.
          </h2>
          <p className={styles.featureText}>
            Niklas Luhmann kept thousands of linked notes and said they did his thinking with him. LuChess brings
            that habit to your games.
          </p>
          <ul className={styles.points}>
            {POINTS.map((point) => (
              <li key={point}>
                <CheckIcon />
                <span>{point}</span>
              </li>
            ))}
          </ul>
        </div>
        <figure className={styles.picture}>
          <div className={styles.pictureBar} aria-hidden="true">
            <span />
            <span />
            <span />
          </div>
          <img
            src={noteScreen}
            width={1440}
            height={1080}
            loading="lazy"
            alt="A note on a club game: the board, the moves with comments on them, and the notes it links to and from"
          />
        </figure>
      </div>
    </section>
  )
}

function CheckIcon() {
  return (
    <svg className={styles.check} width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M5 12.5l4.5 4.5L19 7.5" />
    </svg>
  )
}

const QUESTIONS = [
  {
    question: 'What is a note?',
    answer:
      'One chess game or position, with your writing on it: comments on single moves, longer passages between them, and symbols like ! or ±. Any note can link to your other notes.',
  },
  {
    question: 'What can I do as a Guest?',
    answer:
      'Paste a game or set up a position and write on it, with the same board and editor as a saved note. Nothing is saved, so sign up when you want to keep it.',
  },
  {
    question: 'Who can see my notes?',
    answer: 'Only you. Notes are private to your account.',
  },
  {
    question: 'Do I need a Chess.com or Lichess account?',
    answer: 'No. Paste a game as PGN, from any site or your own scoresheet, or play the moves on the board.',
  },
  {
    question: 'Why not just use an engine?',
    answer:
      'An engine tells you the best move. Your notes tell you why a move mattered to you, and which other games it reminds you of. That is what you remember at the board.',
  },
]

function Faq() {
  return (
    <section id={SECTIONS.faq} className={styles.section} aria-labelledby="faq-title">
      <div className={`${styles.container} ${styles.faqGrid}`}>
        <div className={styles.sectionHead}>
          <p className={styles.eyebrow}>FAQ</p>
          <h2 id="faq-title" className={styles.heading}>
            Questions, answered.
          </h2>
        </div>
        <Accordion
          defaultValue={QUESTIONS[0].question}
          chevron={null}
          disableChevronRotation
          classNames={{
            root: styles.faq,
            item: styles.faqItem,
            control: styles.faqControl,
            label: styles.faqQuestion,
            content: styles.faqAnswer,
          }}
        >
          {QUESTIONS.map(({ question, answer }) => (
            <Accordion.Item key={question} value={question}>
              <Accordion.Control>
                {question}
                <span className={styles.faqSign} aria-hidden="true" />
              </Accordion.Control>
              <Accordion.Panel>{answer}</Accordion.Panel>
            </Accordion.Item>
          ))}
        </Accordion>
      </div>
    </section>
  )
}

function SignUpBand() {
  return (
    <section className={styles.band} aria-labelledby="band-title">
      <div className={`${styles.container} ${styles.bandInner}`}>
        <h2 id="band-title" className={styles.bandTitle}>
          Start your first note.
        </h2>
        <p className={styles.bandText}>Make an account, link your first two games, and see how it feels.</p>
        <div className={styles.bandActions}>
          <Link to="/signup" className={styles.bandPrimary}>
            Sign up free
          </Link>
          <Link to="/login" className={styles.bandSecondary}>
            Log in
          </Link>
        </div>
      </div>
    </section>
  )
}

// Only links that exist (#42): no Articles, Creators, Topics, Contact or legal pages yet.
function Footer() {
  return (
    <footer className={styles.footer}>
      <div className={`${styles.container} ${styles.footerInner}`}>
        <div className={styles.footerBrand}>
          <span className={styles.footerLogo}>LuChess</span>
          <span className={styles.footerTagline}>Chess, learned through connections.</span>
        </div>
        <nav className={styles.footerColumns} aria-label="Footer">
          <div className={styles.footerColumn}>
            <span className={styles.footerHeading}>LuChess</span>
            <Link to="/" hash={SECTIONS.howItWorks}>
              How it works
            </Link>
            <Link to="/" hash={SECTIONS.faq}>
              FAQ
            </Link>
            <Link to="/try">Try as a Guest</Link>
          </div>
          <div className={styles.footerColumn}>
            <span className={styles.footerHeading}>Account</span>
            <Link to="/signup">Sign up</Link>
            <Link to="/login">Log in</Link>
          </div>
        </nav>
      </div>
    </footer>
  )
}
