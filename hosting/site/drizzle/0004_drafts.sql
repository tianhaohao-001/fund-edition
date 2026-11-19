CREATE TABLE drafts (
  owner TEXT NOT NULL, topic TEXT NOT NULL, revision INTEGER NOT NULL, message TEXT NOT NULL, updated INTEGER NOT NULL,
  PRIMARY KEY(owner,topic)
);
