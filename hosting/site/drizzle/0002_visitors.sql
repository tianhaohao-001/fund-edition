CREATE TABLE visitor_spaces (
  token_hash TEXT PRIMARY KEY, space TEXT NOT NULL UNIQUE, ip_key TEXT NOT NULL, created INTEGER NOT NULL,
  expires INTEGER NOT NULL, claimed_by TEXT
);
--> statement-breakpoint
CREATE INDEX visitor_space_issuance ON visitor_spaces(ip_key,created);
--> statement-breakpoint
CREATE TABLE account_spaces (
  account TEXT NOT NULL, space TEXT NOT NULL, created INTEGER NOT NULL,
  PRIMARY KEY(account,space)
);
--> statement-breakpoint
CREATE TABLE account_focus (
  account TEXT PRIMARY KEY, space TEXT NOT NULL
);
--> statement-breakpoint
CREATE TABLE security_settings (
  name TEXT PRIMARY KEY, value TEXT NOT NULL
);
--> statement-breakpoint
ALTER TABLE calls ADD COLUMN ip_key TEXT;
--> statement-breakpoint
CREATE INDEX calls_ip ON calls (ip_key,started);
