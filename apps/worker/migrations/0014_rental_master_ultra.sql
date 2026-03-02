-- 0014_rental_master_ultra.sql
-- Master Refactor for Car Rental Operations (Free Tier)

-- 1) Simplified Auth (Name + PIN)
DROP TABLE IF EXISTS users;
CREATE TABLE users (
    id TEXT PRIMARY KEY,
    name TEXT UNIQUE NOT NULL,
    pin_hash TEXT NOT NULL, -- 4 digits hashed
    role TEXT DEFAULT 'staff' CHECK(role IN ('admin', 'manager', 'staff')),
    status TEXT DEFAULT 'active',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 2) Private Messaging (User to User)
CREATE TABLE private_messages (
    id TEXT PRIMARY KEY,
    sender_id TEXT NOT NULL REFERENCES users(id),
    receiver_id TEXT NOT NULL REFERENCES users(id),
    content TEXT NOT NULL,
    is_read INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 3) ChatGPT Module (Threads & AI Messages)
CREATE TABLE ai_threads (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id),
    title TEXT DEFAULT 'New Conversation',
    model_id TEXT DEFAULT 'gpt-4o-free',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE ai_messages (
    id TEXT PRIMARY KEY,
    thread_id TEXT NOT NULL REFERENCES ai_threads(id) ON DELETE CASCADE,
    role TEXT CHECK(role IN ('user', 'assistant', 'system')),
    content TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 4) Fleet Management (No Bookings/Pricing)
CREATE TABLE fleet (
    id TEXT PRIMARY KEY,
    make TEXT NOT NULL,
    model TEXT NOT NULL,
    license_plate TEXT UNIQUE NOT NULL,
    category TEXT CHECK(category IN ('Economy', 'Luxury', 'SUV', 'Van')),
    status TEXT DEFAULT 'Available' CHECK(status IN ('Available', 'In Use', 'Maintenance', 'Cleaning')),
    last_service_km INTEGER DEFAULT 0,
    location TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 5) Activity Feed
CREATE TABLE system_activity (
    id TEXT PRIMARY KEY,
    user_id TEXT REFERENCES users(id),
    action TEXT NOT NULL,
    details TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Initial Admin (Name: Admin, PIN: 1234 - hashed for demo)
-- PIN 1234 -> simple sha256: 03ac674216f3e15c761ee1a5e255f067953623c8b388b4459e13f978d7c846f4
INSERT INTO users (id, name, pin_hash, role) VALUES ('u_admin', 'Admin', '03ac674216f3e15c761ee1a5e255f067953623c8b388b4459e13f978d7c846f4', 'admin');
