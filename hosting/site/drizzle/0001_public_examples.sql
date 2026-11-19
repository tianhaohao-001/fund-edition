CREATE TABLE public_examples (
  id TEXT PRIMARY KEY, sample TEXT NOT NULL, language TEXT NOT NULL,
  started INTEGER NOT NULL, status TEXT NOT NULL, result TEXT
);
--> statement-breakpoint
CREATE INDEX public_examples_lookup ON public_examples(sample,language,started);
--> statement-breakpoint
CREATE INDEX public_examples_usage ON public_examples(started);
