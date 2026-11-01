# ChessNotes

A chess study tool where players annotate games and positions and connect them to one another, in the manner of Luhmann's note-taking method, so they learn chess through connections between ideas and not through rote memorization.

## Language

**Note**:
One annotated chess game or position belonging to a single user. The unit of study, and the thing that links point at. Its name need not be unique.
_Avoid_: Game, chess note, study, file, page

**Position**:
The starting point of a Note: the standard start or a custom setup. A Note with no moves is a study of a position alone.
_Avoid_: Setup, board state

**Ply**:
A single move by one side. Counting from 0 at the Position, ply 1 is White's first move and ply 2 is Black's first reply.
_Avoid_: Half-move, move number

**Annotation**:
Commentary a user attaches to one Ply of a Note. Has a short Comment and an optional Body.
_Avoid_: Comment (for the whole thing), remark, gloss

**Comment**:
The short, length-limited line of an Annotation, shown inline with the moves. Keeps the notation readable.
_Avoid_: Note text, caption

**Body**:
The long-form text of an Annotation, where a user develops an idea and places Links.
_Avoid_: Description, essay, additional comments

**Link**:
A reference from an Annotation's Body to another Note, optionally shown with a custom label instead of the target's name. Points at the Note itself, so renaming or duplicate names never break it.
_Avoid_: Reference, connection, wikilink

**Backlink**:
The reverse view of a Link: a Note listing the Annotations in other Notes that link to it.
_Avoid_: Incoming link, citation

**Unresolved Link**:
A Link whose target Note has been deleted. It stays in the text and is shown as broken.
_Avoid_: Dead link, orphan

**Folder**:
A named container, nestable inside another Folder, used only to file Notes. A Note is in at most one Folder, or in none. Folders carry no meaning beyond filing; connections are Links.
_Avoid_: Collection, category, tag

**Guest**:
A visitor without an account. Can use the board and annotate in the browser, but nothing is saved.
_Avoid_: Anonymous user, visitor
