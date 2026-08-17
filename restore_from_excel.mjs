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
      
      if (!fs.existsSync(excelPath)) {
        throw new Error('menu-translation.xlsx not found!');
      }

      const workbook = XLSX.readFile(excelPath);
      console.log('Sheet names:', workbook.SheetNames);
      
      // Get first sheet (assuming it has the translations)
      const sheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[sheetName];
      const data = XLSX.utils.sheet_to_json(worksheet);
      
      console.log('Read', data.length, 'rows from Excel');
      console.log('Sample row:', data[0]);

      // Map Excel columns to translations
      let updateCount = 0;
      for (const row of data) {
        // Assuming columns: English name, Russian name, Category, etc.
        const englishName = row['English'] || row['Menu Items'] || row['Item'] || Object.values(row)[0];
        const russianName = row['Russian'] || row['Русский'] || Object.values(row)[1];
        
        if (!englishName || !russianName) continue;

        // Find menu item by English name
        const item = await get('SELECT id FROM menu_items WHERE name = ?', [englishName]);
        
        if (item) {
          // Delete old translation
          await run('DELETE FROM menu_translations WHERE menu_item_id = ? AND language_code = ?', [item.id, 'ru']);
          
          // Insert new translation
          await run(
            `INSERT INTO menu_translations (id, menu_item_id, language_code, name, description)
             VALUES (?, ?, 'ru', ?, ?)`,
            [
              `trans-${item.id}-ru-${Date.now()}`,
              item.id,
              russianName,
              ''
            ]
          );
          updateCount++;
          console.log(`✓ ${englishName} -> ${russianName}`);
        }
      }

      console.log('\\n✅ Applied', updateCount, 'translations from Excel file!');
      process.exit(0);
    } catch (err) {
      console.error('Error:', err.message);
      process.exit(1);
    } finally {
      db.close();
    }
  })();
});
