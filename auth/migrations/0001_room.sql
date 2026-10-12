CREATE TABLE rooms (
  singleton INTEGER PRIMARY KEY CHECK (singleton = 1),
  id TEXT NOT NULL UNIQUE,
  owner_id TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE TABLE members (
  id TEXT PRIMARY KEY,
  room_id TEXT NOT NULL REFERENCES rooms(id),
  name TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('owner', 'member')),
  created_at INTEGER NOT NULL,
  revoked_at INTEGER,
  removal_pending INTEGER NOT NULL DEFAULT 0,
  legacy_hash TEXT UNIQUE
);
CREATE TABLE invites (
  id TEXT PRIMARY KEY,
  room_id TEXT NOT NULL REFERENCES rooms(id),
  code_hash TEXT NOT NULL UNIQUE,
  created_at INTEGER NOT NULL,
  revoked_at INTEGER,
  used_by TEXT REFERENCES members(id)
);
CREATE INDEX members_room ON members(room_id);
CREATE INDEX invites_room ON invites(room_id);
