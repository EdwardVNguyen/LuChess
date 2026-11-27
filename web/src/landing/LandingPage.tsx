import { Accordion } from '@mantine/core'
import { Link } from '@tanstack/react-router'
import heroPhoto from './hero-fischer-tal-1960.jpg'
import styles from './Landing.module.css'
import { SECTIONS } from './sections'
import studyView from './study-view.webp'

// The landing page for Guests, from design/pages/home.html (DESIGN.md "Home
// page") rewritten for v1 (docs/adr/0001): no Articles, Read or Play, so no
// "Learn from people" or "Open to everyone" sections. The hero is dark in
// every theme and the rest follows it (docs/adr/0012).
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

// The photo's licence (CC BY-SA 3.0 DE) requires the credit line, with its links.
const PHOTO_FILE =
  'https://commons.wikimedia.org/wiki/File:Bundesarchiv_Bild_183-76052-0335,_Schacholympiade,_Tal_(UdSSR)_gegen_Fischer_(USA).jpg'
const PHOTO_LICENCE = 'https://creativecommons.org/licenses/by-sa/3.0/de/deed.en'

function Hero() {
  return (
    <section className={styles.hero} aria-labelledby="landing-title">
      <img
        className={styles.heroPhoto}
        src={heroPhoto}
        width={768}
        height={800}
        fetchPriority="high"
        alt="Bobby Fischer and Mikhail Tal at the 1960 Chess Olympiad in Leipzig"
      />
      <div className={styles.heroWash} aria-hidden="true" />
      <div className={`${styles.container} ${styles.heroInner}`}>
        <div className={styles.heroCopy}>
          <p className={styles.heroEyebrow}>Chess, written like a book</p>
          <h1 id="landing-title" className={styles.title}>
            Remember chess the way you remember a good story.
          </h1>
          <p className={styles.heroLede}>
            LuChess links every game you study to the ideas behind it. Write about the moves that mattered, link
            each game to the openings and ideas it reminds you of, and build your own web of notes.
          </p>
          <div className={styles.heroActions}>
            <Link to="/signup" className={`${styles.button} ${styles.tan}`}>
              Sign up free
            </Link>
            <Link to="/try" className={`${styles.button} ${styles.ghostNight}`}>
              Try as a Guest
            </Link>
          </div>
        </div>
      </div>
      <p className={styles.credit}>
        Fischer v. Tal, Leipzig 1960 · Photo: <a href={PHOTO_FILE}>Bundesarchiv, Bild 183-76052-0335 / Kohls, Ulrich</a>{' '}
        · <a href={PHOTO_LICENCE}>CC BY-SA 3.0 DE</a> · cropped and toned
      </p>
    </section>
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
    <section id={SECTIONS.howItWorks} className={`${styles.section} ${styles.band}`} aria-labelledby="how-title">
      <div className={styles.container}>
        <p className={styles.eyebrow}>How it works</p>
        <h2 id="how-title" className={styles.heading}>
          Write&nbsp;it. Link&nbsp;it. Find it&nbsp;again.
        </h2>
        <ol className={styles.steps}>
          {STEPS.map((step, index) => (
            <li key={step.title}>
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
      <div className={`${styles.container} ${styles.feature}`}>
        <div>
          <p className={styles.eyebrow}>Luhmann’s method</p>
          <h2 id="method-title" className={styles.heading}>
            Ideas stick when <br className={styles.wideBreak} />
            they connect.
          </h2>
          <p className={styles.lede}>
            Niklas Luhmann kept thousands of linked notes and said they did his thinking with him. LuChess brings
            that habit to your games.
          </p>
          <ul className={styles.checklist}>
            {POINTS.map((point) => (
              <li key={point}>{point}</li>
            ))}
          </ul>
        </div>
        <figure className={styles.browser}>
          <div className={styles.browserBar} aria-hidden="true">
            <span />
            <span />
            <span />
          </div>
          <img
            src={studyView}
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
    <section id={SECTIONS.faq} className={styles.faqSection} aria-labelledby="faq-title">
      <div className={`${styles.container} ${styles.faqGrid}`}>
        <h2 id="faq-title" className={styles.faqTitle}>
          Questions, <br className={styles.wideBreak} />
          answered.
        </h2>
        <Accordion
          order={3}
          chevron={null}
          disableChevronRotation
          classNames={{
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
    <section className={styles.cta} aria-labelledby="cta-title">
      <h2 id="cta-title" className={styles.ctaTitle}>
        Start your first note.
      </h2>
      <p className={styles.ctaText}>Make an account, link your first two games, and see how it feels.</p>
      <div className={styles.ctaActions}>
        <Link to="/signup" className={`${styles.button} ${styles.light}`}>
          Sign up free
        </Link>
        <Link to="/login" className={`${styles.button} ${styles.ghostBand}`}>
          Log in
        </Link>
      </div>
    </section>
  )
}

// Only links that go somewhere: no Articles, Creators, Topics, Contact or
// legal pages exist yet.
function Footer() {
  return (
    <footer className={styles.footer}>
      <div className={`${styles.container} ${styles.footerGrid}`}>
        <div>
          <Link to="/" className={styles.footerLogo}>
            LuChess
          </Link>
          <p className={styles.tagline}>Chess, learned through connections.</p>
        </div>
        <nav className={styles.footerColumns} aria-label="Footer">
          <div>
            <p className={styles.footerHeading}>LuChess</p>
            <ul>
              <li>
                <Link to="/" hash={SECTIONS.howItWorks}>
                  How it works
                </Link>
              </li>
              <li>
                <Link to="/" hash={SECTIONS.faq}>
                  FAQ
                </Link>
              </li>
              <li>
                <Link to="/try">Try as a Guest</Link>
              </li>
            </ul>
          </div>
          <div>
            <p className={styles.footerHeading}>Account</p>
            <ul>
              <li>
                <Link to="/signup">Sign up</Link>
              </li>
              <li>
                <Link to="/login">Log in</Link>
              </li>
            </ul>
          </div>
        </nav>
      </div>
    </footer>
  )
}
