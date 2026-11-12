# A Note owns its moves, which stay editable behind a server-enforced confirmation

_Superseded in part by ADR 0009: writing is no longer main-line only, and edits arrive as operations on a tree of Moves. The server-enforced confirmation stays._

The original schema had a separate `games` table, so several notes could share one PGN. Because users must be able to edit a game's moves, and sharing would let one edit change other people's Notes, the PGN and starting position live directly on the Note. Glyphs, Comments and Bodies are anchored to a single Ply (0 is the Position) and only on the mainline; side-lines are written as text or as Links to other Notes.

Editing moves reports the first Ply that changed, and every Glyph, Comment and Body at or after it is deleted, along with the Links they contained. If that would delete anything, the API answers 409 with the count until the request is repeated with explicit confirmation, so the guard cannot be bypassed by the UI. The server does not parse PGN; the client reports where the change began, which is acceptable while Notes are private.

## Consequences

Sharing or deduplicating games later means cloning, or a new migration, not reusing a shared row.
