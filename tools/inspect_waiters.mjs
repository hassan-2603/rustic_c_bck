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

function run(sql) {
  return new Promise((resolve, reject) => {
    db.all(sql, (err, rows) => {
      if (err) return reject(err);
      resolve(rows);
    });
  });
}

(async () => {
  try {
    const info = await run("PRAGMA table_info('waiters');");
    console.log('PRAGMA table_info(waiters):');
    console.table(info.map(r => ({ cid: r.cid, name: r.name, type: r.type, notnull: r.notnull, pk: r.pk, default: r.dflt_value })));

    const rows = await run("SELECT id, name, active, pin FROM waiters LIMIT 10;");
    console.log('Sample waiters:');
    console.table(rows);

    const count = await run("SELECT COUNT(*) as c FROM waiters;");
    console.log('waiters count:', count[0]?.c);
  } catch (err) {
    console.error('Error querying DB:', err.message);
  } finally {
    db.close();
  }
})();
