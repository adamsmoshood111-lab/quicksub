PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS admin_users (
id TEXT PRIMARY KEY,
customer_id TEXT NOT NULL UNIQUE,
role TEXT NOT NULL DEFAULT 'admin'
CHECK (role IN ('admin', 'super_admin')),
is_active INTEGER NOT NULL DEFAULT 1
CHECK (is_active IN (0, 1)),
created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
FOREIGN KEY (customer_id) REFERENCES customers(id)
ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS idx_admin_users_active
ON admin_users(is_active, role);
