import {
  Button,
  Card,
  Drawer,
  Group,
  Menu,
  Modal,
  Popover,
  Radio,
  Stack,
  Text,
  Textarea,
  TextInput,
  PasswordInput,
  Title,
} from '@mantine/core'
import { useDisclosure } from '@mantine/hooks'
import styles from './DevTheme.module.css'
import { palettes, panelTokens, type ThemeName } from './tokens'

// Each theme's colours (not its scheme or ramp ends), shown in that theme.
const swatches = (name: ThemeName) =>
  Object.entries(palettes[name]).filter(([, value]) => typeof value === 'string' && value.startsWith('#')) as [
    string,
    string,
  ][]

// Dev-only page that shows the theme's components in one place, so a change
// to a token or a component override is easy to screenshot and compare with
// the designs (NewFolder.dc.html, Note.dc.html, and design/pages/ for the
// logged-out pages).
export function DevTheme() {
  const [modalOpened, modalHandlers] = useDisclosure(false)
  const [drawerOpened, drawerHandlers] = useDisclosure(false)

  return (
    <Stack gap="xl" p="md">
      <Title order={1}>Theme</Title>

      <Stack gap="sm">
        <Title order={2}>Colors</Title>
        {(Object.keys(palettes) as ThemeName[]).map((theme) => (
          <div key={theme} data-cn-theme={theme} className={styles.swatches}>
            {swatches(theme).map(([name, value]) => (
              <div key={name} className={styles.swatch}>
                <div className={styles.swatchColor} style={{ background: value }} />
                <span className={styles.swatchName}>
                  {theme} {name}
                </span>
                <span className={styles.swatchValue}>{value}</span>
              </div>
            ))}
          </div>
        ))}
      </Stack>

      <Stack gap="sm">
        <Title order={2}>Dark panels</Title>
        <div className={styles.swatches}>
          {Object.entries(panelTokens).map(([name, value]) => (
            <div key={name} className={styles.swatch}>
              <div className={styles.swatchColor} style={{ background: value }} />
              <span className={styles.swatchName}>panel {name}</span>
              <span className={styles.swatchValue}>{value}</span>
            </div>
          ))}
        </div>
        {/* The same panel inside each theme, to show it ignores the theme (docs/adr/0012). */}
        <div className={styles.panels}>
          {(Object.keys(palettes) as ThemeName[]).map((theme) => (
            <div key={theme} data-cn-theme={theme} className={styles.panelPage}>
              <span className={styles.swatchName}>In {theme}</span>
              <div className={styles.panel}>
                <h3 className={styles.panelHeading}>Log in</h3>
                <p className={styles.panelText}>
                  New here? <a href="#panel">Create an account</a>
                </p>
                <span className={styles.panelLabel}>Password</span>
                <div className={styles.panelField} />
                <span className={styles.panelHint}>10 to 128 characters.</span>
                <span className={styles.panelError}>Wrong email or password.</span>
                <span className={styles.panelButton}>Log in</span>
              </div>
            </div>
          ))}
        </div>
      </Stack>

      <Stack gap="sm">
        <Title order={2}>Board squares</Title>
        <div className={styles.board}>
          <div className={styles.boardLight} />
          <div className={styles.boardDark} />
          <div className={styles.boardLight} />
          <div className={styles.boardDark} />
          <div className={styles.boardDark} />
          <div className={styles.boardLight} />
          <div className={styles.boardDark} />
          <div className={styles.boardLight} />
        </div>
      </Stack>

      <Stack gap="sm">
        <Title order={2}>Fonts</Title>
        <Text fz={28}>Inter: The Lucena position, step by step</Text>
        <Text fz={28} fs="italic">
          Inter italic: 17.Qxd6
        </Text>
        <Text fz={16}>Inter: FOLDER NAME, Sign up, Only you</Text>
        <Text fz={28} className={styles.serif}>
          Source Serif 4: Remember chess the way you remember a good story
        </Text>
        <Text fz={28} fs="italic" className={styles.serif}>
          Source Serif 4 italic: LuChess
        </Text>
        <Text fz={28} fw={600} className={styles.serif}>
          Source Serif 4 semibold: Read it. Connect it.
        </Text>
      </Stack>

      <Stack gap="sm">
        <Title order={2}>Overlay</Title>
        <div className={styles.overlayDemo} />
      </Stack>

      <Stack gap="sm">
        <Title order={2}>Buttons</Title>
        <Group>
          <Button>New note</Button>
          <Button variant="outline">Cancel</Button>
          <Button variant="subtle">Log out</Button>
          <Button disabled>Disabled</Button>
        </Group>
      </Stack>

      <Stack gap="sm">
        <Title order={2}>Inputs</Title>
        <TextInput label="Folder name" placeholder="Rook endgame basics" maw={360} />
        <PasswordInput label="Password" description="10 to 128 characters." maw={360} />
        <Textarea label="Add a thought" placeholder="Type [[ to link" maw={360} />
        <Radio.Group label="Who can see it" defaultValue="me" maw={360}>
          <Stack gap={2} mt={4}>
            <Radio value="me" label="Only me" description="Private, like your Club losses folder" />
            <Radio value="all" label="Everyone" description="Shown in All studies with your name" />
          </Stack>
        </Radio.Group>
      </Stack>

      <Stack gap="sm">
        <Title order={2}>Card</Title>
        <Card maw={320}>
          <Title order={3}>Hanging Pawns, Explained</Title>
          <Text size="sm" c="dimmed">
            214 · Ines Calloway · 2 days ago
          </Text>
        </Card>
      </Stack>

      <Stack gap="sm">
        <Title order={2}>Dialogs</Title>
        <Group>
          <Button onClick={modalHandlers.open}>Open modal</Button>
          <Button onClick={drawerHandlers.open}>Open drawer</Button>
          <Popover width={260} withArrow>
            <Popover.Target>
              <Button variant="outline">Open popover</Button>
            </Popover.Target>
            <Popover.Dropdown>
              <Text size="sm">Save to folder</Text>
            </Popover.Dropdown>
          </Popover>
          <Menu width={200}>
            <Menu.Target>
              <Button variant="outline">Open menu</Button>
            </Menu.Target>
            <Menu.Dropdown>
              <Menu.Label>Browse</Menu.Label>
              <Menu.Item>All studies</Menu.Item>
              <Menu.Item>New folder</Menu.Item>
            </Menu.Dropdown>
          </Menu>
        </Group>
      </Stack>

      <Modal opened={modalOpened} onClose={modalHandlers.close} title="New folder">
        <Stack>
          <TextInput label="Folder name" defaultValue="Rook endgame basics" />
          <Group justify="flex-end">
            <Button variant="subtle" onClick={modalHandlers.close}>
              Cancel
            </Button>
            <Button onClick={modalHandlers.close}>Create folder</Button>
          </Group>
        </Stack>
      </Modal>

      <Drawer opened={drawerOpened} onClose={drawerHandlers.close} title="New folder" position="bottom">
        <TextInput label="Folder name" defaultValue="Rook endgame basics" />
      </Drawer>
    </Stack>
  )
}
