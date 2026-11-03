CREATE TABLE IF NOT EXISTS wordmate.textbook_volume_joins (
 child_id uuid NOT NULL REFERENCES wordmate.children(id) ON DELETE CASCADE,
 volume_id text NOT NULL,
 wordbook_id uuid NOT NULL,
 PRIMARY KEY(child_id,volume_id),
 FOREIGN KEY(wordbook_id,child_id) REFERENCES wordmate.wordbooks(id,child_id) ON DELETE CASCADE
);
