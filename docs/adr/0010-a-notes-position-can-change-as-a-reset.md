# A Note's Position can change after creation, as a reset that keeps the Note

ADR 0009 read a PGN, and set the Position, only when a Note was created. Edit position (#108) lets a Note get a new Position later, and #109 applies a PGN or FEN to an existing Note. This amends ADR 0009.

Every Move depends on the Position, so a new Position is a new start, not an edit. A reset keeps the Note's name, its Folder and its id, so Links from other Notes still point at it and its Backlinks keep working. Everything else goes: every Move, all the writing (every Comment, Body, Glyph and Drawing, the Position's own included), the Links inside that writing, and the PGN tags, which described the old game and which search reads.

The server enforces it as it does other destructive edits (ADR 0003, ADR 0009): one operation, `PUT /api/notes/{id}/position` with the new FEN (null for the standard start), answers 409 with the number of Moves and of each kind of writing that would go, until it is repeated with `?confirm=true`. A Note with no Moves and no writing resets without asking, so a fresh Note can be given a Position straight away. The tree is replaced by a new root in one transaction. The server still checks only the FEN's shape; the client checks that the position is legal. Guests reset their in-browser Note the same way, with the same confirmation and no request.

Applying a PGN or FEN to an existing Note (#109) uses this reset whenever the Position changes. A FEN always does, since it describes only a starting point: applying the FEN of a later Move starts the Note from there. A PGN with a new Position sends its tree and tags with the reset, which imports them as a new Note's in the same transaction.

## Applying a PGN with the same Position (#109)

The FEN and PGN under the board stay read only until Edit, and nothing applies until Apply, so a stray keystroke cannot damage a Note. A PGN with the same Position is read on the client, as at creation, and sent as a tree to `PUT /api/notes/{id}/tree`, which keeps what did not change:

- Each Move of the PGN is matched to a stored Move by the same line of SANs from the Position, the rule that already keeps one child per SAN under a parent. Matched Moves keep their ids, new Moves are added, and stored Moves the PGN no longer has are deleted with their subtrees. Siblings take the PGN's order, so a reorder keeps everything, as Promote does.
- The PGN shows a Link as plain text. So for each matched Move, and the Position, the client says whether the PGN shows its Comment and its Body exactly as the export wrote them (comparing what each reads back as, so the line wrapping does not matter); if so, the stored text is kept, Links and all. A Comment or Body that was changed is replaced, and its Links become plain text. Glyphs and Drawings come from the PGN, which shows them exactly.
- The tags are replaced with the PGN's. The name stays.

The server counts what would go (each Move deleted, even one with no writing, since deletions are hard to see in a text box; each Comment, Body, Glyph or Drawing deleted or replaced; and each Link that becomes plain text) and answers 409 with the counts until the apply is repeated with `?confirm=true`. Adding Moves, reordering them and changing the tags apply without asking. The whole apply runs in one transaction. Guests apply the same way in the browser, with the same confirmations.

## Considered options

- **Editing the Position in place, keeping the Moves that are still legal.** Rejected: a Move's meaning comes from the position before it, so keeping writing on a Move that now means something else would mislead.
- **Creating a new Note and deleting the old one.** Rejected: the id would change, breaking every Link to the Note and its Backlinks.

## Consequences

A Note's `startFen` and `tags` are no longer fixed at creation. Clients holding a Note's tree must reload it after a reset, since every Move id, the root's included, is new. An applied PGN with the same Position keeps the ids of the Moves it matched, and the API answers the whole new tree.
