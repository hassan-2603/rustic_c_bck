import XLSX from 'xlsx';
import fs from 'fs';
import path from 'path';
import sqlite3 from 'sqlite3';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

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

  const get = (sql, params = []) => new Promise((res, rej) => {
    db.get(sql, params, (err, row) => {
      if (err) return rej(err);
      res(row);
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
      const excelPath = path.join(__dirname, '..', 'frontend', 'src', 'data', 'menu-translation.xlsx');
      console.log('Reading from:', excelPath);
      
      const workbook = XLSX.readFile(excelPath);
      const worksheet = workbook.Sheets[workbook.SheetNames[0]];
      const data = XLSX.utils.sheet_to_json(worksheet);
      
      console.log('Read', data.length, 'translation rows from Excel');

      // Clear existing Russian translations
      await run('DELETE FROM menu_translations WHERE language_code = ?', ['ru']);
      console.log('Cleared existing Russian translations');

      let updateCount = 0;
      for (const row of data) {
        const englishName = row['English'];
        const russianName = row['Recommended Option'];
        
        if (!englishName || !russianName) continue;

        // Find menu item by English name
        const item = await get('SELECT id FROM menu_items WHERE name = ?', [englishName]);
        
        if (item) {
          // Insert translation
          await run(
            `INSERT INTO menu_translations (id, menu_item_id, language_code, name, description)
             VALUES (?, ?, 'ru', ?, ?)`,
            [
              `trans-${item.id}-ru`,
              item.id,
              russianName,
              ''
            ]
          );
          updateCount++;
          if (updateCount <= 5 || updateCount % 100 === 0) {
            console.log(`✓ ${englishName} -> ${russianName}`);
          }
        }
      }

      console.log('\\n✅ Successfully applied', updateCount, 'Russian translations from Excel file!');
      process.exit(0);
    } catch (err) {
      console.error('Error:', err.message);
      process.exit(1);
    } finally {
      db.close();
    }
  })();
});
