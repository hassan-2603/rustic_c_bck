/**
 * Verification script to compare source Russian translations with database
 */

import sqlite3 from 'sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';
import { promisify } from 'util';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Read the source Russian translations from menuTranslations.ts
const tsPath = path.join(__dirname, '../../frontend/src/data/menuTranslations.ts');
const tsContent = fs.readFileSync(tsPath, 'utf8');

// Extract RUSSIAN_TRANSLATIONS object from TypeScript
const extractTranslations = (content) => {
  const match = content.match(/export const RUSSIAN_TRANSLATIONS[:\s]*Record[^{]*{([\s\S]*?)^};/m);
  if (!match) throw new Error('Could not find RUSSIAN_TRANSLATIONS in file');
  
  const translations = {};
  const lines = match[1].split('\n');
  
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('//') || trimmed.startsWith('/*')) continue;
    
    // Match: "Key": "Value",
    const match = trimmed.match(/"([^"]+)"\s*:\s*"([^"]*)"\s*,?$/);
    if (match) {
      translations[match[1]] = match[2];
    }
  }
  
  return translations;
};

const RUSSIAN_TRANSLATIONS = extractTranslations(tsContent);

const dbPath = path.join(__dirname, '../database/rustic-charm.sqlite');
const db = new sqlite3.Database(dbPath);

const dbAll = promisify(db.all.bind(db));
const dbGet = promisify(db.get.bind(db));

async function verifyTranslations() {
  try {
    console.log('='.repeat(80));
    console.log('RUSSIAN TRANSLATION VERIFICATION REPORT');
    console.log('='.repeat(80));
    
    // Get source data stats
    const sourceKeys = Object.keys(RUSSIAN_TRANSLATIONS);
    console.log(`\n1. SOURCE DATA FILE ANALYSIS`);
    console.log(`   Total entries in RUSSIAN_TRANSLATIONS: ${sourceKeys.length}`);
    
    // Get all menu items from database
    const menuItems = await dbAll('SELECT id, name FROM menu_items ORDER BY name ASC');
    console.log(`\n2. DATABASE ANALYSIS`);
    console.log(`   Total menu items in database: ${menuItems.length}`);
    
    // Get all Russian translations from database
    const dbTranslations = await dbAll(
      'SELECT id, menu_item_id, language_code, name FROM menu_translations WHERE language_code = "ru" ORDER BY menu_item_id'
    );
    console.log(`   Total Russian translations in database: ${dbTranslations.length}`);
    
    // Check for duplicate 'ru' translations per menu item
    const itemTranslationCounts = {};
    for (const trans of dbTranslations) {
      itemTranslationCounts[trans.menu_item_id] = (itemTranslationCounts[trans.menu_item_id] || 0) + 1;
    }
    
    const duplicates = Object.entries(itemTranslationCounts).filter(([k, v]) => v > 1);
    console.log(`   Items with MULTIPLE 'ru' translations: ${duplicates.length}`);
    if (duplicates.length > 0) {
      console.log(`   (This is a DATA INTEGRITY ISSUE!)`);
      duplicates.forEach(([itemId, count]) => {
        const item = menuItems.find(m => m.id === itemId);
        console.log(`     - ${item?.name} (ID: ${itemId}): ${count} translations`);
      });
    }
    
    // Matching and comparison
    let matched = 0;
    let replaced = 0;
    let created = 0;
    let identical = 0;
    let mismatches = [];
    const unmatched = [];
    
    // Build database translations map
    const dbTransMap = {};
    for (const trans of dbTranslations) {
      const item = menuItems.find(m => m.id === trans.menu_item_id);
      if (item) {
        dbTransMap[item.name] = trans.name;
      }
    }
    
    console.log(`\n3. COMPARISON: SOURCE vs DATABASE`);
    
    // Check each source entry against database
    for (const [englishName, sourceRussianName] of Object.entries(RUSSIAN_TRANSLATIONS)) {
      // Find matching menu item by English name
      const menuItem = menuItems.find(m => m.name === englishName);
      
      if (menuItem) {
        matched++;
        const dbRussianName = dbTransMap[englishName];
        
        if (!dbRussianName) {
          // Source has translation, database doesn't
          created++;
          console.log(`   ✓ NEW: "${englishName}" → "${sourceRussianName}"`);
        } else if (dbRussianName === sourceRussianName) {
          // Identical - already correct
          identical++;
        } else {
          // MISMATCH - Old Russian name != New Russian name from source
          replaced++;
          mismatches.push({
            english: englishName,
            current_db: dbRussianName,
            expected_source: sourceRussianName
          });
          console.log(`   ✗ MISMATCH: "${englishName}"`);
          console.log(`     - DB Current: "${dbRussianName}"`);
          console.log(`     - Source (Correct): "${sourceRussianName}"`);
        }
      } else {
        // English name not found in database menu_items
        unmatched.push(englishName);
      }
    }
    
    console.log(`\n4. SUMMARY STATISTICS`);
    console.log(`   Total source records: ${sourceKeys.length}`);
    console.log(`   Records matched to menu items: ${matched}`);
    console.log(`   Records NOT in database: ${unmatched.length}`);
    console.log(`   Translations identical (already correct): ${identical}`);
    console.log(`   Translations newly created: ${created}`);
    console.log(`   Translations with MISMATCHES: ${mismatches.length}`);
    
    console.log(`\n5. DATA INTEGRITY ISSUES`);
    if (mismatches.length === 0 && duplicates.length === 0) {
      console.log(`   ✓ NO ISSUES FOUND - All translations are correct and unique`);
    } else {
      if (mismatches.length > 0) {
        console.log(`   ✗ FOUND ${mismatches.length} MISMATCHES:`);
        console.log(`     Old Russian names still in database that don't match source file\n`);
        mismatches.forEach((m, i) => {
          console.log(`   ${i + 1}. English: "${m.english}"`);
          console.log(`      Current DB: "${m.current_db}"`);
          console.log(`      Expected:   "${m.expected_source}"`);
          console.log('');
        });
      }
      if (duplicates.length > 0) {
        console.log(`   ✗ FOUND ${duplicates.length} ITEMS WITH DUPLICATE 'ru' TRANSLATIONS`);
        duplicates.forEach(([itemId, count]) => {
          const item = menuItems.find(m => m.id === itemId);
          console.log(`     - ${item?.name}: ${count} Russian translations`);
        });
      }
    }
    
    console.log(`\n6. UNMATCHED SOURCE ENTRIES (English names in source file NOT in database menu_items)`);
    if (unmatched.length === 0) {
      console.log(`   ✓ All source entries have matching menu items`);
    } else {
      console.log(`   Total unmatched: ${unmatched.length}`);
      unmatched.slice(0, 20).forEach(name => {
        console.log(`   - "${name}"`);
      });
      if (unmatched.length > 20) {
        console.log(`   ... and ${unmatched.length - 20} more`);
      }
    }
    
    console.log(`\n${'='.repeat(80)}`);
    console.log('VERIFICATION COMPLETE');
    console.log(`${'='.repeat(80)}\n`);
    
    // Final verdict
    if (mismatches.length === 0 && duplicates.length === 0) {
      console.log('✅ VERDICT: Migration appears CORRECT\n');
    } else {
      console.log('❌ VERDICT: Issues detected - see details above\n');
    }
    
    process.exit(0);
  } catch (error) {
    console.error('Error during verification:', error);
    process.exit(1);
  } finally {
    db.close();
  }
}

verifyTranslations();
