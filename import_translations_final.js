import xlsx from 'xlsx';
import sqlite3 from 'sqlite3';
import { randomUUID } from 'crypto';
import { promisify } from 'util';

const dbPath = './database/rustic-charm.sqlite';
const excelPath = '../frontend/src/data/menu-translation.xlsx';

function removeBrackets(s) {
  return String(s)
    .replace(/\([^)]*\)/g, '')
    .replace(/\[[^\]]*\]/g, '')
    .replace(/\{[^}]*\}/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalize(s) {
  return String(s)
    .toLowerCase()
    .replace(/[''`]/g, '')
    .replace(/[-_/\\+&,:]/g, ' ')
    .replace(/[^\w\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function applySynonyms(s) {
  return s
    .replace(/\bveggies\b/g, 'vegetable')
    .replace(/\bveg\b/g, 'vegetable')
    .replace(/\bvegetables\b/g, 'vegetable')
    .replace(/\bmixed\b/g, 'mix')
    .replace(/\bcurd\b/g, 'yogurt')
    .replace(/\byoghurt\b/g, 'yogurt')
    .replace(/\blaccha\b/g, 'lacha')
    .replace(/\blachha\b/g, 'lacha')
    .replace(/\bpanner\b/g, 'paneer')
    .replace(/\bchoco\b/g, 'chocolate')
    .replace(/\bfries\b/g, 'fry')
    .replace(/\bfried\b/g, 'fry')
    .replace(/\bcheesecake\b/g, 'cheese cake')
    .replace(/\bcashewnut\b/g, 'cashew nut')
    .replace(/\bbabycorn\b/g, 'baby corn')
    .replace(/\bplater\b/g, 'platter')
    .replace(/\bpapadum\b/g, 'papad')
    .replace(/\bpapadums\b/g, 'papad')
    .replace(/\broasted\b/g, 'roast')
    .replace(/\bgrilled\b/g, 'grill')
    .replace(/\bmashed\b/g, 'mash')
    .replace(/\bcubes\b/g, 'cube')
    .replace(/\beggs\b/g, 'egg')
    .replace(/\biced\b/g, 'ice')
    .replace(/\bsoft drink\b/g, 'cold drink')
    .replace(/\bcanned\b/g, 'can')
    .replace(/\bwater\b/g, '')
    .replace(/\bwith\b/g, '')
    .replace(/\bin\b/g, '')
    .replace(/\band\b/g, '')
    .replace(/\bor\b/g, '')
    .replace(/\bstyle\b/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function fullKey(raw) {
  const withoutBrackets = removeBrackets(raw);
  const normed = applySynonyms(normalize(withoutBrackets));
  return normed.split(' ').filter(Boolean).sort().join(' ');
}

function naiveKey(raw) {
  const withoutBrackets = removeBrackets(raw);
  return applySynonyms(normalize(withoutBrackets));
}

function jaccardSimilarity(a, b) {
  const setA = new Set(a.split(' ').filter(Boolean));
  const setB = new Set(b.split(' ').filter(Boolean));
  const intersection = [...setA].filter(w => setB.has(w)).length;
  const union = new Set([...setA, ...setB]).size;
  return union === 0 ? 0 : intersection / union;
}

const db = new sqlite3.Database(dbPath);
const dbAll  = promisify(db.all.bind(db));
const dbGet  = promisify(db.get.bind(db));
const dbRun  = (...args) => new Promise((res, rej) =>
  db.run(...args, function(err) { if (err) rej(err); else res(this); })
);

async function run() {
  const workbook = xlsx.readFile(excelPath);
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const data  = xlsx.utils.sheet_to_json(sheet);

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
    excelRows.push({
      enName,
      ruName,
      naiveKey: naiveKey(enName),
      fullKey: fullKey(enName),
      rawKey: normalize(removeBrackets(enName))
    });
  }

  // Load items missing RU translation only
  const missing = await dbAll(`
    SELECT m.id, m.name
    FROM menu_items m
    LEFT JOIN menu_translations t
      ON m.id = t.menu_item_id AND t.language_code = 'ru'
    WHERE t.id IS NULL OR t.name IS NULL OR TRIM(t.name) = ''
    ORDER BY m.name
  `);

  const missingBefore = missing.length;
  console.log(`Missing RU BEFORE this pass: ${missingBefore}`);

  let insertedBracket = 0;
  let insertedOther   = 0;
  let skipped         = 0;
  const unmatched     = [];

  for (const item of missing) {
    let enName = item.name;
    try { enName = JSON.parse(item.name).English || item.name; } catch(e) {}
    enName = String(enName).trim();

    const bracketsPresent = /[(\[{]/.test(enName);
    const itemNaive = naiveKey(enName);
    const itemFull  = fullKey(enName);

    let bestMatch  = null;
    let matchTier  = '';

    // Direct high confidence mappings
    const explicitMappings = {
      "Butter Toast": "Buttered Toast",
      "Regular Red Bull": "Red Bull",
      "Pink Panther Mocktail": "Pink Panther",
      "Tropical Mango Mocktail": "Tropical Mango",
      "Lasagne with Mushroom": "Mushroom Lasagne",
      "Mushroom Mutter Masala": "Mushroom & Green Peas Masala (Mutter)",
      "Vegetable Manchurian Gravy": "Vegetable Manchurian",
      "Slice Lamb Szechuan Style": "Szechuan-style Sliced Lamb",
      "Crispy Lamb Green Chilli Onion Dry": "Crispy Lamb with Green Chilli & Onion",
      "Fried or Roast Papad": "Fried or Roasted Papadum",
      "Jumbo Breakfast Plater": "Jumbo Breakfast Platter"
    };

    if (explicitMappings[enName]) {
      const target = explicitMappings[enName];
      bestMatch = excelRows.find(r => r.enName.toLowerCase() === target.toLowerCase());
      if (bestMatch) matchTier = 'Explicit-Food-Match';
    }

    if (!bestMatch) {
      for (const row of excelRows) {
        if (row.fullKey === itemFull) {
          bestMatch = row; matchTier = 'T1-sorted';
          break;
        }
      }
    }

    if (!bestMatch) {
      for (const row of excelRows) {
        if (row.naiveKey === itemNaive) {
          bestMatch = row; matchTier = 'T2-naive';
          break;
        }
      }
    }

    if (!bestMatch) {
      skipped++;
      unmatched.push(enName);
      continue;
    }

    // Safety re-check: do NOT overwrite any existing translation
    const recheck = await dbGet(
      `SELECT name FROM menu_translations WHERE menu_item_id = ? AND language_code = 'ru' LIMIT 1`,
      [item.id]
    );
    if (recheck && recheck.name && recheck.name.trim()) {
      skipped++;
      continue;
    }

    await dbRun(
      `INSERT INTO menu_translations (id, menu_item_id, language_code, name, description, created_at, updated_at)
       VALUES (?, ?, 'ru', ?, '', ?, ?)`,
      [randomUUID(), item.id, bestMatch.ruName, new Date().toISOString(), new Date().toISOString()]
    );

    const bracketHelped = bracketsPresent ? ' [bracket-removal helped]' : '';
    console.log(`  OK [${matchTier}]${bracketHelped}: "${enName}" → "${bestMatch.enName}" → "${bestMatch.ruName}"`);

    if (bracketsPresent) {
      insertedBracket++;
    } else {
      insertedOther++;
    }
  }

  const dupRow = await dbGet(
    `SELECT COUNT(*) as c FROM (
       SELECT menu_item_id FROM menu_translations
       WHERE language_code = 'ru'
       GROUP BY menu_item_id HAVING COUNT(*) > 1
     )`
  );

  const afterMissing = await dbGet(
    `SELECT COUNT(*) as c
     FROM menu_items m
     LEFT JOIN menu_translations t ON m.id = t.menu_item_id AND t.language_code = 'ru'
     WHERE t.id IS NULL OR t.name IS NULL OR TRIM(t.name) = ''`
  );

  console.log('\n=== FINAL MIGRATION REPORT ===');
  console.log(`Missing RU BEFORE:                    ${missingBefore}`);
  console.log(`Matched via bracket-removal:          ${insertedBracket}`);
  console.log(`Matched via other normalization:      ${insertedOther}`);
  console.log(`Total newly inserted:                 ${insertedBracket + insertedOther}`);
  console.log(`Remaining unmatched:                  ${afterMissing.c}`);
  console.log(`Existing translations modified:       0`);
  console.log(`Duplicate ru rows:                    ${dupRow.c}`);
  console.log(`All inserted values from Excel only:  YES`);

  db.close();
}

run().catch(err => { console.error(err); db.close(); process.exit(1); });
