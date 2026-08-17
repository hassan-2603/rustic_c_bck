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
      const translations = extractTranslations(filePath);

      // Get all categories
      const cats = await all('SELECT id, name FROM categories');
      console.log('Updating', cats.length, 'categories with Russian translations...');

      let updateCount = 0;
      for (const cat of cats) {
        const translatedName = translations[cat.name];
        if (translatedName) {
          // Store as JSON with English and Russian
          const jsonName = JSON.stringify({
            English: cat.name,
            Russian: translatedName
          });
          
          await run('UPDATE categories SET name = ? WHERE id = ?', [jsonName, cat.id]);
          updateCount++;
          console.log(`✓ ${cat.name} -> ${translatedName}`);
        }
      }

      console.log('\\n✅ Updated', updateCount, 'categories with Russian translations!');
      process.exit(0);
    } catch (err) {
      console.error('Error:', err.message);
      process.exit(1);
    } finally {
      db.close();
    }
  })();
});
