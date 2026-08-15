import { openDatabase } from "../config/database.js";

async function inspect() {
  const db = openDatabase();
  const all = (sql, params=[]) => new Promise((res, rej) => db.all(sql, params, (err, rows) => err ? rej(err) : res(rows)));
  try {
    const cats = await all('SELECT COUNT(*) as cnt FROM categories');
    const menus = await all('SELECT COUNT(*) as cnt FROM menu_items');
    const tables = await all('SELECT COUNT(*) as cnt FROM tables');
    console.log('categories:', cats[0]?.cnt || 0);
    console.log('menu_items:', menus[0]?.cnt || 0);
    console.log('tables:', tables[0]?.cnt || 0);
    const sampleCats = await all('SELECT id,name FROM categories LIMIT 10');
    console.log('sample categories:', sampleCats);
    const sampleMenus = await all('SELECT id,name FROM menu_items LIMIT 10');
    console.log('sample menu items:', sampleMenus);
  } catch (e) {
    console.error('inspect error', e);
  } finally {
    db.close(() => process.exit(0));
  }
}

inspect();
