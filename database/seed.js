import { openDatabase } from "../config/database.js";

const db = openDatabase();

const seedSql = `
INSERT OR IGNORE INTO restaurant_settings (id, key, value) VALUES
  ('app', 'menu_version', '1'),
  ('app', 'restaurant_name', 'Rustic Charm');

INSERT OR IGNORE INTO kitchen_credentials (id, password) VALUES ('kitchen', '0000');

INSERT OR IGNORE INTO supported_languages (code, name, enabled) VALUES
  ('en', 'English', 1),
  ('ru', 'Russian', 1),
  ('de', 'German', 1),
  ('es', 'Spanish', 1),
  ('kk', 'Kazakh', 1),
  ('he', 'Hebrew', 1),
  ('ja', 'Japanese', 1),
  ('ko', 'Korean', 1);
`;

db.exec(seedSql, (error) => {
  if (error) {
    console.error("SQLite seed failed:", error);
    process.exit(1);
  }

  console.log("SQLite seed completed successfully.");
  process.exit(0);
});
