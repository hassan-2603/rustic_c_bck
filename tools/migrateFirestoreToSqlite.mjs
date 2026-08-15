import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import sqlite3 from 'sqlite3';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const serviceKeyPath = path.join(__dirname, '..', 'serviceAccountKey.json');
if (!fs.existsSync(serviceKeyPath)) {
  console.error('serviceAccountKey.json not found at backend/serviceAccountKey.json. Place your Firebase service account there and re-run.');
  process.exit(1);
}

import admin from 'firebase-admin';

admin.initializeApp({
  credential: admin.credential.cert(serviceKeyPath)
});

const firestore = admin.firestore();

import { getDatabasePath } from '../config/database.js';

function openDb() {
  const dbPath = getDatabasePath();
  return new sqlite3.Database(dbPath, sqlite3.OPEN_READWRITE, (err) => {
    if (err) {
      console.error('Failed to open sqlite db:', err.message || err);
      process.exit(1);
    }
  });
}

const db = openDb();
const run = (sql, params=[]) => new Promise((res, rej) => db.run(sql, params, function(err){ if (err) rej(err); else res(this); }));
const all = (sql, params=[]) => new Promise((res, rej) => db.all(sql, params, (err, rows) => err ? rej(err) : res(rows)));

async function migrateCategories() {
  console.log('Migrating categories...');
  const snap = await firestore.collection('categories').get();
  for (const doc of snap.docs) {
    const data = doc.data();
    const id = doc.id;
    const name = data.name || data.title || 'Unnamed';
    const is_active = data.is_active === false ? 0 : 1;
    const display_order = data.display_order || 0;
    await run(`INSERT OR REPLACE INTO categories (id,name,is_active,display_order,created_at,updated_at) VALUES (?, ?, ?, ?, datetime('now'), datetime('now'))`, [id, name, is_active, display_order]);
  }
}

async function migrateTables() {
  console.log('Migrating tables...');
  const snap = await firestore.collection('tables').get();
  for (const doc of snap.docs) {
    const data = doc.data();
    const id = doc.id;
    const table_key = data.table_key || id;
    const table_number = data.table_number || data.number || 0;
    const area = data.area || 'table';
    const area_label = data.area_label || 'Table';
    const display_name = data.display_name || `Table ${table_number}`;
    const occupied = data.occupied ? 1 : 0;
    const status = data.status || 'available';
    await run(`INSERT OR REPLACE INTO tables (id,table_key,table_number,area,area_label,display_name,occupied,status,created_at,updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))`, [id, table_key, table_number, area, area_label, display_name, occupied, status]);
  }
}

async function migrateMenuItems() {
  console.log('Migrating menu items...');
  // try collection names that might be used
  const candidates = ['menu', 'menu_items', 'items', 'restaurant_menu'];
  let snap = null;
  for (const c of candidates) {
    const s = await firestore.collection(c).limit(1).get();
    if (!s.empty) { snap = await firestore.collection(c).get(); break; }
  }
  if (!snap) {
    console.warn('No menu collection found in Firestore. Skipping menu migration.');
    return;
  }
  for (const doc of snap.docs) {
    const data = doc.data();
    const id = doc.id;
    const name = data.name || data.title || 'Unnamed';
    const description = data.description || '';
    const price = Number(data.price || data.cost || 0) || 0;
    const category_id = data.categoryId || data.category_id || data.category || null;
    const image_url = data.image_url || data.image || '';
    const is_veg = data.is_veg === false ? 0 : 1;
    const is_available = data.is_available === false ? 0 : 1;
    const is_popular = data.is_popular ? 1 : 0;
    const prep_time = data.prep_time || null;
    await run(`INSERT OR REPLACE INTO menu_items (id,category_id,name,description,price,image_url,is_veg,is_available,is_popular,prep_time,created_at,updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))`, [id, category_id, name, description, price, image_url, is_veg, is_available, is_popular, prep_time]);
  }
}

async function migrateOrders() {
  console.log('Migrating orders (basic mapping)...');
  const snap = await firestore.collection('orders').get();
  for (const doc of snap.docs) {
    const data = doc.data();
    const id = doc.id;
    const session_id = data.sessionId || data.session_id || null;
    const table_id = data.tableId || data.table_id || null;
    const table_reference = data.tableReference || data.table_reference || null;
    const order_number = data.order_number || data.orderNo || id;
    const status = data.status || 'Pending';
    const total = Number(data.total || data.amount || 0) || 0;
    const customer_name = data.customerName || data.customer_name || null;
    const customer_phone = data.customerPhone || data.customer_phone || null;
    await run(`INSERT OR REPLACE INTO orders (id,session_id,table_id,table_reference,order_number,status,total,customer_name,customer_phone,created_at,updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))`, [id, session_id, table_id, table_reference, order_number, status, total, customer_name, customer_phone]);

    // order items
    const items = data.items || data.order_items || data.cart || [];
    for (const it of items) {
      const itemId = it.id || it.menuItem?.id || `${id}-${Math.random().toString(36).slice(2,8)}`;
      const name = it.name || it.menuItem?.name || 'Item';
      const menu_item_id = it.menuItem?.id || it.menu_item_id || null;
      const qty = it.quantity || it.qty || 1;
      const price = Number(it.price || it.menuItem?.price || 0) || 0;
      await run(`INSERT OR REPLACE INTO order_items (id,order_id,menu_item_id,name,quantity,price,created_at) VALUES (?, ?, ?, ?, ?, ?, datetime('now'))`, [itemId, id, menu_item_id, name, qty, price]);
    }
  }
}

async function main(){
  try{
    await migrateCategories();
    await migrateTables();
    await migrateMenuItems();
    await migrateOrders();
    console.log('Migration complete.');
  } catch(e) {
    console.error('migration error', e && e.message || e);
    process.exit(1);
  } finally {
    db.close(() => process.exit(0));
  }
}

main();
