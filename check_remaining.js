import xlsx from 'xlsx';
import sqlite3 from 'sqlite3';
import { promisify } from 'util';

const db = new sqlite3.Database('./database/rustic-charm.sqlite');
const dbAll = promisify(db.all.bind(db));

async function check() {
  const workbook = xlsx.readFile('../frontend/src/data/menu-translation.xlsx');
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const data = xlsx.utils.sheet_to_json(sheet);
  const excel = data.map(r => ({
    en: String(r['English'] || r['Menu Item'] || r['Item Name'] || r['English Name'] || r['Name'] || Object.values(r)[0] || '').trim(),
    ru: String(r['Russian'] || r['RU'] || r['Translation'] || r['Russian Name'] || Object.values(r)[1] || '').trim()
  })).filter(x => x.en && x.ru);

  const missing = await dbAll(`
    SELECT m.id, m.name
    FROM menu_items m
    LEFT JOIN menu_translations t ON m.id = t.menu_item_id AND t.language_code = 'ru'
    WHERE t.id IS NULL OR t.name IS NULL OR TRIM(t.name) = ''
  `);

  console.log('Total remaining missing:', missing.length);

  for (const m of missing) {
    let name = m.name;
    try { name = JSON.parse(name).English || name; } catch(e){}
    name = String(name).trim();

    const words = name.toLowerCase().replace(/[^a-z0-9]/g, ' ').split(' ').filter(w => w.length > 2);
    const matches = excel.filter(e => {
      const eLower = e.en.toLowerCase();
      return words.filter(w => eLower.includes(w)).length >= Math.min(2, words.length);
    });

    if (matches.length > 0) {
      console.log(`DB: "${name}" => Excel: ${matches.map(x => `"${x.en}"`).join(', ')}`);
    }
  }
  db.close();
}
check();
