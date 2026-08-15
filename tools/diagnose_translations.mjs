/**
 * Diagnostic script to trace Russian translations through the data flow
 */

import sqlite3 from 'sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';
import { promisify } from 'util';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const dbPath = path.join(__dirname, '../database/rustic-charm.sqlite');
const db = new sqlite3.Database(dbPath);

const dbAll = promisify(db.all.bind(db));
const dbGet = promisify(db.get.bind(db));

async function diagnose() {
  try {
    console.log('='.repeat(80));
    console.log('RUSSIAN TRANSLATION DATA FLOW DIAGNOSTIC');
    console.log('='.repeat(80));
    
    // Step 1: Find a menu item with Russian translation
    console.log('\n1. FINDING MENU ITEMS WITH RUSSIAN TRANSLATIONS...\n');
    
    const itemsWithRussian = await dbAll(`
      SELECT DISTINCT mi.id, mi.name as english_name, mt.name as russian_name
      FROM menu_items mi
      INNER JOIN menu_translations mt ON mi.id = mt.menu_item_id
      WHERE mt.language_code = 'ru'
      LIMIT 5
    `);
    
    if (itemsWithRussian.length === 0) {
      console.log('ERROR: No items with Russian translations found!');
      process.exit(1);
    }
    
    console.log(`Found ${itemsWithRussian.length} items with Russian translations:\n`);
    itemsWithRussian.forEach((item, i) => {
      console.log(`${i + 1}. English: "${item.english_name}"`);
      console.log(`   Russian: "${item.russian_name}"`);
      console.log(`   ID: ${item.id}\n`);
    });
    
    // Use the first one for testing
    const testItem = itemsWithRussian[0];
    const testItemId = testItem.id;
    
    console.log('='.repeat(80));
    console.log(`\n2. CHECKING SQLITE DIRECTLY FOR ITEM: "${testItem.english_name}"\n`);
    
    // Check menu_items
    const menuItem = await dbGet(
      'SELECT * FROM menu_items WHERE id = ?',
      [testItemId]
    );
    console.log('menu_items row:');
    console.log(JSON.stringify(menuItem, null, 2));
    
    // Check menu_translations
    const translations = await dbAll(
      'SELECT * FROM menu_translations WHERE menu_item_id = ?',
      [testItemId]
    );
    console.log('\nmenu_translations rows:');
    console.log(JSON.stringify(translations, null, 2));
    
    console.log('\n' + '='.repeat(80));
    console.log('\n3. SIMULATING BACKEND getMenuItems() FUNCTION\n');
    
    // Simulate what the backend does
    const rows = await dbAll(
      `SELECT menu_items.*, categories.name AS cat_join_name
       FROM menu_items
       LEFT JOIN categories ON menu_items.category_id = categories.id
       WHERE menu_items.id = ?`,
      [testItemId]
    );
    
    const translationsRows = await dbAll(
      `SELECT menu_item_id, language_code, name, description FROM menu_translations`
    );
    
    // Build translations map (exactly like backend)
    const translationsMap = {};
    for (const trans of translationsRows) {
      if (!translationsMap[trans.menu_item_id]) {
        translationsMap[trans.menu_item_id] = {};
      }
      translationsMap[trans.menu_item_id][trans.language_code] = {
        name: trans.name,
        description: trans.description,
      };
    }
    
    // Build response (exactly like backend)
    const backendResponse = rows.map((row) => ({
      id: row.id,
      categoryId: row.category_id,
      category: row.cat_join_name || row.category_name || row.category_id || "",
      name: row.name,
      description: row.description || "",
      price: Number(row.price || 0),
      imageUrl: row.image_url || "",
      image: row.image_url || "",
      isVeg: row.is_veg === 1,
      isAvailable: row.is_available === 1,
      isPopular: row.is_popular === 1,
      prepTime: row.prep_time,
      rating: Number(row.rating || 0),
      translations: translationsMap[row.id] || {},
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }))[0];
    
    console.log('Backend API response would be:');
    console.log(JSON.stringify(backendResponse, null, 2));
    
    console.log('\n' + '='.repeat(80));
    console.log('\n4. CHECKING TRANSLATION STRUCTURE IN RESPONSE\n');
    
    console.log(`translations field exists: ${!!backendResponse.translations}`);
    console.log(`translations is object: ${typeof backendResponse.translations === 'object'}`);
    console.log(`Russian translation exists: ${!!backendResponse.translations.ru}`);
    
    if (backendResponse.translations.ru) {
      console.log(`Russian name: "${backendResponse.translations.ru.name}"`);
      console.log(`Russian description: "${backendResponse.translations.ru.description}"`);
    }
    
    console.log('\n' + '='.repeat(80));
    console.log('\nDIAGNOSTIC COMPLETE');
    console.log('='.repeat(80) + '\n');
    
    process.exit(0);
  } catch (error) {
    console.error('Diagnostic error:', error);
    process.exit(1);
  } finally {
    db.close();
  }
}

diagnose();
