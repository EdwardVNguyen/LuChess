import { Menu, UnstyledButton } from '@mantine/core'
import type { User } from '../api'
import styles from './Header.module.css'

// The avatar opens a menu with Log out, plus Settings once #12 lands.
export function UserMenu({ user, onLogOut }: { user: User; onLogOut: () => void }) {
  const initial = user.name.trim().charAt(0).toUpperCase() || '?'

  return (
    <Menu width={180} position="bottom-end" withinPortal>
      <Menu.Target>
        <UnstyledButton aria-label="Account and settings" className={styles.avatar}>
          {initial}
        </UnstyledButton>
      </Menu.Target>
      <Menu.Dropdown>
        <Menu.Item onClick={onLogOut}>Log out</Menu.Item>
      </Menu.Dropdown>
    </Menu>
  )
}
