import sqlite3 from 'sqlite3';
import { getDatabasePath } from '../config/database.js';

const dbPath = getDatabasePath();
const db = new sqlite3.Database(dbPath, sqlite3.OPEN_READONLY);
const all = (sql, p=[]) => new Promise((res,rej) => db.all(sql, p, (err,rows) => err?rej(err):res(rows)));

async function main() {
  // The 5 NULL category items - what are they?
  const nullItems = await all('SELECT id, name, category_id FROM menu_items WHERE category_id IS NULL');
  console.log('\n=== ITEMS WITH NULL category_id ===');
  nullItems.forEach(i => console.log(' -', i.name));

  // Check what the admin panel sees for these items
  const adminView = await all(
    'SELECT mi.id, mi.name, mi.category_id, c.name as cat_name FROM menu_items mi LEFT JOIN categories c ON mi.category_id = c.id WHERE mi.category_id IS NULL LIMIT 10'
  );
  console.log('\n=== ADMIN VIEW (LEFT JOIN) for NULL items ===');
  adminView.forEach(i => console.log(' -', i.name, '| category:', i.cat_name || '(none)'));

  // Check what category name the admin panel would show for ALL items
  // Admin getMenuItems uses: category: row.category_name || row.category_id || ""
  const allItems = await all(
    `SELECT mi.name, mi.category_id, c.name as category_name 
     FROM menu_items mi 
     LEFT JOIN categories c ON mi.category_id = c.id 
     ORDER BY mi.created_at DESC LIMIT 30`
  );
  console.log('\n=== MOST RECENT 30 MENU ITEMS (what admin + customer sees) ===');
  allItems.forEach(i => {
    const cat = i.category_name || i.category_id || '(NONE)';
    console.log(` - ${i.name} | category: ${cat}`);
  });

  // Count items per category
  const countPerCat = await all(
    `SELECT c.name as cat_name, COUNT(mi.id) as item_count
     FROM categories c
     LEFT JOIN menu_items mi ON mi.category_id = c.id
     GROUP BY c.id
     ORDER BY item_count DESC`
  );
  console.log('\n=== ITEMS PER CATEGORY ===');
  countPerCat.forEach(r => console.log(` ${r.item_count} items - ${r.cat_name}`));

  db.close(() => {});
}
main().catch(e => { console.error(e.message); db.close(() => {}); });
