-- Device-independent unlock delivery: encrypted at rest for authenticated recipients.

ALTER TABLE pending_unlocks
  ADD COLUMN IF NOT EXISTS unlock_secret_enc TEXT;
