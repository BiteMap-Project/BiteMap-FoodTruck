ALTER TABLE vendors ADD COLUMN ordering_cutoff_minutes integer NOT NULL DEFAULT 15
    CHECK (ordering_cutoff_minutes BETWEEN 0 AND 120);
