import fs from 'fs';
import path from 'path';
import sqlite3 from 'sqlite3';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Read translations
function extractTranslations(filePath) {
  const txt = fs.readFileSync(filePath, 'utf8');
  const m = txt.match(/export\s+const\s+RUSSIAN_TRANSLATIONS[^=]*=\s*(\{[\s\S]*?\})\s*;/);
  if (!m) throw new Error('RUSSIAN_TRANSLATIONS not found');
  const objText = m[1];
  return eval(`(${objText})`);
}

const db = new sqlite3.Database(path.join(__dirname, 'database', 'rustic-charm.sqlite'), (err) => {
  if (err) {
    console.error('Error opening database:', err);
    process.exit(1);
  }

  const run = (sql, params = []) => new Promise((res, rej) => {
    db.run(sql, params, function(err) {
      if (err) return rej(err);
      res({ lastID: this.lastID, changes: this.changes });
    });
  });

  const all = (sql, params = []) => new Promise((res, rej) => {
    db.all(sql, params, (err, rows) => {
      if (err) return rej(err);
      res(rows);
    });
  });

  (async () => {
    try {
      const filePath = path.join(__dirname, '..', 'frontend', 'src', 'data', 'menuTranslations.ts');
      console.log('Reading translations from:', filePath);
      
      const translations = extractTranslations(filePath);
      console.log('Found', Object.keys(translations).length, 'translation entries');

      // Get all menu items
      const items = await all('SELECT id, name FROM menu_items');
      console.log('Found', items.length, 'menu items in database');

      let updateCount = 0;
      for (const item of items) {
        const translatedName = translations[item.name];
        if (translatedName) {
          await run(
            `INSERT OR REPLACE INTO menu_translations (id, menu_item_id, language_code, name, description)
             VALUES (?, ?, 'ru', ?, ?)`,
            [
              `trans-${item.id}-ru`,
              item.id,
              translatedName,
              '' // description
            ]
          );
          updateCount++;
        }
      }
      console.log('Applied', updateCount, 'Russian translations to menu items');

      // Get all categories
      const cats = await all('SELECT id, name FROM categories');
      console.log('Found', cats.length, 'categories in database');

      let catUpdateCount = 0;
      for (const cat of cats) {
        const translatedName = translations[cat.name];
        if (translatedName) {
          // For now just log, since we haven't added category_translations table
          console.log('Category translation found:', cat.name, '->', translatedName);
          catUpdateCount++;
        }
      }
      console.log('Found', catUpdateCount, 'category translations (note: category translations not stored yet)');

      console.log('\\n✅ Translations restored!');
      process.exit(0);
    } catch (err) {
      console.error('Error:', err.message);
      process.exit(1);
    } finally {
      db.close();
    }
  })();
});
