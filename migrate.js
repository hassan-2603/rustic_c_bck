import sqlite3 from "sqlite3";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const dbPath = path.join(__dirname, "database", "rustic-charm.sqlite");

const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error("Error opening database:", err);
    process.exit(1);
  }
});

const run = (sql) => {
  return new Promise((resolve, reject) => {
    db.run(sql, (err) => {
      if (err) {
        if (err.message.includes("duplicate column name")) {
          console.log(`Column already exists: ${sql}`);
          resolve();
        } else {
          reject(err);
        }
      } else {
        console.log(`Executed: ${sql}`);
        resolve();
      }
    });
  });
};

async function migrate() {
  try {
    await run("ALTER TABLE orders ADD COLUMN waiter_id TEXT");
    await run("ALTER TABLE orders ADD COLUMN waiter_name TEXT");
    await run("ALTER TABLE orders ADD COLUMN accepted_at TEXT");
    await run("ALTER TABLE orders ADD COLUMN served_at TEXT");
    await run("ALTER TABLE orders ADD COLUMN completed_at TEXT");
    console.log("Migration complete.");
  } catch (err) {
    console.error("Migration failed:", err);
  } finally {
    db.close();
  }
}

migrate();
