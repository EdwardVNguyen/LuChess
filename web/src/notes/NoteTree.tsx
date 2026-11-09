import { Button, Loader, Menu, Text, UnstyledButton } from '@mantine/core'
import { Link, useParams } from '@tanstack/react-router'
import { useState, type CSSProperties } from 'react'
import type { Folder, NoteSummary } from '../api'
import { errorMessage } from '../errors'
import { useOverlaySize } from '../overlay'
import { DeleteFolderDialog, MoveFolderDialog, NewFolderDialog, RenameFolderDialog } from './FolderDialogs'
import { buildTree, foldersToOpen, type FolderNode } from './folders'
import { ChevronIcon, FolderPlusIcon, MoreIcon } from './icons'
import styles from './Notes.module.css'
import { useFolders, useNoteList } from './queries'

type Props = {
  /** Called when a Note is chosen, e.g. to close the overlay the tree is in. */
  onNavigate?: () => void
  /** Hide the "Your notes" label when the surrounding overlay already titles the tree. */
  showHeading?: boolean
}

type Dialog =
  | { kind: 'new'; parent: Folder | null }
  | { kind: 'rename' | 'move' | 'delete'; folder: Folder }

const depthStyle = (depth: number) => ({ '--depth': depth }) as CSSProperties

// "Your notes": the user's Folders, which open and close, and the Notes filed
// in them, with the open Note highlighted (Note.png's sidebar). Shown in the
// desktop sidebar, the "All notes" overlay on tablet and mobile, and the index.
export function NoteTree({ onNavigate, showHeading = true }: Props) {
  const notes = useNoteList()
  const folders = useFolders()
  const size = useOverlaySize()
  const { noteId } = useParams({ strict: false })
  const currentId = noteId && /^\d+$/.test(noteId) ? Number(noteId) : null
  const [open, setOpen] = useState<ReadonlySet<number>>(new Set())
  const [dialog, setDialog] = useState<Dialog | null>(null)

  // Open the Folders above the open Note when it, or the Folder it is in, changes.
  const currentFolder = notes.data?.find((note) => note.id === currentId)?.folderId ?? null
  const reveal = folders.data ? foldersToOpen(folders.data, currentFolder) : []
  const [revealed, setRevealed] = useState('')
  if (reveal.join() !== revealed) {
    setRevealed(reveal.join())
    if (reveal.length > 0) setOpen((ids) => new Set([...ids, ...reveal]))
  }

  const toggle = (id: number) =>
    setOpen((ids) => {
      const next = new Set(ids)
      if (!next.delete(id)) next.add(id)
      return next
    })

  const failed = notes.isError ? notes : folders.isError ? folders : null
  const tree = notes.isSuccess && folders.isSuccess ? buildTree(folders.data, notes.data) : null
  const empty = tree !== null && tree.folders.length === 0 && tree.notes.length === 0

  return (
    <div className={styles.list}>
      {showHeading && <div className={styles.eyebrow}>Your notes</div>}
      {failed ? (
        <div className={styles.listState}>
          <Text size="sm" ff="var(--cn-font-sans)" role="alert">
            {errorMessage(failed.error)}
          </Text>
          <Button
            variant="default"
            size="xs"
            onClick={() => {
              if (notes.isError) void notes.refetch()
              if (folders.isError) void folders.refetch()
            }}
          >
            Try again
          </Button>
        </div>
      ) : tree === null ? (
        <div className={styles.listState}>
          <Loader size="sm" aria-label="Loading notes" />
        </div>
      ) : (
        <>
          {empty && (
            <div className={styles.listState}>
              <Text size="sm" ff="var(--cn-font-sans)" c="var(--cn-muted)">
                No notes yet.
              </Text>
            </div>
          )}
          {!empty && (
            <ul className={styles.items}>
              <Level
                folders={tree.folders}
                notes={tree.notes}
                depth={0}
                open={open}
                onToggle={toggle}
                onAction={setDialog}
                onNavigate={onNavigate}
              />
            </ul>
          )}
          <UnstyledButton className={styles.newFolder} onClick={() => setDialog({ kind: 'new', parent: null })}>
            <FolderPlusIcon />
            New folder
          </UnstyledButton>
        </>
      )}

      {dialog?.kind === 'new' && (
        <NewFolderDialog
          size={size}
          parent={dialog.parent}
          onClose={() => setDialog(null)}
          onCreated={(folder) => folder.parentId !== null && setOpen((ids) => new Set([...ids, folder.parentId!]))}
        />
      )}
      {dialog?.kind === 'rename' && <RenameFolderDialog size={size} folder={dialog.folder} onClose={() => setDialog(null)} />}
      {dialog?.kind === 'move' && <MoveFolderDialog size={size} folder={dialog.folder} onClose={() => setDialog(null)} />}
      {dialog?.kind === 'delete' && <DeleteFolderDialog size={size} folder={dialog.folder} onClose={() => setDialog(null)} />}
    </div>
  )
}

type LevelProps = {
  folders: FolderNode[]
  notes: NoteSummary[]
  depth: number
  open: ReadonlySet<number>
  onToggle: (id: number) => void
  onAction: (dialog: Dialog) => void
  onNavigate?: () => void
}

function Level({ folders, notes, depth, ...rest }: LevelProps) {
  return (
    <>
      {folders.map((node) => (
        <FolderItem key={node.folder.id} node={node} depth={depth} {...rest} />
      ))}
      {notes.map((note) => (
        <li key={note.id}>
          <Link
            to="/notes/$noteId"
            params={{ noteId: String(note.id) }}
            className={styles.item}
            style={depthStyle(depth)}
            activeProps={{ 'aria-current': 'page' }}
            onClick={rest.onNavigate}
          >
            <span className={styles.treeSlot} />
            <span className={styles.itemName}>{note.name}</span>
          </Link>
        </li>
      ))}
    </>
  )
}

function FolderItem({ node, depth, ...rest }: Omit<LevelProps, 'folders' | 'notes'> & { node: FolderNode }) {
  const { folder } = node
  const isOpen = rest.open.has(folder.id)
  const empty = node.folders.length === 0 && node.notes.length === 0

  return (
    <li>
      <div className={styles.folderRow}>
        <UnstyledButton
          className={styles.item}
          style={depthStyle(depth)}
          aria-expanded={isOpen}
          onClick={() => rest.onToggle(folder.id)}
        >
          <span className={styles.treeSlot}>
            <ChevronIcon open={isOpen} />
          </span>
          <span className={styles.itemName}>{folder.name}</span>
        </UnstyledButton>
        <Menu position="bottom-end" width={180} withinPortal>
          <Menu.Target>
            <UnstyledButton className={styles.folderActions} aria-label={`Folder actions: ${folder.name}`}>
              <MoreIcon size={16} />
            </UnstyledButton>
          </Menu.Target>
          <Menu.Dropdown>
            <Menu.Item onClick={() => rest.onAction({ kind: 'new', parent: folder })}>New subfolder</Menu.Item>
            <Menu.Item onClick={() => rest.onAction({ kind: 'rename', folder })}>Rename</Menu.Item>
            <Menu.Item onClick={() => rest.onAction({ kind: 'move', folder })}>Move</Menu.Item>
            <Menu.Item color="accent.6" onClick={() => rest.onAction({ kind: 'delete', folder })}>
              Delete
            </Menu.Item>
          </Menu.Dropdown>
        </Menu>
      </div>
      {isOpen && (
        <ul className={styles.items} aria-label={folder.name}>
          {empty ? (
            <li className={styles.treeEmpty} style={depthStyle(depth + 1)}>
              Empty
            </li>
          ) : (
            <Level folders={node.folders} notes={node.notes} depth={depth + 1} {...rest} />
          )}
        </ul>
      )}
    </li>
  )
}
