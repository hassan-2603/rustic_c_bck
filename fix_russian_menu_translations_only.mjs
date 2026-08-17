import fs from 'fs';
import path from 'path';
import sqlite3 from 'sqlite3';
import { randomUUID } from 'crypto';
import { fileURLToPath } from 'url';
import XLSX from 'xlsx';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const dbPath = path.join(__dirname, 'database', 'rustic-charm.sqlite');
const excelPath = path.join(__dirname, '..', 'frontend', 'src', 'data', 'menu-translation.xlsx');
const backupPath = path.join(__dirname, 'database', `rustic-charm.sqlite.backup-${Date.now()}`);

function normalizeEnglishName(value) {
  if (value === null || value === undefined) return '';
  let text = String(value).trim();

  if (text.startsWith('{') || text.startsWith('[')) {
    try {
      const parsed = JSON.parse(text);
      const english = typeof parsed === 'object' && parsed !== null
        ? (parsed.English || parsed.en || Object.values(parsed)[0])
        : null;
      if (english) text = String(english);
    } catch {
      // ignore invalid JSON and continue with the raw string
    }
  }

  return String(text)
    .normalize('NFKC')
    .replace(/['’`]/g, '')
    .replace(/&/g, ' and ')
    .replace(/[^a-zA-Z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeForMatch(value) {
  return normalizeEnglishName(value).toLowerCase();
}

function getExcelEnglishName(row) {
  const preferredKeys = ['English', 'Menu Item', 'Item Name', 'English Name', 'Name'];
  for (const key of preferredKeys) {
    if (row[key] !== undefined && row[key] !== null && String(row[key]).trim()) {
      return String(row[key]).trim();
    }
  }
  for (const value of Object.values(row)) {
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return '';
}

function getExcelRussianName(row) {
  const preferredKeys = ['Recommended Option', 'Russian', 'RU', 'Translation', 'Russian Name'];
  for (const key of preferredKeys) {
    if (row[key] !== undefined && row[key] !== null && String(row[key]).trim()) {
      return String(row[key]).trim();
    }
  }
  for (const value of Object.values(row)) {
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return '';
}

const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error('Unable to open SQLite database:', err.message);
    process.exit(1);
  }
});

const run = (sql, params = []) => new Promise((resolve, reject) => {
  db.run(sql, params, function onRun(err) {
    if (err) reject(err);
    else resolve({ lastID: this.lastID, changes: this.changes });
  });
});
const all = (sql, params = []) => new Promise((resolve, reject) => {
  db.all(sql, params, (err, rows) => {
    if (err) reject(err);
    else resolve(rows);
  });
});
const get = (sql, params = []) => new Promise((resolve, reject) => {
  db.get(sql, params, (err, row) => {
    if (err) reject(err);
    else resolve(row);
  });
});

async function main() {
  if (!fs.existsSync(excelPath)) {
    throw new Error(`Excel file not found: ${excelPath}`);
  }

  fs.copyFileSync(dbPath, backupPath);
  console.log(`Backup created at: ${backupPath}`);

  const workbook = XLSX.readFile(excelPath);
  const sheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json(sheet, { defval: '' });

  const excelEntries = [];
  for (const row of rows) {
    const en = getExcelEnglishName(row);
    const ru = getExcelRussianName(row);
    if (!en || !ru) continue;
    excelEntries.push({ english: en.trim(), russian: ru.trim() });
  }

  const excelIndex = new Map();
  for (const entry of excelEntries) {
    const key = normalizeForMatch(entry.english);
    if (!key) continue;
    excelIndex.set(key, entry);
  }

  const menuItems = await all('SELECT id, name FROM menu_items ORDER BY name');
  const currentRu = await all("SELECT menu_item_id, name FROM menu_translations WHERE language_code = 'ru'");
  const currentRuMap = new Map(currentRu.map((row) => [row.menu_item_id, row.name]));

  let inserted = 0;
  let updated = 0;
  let unchanged = 0;
  const unmatched = [];

  for (const item of menuItems) {
    const englishName = normalizeEnglishName(item.name);
    if (!englishName) continue;

    const matchKey = normalizeForMatch(englishName);
    const excelMatch = excelIndex.get(matchKey);
    if (!excelMatch) {
      unmatched.push(englishName);
      continue;
    }

    const desiredRussian = excelMatch.russian.trim();
    const existingRussian = currentRuMap.get(item.id);

    if (existingRussian === desiredRussian) {
      unchanged++;
      continue;
    }

    if (existingRussian) {
      await run(
        'UPDATE menu_translations SET name = ?, updated_at = ? WHERE menu_item_id = ? AND language_code = ?',
        [desiredRussian, new Date().toISOString(), item.id, 'ru']
      );
      updated++;
    } else {
      await run(
        'INSERT INTO menu_translations (id, menu_item_id, language_code, name, description, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [randomUUID(), item.id, 'ru', desiredRussian, '', new Date().toISOString(), new Date().toISOString()]
      );
      inserted++;
    }
  }

  const finalRuCount = (await get("SELECT COUNT(*) as c FROM menu_translations WHERE language_code = 'ru'"))?.c ?? 0;
  const missingCount = (await get(
    `SELECT COUNT(*) as c
     FROM menu_items m
     LEFT JOIN menu_translations t ON m.id = t.menu_item_id AND t.language_code = 'ru'
     WHERE t.id IS NULL OR t.name IS NULL OR TRIM(t.name) = ''`
  ))?.c ?? 0;

  console.log('\n=== RUSSIAN MENU TRANSLATION UPDATE REPORT ===');
  console.log(`Excel entries loaded: ${excelEntries.length}`);
  console.log(`Menu items checked: ${menuItems.length}`);
  console.log(`Inserted RU rows: ${inserted}`);
  console.log(`Updated existing RU rows: ${updated}`);
  console.log(`Unchanged RU rows: ${unchanged}`);
  console.log(`Unmatched menu items: ${unmatched.length}`);
  console.log(`Final RU row count: ${finalRuCount}`);
  console.log(`Missing RU rows after update: ${missingCount}`);

  if (unmatched.length > 0) {
    console.log('\nSample unmatched menu item names:');
    unmatched.slice(0, 25).forEach((item) => console.log(`- ${item}`));
  }

  db.close();
}

main().catch((error) => {
  console.error('Translation repair failed:', error);
  db.close();
  process.exit(1);
});
