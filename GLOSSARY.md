# ChessNotes

A chess study tool where players write about games and positions and connect them to one another, in the manner of Luhmann's note-taking method, so they learn chess through connections between ideas and not through rote memorization.

## Language

**Note**:
One chess game or position, with the user's writing on it, belonging to a single user. The unit of study, and the thing that links point at. Its name need not be unique.
_Avoid_: Game, chess note, study, file, page

**Position**:
The starting point of a Note: the standard start or a custom setup. A Note with no moves is a study of a position alone.
_Avoid_: Setup, board state

**Ply**:
A single move by one side. Counting from 0 at the Position, ply 1 is White's first move and ply 2 is Black's first reply.
_Avoid_: Half-move, move number

**Glyph**:
A symbol judging the move at one Ply (such as ! or ??) or the position that move leads to (such as ± or =). A Ply has at most one Glyph of each kind, and Ply 0 can only have one about the position.
_Avoid_: Annotation, NAG, symbol

**Comment**:
A user's writing about the move at one Ply, shown with that move.
_Avoid_: Annotation, remark, caption

**Body**:
The long-form writing after a Ply that carries the reader to the next move. The Body at Ply 0 opens the Note, before the first move.
_Avoid_: Annotation, description, essay, big idea

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
