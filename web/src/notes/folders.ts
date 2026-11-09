import type { Folder, NoteSummary } from '../api'

/** A Folder in the tree, with its subfolders and the Notes filed directly in it. */
export type FolderNode = { folder: Folder; folders: FolderNode[]; notes: NoteSummary[] }

/** The whole tree: the top-level Folders and the Notes at the root. */
export type FolderTree = { folders: FolderNode[]; notes: NoteSummary[] }

const collator = new Intl.Collator(undefined, { sensitivity: 'base', numeric: true })
const byName = (a: { name: string }, b: { name: string }) => collator.compare(a.name, b.name)

// Builds the tree the sidebar shows: Folders first, then Notes, each by name.
// A Folder or Note whose parent isn't in the list (as while a delete settles)
// is shown at the root, so nothing disappears.
export function buildTree(folders: Folder[], notes: NoteSummary[]): FolderTree {
  const nodes = new Map(folders.map((folder) => [folder.id, { folder, folders: [], notes: [] } as FolderNode]))
  const root: FolderTree = { folders: [], notes: [] }
  // A parent chain that loops (never from the API) is cut at the root.
  const reachesRoot = (id: number) => folderPath(folders, id).length > 0

  for (const node of nodes.values()) {
    const parent = node.folder.parentId === null ? undefined : nodes.get(node.folder.parentId)
    if (parent && reachesRoot(node.folder.id)) parent.folders.push(node)
    else root.folders.push(node)
  }
  for (const note of notes) {
    const folder = note.folderId === null ? undefined : nodes.get(note.folderId)
    if (folder) folder.notes.push(note)
    else root.notes.push(note)
  }

  const sort = (level: { folders: FolderNode[]; notes: NoteSummary[] }) => {
    level.folders.sort((a, b) => byName(a.folder, b.folder))
    level.notes.sort((a, b) => byName(a, b) || a.id - b.id)
    level.folders.forEach(sort)
  }
  sort(root)
  return root
}

/**
 * The Folders from the root down to and including `id`, or [] when `id` is
 * null, unknown, or its parents loop.
 */
export function folderPath(folders: Folder[], id: number | null): Folder[] {
  const byId = new Map(folders.map((folder) => [folder.id, folder]))
  const path: Folder[] = []
  for (let at = id === null ? undefined : byId.get(id); at; at = at.parentId === null ? undefined : byId.get(at.parentId)) {
    if (path.includes(at)) return []
    path.unshift(at)
    if (at.parentId !== null && !byId.has(at.parentId)) return []
  }
  return path
}

/** `id` and every Folder inside it at any depth: where a Folder cannot move. */
export function folderAndSubfolders(folders: Folder[], id: number): Set<number> {
  const inside = new Set([id])
  let grew = true
  while (grew) {
    grew = false
    for (const folder of folders) {
      if (folder.parentId !== null && inside.has(folder.parentId) && !inside.has(folder.id)) {
        inside.add(folder.id)
        grew = true
      }
    }
  }
  return inside
}

/** What deleting a Folder reaches, as the API counts it: subfolders at any depth, and the Notes in any of them. */
export function folderContents(folders: Folder[], notes: NoteSummary[], id: number) {
  const inside = folderAndSubfolders(folders, id)
  return {
    folders: inside.size - 1,
    notes: notes.filter((note) => note.folderId !== null && inside.has(note.folderId)).length,
  }
}

/** A place to file something, as the move dialog lists them: in tree order, with its depth. */
export type FolderChoice = { folder: Folder; depth: number }

/** Every Folder in tree order, leaving out `exclude` and everything inside it. */
export function folderChoices(folders: Folder[], exclude?: number): FolderChoice[] {
  const hidden = exclude === undefined ? new Set<number>() : folderAndSubfolders(folders, exclude)
  const choices: FolderChoice[] = []
  const walk = (nodes: FolderNode[], depth: number) => {
    for (const node of nodes) {
      if (hidden.has(node.folder.id)) continue
      choices.push({ folder: node.folder, depth })
      walk(node.folders, depth + 1)
    }
  }
  walk(buildTree(folders, []).folders, 0)
  return choices
}

/** The Folder IDs to open so `folderId` shows: it and every Folder above it. */
export function foldersToOpen(folders: Folder[], folderId: number | null): number[] {
  return folderPath(folders, folderId).map((folder) => folder.id)
}
