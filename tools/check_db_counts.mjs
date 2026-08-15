import sqlite3 from 'sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const dbPath = path.join(__dirname, '..', 'database', 'rustic-charm.sqlite');

const db = new sqlite3.Database(dbPath, sqlite3.OPEN_READONLY, (err) => {
  if (err) {
    console.error('Failed to open DB', err);
    process.exit(1);
  }
});

function queryCount(table) {
  return new Promise((resolve) => {
    db.get(`SELECT COUNT(*) as c FROM ${table}`, (err, row) => {
      if (err) return resolve({ table, error: err.message });
      resolve({ table, count: row.c });
    });
  });
}

(async () => {
  const tables = ['tables','categories','menu_items','orders','waiters','waiter_calls'];
  for (const t of tables) {
    const res = await queryCount(t);
    if (res.error) {
      console.log(`${t}: ERROR - ${res.error}`);
    } else {
      console.log(`${t}: ${res.count}`);
    }
  }
  db.close();
})();
