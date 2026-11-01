# Links point at Note IDs, not names

A Link is stored in an Annotation's Body as a token holding the target Note's ID plus an optional label (`[[note:42|label]]`), and the displayed name is looked up when rendering. Note names are not unique, so "Fischer v. Spassky 1972" can exist many times and the user picks the exact one through a picker showing folder and players. We rejected name-based links (as Obsidian does) because they force unique names or ambiguous resolution, and rejected Luhmann-style numbered IDs because links, Backlinks and Folders already do the work of that numbering. A derived index table is rebuilt from the tokens on every save to serve Backlinks; the text is the source of truth.

## Consequences

Deleting a target Note leaves the token in the text as an Unresolved Link. Links may only target Notes the author owns.
