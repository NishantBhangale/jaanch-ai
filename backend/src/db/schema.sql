CREATE TABLE IF NOT EXISTS scans (
  id            TEXT PRIMARY KEY,
  url           TEXT NOT NULL,
  hostname      TEXT NOT NULL,
  lang          TEXT NOT NULL DEFAULT 'en',
  status        TEXT NOT NULL DEFAULT 'pending',   -- pending | running | done | failed
  stage         TEXT,                              -- queued | trust | ai | health | explain
  error         TEXT,
  verdict       TEXT,                              -- safe | careful | likely_fake
  score         INTEGER,
  trust         JSONB,
  health        JSONB,
  explanations  JSONB NOT NULL DEFAULT '{}'::jsonb,
  screenshot    JSONB,
  flags         JSONB NOT NULL DEFAULT '{}'::jsonb, -- e.g. {"hadCredentials": true}
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  started_at    TIMESTAMPTZ,
  finished_at   TIMESTAMPTZ
);

ALTER TABLE scans ADD COLUMN IF NOT EXISTS flags JSONB NOT NULL DEFAULT '{}'::jsonb;

CREATE INDEX IF NOT EXISTS scans_status_created_idx ON scans (status, created_at);
CREATE INDEX IF NOT EXISTS scans_url_created_idx ON scans (url, created_at DESC);
CREATE INDEX IF NOT EXISTS scans_verdict_finished_idx ON scans (verdict, finished_at DESC);
CREATE INDEX IF NOT EXISTS scans_sms_group_idx ON scans ((flags->>'smsGroup'));

-- Optional accounts. Scans made while logged in keep the user's id so they can see their history.
CREATE TABLE IF NOT EXISTS users (
  id            TEXT PRIMARY KEY,
  email         TEXT NOT NULL UNIQUE,
  name          TEXT NOT NULL DEFAULT '',
  password_hash TEXT NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE scans ADD COLUMN IF NOT EXISTS user_id TEXT;
CREATE INDEX IF NOT EXISTS scans_user_created_idx ON scans (user_id, created_at DESC);
