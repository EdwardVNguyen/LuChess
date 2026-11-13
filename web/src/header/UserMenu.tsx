import { Menu, UnstyledButton } from '@mantine/core'
import { Link } from '@tanstack/react-router'
import styles from './Header.module.css'

// The avatar (the default profile picture) opens a menu with Settings and Log out.
export function UserMenu({ onLogOut }: { onLogOut: () => void }) {
  return (
    <Menu width={180} position="bottom-end" withinPortal>
      <Menu.Target>
        <UnstyledButton aria-label="Account and settings" className={styles.avatar}>
          <img src="/profile-icon.svg" alt="" className={styles.avatarImage} />
        </UnstyledButton>
      </Menu.Target>
      <Menu.Dropdown>
        <Menu.Item component={Link} to="/settings">
          Settings
        </Menu.Item>
        <Menu.Item onClick={onLogOut}>Log out</Menu.Item>
      </Menu.Dropdown>
    </Menu>
  )
}
