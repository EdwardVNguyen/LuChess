# A Note holds a tree of Moves, stored as rows, with writing on any Move

_Amended by ADR 0010: a Note's Position can change after creation, as a reset that keeps its name, Folder and id, and a PGN or FEN can be applied to an existing Note._

Playing a different move partway through a Note adds a Variation, Variations nest to any depth, and every Move takes the same writing as the Main line (#69, #70). This supersedes ADR 0003's rule that writing lives only on the main line and that side-lines are written as text, and its rule that the client reports the first changed Ply. It keeps ADR 0003's server-enforced confirmation before writing is deleted.

The tree lives in the database as one row per Move (its parent, its place among its siblings, and its SAN), plus a root row per Note for the Position. Comments, Bodies, Glyphs and Drawings are columns on the row they belong to, and Links are keyed by that row's id and part. The first child continues a line: the Main line follows first children from the Position, and a Variation is any later child with its own continuation. Because writing is keyed by id, Promote to main line only reorders siblings (every ancestor of the Move becomes its parent's first child), and writing stays on its Moves. Delete from here removes the Move and its whole subtree. If anything would go, meaning Comments, Bodies, Glyphs, Drawings and the Links inside them, the API answers 409 with the count until the request is confirmed.

The server still does not know chess. Edits arrive as small operations: add a Move by SAN under a parent, delete a subtree, promote, and import a whole tree when a Note is created. The server trusts the SAN, which is acceptable while Notes are private, but it keeps one child per SAN under a parent, so replaying a Move that exists reuses it. A Note holds at most 5,000 Moves, and an imported PGN at most 64 KB. PGN is read only when a Note is created. Afterwards the PGN shown under the board is generated from the tree, and it can be copied but not edited. (ADR 0010 amends this: a PGN or FEN can be applied to an existing Note.)

PGN is parsed on the client with **@mliebelt/pgn-parser** (Apache-2.0), and chess.js still checks every move and stays for rules. This amends ADR 0006: chess.js reads only a PGN's main line, and the licence rule for dependencies widens from MIT or BSD to MIT, BSD or Apache-2.0, all of which fit this repo's MIT licence. chessops reads variations too, but it is GPL-3.0, so it was rejected for the same reason as chessground.

An import keeps everything it can:
- Variations become Variations, and NAGs become Glyphs where one exists.
- The first `{comment}` after a move becomes its Comment and any later ones its Body, and a comment before the first move becomes the Position's Body.
- `[%cal]` and `[%csl]` become Drawings.

Export reverses this as `SAN {Comment} {Body}`, so our own PGNs round-trip. Links are written as their label, or the target's name, as plain text, because Note ids mean nothing outside the app. PGN tag pairs are kept on the Note for export, and search still reads White, Black and Date from them.

## Considered options

- **One PGN with variations on the Note, with writing keyed by a move path** (such as `3.1.0`). The server would stay unaware of the tree, but every promote or delete would shift the paths of all writing beneath it, and the client would have to report those rewrites.
- **Promote one level at a time**, as a separate "Promote variation" action. We kept the single "Promote to main line" from #69.
- **Moving existing writing to main-line Moves.** Unnecessary, because nothing was in production when the tree arrived. The migration drops the old per-Ply writing and the stored PGN, and development databases are reset.

## Consequences

Ply is now only a depth (for move numbers and FEN), never a key. Guests hold the same tree in the browser, and none of it is saved. Sharing a Note later would need the server to check moves itself, since it trusts the client's SAN today.
