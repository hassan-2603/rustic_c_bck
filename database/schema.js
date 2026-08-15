const schemaSql = `
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS restaurant_settings (
  id TEXT PRIMARY KEY,
  key TEXT NOT NULL UNIQUE,
  value TEXT,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS categories (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0,1)),
  display_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS menu_items (
  id TEXT PRIMARY KEY,
  category_id TEXT,
  name TEXT NOT NULL,
  description TEXT,
  price REAL NOT NULL DEFAULT 0,
  image_url TEXT,
  is_veg INTEGER NOT NULL DEFAULT 1 CHECK (is_veg IN (0,1)),
  is_available INTEGER NOT NULL DEFAULT 1 CHECK (is_available IN (0,1)),
  is_popular INTEGER NOT NULL DEFAULT 0 CHECK (is_popular IN (0,1)),
  prep_time INTEGER,
  rating REAL DEFAULT 0,
  metadata TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS menu_translations (
  id TEXT PRIMARY KEY,
  menu_item_id TEXT NOT NULL,
  language_code TEXT NOT NULL,
  name TEXT,
  description TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(menu_item_id, language_code),
  FOREIGN KEY (menu_item_id) REFERENCES menu_items(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS tables (
  id TEXT PRIMARY KEY,
  table_key TEXT NOT NULL UNIQUE,
  table_number INTEGER NOT NULL,
  area TEXT NOT NULL,
  area_label TEXT,
  display_name TEXT,
  occupied INTEGER NOT NULL DEFAULT 0 CHECK (occupied IN (0,1)),
  status TEXT NOT NULL DEFAULT 'available',
  current_order_id TEXT,
  current_session_id TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  table_id TEXT,
  table_reference TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','expired','ended','closed')),
  customer_name TEXT,
  customer_phone TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
  expires_at TEXT,
  FOREIGN KEY (table_id) REFERENCES tables(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS orders (
  id TEXT PRIMARY KEY,
  session_id TEXT,
  table_id TEXT,
  table_reference TEXT,
  table_number INTEGER,
  table_area TEXT,
  table_label TEXT,
  order_number TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'Pending',
  total REAL NOT NULL DEFAULT 0,
  customer_name TEXT,
  customer_phone TEXT,
  payment_status TEXT DEFAULT 'Unpaid',
  payment_method TEXT,
  discount_type TEXT,
  discount_value REAL,
  discount_amount REAL,
  final_total REAL,
  waiter_id TEXT,
  waiter_name TEXT,
  accepted_at TEXT,
  served_at TEXT,
  completed_at TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE SET NULL,
  FOREIGN KEY (table_id) REFERENCES tables(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS order_items (
  id TEXT PRIMARY KEY,
  order_id TEXT NOT NULL,
  menu_item_id TEXT,
  name TEXT NOT NULL,
  quantity INTEGER NOT NULL DEFAULT 1,
  price REAL NOT NULL DEFAULT 0,
  special_instructions TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS waiters (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  pin INTEGER,
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0,1)),
  online INTEGER NOT NULL DEFAULT 0 CHECK (online IN (0,1)),
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS waiter_calls (
  id TEXT PRIMARY KEY,
  session_id TEXT,
  table_id TEXT,
  table_reference TEXT,
  order_id TEXT,
  customer_name TEXT,
  customer_phone TEXT,
  status TEXT NOT NULL DEFAULT 'Pending',
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE SET NULL,
  FOREIGN KEY (table_id) REFERENCES tables(id) ON DELETE SET NULL,
  FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS offers (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT,
  code TEXT,
  discount_tag TEXT,
  is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0,1)),
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS kitchen_credentials (
  id TEXT PRIMARY KEY,
  password TEXT NOT NULL,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS supported_languages (
  code TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 1 CHECK (enabled IN (0,1)),
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_menu_items_category_id ON menu_items(category_id);
CREATE INDEX IF NOT EXISTS idx_menu_translations_menu_item_id ON menu_translations(menu_item_id);
CREATE INDEX IF NOT EXISTS idx_menu_translations_language_code ON menu_translations(language_code);
CREATE INDEX IF NOT EXISTS idx_orders_session_id ON orders(session_id);
CREATE INDEX IF NOT EXISTS idx_orders_table_id ON orders(table_id);
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
CREATE INDEX IF NOT EXISTS idx_order_items_order_id ON order_items(order_id);
CREATE INDEX IF NOT EXISTS idx_sessions_table_id ON sessions(table_id);
CREATE INDEX IF NOT EXISTS idx_sessions_status ON sessions(status);
CREATE INDEX IF NOT EXISTS idx_waiter_calls_table_id ON waiter_calls(table_id);
CREATE INDEX IF NOT EXISTS idx_waiter_calls_status ON waiter_calls(status);
CREATE INDEX IF NOT EXISTS idx_offers_is_active ON offers(is_active);
`;

export function initializeSchema(db) {
  // support both callback-style and Promise-style `db.exec`
  try {
    const result = db.exec(schemaSql);
    if (result && typeof result.then === "function") {
      return result;
    }
  } catch (e) {
    // fall through to callback-style
  }

  return new Promise((resolve, reject) => {
    db.exec(schemaSql, (error) => {
      if (error) {
        reject(error);
        return;
      }
      resolve();
    });
  });
}

export function seedDefaultData(db) {
  const defaultSeedSql = `
      INSERT OR IGNORE INTO restaurant_settings (id, key, value, updated_at) VALUES
        ('app', 'restaurant_name', 'Rustic Charm', CURRENT_TIMESTAMP),
        ('app', 'menu_version', '1', CURRENT_TIMESTAMP);

      INSERT OR IGNORE INTO kitchen_credentials (id, password, updated_at) VALUES
        ('kitchen', '0000', CURRENT_TIMESTAMP);

      INSERT OR IGNORE INTO supported_languages (code, name, enabled, created_at) VALUES
        ('en', 'English', 1, CURRENT_TIMESTAMP),
        ('ru', 'Russian', 1, CURRENT_TIMESTAMP),
        ('de', 'German', 1, CURRENT_TIMESTAMP),
        ('es', 'Spanish', 1, CURRENT_TIMESTAMP),
        ('kk', 'Kazakh', 1, CURRENT_TIMESTAMP),
        ('he', 'Hebrew', 1, CURRENT_TIMESTAMP),
        ('ja', 'Japanese', 1, CURRENT_TIMESTAMP),
        ('ko', 'Korean', 1, CURRENT_TIMESTAMP);

      INSERT OR IGNORE INTO categories (id, name, is_active, display_order, created_at, updated_at) VALUES
        ('cat-starters', 'Starters', 1, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
        ('cat-mains', 'Mains', 1, 2, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
        ('cat-desserts', 'Desserts', 1, 3, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
        ('cat-drinks', 'Drinks', 1, 4, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

      INSERT OR IGNORE INTO tables (id, table_key, table_number, area, area_label, display_name, occupied, status, current_order_id, current_session_id, created_at, updated_at) VALUES
        ('deck-area-1', 'deck-area-1', 1, 'deck-area', 'Deck Area', 'Deck Area - Table 1', 0, 'available', '', '', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
        ('deck-area-2', 'deck-area-2', 2, 'deck-area', 'Deck Area', 'Deck Area - Table 2', 0, 'available', '', '', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
        ('deck-area-3', 'deck-area-3', 3, 'deck-area', 'Deck Area', 'Deck Area - Table 3', 0, 'available', '', '', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
        ('dine-in-area-1', 'dine-in-area-1', 1, 'dine-in-area', 'Dine in area', 'Dine in area - Table 1', 0, 'available', '', '', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
        ('dine-in-area-2', 'dine-in-area-2', 2, 'dine-in-area', 'Dine in area', 'Dine in area - Table 2', 0, 'available', '', '', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
        ('dine-in-area-3', 'dine-in-area-3', 3, 'dine-in-area', 'Dine in area', 'Dine in area - Table 3', 0, 'available', '', '', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
        ('courtyard-area-1', 'courtyard-area-1', 1, 'courtyard-area', 'Courtyard area', 'Courtyard area - Table 1', 0, 'available', '', '', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
        ('courtyard-area-2', 'courtyard-area-2', 2, 'courtyard-area', 'Courtyard area', 'Courtyard area - Table 2', 0, 'available', '', '', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
        ('courtyard-area-3', 'courtyard-area-3', 3, 'courtyard-area', 'Courtyard area', 'Courtyard area - Table 3', 0, 'available', '', '', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
        ('chillout-area-1', 'chillout-area-1', 1, 'chillout-area', 'Chillout area', 'Chillout area - Table 1', 0, 'available', '', '', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
        ('chillout-area-2', 'chillout-area-2', 2, 'chillout-area', 'Chillout area', 'Chillout area - Table 2', 0, 'available', '', '', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
        ('chillout-area-3', 'chillout-area-3', 3, 'chillout-area', 'Chillout area', 'Chillout area - Table 3', 0, 'available', '', '', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);
    `;

  // support both callback-style and Promise-style `db.exec`
  try {
    const result = db.exec(defaultSeedSql);
    if (result && typeof result.then === "function") {
      return result;
    }
  } catch (e) {
    // fall through to callback-style
  }

  return new Promise((resolve, reject) => {
    db.exec(defaultSeedSql, (error) => {
      if (error) {
        reject(error);
        return;
      }
      resolve();
    });
  });
}

export { schemaSql };
