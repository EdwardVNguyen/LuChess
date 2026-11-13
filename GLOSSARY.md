# ChessNotes

A chess study tool where players write about games and positions and connect them to one another, in the manner of Luhmann's note-taking method, so they learn chess through connections between ideas and not through rote memorization.

## Language

**Note**:
One chess game or position, with the user's writing on it, belonging to a single user. The unit of study, and the thing that links point at. Its name need not be unique.
_Avoid_: Game, chess note, study, file, page

**Position**:
The starting point of a Note: the standard start or a custom setup. A Note with no moves is a study of a position alone.
_Avoid_: Setup, board state

**Move**:
A single move by one side, played from the Position or from another Move. A Move can be followed by several Moves, so a Note's Moves form a tree. Writing hangs on a Move or on the Position.
_Avoid_: Ply, node, half-move

**Main line**:
The line of Moves that follows the first continuation of each Move, from the Position.
_Avoid_: Mainline, game, main variation

**Variation**:
A line that branches off another line, starting from any continuation other than the first. Variations can hold Variations of their own.
_Avoid_: Side-line, sub-variation, branch

**Ply**:
How far a Move is from the Position, counting each side's move: White's first Move is at ply 1 and Black's reply at ply 2. A depth, not a Move: Moves in different lines can share a ply.
_Avoid_: Half-move, move number

**Glyph**:
A symbol judging a Move (such as ! or ??) or the position it leads to (such as ± or =). A Move has at most one Glyph of each kind, and the Position can only have one about the position.
_Avoid_: Annotation, NAG, symbol

**Comment**:
A user's writing about a Move, shown with that Move. The Position takes no new Comments: writing about it is its Body.
_Avoid_: Annotation, remark, caption

**Body**:
The long-form writing after a Move that carries the reader to the next one. The Body on the Position opens the Note, before the first Move.
_Avoid_: Annotation, description, essay, big idea

**Drawing**:
An arrow or a circle on the board, saved on a Move or the Position.
_Avoid_: Shape, mark, highlight, annotation

**Link**:
A reference from a Comment or Body to another Note, optionally shown with a custom label instead of the target's name. Points at the Note itself, so renaming or duplicate names never break it.
_Avoid_: Reference, connection, wikilink

**Backlink**:
The reverse view of a Link: a Note listing the Comments and Bodies in other Notes that link to it.
_Avoid_: Incoming link, citation

**Unresolved Link**:
A Link whose target Note has been deleted. It stays in the text and is shown as broken.
_Avoid_: Dead link, orphan

**Folder**:
A named container, nestable inside another Folder, used only to file Notes. A Note is in at most one Folder, or in none. Folders carry no meaning beyond filing; connections are Links.
_Avoid_: Collection, category, tag

**Guest**:
A visitor without an account. Can use the board and write Comments and Bodies in the browser, but nothing is saved. A visitor whose Session could not be restored is not yet known to be a Guest.
_Avoid_: Anonymous user, visitor

**Session**:
One login of a user on one browser or device, lasting until it is logged out, expires, or is revoked. A user can have several at once.
_Avoid_: Login, Token
