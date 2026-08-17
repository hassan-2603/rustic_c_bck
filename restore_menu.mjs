import fs from 'fs';
import path from 'path';
import sqlite3 from 'sqlite3';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Read menu data from frontend
function extractArrayFromTs(filePath) {
  const txt = fs.readFileSync(filePath, 'utf8');
  const m = txt.match(/export\s+const\s+menuItems\s*=\s*(\[([\s\S]*?)\])\s*;/m);
  if (!m) throw new Error('menuItems export not found in ' + filePath);
  const arrText = m[1];
  return JSON.parse(arrText);
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
      const filePath = path.join(__dirname, '..', 'frontend', 'src', 'data', 'menudata.ts');
      console.log('Reading from:', filePath);
      
      const items = extractArrayFromTs(filePath);
      console.log('Found', items.length, 'menu items');

      // Get unique categories from items
      const categoryMap = {};
      items.forEach((item) => {
        const catName = item.category;
        if (!categoryMap[catName]) {
          categoryMap[catName] = {
            id: 'cat-' + catName.toLowerCase().replace(/\s+/g, '-'),
            name: catName,
            displayOrder: Object.keys(categoryMap).length,
          };
        }
      });

      const categories = Object.values(categoryMap);
      console.log('Found', categories.length, 'categories');

      // Delete existing items and categories
      await run('DELETE FROM menu_items');
      await run('DELETE FROM categories');
      console.log('Cleared existing data');

      // Insert categories
      for (const cat of categories) {
        await run(
          `INSERT INTO categories (id, name, display_order, is_active) VALUES (?, ?, ?, 1)`,
          [cat.id, cat.name, cat.displayOrder]
        );
      }
      console.log('Inserted', categories.length, 'categories');

      // Insert menu items
      let insertedCount = 0;
      for (const item of items) {
        const catId = categoryMap[item.category]?.id;
        await run(
          `INSERT INTO menu_items (id, name, description, price, category_id, is_veg, rating, prep_time, image_url, is_available)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`,
          [
            item.id || ('item-' + Math.random().toString(36).substr(2, 9)),
            item.name,
            item.description || '',
            item.price || 0,
            catId,
            item.isVeg ? 1 : 0,
            item.rating || 0,
            item.prepTime ? parseInt(item.prepTime) : 15,
            item.image || '',
          ]
        );
        insertedCount++;
      }
      console.log('Inserted', insertedCount, 'menu items');

      const finalCats = await all('SELECT COUNT(*) as count FROM categories');
      const finalItems = await all('SELECT COUNT(*) as count FROM menu_items');
      console.log('Final database state:');
      console.log('- Categories:', finalCats[0].count);
      console.log('- Menu Items:', finalItems[0].count);

      process.exit(0);
    } catch (err) {
      console.error('Error:', err);
      process.exit(1);
    } finally {
      db.close();
    }
  })();
});
