import sqlite3 from 'sqlite3';
import { promisify } from 'util';

const db = new sqlite3.Database('./database/rustic-charm.sqlite');
const dbAll = promisify(db.all.bind(db));
const dbGet = promisify(db.get.bind(db));
const dbRun = (...args) => new Promise((res, rej) =>
  db.run(...args, function(err) { if (err) rej(err); else res(this); })
);

async function run() {
  console.log('=== BEFORE UPDATE ===');
  const beforeDist = await dbAll(`SELECT image_url, COUNT(*) as count FROM menu_items GROUP BY image_url`);
  console.log('Image distribution before:', beforeDist);

  const oldUrl = '/placeholder-food.jpg';
  const newUrl = '/placeholder-no-image.jpg';

  const oldCountRow = await dbGet(`SELECT COUNT(*) as c FROM menu_items WHERE image_url = ?`, [oldUrl]);
  const oldCount = oldCountRow.c;
  console.log(`Menu items with old default image (${oldUrl}): ${oldCount}`);

  const updateResult = await dbRun(
    `UPDATE menu_items SET image_url = ?, updated_at = ? WHERE image_url = ?`,
    [newUrl, new Date().toISOString(), oldUrl]
  );
  console.log(`Rows updated: ${updateResult.changes}`);

  console.log('\n=== AFTER UPDATE ===');
  const afterDist = await dbAll(`SELECT image_url, COUNT(*) as count FROM menu_items GROUP BY image_url`);
  console.log('Image distribution after:', afterDist);

  const remainingOldRow = await dbGet(`SELECT COUNT(*) as c FROM menu_items WHERE image_url = ?`, [oldUrl]);
  console.log(`Menu items still using old image URL (${oldUrl}): ${remainingOldRow.c}`);

  const newCountRow = await dbGet(`SELECT COUNT(*) as c FROM menu_items WHERE image_url = ?`, [newUrl]);
  console.log(`Menu items using new image URL (${newUrl}): ${newCountRow.c}`);

  db.close();
}

run().catch(err => {
  console.error(err);
  db.close();
});
