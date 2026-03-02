-- Migration number: 0000 	 2026-03-02T00:00:00.000Z

CREATE TABLE users (
  id TEXT PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('admin', 'manager', 'agent')),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  expires_at DATETIME NOT NULL
);

CREATE TABLE locations (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  address TEXT NOT NULL,
  hours_json TEXT NOT NULL
);

CREATE TABLE vehicles (
  id TEXT PRIMARY KEY,
  location_id TEXT NOT NULL REFERENCES locations(id),
  make TEXT NOT NULL,
  model TEXT NOT NULL,
  year INTEGER NOT NULL,
  class TEXT NOT NULL,
  seats INTEGER NOT NULL,
  transmission TEXT NOT NULL,
  fuel TEXT NOT NULL,
  base_price_day REAL NOT NULL,
  deposit REAL NOT NULL,
  status TEXT NOT NULL DEFAULT 'available' CHECK (status IN ('available', 'rented', 'maintenance'))
);

CREATE TABLE pricing_rules (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  rule_json TEXT NOT NULL,
  active BOOLEAN NOT NULL DEFAULT 1
);

CREATE TABLE bookings (
  id TEXT PRIMARY KEY,
  customer_name TEXT NOT NULL,
  customer_phone TEXT NOT NULL,
  vehicle_id TEXT NOT NULL REFERENCES vehicles(id),
  start_at DATETIME NOT NULL,
  end_at DATETIME NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'confirmed', 'cancelled', 'completed')),
  price_breakdown_json TEXT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE booking_events (
  id TEXT PRIMARY KEY,
  booking_id TEXT NOT NULL REFERENCES bookings(id),
  event_type TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE kb_documents (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  body_text TEXT NOT NULL,
  visibility_role TEXT NOT NULL DEFAULT 'agent',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE VIRTUAL TABLE kb_fts USING fts5(
  title,
  body_text,
  content='kb_documents',
  content_rowid='rowid'
);

-- Triggers to keep FTS index updated
CREATE TRIGGER kb_ai AFTER INSERT ON kb_documents BEGIN
  INSERT INTO kb_fts(rowid, title, body_text) VALUES (new.rowid, new.title, new.body_text);
END;
CREATE TRIGGER kb_ad AFTER DELETE ON kb_documents BEGIN
  INSERT INTO kb_fts(kb_fts, rowid, title, body_text) VALUES('delete', old.rowid, old.title, old.body_text);
END;
CREATE TRIGGER kb_au AFTER UPDATE ON kb_documents BEGIN
  INSERT INTO kb_fts(kb_fts, rowid, title, body_text) VALUES('delete', old.rowid, old.title, old.body_text);
  INSERT INTO kb_fts(rowid, title, body_text) VALUES (new.rowid, new.title, new.body_text);
END;

CREATE TABLE chat_threads (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  title TEXT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE chat_messages (
  id TEXT PRIMARY KEY,
  thread_id TEXT NOT NULL REFERENCES chat_threads(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
  content TEXT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE models (
  id TEXT PRIMARY KEY,
  display_name TEXT NOT NULL,
  provider TEXT NOT NULL,
  base_url TEXT,
  model_name TEXT NOT NULL,
  enabled BOOLEAN NOT NULL DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE audit_logs (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  action TEXT NOT NULL,
  entity TEXT NOT NULL,
  entity_id TEXT,
  metadata_json TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Insert default admin user (password: admin123, you should change this in production, hashed using simple sha256 for demo purposes but use bcrypt/argon2 in real)
-- For simplicity, we'll hash 'admin123' to '8c6976e5b5410415bde908bd4dee15dfb167a9c873fc4bb8a81f6f2ab448a918' (SHA-256)
INSERT INTO users (id, email, password_hash, role) VALUES ('u_admin_1', 'admin@example.com', '8c6976e5b5410415bde908bd4dee15dfb167a9c873fc4bb8a81f6f2ab448a918', 'admin');
