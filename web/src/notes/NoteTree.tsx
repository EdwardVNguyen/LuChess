import { Button, Loader, Menu, Text, UnstyledButton } from '@mantine/core'
import { Link, useNavigate, useParams } from '@tanstack/react-router'
import { useState, type CSSProperties } from 'react'
import type { Folder, NoteSummary } from '../api'
import { errorMessage } from '../errors'
import { ContextMenu, useContextMenu, useOverlaySize } from '../overlay'
import { DeleteFolderDialog, MoveFolderDialog, MoveNoteDialog, NewFolderDialog } from './FolderDialogs'
import { buildTree, foldersToOpen, type FolderNode } from './folders'
import { ChevronIcon, FolderPlusIcon, MoreIcon } from './icons'
import { InlineRename } from './InlineRename'
import { rowKey, useInlineRename, type RenameEnd, type RenameTarget } from './useInlineRename'
import { DeleteNoteDialog } from './NoteActions'
import styles from './Notes.module.css'
import { useFolders, useNoteList } from './queries'
import { useNewNote } from './useNewNote'

type Props = {
  /** Called when a Note is chosen, e.g. to close the overlay the tree is in. */
  onNavigate?: () => void
  /** Hide the "Your notes" label when the surrounding overlay already titles the tree. */
  showHeading?: boolean
}

type Dialog =
  | { kind: 'new'; parent: Folder | null }
  | { kind: 'move' | 'delete'; folder: Folder }
  | { kind: 'moveNote' | 'deleteNote'; note: NoteSummary }

/** What a right-click menu opens on: a Folder, a Note, or the empty space around the tree (null). */
type MenuTarget = { kind: 'folder'; folder: Folder } | { kind: 'note'; note: NoteSummary } | null
type TriggerProps = ReturnType<typeof useContextMenu<MenuTarget>>['triggerProps']

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
  const menu = useContextMenu<MenuTarget>()
  const rename = useInlineRename()
  const navigate = useNavigate()
  const opened = menu.opened?.value ?? null
  const menuOpenOn =
    opened && rowKey(opened.kind === 'folder' ? { kind: 'folder', id: opened.folder.id } : { kind: 'note', id: opened.note.id })

  const newNote = useNewNote()
  // Import… opens the form; New note makes the Note first, so the overlay the tree is in closes once it opens.
  const importNote = (folder: Folder | null) => {
    onNavigate?.()
    void navigate({ to: '/notes/import', search: folder ? { folder: folder.id } : {} })
  }

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
    <div className={styles.list} {...menu.triggerProps(null)}>
      {showHeading && <div className={styles.eyebrow}>Your notes</div>}
      {newNote.error && (
        <div className={styles.listState}>
          <Text size="sm" c="accent" role="alert">
            Could not create the note. {newNote.error}
          </Text>
        </div>
      )}
      {failed ? (
        <div className={styles.listState}>
          <Text size="sm" role="alert">
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
              <Text size="sm" c="var(--cn-muted)">
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
                menuTarget={menu.triggerProps}
                menuOpenOn={menuOpenOn}
                rename={rename}
                onRenameEnd={rename.end}
              />
            </ul>
          )}
          <UnstyledButton className={styles.newFolder} onClick={() => setDialog({ kind: 'new', parent: null })}>
            <FolderPlusIcon />
            New folder
          </UnstyledButton>
        </>
      )}

      <ContextMenu at={menu.opened} onClose={menu.close}>
        {opened?.kind === 'folder' ? (
          <>
            <Menu.Item disabled={newNote.creating} onClick={() => newNote.start(opened.folder.id, onNavigate)}>
              New note here
            </Menu.Item>
            <Menu.Item onClick={() => importNote(opened.folder)}>Import here…</Menu.Item>
            <FolderMenuItems folder={opened.folder} onAction={setDialog} onRename={rename.start} />
          </>
        ) : opened?.kind === 'note' ? (
          <>
            <Menu.Item onClick={() => rename.start({ kind: 'note', id: opened.note.id })}>Rename</Menu.Item>
            <Menu.Item onClick={() => setDialog({ kind: 'moveNote', note: opened.note })}>Move to folder</Menu.Item>
            <Menu.Item color="accent.6" onClick={() => setDialog({ kind: 'deleteNote', note: opened.note })}>
              Delete
            </Menu.Item>
          </>
        ) : (
          <>
            <Menu.Item disabled={newNote.creating} onClick={() => newNote.start(null, onNavigate)}>
              New note
            </Menu.Item>
            <Menu.Item onClick={() => importNote(null)}>Import…</Menu.Item>
            <Menu.Item onClick={() => setDialog({ kind: 'new', parent: null })}>New folder</Menu.Item>
          </>
        )}
      </ContextMenu>

      {dialog?.kind === 'new' && (
        <NewFolderDialog
          size={size}
          parent={dialog.parent}
          onClose={() => setDialog(null)}
          onCreated={(folder) => folder.parentId !== null && setOpen((ids) => new Set([...ids, folder.parentId!]))}
        />
      )}
      {dialog?.kind === 'move' && <MoveFolderDialog size={size} folder={dialog.folder} onClose={() => setDialog(null)} />}
      {dialog?.kind === 'delete' && <DeleteFolderDialog size={size} folder={dialog.folder} onClose={() => setDialog(null)} />}
      {dialog?.kind === 'moveNote' && <MoveNoteDialog size={size} note={dialog.note} onClose={() => setDialog(null)} />}
      {dialog?.kind === 'deleteNote' && <DeleteNoteDialog size={size} note={dialog.note} onClose={() => setDialog(null)} />}
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
  menuTarget: TriggerProps
  /** The row whose right-click menu is open, if any, by its `rowKey`. */
  menuOpenOn: string | null
  rename: ReturnType<typeof useInlineRename>
  onRenameEnd: (how: RenameEnd) => void
}

function Level({ folders, notes, depth, ...rest }: LevelProps) {
  return (
    <>
      {folders.map((node) => (
        <FolderItem key={node.folder.id} node={node} depth={depth} {...rest} />
      ))}
      {notes.map((note) => (
        <li key={note.id}>
          {rest.rename.isRenaming('note', note.id) ? (
            <InlineRename item={{ kind: 'note', note }} depth={depth} onDone={rest.onRenameEnd} />
          ) : (
            // Its own menu replaces the browser's; a middle-click still opens it in a new tab.
            <Link
              to="/notes/$noteId"
              params={{ noteId: String(note.id) }}
              className={styles.item}
              style={depthStyle(depth)}
              activeProps={{ 'aria-current': 'page' }}
              onClick={rest.onNavigate}
              // The first click has opened it already; the second renames it.
              onDoubleClick={() => rest.rename.start({ kind: 'note', id: note.id })}
              data-row={rowKey({ kind: 'note', id: note.id })}
              data-menu-open={rest.menuOpenOn === rowKey({ kind: 'note', id: note.id }) || undefined}
              {...rest.menuTarget({ kind: 'note', note })}
            >
              <span className={styles.treeSlot} />
              <span className={styles.itemName}>{note.name}</span>
            </Link>
          )}
        </li>
      ))}
    </>
  )
}

function FolderItem({ node, depth, ...rest }: Omit<LevelProps, 'folders' | 'notes'> & { node: FolderNode }) {
  const { folder } = node
  const isOpen = rest.open.has(folder.id)
  const empty = node.folders.length === 0 && node.notes.length === 0
  const key = rowKey({ kind: 'folder', id: folder.id })

  return (
    <li>
      {rest.rename.isRenaming('folder', folder.id) ? (
        <InlineRename
          item={{ kind: 'folder', folder }}
          depth={depth}
          slot={<ChevronIcon open={isOpen} />}
          onDone={rest.onRenameEnd}
        />
      ) : (
        <div
          className={styles.folderRow}
          data-menu-open={rest.menuOpenOn === key || undefined}
          {...rest.menuTarget({ kind: 'folder', folder })}
        >
          <UnstyledButton
            className={styles.item}
            style={depthStyle(depth)}
            aria-expanded={isOpen}
            onClick={() => rest.onToggle(folder.id)}
            // Its two clicks have opened and closed it again: nothing else changes.
            onDoubleClick={() => rest.rename.start({ kind: 'folder', id: folder.id })}
            data-row={key}
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
              <FolderMenuItems folder={folder} onAction={rest.onAction} onRename={rest.rename.start} />
            </Menu.Dropdown>
          </Menu>
        </div>
      )}
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

// A Folder's actions, in its "…" menu and its right-click menu. Rename edits
// the name in place, in the row.
function FolderMenuItems({
  folder,
  onAction,
  onRename,
}: {
  folder: Folder
  onAction: (dialog: Dialog) => void
  onRename: (target: RenameTarget) => void
}) {
  return (
    <>
      <Menu.Item onClick={() => onAction({ kind: 'new', parent: folder })}>New subfolder</Menu.Item>
      <Menu.Item onClick={() => onRename({ kind: 'folder', id: folder.id })}>Rename</Menu.Item>
      <Menu.Item onClick={() => onAction({ kind: 'move', folder })}>Move</Menu.Item>
      <Menu.Item color="accent.6" onClick={() => onAction({ kind: 'delete', folder })}>
        Delete
      </Menu.Item>
    </>
  )
}
