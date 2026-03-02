-- Migration number: 0001 	 2026-03-02T10:00:00.000Z

-- Add tags_json to chat_threads
ALTER TABLE chat_threads ADD COLUMN tags_json TEXT DEFAULT '[]';

-- Add priority to pricing_rules
ALTER TABLE pricing_rules ADD COLUMN priority INTEGER DEFAULT 0;
ALTER TABLE pricing_rules ADD COLUMN created_at DATETIME DEFAULT CURRENT_TIMESTAMP;

-- Add correlation_id to audit_logs
ALTER TABLE audit_logs ADD COLUMN correlation_id TEXT;

-- Create Macros table
CREATE TABLE macros (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  tags_json TEXT DEFAULT '[]',
  visibility_role TEXT NOT NULL DEFAULT 'agent',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Create daily KPIs table
CREATE TABLE daily_kpis (
  date TEXT NOT NULL, -- YYYY-MM-DD
  location_id TEXT NOT NULL,
  utilization REAL DEFAULT 0,
  revenue REAL DEFAULT 0,
  cancellations INTEGER DEFAULT 0,
  bookings_count INTEGER DEFAULT 0,
  avg_handling_time REAL DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (date, location_id)
);

-- D1 Indexes for hot paths
CREATE INDEX idx_vehicles_location_status ON vehicles(location_id, status);
CREATE INDEX idx_bookings_status_start ON bookings(status, start_at);
CREATE INDEX idx_bookings_vehicle_start ON bookings(vehicle_id, start_at);
CREATE INDEX idx_booking_events_booking_created ON booking_events(booking_id, created_at);
CREATE INDEX idx_chat_threads_user_updated ON chat_threads(user_id, updated_at);
CREATE INDEX idx_chat_messages_thread_created ON chat_messages(thread_id, created_at);
CREATE INDEX idx_audit_logs_created ON audit_logs(created_at);
CREATE INDEX idx_audit_logs_user_created ON audit_logs(user_id, created_at);
