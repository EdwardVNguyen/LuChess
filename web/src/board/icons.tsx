// The move-control icons from design/screens/Note.dc.html: 1.8px stroke, round caps.
function ControlIcon({ children }: { children: React.ReactNode }) {
  return (
    <svg
      width={20}
      height={20}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {children}
    </svg>
  )
}

export function FirstIcon() {
  return (
    <ControlIcon>
      <path d="M6 5v14" />
      <path d="M18 6l-8 6 8 6z" />
    </ControlIcon>
  )
}

export function PreviousIcon() {
  return (
    <ControlIcon>
      <path d="M15 6l-6 6 6 6" />
    </ControlIcon>
  )
}

export function NextIcon() {
  return (
    <ControlIcon>
      <path d="M9 6l6 6-6 6" />
    </ControlIcon>
  )
}

export function LastIcon() {
  return (
    <ControlIcon>
      <path d="M18 5v14" />
      <path d="M6 6l8 6-8 6z" />
    </ControlIcon>
  )
}
