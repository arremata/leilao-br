CREATE TABLE IF NOT EXISTS users (
  id            BIGSERIAL PRIMARY KEY,
  google_sub    TEXT NOT NULL UNIQUE,
  email         TEXT NOT NULL,
  name          TEXT,
  avatar_url    TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_login_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS housing_profile JSONB;

CREATE TABLE IF NOT EXISTS user_saved_properties (
  user_id      BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  property_id  BIGINT NOT NULL,
  saved_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, property_id)
);

CREATE TABLE IF NOT EXISTS user_viewed_properties (
  user_id      BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  property_id  BIGINT NOT NULL,
  viewed_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  snapshot     JSONB NOT NULL,
  PRIMARY KEY (user_id, property_id)
);

CREATE TABLE IF NOT EXISTS user_sessions (
  id          TEXT PRIMARY KEY,
  user_id     BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at  TIMESTAMPTZ NOT NULL,
  expires_at  TIMESTAMPTZ NOT NULL,
  revoked_at  TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_user_saved_user ON user_saved_properties(user_id);
CREATE INDEX IF NOT EXISTS idx_user_viewed_user ON user_viewed_properties(user_id);
CREATE INDEX IF NOT EXISTS idx_user_sessions_user ON user_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_user_sessions_expiry ON user_sessions(expires_at);
