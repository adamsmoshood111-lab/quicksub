PRAGMA foreign_keys = ON;

-- CUSTOMERS
CREATE TABLE IF NOT EXISTS customers (
    id TEXT PRIMARY KEY,
    full_name TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE COLLATE NOCASE,
    phone TEXT NOT NULL,
    password_hash TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'active'
        CHECK (status IN ('active', 'suspended')),
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CUSTOMER SESSIONS
CREATE TABLE IF NOT EXISTS sessions (
    id_hash TEXT PRIMARY KEY,
    customer_id TEXT NOT NULL,
    expires_at TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (customer_id) REFERENCES customers(id)
        ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_sessions_customer
ON sessions(customer_id);

CREATE INDEX IF NOT EXISTS idx_sessions_expiry
ON sessions(expires_at);

-- SAVED PHONE NUMBERS
CREATE TABLE IF NOT EXISTS saved_numbers (
    id TEXT PRIMARY KEY,
    customer_id TEXT NOT NULL,
    label TEXT NOT NULL,
    phone TEXT NOT NULL,
    network TEXT NOT NULL,
    is_favourite INTEGER NOT NULL DEFAULT 0
        CHECK (is_favourite IN (0, 1)),
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (customer_id) REFERENCES customers(id)
        ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_saved_numbers_customer
ON saved_numbers(customer_id);

-- SERVICE PLANS
CREATE TABLE IF NOT EXISTS service_plans (
    id TEXT PRIMARY KEY,
    service_type TEXT NOT NULL
        CHECK (service_type IN (
            'data',
            'airtime',
            'electricity',
            'cable_tv',
            'educational_pins'
        )),
    network TEXT,
    category TEXT,
    supplier_plan_id TEXT,
    name TEXT NOT NULL,
    supplier_price_minor INTEGER,
    selling_price_minor INTEGER,
    is_active INTEGER NOT NULL DEFAULT 0
        CHECK (is_active IN (0, 1)),
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (service_type, supplier_plan_id)
);

CREATE INDEX IF NOT EXISTS idx_plans_service
ON service_plans(service_type, is_active);

-- CUSTOMER WALLETS
CREATE TABLE IF NOT EXISTS wallets (
    customer_id TEXT PRIMARY KEY,
    balance_minor INTEGER NOT NULL DEFAULT 0
        CHECK (balance_minor >= 0),
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (customer_id) REFERENCES customers(id)
        ON DELETE RESTRICT
);

-- WALLET LEDGER
CREATE TABLE IF NOT EXISTS wallet_ledger (
    id TEXT PRIMARY KEY,
    customer_id TEXT NOT NULL,
    transaction_id TEXT,
    entry_type TEXT NOT NULL
        CHECK (entry_type IN (
            'funding',
            'purchase',
            'refund',
            'adjustment'
        )),
    amount_minor INTEGER NOT NULL,
    reference TEXT NOT NULL UNIQUE,
    description TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (customer_id) REFERENCES customers(id)
        ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS idx_ledger_customer
ON wallet_ledger(customer_id, created_at);

-- SERVICE TRANSACTIONS
CREATE TABLE IF NOT EXISTS transactions (
    id TEXT PRIMARY KEY,
    customer_id TEXT NOT NULL,
    service_type TEXT NOT NULL
        CHECK (service_type IN (
            'data',
            'airtime',
            'electricity',
            'cable_tv',
            'educational_pins'
        )),
    plan_id TEXT,
    recipient TEXT NOT NULL,
    amount_minor INTEGER NOT NULL CHECK (amount_minor > 0),
    supplier_cost_minor INTEGER,
    status TEXT NOT NULL DEFAULT 'pending'
        CHECK (status IN (
            'pending',
            'successful',
            'failed',
            'reversed'
        )),
    reference TEXT NOT NULL UNIQUE,
    supplier_reference TEXT,
    failure_reason TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (customer_id) REFERENCES customers(id)
        ON DELETE RESTRICT,
    FOREIGN KEY (plan_id) REFERENCES service_plans(id)
        ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS idx_transactions_customer
ON transactions(customer_id, created_at);

CREATE INDEX IF NOT EXISTS idx_transactions_status
ON transactions(status, created_at);

CREATE UNIQUE INDEX IF NOT EXISTS idx_transactions_supplier_reference
ON transactions(supplier_reference)
WHERE supplier_reference IS NOT NULL;
