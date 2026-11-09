# Links point at Note IDs, not names

A Link is stored in a Comment or a Body as a token holding the target Note's ID plus an optional label (`[[note:42|label]]`), and the displayed name is looked up when rendering. Note names are not unique, so "Fischer v. Spassky 1972" can exist many times and the user picks the exact one through a picker showing folder and players. We rejected name-based links (as Obsidian does) because they force unique names or ambiguous resolution, and rejected Luhmann-style numbered IDs because links, Backlinks and Folders already do the work of that numbering. A derived index table is rebuilt from the tokens on every save to serve Backlinks, recording the Ply and whether the Link sits in the Comment or the Body so a Backlink opens the right place; the text is the source of truth.

## Consequences

Deleting a target Note leaves the token in the text as an Unresolved Link. Links may only target Notes the author owns: on save, every target must be one of the author's Notes or already be indexed on that Ply, so an Unresolved Link does not block editing the text around it. A target that belongs to another user and one that never existed are rejected alike, so a save reveals nothing about other users' Notes.
