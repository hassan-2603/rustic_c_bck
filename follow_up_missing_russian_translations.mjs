import sqlite3 from 'sqlite3';
import XLSX from 'xlsx';
import { randomUUID } from 'crypto';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const dbPath = path.join(__dirname, 'database', 'rustic-charm.sqlite');
const excelPath = path.join(__dirname, '..', 'frontend', 'src', 'data', 'menu-translation.xlsx');

const db = new sqlite3.Database(dbPath);
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

const STOP_WORDS = new Set([
  'the', 'a', 'an', 'of', 'and', 'with', 'in', 'on', 'for', 'to', 'from', 'at', 'by', 'or', 'plus', 'without'
]);
const GENERIC_MODIFIERS = new Set([
  'double', 'full', 'half', 'regular', 'classic', 'iced', 'hot', 'cold', 'fresh', 'freshly', 'special', 'mini', 'large', 'small', 'medium', 'veg', 'vegetarian', 'mild', 'spicy', 'masala', 'combo', 'authentic'
]);
const FOOD_TYPE_TOKENS = new Set([
  'biryani', 'pizza', 'burger', 'sandwich', 'wrap', 'roll', 'pasta', 'noodles', 'fried', 'rice', 'curry', 'soup', 'salad', 'toast', 'pancake', 'waffle', 'shake', 'smoothie', 'lassi', 'juice', 'coffee', 'tea', 'latte', 'espresso', 'americano', 'macchiato', 'mocha', 'cappuccino', 'mocktail', 'milkshake', 'fries', 'starter', 'appetizer', 'pie', 'muffin', 'bread', 'cake'
]);
const PROTEIN_TOKENS = new Set([
  'chicken', 'mutton', 'paneer', 'beef', 'prawn', 'shrimp', 'fish', 'egg', 'tofu', 'veg', 'vegetable', 'cheese', 'butter', 'corn', 'mushroom', 'potato', 'mixed', 'pineapple', 'banana', 'mango', 'strawberry', 'papaya', 'avocado', 'berry', 'apple', 'kiwi', 'orange', 'grape', 'carrot', 'beetroot', 'pomegranate'
]);
const DESTRUCTIVE_MODIFIERS = new Set(['double', 'full', 'half', 'regular', 'classic', 'iced', 'hot', 'cold', 'fresh', 'freshly', 'special']);

function extractEnglishName(rawName) {
  if (rawName === null || rawName === undefined) return '';
  let text = String(rawName).trim();
  if (text.startsWith('{') || text.startsWith('[')) {
    try {
      const parsed = JSON.parse(text);
      if (parsed && typeof parsed === 'object') {
        const english = parsed.English || parsed.en || Object.values(parsed)[0];
        if (english) text = String(english);
      }
    } catch {
      // ignore invalid JSON; keep the original text
    }
  }
  return text.trim();
}

function normalizeForMatch(value) {
  let s = extractEnglishName(value)
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '');
  s = s.replace(/&/g, ' and ');
  s = s.replace(/[-–—]/g, ' ');
  s = s.replace(/[()\[\]{}]/g, ' ');
  s = s.replace(/[^a-zA-Z0-9\s]/g, ' ');
  s = s.replace(/\s+/g, ' ').trim().toLowerCase();
  return s;
}

function tokenize(value) {
  const norm = normalizeForMatch(value);
  return norm.split(/\s+/).filter((token) => token && !STOP_WORDS.has(token) && token.length > 0);
}

function removeGenericWords(tokens) {
  return tokens.filter((token) => !GENERIC_MODIFIERS.has(token));
}

function getMeaningfulTokenSet(value) {
  const tokens = removeGenericWords(tokenize(value));
  return new Set(tokens.filter(Boolean));
}

function levenshteinDistance(a, b) {
  const dp = Array.from({ length: a.length + 1 }, () => new Array(b.length + 1).fill(0));
  for (let i = 0; i <= a.length; i++) dp[i][0] = i;
  for (let j = 0; j <= b.length; j++) dp[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,
        dp[i][j - 1] + 1,
        dp[i - 1][j - 1] + cost
      );
    }
  }
  return dp[a.length][b.length];
}

function similarityRatio(a, b) {
  const maxLen = Math.max(a.length, b.length);
  if (maxLen === 0) return 1;
  return 1 - levenshteinDistance(a, b) / maxLen;
}

function jaccardSimilarity(a, b) {
  const setA = new Set(a);
  const setB = new Set(b);
  const inter = [...setA].filter((x) => setB.has(x)).length;
  const union = new Set([...setA, ...setB]).size;
  return union === 0 ? 1 : inter / union;
}

function sortedTokenSimilarity(a, b) {
  const s1 = [...new Set(a)].sort();
  const s2 = [...new Set(b)].sort();
  const short = s1.length < s2.length ? s1 : s2;
  const long = s1.length < s2.length ? s2 : s1;
  const common = short.filter((token) => long.includes(token)).length;
  return short.length === 0 && long.length === 0 ? 1 : common / Math.max(short.length, long.length);
}

function extractFoodWordSets(value) {
  const norm = normalizeForMatch(value);
  const tokens = Array.from(new Set(tokenize(norm)));
  const foodType = tokens.filter((token) => FOOD_TYPE_TOKENS.has(token));
  const protein = tokens.filter((token) => PROTEIN_TOKENS.has(token));
  return { foodType, protein, tokens };
}

function semanticValidation(itemValue, candidateValue) {
  const itemWords = extractFoodWordSets(itemValue);
  const candidateWords = extractFoodWordSets(candidateValue);

  const sharedType = itemWords.foodType.filter((token) => candidateWords.foodType.includes(token));
  const sharedProtein = itemWords.protein.filter((token) => candidateWords.protein.includes(token));

  const itemConflict = itemWords.protein.filter((token) => !candidateWords.protein.includes(token) && token !== 'veg' && token !== 'vegetable');
  const candidateConflict = candidateWords.protein.filter((token) => !itemWords.protein.includes(token) && token !== 'veg' && token !== 'vegetable');

  const hasTypeAgreement = sharedType.length > 0 || itemWords.foodType.length === 0 || candidateWords.foodType.length === 0;
  const hasProteinAgreement = sharedProtein.length > 0 || itemWords.protein.length === 0 || candidateWords.protein.length === 0;
  const isSeverelyDifferent =
    (itemWords.protein.length > 0 && candidateWords.protein.length > 0 &&
      (itemConflict.some((token) => token !== 'veg' && token !== 'vegetable') ||
      candidateConflict.some((token) => token !== 'veg' && token !== 'vegetable')));

  const safe = hasTypeAgreement && hasProteinAgreement && !isSeverelyDifferent;
  return {
    sharedType,
    sharedProtein,
    safe,
    isSeverelyDifferent,
  };
}

function chooseBestMatch(itemName, excelEntries) {
  const itemExact = normalizeForMatch(itemName);
  const itemTokens = removeGenericWords(tokenize(itemName));

  let best = { candidate: null, score: 0, method: 'none' };

  // 1. Direct exact match
  for (const entry of excelEntries) {
    if (normalizeForMatch(entry.english) === itemExact) {
      return { candidate: entry, score: 1.0, method: 'direct exact' };
    }
  }

  // 2. Case-insensitive exact match
  for (const entry of excelEntries) {
    if (entry.english.trim().toLowerCase() === itemName.trim().toLowerCase()) {
      return { candidate: entry, score: 0.99, method: 'case-insensitive exact' };
    }
  }

  // 3. Trimmed / whitespace-normalized match
  const itemTrimmed = itemName.replace(/\s+/g, ' ').trim();
  for (const entry of excelEntries) {
    if (entry.english.replace(/\s+/g, ' ').trim() === itemTrimmed) {
      return { candidate: entry, score: 0.97, method: 'trimmed whitespace' };
    }
  }

  // 4. Strong normalized match
  for (const entry of excelEntries) {
    const a = normalizeForMatch(itemName);
    const b = normalizeForMatch(entry.english);
    if (a === b || a.replace(/\s+and\s+/g, ' ').replace(/\s+/g, ' ') === b.replace(/\s+and\s+/g, ' ').replace(/\s+/g, ' ')) {
      return { candidate: entry, score: 0.95, method: 'strong normalized' };
    }
  }

  // 5. Token / word-based matching
  let tokenBest = null;
  for (const entry of excelEntries) {
    const candTokens = removeGenericWords(tokenize(entry.english));
    const overlap = [...new Set(itemTokens)].filter((token) => candTokens.includes(token)).length;
    const tokenScore = jaccardSimilarity(itemTokens, candTokens);
    const sortedScore = sortedTokenSimilarity(itemTokens, candTokens);
    const combined = Math.max(tokenScore, sortedScore, overlap / Math.max(1, Math.max(itemTokens.length, candTokens.length)));
    const sem = semanticValidation(itemName, entry.english);
    const finalTokenScore = combined * (sem.safe ? 1.1 : 0.7);
    if (finalTokenScore > 0.72 && finalTokenScore > (tokenBest?.score || 0)) {
      tokenBest = { candidate: entry, score: Math.min(0.94, finalTokenScore), method: 'token based' };
    }
  }
  if (tokenBest) {
    return tokenBest;
  }

  // 6. Fuzzy match
  let fuzzyBest = null;
  for (const entry of excelEntries) {
    const a = normalizeForMatch(itemName);
    const b = normalizeForMatch(entry.english);
    const lev = similarityRatio(a, b);
    const shortSet = removeGenericWords(tokenize(itemName));
    const candSet = removeGenericWords(tokenize(entry.english));
    const jacc = jaccardSimilarity(shortSet, candSet);
    const sem = semanticValidation(itemName, entry.english);
    const score = (lev * 0.5) + (jacc * 0.5);
    const safeScore = sem.safe ? score : score * 0.6;

    if (safeScore > 0.75 && safeScore > (fuzzyBest?.score || 0)) {
      fuzzyBest = { candidate: entry, score: Math.min(0.92, safeScore), method: 'fuzzy similarity' };
    }
  }
  if (fuzzyBest) {
    return fuzzyBest;
  }

  // 7. Semantic validation only
  let semanticBest = null;
  for (const entry of excelEntries) {
    const sem = semanticValidation(itemName, entry.english);
    if (sem.safe) {
      const itemWords = getMeaningfulTokenSet(itemName);
      const candWords = getMeaningfulTokenSet(entry.english);
      const common = [...itemWords].filter((token) => candWords.has(token)).length;
      const score = common > 0 ? 0.75 + (common / Math.max(itemWords.size, candWords.size, 1)) * 0.2 : 0.65;
      if (score > (semanticBest?.score || 0)) {
        semanticBest = { candidate: entry, score, method: 'semantic validation' };
      }
    }
  }
  if (semanticBest) {
    return semanticBest;
  }

  return { candidate: null, score: 0, method: 'no match' };
}

(async () => {
  try {
    const initialTranslated = (await get("SELECT COUNT(*) as c FROM menu_translations WHERE language_code = 'ru' AND TRIM(name) <> ''"))?.c || 0;

    const workbook = XLSX.readFile(excelPath);
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(sheet, { defval: '' });

    const excelEntries = rows
      .map((row) => ({
        english: String(row['English'] || row['Menu Item'] || row['Item Name'] || row['English Name'] || row['Name'] || Object.values(row)[0] || '').trim(),
        russian: String(row['Recommended Option'] || row['Russian'] || row['RU'] || row['Translation'] || row['Russian Name'] || Object.values(row)[1] || '').trim(),
      }))
      .filter((entry) => entry.english && entry.russian);

    const missingRows = await all(`
      SELECT m.id, m.name
      FROM menu_items m
      LEFT JOIN menu_translations t
        ON m.id = t.menu_item_id AND t.language_code = 'ru'
      WHERE t.id IS NULL OR TRIM(COALESCE(t.name, '')) = ''
      ORDER BY m.name ASC
    `);

    const methodCounts = {};
    let addedByInsert = 0;
    let addedByUpdate = 0;
    const matchedRecords = [];
    const remainingUnmatched = [];

    for (const item of missingRows) {
      const itemName = extractEnglishName(item.name);
      const match = chooseBestMatch(itemName, excelEntries);

      if (!match.candidate) {
        remainingUnmatched.push({
          menuItem: itemName,
          bestCandidate: null,
          score: 0,
          method: 'no match',
        });
        continue;
      }

      const russian = match.candidate.russian.trim();
      const existing = await get("SELECT id, name FROM menu_translations WHERE menu_item_id = ? AND language_code = 'ru' LIMIT 1", [item.id]);

      if (existing && existing.name && existing.name.trim()) {
        // This branch should not happen because the query only selects missing rows. Keep it safe and immutable.
        continue;
      }

      if (existing) {
        await run(
          'UPDATE menu_translations SET name = ?, description = ?, updated_at = ? WHERE menu_item_id = ? AND language_code = ?',
          [russian, '', new Date().toISOString(), item.id, 'ru']
        );
        addedByUpdate++;
      } else {
        await run(
          'INSERT INTO menu_translations (id, menu_item_id, language_code, name, description, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
          [randomUUID(), item.id, 'ru', russian, '', new Date().toISOString(), new Date().toISOString()]
        );
        addedByInsert++;
      }

      methodCounts[match.method] = (methodCounts[match.method] || 0) + 1;
      matchedRecords.push({
        menuItem: itemName,
        excelEnglish: match.candidate.english,
        russian,
        score: Number(match.score.toFixed(4)),
        method: match.method,
      });
    }

    const finalTranslated = (await get("SELECT COUNT(*) as c FROM menu_translations WHERE language_code = 'ru' AND TRIM(name) <> ''"))?.c || 0;
    const finalMissing = (await get(`
      SELECT COUNT(*) as c
      FROM menu_items m
      LEFT JOIN menu_translations t
        ON m.id = t.menu_item_id AND t.language_code = 'ru'
      WHERE t.id IS NULL OR TRIM(COALESCE(t.name, '')) = ''
    `))?.c || 0;

    console.log('\n=== FOLLOW-UP RUSSIAN MATCH REPORT ===');
    console.log(`Already translated before this pass: ${initialTranslated}`);
    console.log(`Items newly inserted in this pass: ${addedByInsert}`);
    console.log(`Items newly updated in this pass: ${addedByUpdate}`);
    console.log(`Total newly translated in this pass: ${addedByInsert + addedByUpdate}`);
    console.log(`Final translated count: ${finalTranslated}`);
    console.log(`Remaining missing after this pass: ${finalMissing}`);
    console.log('\nMethods used for successful matches:');
    for (const [method, count] of Object.entries(methodCounts)) {
      console.log(`- ${method}: ${count}`);
    }

    console.log('\nSuccessfully matched items:');
    for (const entry of matchedRecords) {
      console.log(`- ${entry.menuItem} => ${entry.excelEnglish} [${entry.method}] score=${entry.score}`);
    }

    console.log('\nRemaining unmatched items:');
    for (const entry of remainingUnmatched) {
      console.log(`- ${entry.menuItem}`);
    }

    db.close();
  } catch (error) {
    console.error('Follow-up translation repair failed:', error);
    db.close();
    process.exit(1);
  }
})();
