# A Note's Position can change after creation, as a reset that keeps the Note

ADR 0009 read a PGN, and set the Position, only when a Note was created. Edit position (#108) lets a Note get a new Position later, and #109 applies a PGN or FEN to an existing Note. This amends ADR 0009.

Every Move depends on the Position, so a new Position is a new start, not an edit. A reset keeps the Note's name, its Folder and its id, so Links from other Notes still point at it and its Backlinks keep working. Everything else goes: every Move, all the writing (every Comment, Body, Glyph and Drawing, the Position's own included), the Links inside that writing, and the PGN tags, which described the old game and which search reads.

The server enforces it as it does other destructive edits (ADR 0003, ADR 0009): one operation, `PUT /api/notes/{id}/position` with the new FEN (null for the standard start), answers 409 with the number of Moves and of each kind of writing that would go, until it is repeated with `?confirm=true`. A Note with no Moves and no writing resets without asking, so a fresh Note can be given a Position straight away. The tree is replaced by a new root in one transaction. The server still checks only the FEN's shape; the client checks that the position is legal. Guests reset their in-browser Note the same way, with the same confirmation and no request.

Applying a PGN or FEN to an existing Note (#109) uses this reset whenever the Position changes. A PGN with the same Position is applied by matching Moves instead, keeping what did not change; that is #109's to describe.

## Considered options

- **Editing the Position in place, keeping the Moves that are still legal.** Rejected: a Move's meaning comes from the position before it, so keeping writing on a Move that now means something else would mislead.
- **Creating a new Note and deleting the old one.** Rejected: the id would change, breaking every Link to the Note and its Backlinks.

## Consequences

A Note's `startFen` and `tags` are no longer fixed at creation. Clients holding a Note's tree must reload it after a reset, since every Move id, the root's included, is new.
