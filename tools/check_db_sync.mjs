import sqlite3 from 'sqlite3';
import { getDatabasePath } from '../config/database.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function writeOut(obj) {
  const outPath = path.join(__dirname, 'db-check.json');
  fs.writeFileSync(outPath, JSON.stringify(obj, null, 2));
  console.log('wrote', outPath);
}

const dbPath = getDatabasePath();
console.log('dbPath', dbPath);
const db = new sqlite3.Database(dbPath, sqlite3.OPEN_READONLY, (err) => {
  if (err) {
    console.error('open error', err && err.message);
    writeOut({ error: err && err.message || String(err) });
    process.exit(1);
  }
});

const all = (sql, params=[]) => new Promise((res, rej) => db.all(sql, params, (err, rows) => err ? rej(err) : res(rows)));

(async function(){
  try {
    const categories = await all('SELECT COUNT(*) as cnt FROM categories');
    const menu = await all('SELECT COUNT(*) as cnt FROM menu_items');
    const tables = await all('SELECT COUNT(*) as cnt FROM tables');
    const sampleCats = await all('SELECT id,name FROM categories LIMIT 50');
    const sampleMenu = await all('SELECT id,name,category_id,price FROM menu_items LIMIT 50');
    const out = {
      dbPath,
      categories: categories[0]?.cnt || 0,
      menu_items: menu[0]?.cnt || 0,
      tables: tables[0]?.cnt || 0,
      sampleCategories: sampleCats,
      sampleMenu: sampleMenu
    };
    writeOut(out);
  } catch (e) {
    console.error('query error', e && e.message);
    writeOut({ error: e && e.message || String(e) });
    process.exit(1);
  } finally {
    db.close(() => process.exit(0));
  }
})();
