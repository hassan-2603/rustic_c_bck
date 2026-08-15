import xlsx from 'xlsx';
import sqlite3 from 'sqlite3';
import { randomUUID } from 'crypto';
import { promisify } from 'util';

const dbPath = './database/rustic-charm.sqlite';
const excelPath = '../frontend/src/data/menu-translation.xlsx';

// ─── Normalization helpers ───────────────────────────────────────────────────

/** Full normalization: lowercase, strip punctuation, collapse spaces */
function normalize(s) {
  if (!s) return '';
  return String(s)
    .toLowerCase()
    .replace(/[''`]/g, '')           // apostrophes
    .replace(/[-_/\\+&]/g, ' ')     // separators → space
    .replace(/[^\w\s]/g, '')        // remaining punctuation
    .replace(/\s+/g, ' ')           // collapse whitespace
    .trim();
}

/** Synonym substitution for common food vocabulary */
function applySynonyms(s) {
  return s
    .replace(/\bveg\b/g, 'vegetable')
    .replace(/\bveggies\b/g, 'vegetable')
    .replace(/\bmix\b/g, 'mixed')
    .replace(/\bmixed\b/g, 'mixed')
    .replace(/\bcurd\b/g, 'yogurt')
    .replace(/\byoghurt\b/g, 'yogurt')
    .replace(/\byogurt\b/g, 'yogurt')
    .replace(/\blaccha\b/g, 'lacha')
    .replace(/\blachha\b/g, 'lacha')
    .replace(/\blacha\b/g, 'lacha')
    .replace(/\bpanner\b/g, 'paneer')
    .replace(/\bmasala\b/g, 'masala')
    .replace(/\bchicken\b/g, 'chicken')
    .replace(/\bmutton\b/g, 'mutton')
    .replace(/\bsodium\b/g, 'soda')
    .replace(/\bchoco\b/g, 'chocolate')
    .replace(/\bchocolate\b/g, 'chocolate')
    .replace(/\bstrawb\b/g, 'strawberry')
    .replace(/\bfries\b/g, 'fry')
    .replace(/\bfried\b/g, 'fry')
    .replace(/\bspecial\b/g, 'special')
    .replace(/\bhalf\b/g, 'half')
    .replace(/\bfull\b/g, 'full')
    .replace(/\bor\b/g, '')          // "Butter or Jam" ≈ "Butter Jam"
    .replace(/\s+/g, ' ')
    .trim();
}

/** Sort words for word-order agnostic comparison */
function sortedWords(s) {
  return s.split(' ').sort().join(' ');
}

function fullKey(name) {
  const n = applySynonyms(normalize(name));
  return sortedWords(n);
}

function naiveKey(name) {
  return applySynonyms(normalize(name));
}

// ─── Similarity score (Jaccard on word sets) ────────────────────────────────
function jaccardSimilarity(a, b) {
  const setA = new Set(a.split(' ').filter(Boolean));
  const setB = new Set(b.split(' ').filter(Boolean));
  const intersection = [...setA].filter(w => setB.has(w)).length;
  const union = new Set([...setA, ...setB]).size;
  return union === 0 ? 0 : intersection / union;
}

// ─── Open DB ─────────────────────────────────────────────────────────────────
const db = new sqlite3.Database(dbPath);
const dbAll = promisify(db.all.bind(db));
const dbGet = promisify(db.get.bind(db));
const dbRun = (...args) => new Promise((res, rej) => db.run(...args, function(err) { if (err) rej(err); else res(this); }));

async function run() {
  // 1. Load Excel
  const workbook = xlsx.readFile(excelPath);
  const sheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];
  const data = xlsx.utils.sheet_to_json(sheet);

  // Build Excel map: normalized key → { enName, ruName }
  const excelRows = [];
  for (const row of data) {
    const enName = String(
      row['English'] || row['Menu Item'] || row['Item Name'] ||
      row['English Name'] || row['Name'] || Object.values(row)[0] || ''
    ).trim();
    const ruName = String(
      row['Russian'] || row['RU'] || row['Translation'] ||
      row['Russian Name'] || Object.values(row)[1] || ''
    ).trim();
    if (!enName || !ruName) continue;
    excelRows.push({ enName, ruName });
  }
  console.log(`Excel rows loaded: ${excelRows.length}`);

  // Pre-compute keys for each Excel row
  const excelKeyed = excelRows.map(r => ({
    ...r,
    naiveKey: naiveKey(r.enName),
    fullKey:  fullKey(r.enName),
  }));

  // 2. Load all menu items
  const menuItems = await dbAll(`SELECT id, name FROM menu_items`);

  // 3. Find items missing RU translation
  const missing = [];
  for (const item of menuItems) {
    let enName = item.name;
    try { enName = JSON.parse(item.name).English || item.name; } catch(e) {}
    enName = String(enName).trim();

    const existing = await dbGet(
      `SELECT name FROM menu_translations WHERE menu_item_id = ? AND language_code = 'ru' LIMIT 1`,
      [item.id]
    );
    if (!existing || !existing.name || !existing.name.trim()) {
      missing.push({ id: item.id, enName });
    }
  }

  const missingBefore = missing.length;
  console.log(`\nMissing RU translations BEFORE: ${missingBefore}`);
  missing.forEach(m => console.log(`  - ${m.enName}`));

  // 4. Match and insert
  let inserted = 0;
  let skipped = 0;
  const unmatched = [];

  for (const item of missing) {
    const itemNaive = naiveKey(item.enName);
    const itemFull  = fullKey(item.enName);

    let bestMatch = null;
    let bestScore = 0;

    for (const row of excelKeyed) {
      // Tier 1: exact normalized + synonym match (sorted words)
      if (row.fullKey === itemFull) {
        bestMatch = row;
        bestScore = 1.0;
        break;
      }
      // Tier 2: naive normalized (unsorted words)
      if (row.naiveKey === itemNaive) {
        bestMatch = row;
        bestScore = 0.95;
        break;
      }
    }

    if (!bestMatch) {
      // Tier 3: Jaccard similarity on synonym-normalized word sets
      for (const row of excelKeyed) {
        const score = jaccardSimilarity(itemFull, row.fullKey);
        if (score > bestScore) {
          bestScore = score;
          bestMatch = row;
        }
      }
      // Only accept high-confidence fuzzy matches (≥ 0.72)
      if (bestScore < 0.72) {
        bestMatch = null;
      }
    }

    if (bestMatch) {
      // Safety: double-check no existing translation slipped through
      const recheck = await dbGet(
        `SELECT name FROM menu_translations WHERE menu_item_id = ? AND language_code = 'ru' LIMIT 1`,
        [item.id]
      );
      if (recheck && recheck.name && recheck.name.trim()) {
        console.log(`  SKIP (already has translation): ${item.enName}`);
        skipped++;
        continue;
      }

      await dbRun(
        `INSERT INTO menu_translations (id, menu_item_id, language_code, name, description, created_at, updated_at) VALUES (?, ?, 'ru', ?, '', ?, ?)`,
        [randomUUID(), item.id, bestMatch.ruName, new Date().toISOString(), new Date().toISOString()]
      );
      console.log(`  INSERTED [score=${bestScore.toFixed(2)}]: "${item.enName}" → "${bestMatch.enName}" → RU: "${bestMatch.ruName}"`);
      inserted++;
    } else {
      skipped++;
      unmatched.push(item.enName);
    }
  }

  // 5. Verify
  console.log('\n=== MIGRATION REPORT ===');
  console.log(`Missing RU BEFORE:       ${missingBefore}`);
  console.log(`Inserted:                ${inserted}`);
  console.log(`Skipped (no match):      ${skipped}`);
  console.log(`Unmatched items:         ${unmatched.length}`);

  const dupRow = await dbGet(
    `SELECT COUNT(*) as c FROM (SELECT menu_item_id FROM menu_translations WHERE language_code = 'ru' GROUP BY menu_item_id HAVING COUNT(*) > 1)`
  );
  console.log(`Duplicate ru rows:       ${dupRow.c}`);

  // After count
  const afterMissing = await dbGet(
    `SELECT COUNT(*) as c FROM menu_items m LEFT JOIN menu_translations t ON m.id = t.menu_item_id AND t.language_code = 'ru' WHERE t.id IS NULL OR t.name IS NULL OR t.name = ''`
  );
  console.log(`Missing RU AFTER:        ${afterMissing.c}`);

  console.log('\nUnmatched items (no confident Excel match found):');
  unmatched.forEach(n => console.log(`  - ${n}`));

  db.close();
}

run().catch(err => { console.error(err); db.close(); });
