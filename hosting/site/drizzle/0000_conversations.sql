CREATE TABLE conversations (
  owner TEXT NOT NULL, topic TEXT NOT NULL, revision INTEGER NOT NULL DEFAULT 0,
  content TEXT NOT NULL, PRIMARY KEY (owner, topic)
);
--> statement-breakpoint
CREATE TABLE calls (
  owner TEXT NOT NULL, request_id TEXT NOT NULL, topic TEXT NOT NULL, fingerprint TEXT NOT NULL,
  started INTEGER NOT NULL, status TEXT NOT NULL, result TEXT,
  PRIMARY KEY (owner, request_id)
);
--> statement-breakpoint
CREATE INDEX calls_time ON calls (started);
--> statement-breakpoint
CREATE INDEX calls_owner_topic ON calls (owner,topic,started);
