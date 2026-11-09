-- +goose Up
-- Folders (#11): named containers, nestable, used only to file Notes. A Note
-- is in at most one Folder, or at the root (folder_id NULL). The composite
-- foreign keys keep a Folder's parent and a Note's Folder with the same owner.
-- Deleting a Folder deletes its subfolders, and every Note in any of them goes
-- to the root: a Note is never deleted with its Folder. The API keeps the tree
-- free of cycles.
CREATE TABLE folders (
  id BIGSERIAL PRIMARY KEY,
  user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  parent_id BIGINT NULL,
  name VARCHAR(255) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (id, user_id),
  CHECK (parent_id <> id),
  FOREIGN KEY (parent_id, user_id) REFERENCES folders(id, user_id) ON DELETE CASCADE
);

CREATE INDEX folders_user_idx ON folders (user_id);
CREATE INDEX folders_parent_idx ON folders (parent_id);

ALTER TABLE notes
  ADD COLUMN folder_id BIGINT NULL,
  ADD CONSTRAINT notes_folder_fk FOREIGN KEY (folder_id, user_id)
    REFERENCES folders(id, user_id) ON DELETE SET NULL (folder_id);

CREATE INDEX notes_folder_idx ON notes (folder_id);

-- +goose Down
ALTER TABLE notes DROP CONSTRAINT IF EXISTS notes_folder_fk, DROP COLUMN IF EXISTS folder_id;
DROP TABLE IF EXISTS folders;
