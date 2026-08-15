import fs from 'fs';
import path from 'path';
import { getSqliteDb } from '../config/database.js';
import {
  getCategories,
  addCategory,
  getMenuItems,
  addMenuItem,
} from '../services/adminService.js';

function extractArrayFromTs(filePath) {
  const txt = fs.readFileSync(filePath, 'utf8');
  const m = txt.match(/export\s+const\s+menuItems\s*=\s*(\[([\s\S]*?)\])\s*;/m);
  if (!m) throw new Error('menuItems export not found in ' + filePath);
  const arrText = m[1];
  return JSON.parse(arrText);
}

async function run() {
  const db = getSqliteDb();
  // wrap callback-style sqlite3.Database with Promise-based methods expected by services
  const dbp = {
    all: (sql, params=[]) => new Promise((res, rej) => db.all(sql, params, (err, rows) => err ? rej(err) : res(rows))),
    get: (sql, params=[]) => new Promise((res, rej) => db.get(sql, params, (err, row) => err ? rej(err) : res(row))),
    run: (sql, params=[]) => new Promise((res, rej) => db.run(sql, params, function(err) { if (err) return rej(err); res({ lastID: this.lastID, changes: this.changes }); })),
    exec: (sql) => new Promise((res, rej) => db.exec(sql, (err) => err ? rej(err) : res()))
  };
  const filePath = path.join('frontend','src','data','menudata.ts');
  if (!fs.existsSync(filePath)) {
    console.error('menudata.ts not found at', filePath);
    process.exit(1);
  }

  const items = extractArrayFromTs(filePath);
  console.log('Found', items.length, 'items');

  // wait until schema is initialized (categories table exists)
  const waitFor = (ms) => new Promise((r) => setTimeout(r, ms));
  let tries = 0;
  while (tries < 50) {
    try {
      const rows = await new Promise((res, rej) => db.all("SELECT name FROM sqlite_master WHERE type='table' AND name='categories'", [], (err, rows) => err ? rej(err) : res(rows)));
      if (rows && rows.length) break;
    } catch (e) {}
    await waitFor(100);
    tries++;
  }

  console.log('Schema check done (or timed out after', tries, 'tries)');
  let existingCats;
  try {
    console.log('Fetching existing categories...');
    existingCats = await getCategories(dbp);
    console.log('Existing categories count:', existingCats && existingCats.length);
  } catch (err) {
    console.error('Error fetching existing categories:', err && err.stack ? err.stack : err);
    throw err;
  }
  const catByName = new Map(existingCats.map(c => [c.name, c]));

  // ensure categories
  const catMap = {};
  for (const item of items) {
    const name = item.category || 'Uncategorized';
    if (catByName.has(name)) {
      catMap[name] = catByName.get(name).id;
      continue;
    }
    try {
      const created = await addCategory(dbp, { name, isActive: true });
      catMap[name] = created.id;
      catByName.set(name, created);
      console.log('Created category', name, '->', created.id);
    } catch (err) {
      console.error('Error creating category', name, err && err.stack ? err.stack : err);
      throw err;
    }
  }

  let existingMenu;
  try {
    existingMenu = await getMenuItems(dbp);
    console.log('Existing menu items count:', existingMenu && existingMenu.length);
  } catch (err) {
    console.error('Error fetching existing menu items:', err && err.stack ? err.stack : err);
    throw err;
  }
  const existingKeys = new Set(existingMenu.map(m => `${m.name}||${m.categoryId || ''}`.toLowerCase()));

  let created = 0;
  for (const it of items) {
    const name = it.name || it.title || 'Unnamed';
    const categoryId = catMap[it.category] || null;
    const key = `${name}||${categoryId || ''}`.toLowerCase();
    if (existingKeys.has(key)) continue;
    const body = {
      name,
      description: it.description || '',
      price: Number(it.price || 0) || 0,
      imageUrl: it.image || it.image_url || '',
      categoryId,
      isVeg: it.isVeg === false ? false : true,
      isAvailable: it.isAvailable === false ? false : true,
      isPopular: it.isPopular ? true : false,
    };
    await addMenuItem(dbp, body);
    created++;
    if (created % 50 === 0) console.log('created', created, 'items');
  }

  console.log('Done. Created', created, 'new menu items.');
  process.exit(0);
}

run().catch(e=>{ console.error(e); process.exit(1); });
