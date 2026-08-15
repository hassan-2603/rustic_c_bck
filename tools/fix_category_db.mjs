import sqlite3 from 'sqlite3';
import { getDatabasePath } from '../config/database.js';

const dbPath = getDatabasePath();
const db = new sqlite3.Database(dbPath, sqlite3.OPEN_READWRITE);
const run = (sql, p=[]) => new Promise((res,rej) => db.run(sql, p, function(err) { err ? rej(err) : res(this); }));
const all = (sql, p=[]) => new Promise((res,rej) => db.all(sql, p, (err,rows) => err ? rej(err) : res(rows)));

async function main() {
  // 1. Ensure category_name column
  try {
    await run("ALTER TABLE menu_items ADD COLUMN category_name TEXT DEFAULT ''");
    console.log("Added category_name column to menu_items");
  } catch (e) {
    console.log("category_name column already exists");
  }

  // 2. Find "Cold Beverages" category id
  const coldBevCat = await all("SELECT id, name FROM categories WHERE LOWER(name) = 'cold beverages' LIMIT 1");
  let coldBevId = coldBevCat[0]?.id;
  if (!coldBevId) {
    console.log("Creating Cold Beverages category...");
    coldBevId = 'cat-cold-beverages';
    await run(
      "INSERT INTO categories (id, name, is_active, display_order, created_at, updated_at) VALUES (?, 'Cold Beverages', 1, 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)",
      [coldBevId]
    );
  }

  // 3. Link NULL category items to Cold Beverages
  const updatedNulls = await run(
    "UPDATE menu_items SET category_id = ?, category_name = 'Cold Beverages' WHERE category_id IS NULL OR category_id = ''",
    [coldBevId]
  );
  console.log(`Updated ${updatedNulls.changes} orphaned/NULL category items to 'Cold Beverages' (id: ${coldBevId})`);

  // 4. Backfill category_name for all existing menu items
  const backfilled = await run(`
    UPDATE menu_items
    SET category_name = (
      SELECT name FROM categories WHERE categories.id = menu_items.category_id
    )
    WHERE category_id IS NOT NULL AND category_id != ''
  `);
  console.log(`Backfilled category_name for ${backfilled.changes} menu items`);

  db.close(() => process.exit(0));
}

main().catch(err => {
  console.error("Migration error:", err);
  db.close(() => process.exit(1));
});
