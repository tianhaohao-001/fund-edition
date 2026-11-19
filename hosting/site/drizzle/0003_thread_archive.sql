ALTER TABLE calls ADD COLUMN billable INTEGER NOT NULL DEFAULT 1;
--> statement-breakpoint
CREATE TABLE thread_journal (
  owner TEXT NOT NULL, topic TEXT NOT NULL, revision INTEGER NOT NULL, messages TEXT NOT NULL, recorded INTEGER NOT NULL,
  PRIMARY KEY(owner,topic,revision)
);
