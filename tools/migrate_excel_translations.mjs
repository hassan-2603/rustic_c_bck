import sqlite3 from 'sqlite3';
import path from 'path';
import XLSX from 'xlsx';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const excelPath = path.join(__dirname, '..', '..', 'frontend', 'src', 'data', 'menu-translation.xlsx');
const dbPath = path.join(__dirname, '..', 'database', 'rustic-charm.sqlite');

function cleanStr(s) {
  return String(s || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/[’']/g, "'");
}

async function migrate() {
  const wb = XLSX.readFile(excelPath);
  const sheetData = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]]);

  const excelMap = new Map();
  sheetData.forEach(row => {
    const eng = String(row['English'] || row['english'] || '').trim();
    const ru = String(row['Recommended Option'] || row['Russian'] || row['ru'] || '').trim();
    if (eng && ru) {
      excelMap.set(cleanStr(eng), ru);
    }
  });

  console.log(`Loaded ${excelMap.size} valid Russian translations from Excel.`);

  const db = new sqlite3.Database(dbPath);
  const all = (sql, p=[]) => new Promise((res, rej) => db.all(sql, p, (err, rows) => err ? rej(err) : res(rows)));
  const run = (sql, p=[]) => new Promise((res, rej) => db.run(sql, p, function(err) { err ? rej(err) : res(this); }));

  const items = await all('SELECT id, name FROM menu_items');
  let updatedCount = 0;
  let skippedCount = 0;

  for (const item of items) {
    let nameObj = {};
    let rawName = item.name;

    if (rawName && typeof rawName === 'string' && rawName.trim().startsWith('{')) {
      try {
        nameObj = JSON.parse(rawName);
      } catch {
        nameObj = { English: rawName };
      }
    } else if (typeof rawName === 'object' && rawName !== null) {
      nameObj = { ...rawName };
    } else {
      nameObj = { English: String(rawName || '') };
    }

    const engName = String(nameObj.English || nameObj.en || (typeof rawName === 'string' ? rawName : '') || '').trim();
    const ruFromExcel = excelMap.get(cleanStr(engName));

    if (ruFromExcel) {
      nameObj.English = engName || nameObj.English;
      nameObj.Russian = ruFromExcel;
      const updatedNameJson = JSON.stringify(nameObj);

      await run('UPDATE menu_items SET name = ? WHERE id = ?', [updatedNameJson, item.id]);
      updatedCount++;
    } else {
      skippedCount++;
    }
  }

  console.log(`Migration Complete:`);
  console.log(`- Total menu items checked: ${items.length}`);
  console.log(`- Updated Russian names from Excel: ${updatedCount}`);
  console.log(`- Skipped (not found or empty in Excel): ${skippedCount}`);

  db.close();
}

migrate().catch(err => {
  console.error('Migration failed:', err);
  process.exit(1);
});
