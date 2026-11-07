import { Button, Group, Radio, Stack, Text, TextInput, Title } from '@mantine/core'
import { useDisclosure } from '@mantine/hooks'
import { useState } from 'react'
import { ConfirmDialog } from './ConfirmDialog'
import { ResponsiveDialog } from './ResponsiveDialog'
import { ResponsivePopover } from './ResponsivePopover'

// Dev-only page exercising the three overlay shapes (ResponsivePopover,
// ResponsiveDialog, the destructive ConfirmDialog) so the screenshot harness
// can show each open at 1440, 834 and 390px (#23's acceptance criteria).
export function DevOverlays() {
  const [popoverOpened, popoverHandlers] = useDisclosure(false)
  const [folder, setFolder] = useState('opening-ideas')
  const [dialogOpened, dialogHandlers] = useDisclosure(false)
  const [confirmOpened, confirmHandlers] = useDisclosure(false)

  return (
    <Stack gap="xl" p="md">
      <Title order={1}>Overlays</Title>

      <Stack gap="sm">
        <Title order={2}>Popover</Title>
        <Text size="sm" c="dimmed">
          Anchored on desktop, a centred dialog on tablet, a bottom sheet on mobile.
        </Text>
        <Group>
          <ResponsivePopover
            opened={popoverOpened}
            onClose={popoverHandlers.close}
            target={
              <Button variant="outline" onClick={popoverHandlers.toggle}>
                Save to folder
              </Button>
            }
            label="Save to folder"
          >
            <Radio.Group value={folder} onChange={setFolder}>
              <Stack gap={2}>
                <Radio value="all-saved" label="All saved (no folder)" />
                <Radio value="opening-ideas" label="Opening ideas" />
                <Radio value="club-losses" label="Club losses" />
              </Stack>
            </Radio.Group>
            <Group justify="flex-end" mt="md">
              <Button onClick={popoverHandlers.close}>Done</Button>
            </Group>
          </ResponsivePopover>
        </Group>
      </Stack>

      <Stack gap="sm">
        <Title order={2}>Dialog</Title>
        <Text size="sm" c="dimmed">
          A centred dialog on desktop and tablet, a bottom sheet on mobile, with a title, a body and an actions row.
        </Text>
        <Group>
          <Button onClick={dialogHandlers.open}>New folder</Button>
        </Group>
        <ResponsiveDialog
          opened={dialogOpened}
          onClose={dialogHandlers.close}
          title="New folder"
          confirmLabel="Create folder"
          onConfirm={dialogHandlers.close}
        >
          <TextInput label="Folder name" defaultValue="Rook endgame basics" />
        </ResponsiveDialog>
      </Stack>

      <Stack gap="sm">
        <Title order={2}>Confirm (destructive)</Title>
        <Text size="sm" c="dimmed">
          A title, a message and a confirm button, styled with the oxblood accent for actions that delete or discard.
        </Text>
        <Group>
          <Button variant="outline" onClick={confirmHandlers.open}>
            Delete account
          </Button>
        </Group>
        <ConfirmDialog
          opened={confirmOpened}
          onClose={confirmHandlers.close}
          title="Delete account"
          message="This permanently deletes your account, Folders, Notes and everything written in them. This cannot be undone."
          confirmLabel="Delete account"
          onConfirm={confirmHandlers.close}
          destructive
        />
      </Stack>
    </Stack>
  )
}
