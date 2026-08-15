import sqlite3 from "sqlite3";
import { getDatabasePath } from "../config/database.js";

async function run() {
  const dbPath = getDatabasePath();
  console.log('dbPath=', dbPath);
  const db = new sqlite3.Database(dbPath, sqlite3.OPEN_READONLY, (err) => {
    if (err) {
      console.error('open error', err);
      process.exit(1);
    }
  });

  const all = (sql, params=[]) => new Promise((res, rej) => db.all(sql, params, (err, rows) => err ? rej(err) : res(rows)));
  try {
    const categories = await all('SELECT COUNT(*) as cnt FROM categories');
    const menu = await all('SELECT COUNT(*) as cnt FROM menu_items');
    const tables = await all('SELECT COUNT(*) as cnt FROM tables');
    const sampleCats = await all('SELECT id,name FROM categories LIMIT 20');
    const sampleMenu = await all('SELECT id,name,category_id,price FROM menu_items LIMIT 20');
    console.log(JSON.stringify({categories: categories[0]?.cnt||0, menu_items: menu[0]?.cnt||0, tables: tables[0]?.cnt||0, sampleCats, sampleMenu}, null, 2));
  } catch (e) {
    console.error('query error', e && e.message ? e.message : e);
    process.exit(1);
  } finally {
    db.close(() => process.exit(0));
  }
}

run();
