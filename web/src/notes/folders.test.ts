import { describe, expect, it } from 'vitest'
import type { Folder, NoteSummary } from '../api'
import { buildTree, folderChoices, folderContents, folderPath, foldersToOpen, type FolderNode } from './folders'

const folder = (id: number, name: string, parentId: number | null = null): Folder => ({ id, name, parentId })
const note = (id: number, name: string, folderId: number | null = null): NoteSummary => ({
  id,
  name,
  folderId,
  createdAt: '',
  updatedAt: '',
})

const folders = [
  folder(1, 'Openings'),
  folder(2, 'Queen’s Gambit Declined', 1),
  folder(3, 'concepts'),
  folder(4, 'Tartakower', 2),
  folder(5, 'Catalan', 1),
]

function shape(nodes: FolderNode[]): unknown[] {
  return nodes.map((n) => [n.folder.name, shape(n.folders), n.notes.map((x) => x.name)])
}

describe('buildTree', () => {
  it('nests Folders and files Notes, Folders and Notes each by name', () => {
    const tree = buildTree(folders, [
      note(1, 'Game 10', 2),
      note(2, 'Game 2', 2),
      note(3, 'Rook endings'),
      note(4, 'Isolani', 3),
      note(5, 'At the root'),
    ])

    expect(shape(tree.folders)).toEqual([
      ['concepts', [], ['Isolani']],
      ['Openings', [['Catalan', [], []], ['Queen’s Gambit Declined', [['Tartakower', [], []]], ['Game 2', 'Game 10']]], []],
    ])
    expect(tree.notes.map((n) => n.name)).toEqual(['At the root', 'Rook endings'])
  })

  it('shows a Note or Folder whose parent is missing at the root', () => {
    const tree = buildTree([folder(2, 'Orphan', 99)], [note(1, 'Lost', 42)])
    expect(tree.folders.map((n) => n.folder.name)).toEqual(['Orphan'])
    expect(tree.notes.map((n) => n.name)).toEqual(['Lost'])
  })

  it('cuts a parent chain that loops at the root instead of hiding it', () => {
    const tree = buildTree([folder(1, 'A', 2), folder(2, 'B', 1)], [])
    expect(tree.folders.map((n) => n.folder.name)).toEqual(['A', 'B'])
  })
})

describe('folderPath', () => {
  it('lists the Folders from the root down', () => {
    expect(folderPath(folders, 4).map((f) => f.name)).toEqual(['Openings', 'Queen’s Gambit Declined', 'Tartakower'])
  })

  it('is empty at the root or for an unknown Folder', () => {
    expect(folderPath(folders, null)).toEqual([])
    expect(folderPath(folders, 99)).toEqual([])
  })
})

describe('folderChoices', () => {
  it('lists every Folder in tree order with its depth', () => {
    expect(folderChoices(folders).map((c) => [c.folder.name, c.depth])).toEqual([
      ['concepts', 0],
      ['Openings', 0],
      ['Catalan', 1],
      ['Queen’s Gambit Declined', 1],
      ['Tartakower', 2],
    ])
  })

  it('leaves out a Folder being moved and everything inside it', () => {
    expect(folderChoices(folders, 2).map((c) => c.folder.name)).toEqual(['concepts', 'Openings', 'Catalan'])
  })
})

describe('folderContents', () => {
  it('counts subfolders at any depth and the Notes in any of them', () => {
    const notes = [note(1, 'a', 1), note(2, 'b', 4), note(3, 'c', 3), note(4, 'd')]
    expect(folderContents(folders, notes, 1)).toEqual({ folders: 3, notes: 2 })
    expect(folderContents(folders, notes, 5)).toEqual({ folders: 0, notes: 0 })
  })
})

describe('foldersToOpen', () => {
  it('opens a Folder and every Folder above it', () => {
    expect(foldersToOpen(folders, 4)).toEqual([1, 2, 4])
    expect(foldersToOpen(folders, null)).toEqual([])
  })
})
