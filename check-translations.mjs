import { openDatabase } from "./config/database.js";

console.log("Starting check-translations.mjs...");

async function checkTranslations() {
  console.log("Opening database...");
  const db = openDatabase();
  console.log("Database opened");
  
  // Add a timeout  
  setTimeout(() => {
    console.error("Timeout: Script taking too long");
    process.exit(1);
  }, 5000);
  
  const all = (sql, params=[]) => new Promise((res, rej) => db.all(sql, params, (err, rows) => err ? rej(err) : res(rows)));
  try {
    // Check Russian translations
    console.log("Querying Russian translations count...");
    const ru_count = await all("SELECT COUNT(*) as count FROM menu_translations WHERE language_code='ru'");
    console.log("Russian translations in DB:", ru_count[0]?.count || 0);

    // Check what's in the tables
    const items_count = await all("SELECT COUNT(*) as count FROM menu_items");
    console.log("Menu items in DB:", items_count[0]?.count || 0);

    // Sample a translation
    const sample = await all(`
      SELECT menu_item_id, language_code, name, description 
      FROM menu_translations 
      WHERE language_code='ru' 
      LIMIT 3
    `);
    console.log("Sample Russian translations:", JSON.stringify(sample, null, 2));

    // Now test what the getMenuItems function would return
    // Get all translations for one item
    const testItem = await all("SELECT id FROM menu_items LIMIT 1");
    if (testItem.length > 0) {
      const itemId = testItem[0].id;
      console.log("\nTesting with item ID:", itemId);
      
      const itemTranslations = await all(
        "SELECT menu_item_id, language_code, name, description FROM menu_translations WHERE menu_item_id = ?",
        [itemId]
      );
      console.log("Translations for this item:", JSON.stringify(itemTranslations, null, 2));
    }
  } catch (e) {
    console.error('error', e);
  } finally {
    db.close(() => process.exit(0));
  }
}

checkTranslations();
