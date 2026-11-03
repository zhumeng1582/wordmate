-- Imported source data is kept separate from the published learning catalogue.
CREATE TABLE IF NOT EXISTS wordmate.textbook_source_batches (
  source_url text NOT NULL,
  sha256 text NOT NULL,
  claimed_label text NOT NULL,
  review_status text NOT NULL DEFAULT 'unreviewed' CHECK (review_status IN ('unreviewed','approved','rejected')),
  imported_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (source_url, sha256)
);
CREATE TABLE IF NOT EXISTS wordmate.textbook_source_entries (
  source_url text NOT NULL,
  sha256 text NOT NULL,
  ordinal integer NOT NULL CHECK (ordinal > 0),
  raw_entry jsonb NOT NULL,
  PRIMARY KEY (source_url, sha256, ordinal),
  FOREIGN KEY (source_url, sha256) REFERENCES wordmate.textbook_source_batches(source_url, sha256)
);
