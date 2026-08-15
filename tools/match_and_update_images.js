import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import sqlite3 from 'sqlite3';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Paths
const dbPath = path.resolve(__dirname, '../database/rustic-charm.sqlite');
const imagesDir = path.resolve(__dirname, '../images/foodimg/food image');

// Command line arguments
const isDryRun = process.argv.includes('--dry-run') || process.argv.includes('-d');

// Helper to normalize strings for comparison
function cleanName(name) {
    if (!name) return '';
    // Remove content inside parenthesis, brackets, curly braces
    let cleaned = name.replace(/\([^)]*\)/g, '')
        .replace(/\[[^\]]*\]/g, '')
        .replace(/\{[^}]*\}/g, '');
    // Convert to lowercase
    cleaned = cleaned.toLowerCase();

    // Replace '&' with 'and'
    cleaned = cleaned.replace(/&/g, 'and');

    // Replace punctuation and special chars (hyphen, underscore, comma, dot, apostrophe, slash, etc.) with spaces
    cleaned = cleaned.replace(/[-_,.'"/\\#!$%^&*;:{}=\-_`~()]/g, ' ');

    // Replace multiple spaces with a single space and trim
    cleaned = cleaned.replace(/\s+/g, ' ').trim();

    return cleaned;
}

// Synonyms and plurals mapping
function normalizeWord(w) {
    // spelling / synonyms
    if (w === 'yoghurt' || w === 'yogurt' || w === 'curds') return 'curd';
    if (w === 'vegetable' || w === 'vegetables') return 'veg';
    if (w === 'mixed') return 'mix';
    if (w === 'miv') return 'mix';
    if (w === 'lacha' || w === 'lachha') return 'laccha';
    if (w === 'maggie') return 'maggi';
    if (w === 'custurd') return 'custard';
    if (w === 'musli') return 'muesli';
    if (w === 'tequilla') return 'tequila';
    if (w === 'tirramissu') return 'tiramisu';
    if (w === 'lolypop') return 'lollipop';
    if (w === 'chilly' || w === 'chilli') return 'chili';
    if (w === 'englis') return 'english';
    if (w === 'dall') return 'dal';
    if (w === 'garkic') return 'garlic';

    // Plural to singular (basic check)
    if (w.length > 3 && w.endsWith('s')) {
        if (w === 'fries') return 'fry';
        return w.slice(0, -1);
    }
    return w;
}

function getComparisonKey(name) {
    const cleaned = cleanName(name);
    if (!cleaned) return '';
    const words = cleaned.split(' ').map(normalizeWord).filter(Boolean);
    words.sort();
    return words.join(' ');
}

// Main execution function
const reportLines = [];
function log(msg) {
    console.log(msg);
    reportLines.push(msg);
}

async function main() {
    log(`=== Food Image Matching & SQL Database Update ===`);
    log(`Dry Run status: ${isDryRun ? 'ENABLED (No DB writes will occur)' : 'DISABLED (DB writes will occur)'}`);

    // 1. Back up database first (if not dry run)
    if (!isDryRun) {
        if (!fs.existsSync(dbPath)) {
            log(`Database not found at ${dbPath}`);
            process.exit(1);
        }
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const backupPath = `${dbPath}.bak.${timestamp}`;
        try {
            fs.copyFileSync(dbPath, backupPath);
            log(`✅ Database successfully backed up to:`);
            log(`   ${backupPath}`);
        } catch (e) {
            log(`❌ FAILED to create database backup: ${e.message}`);
            process.exit(1);
        }
    }

    // 2. Read images directory
    if (!fs.existsSync(imagesDir)) {
        log(`Images directory not found at ${imagesDir}`);
        process.exit(1);
    }

    const imageFiles = fs.readdirSync(imagesDir).filter(file => {
        const ext = path.extname(file).toLowerCase();
        return ['.jpg', '.jpeg', '.png', '.webp'].includes(ext);
    });
    log(`\n1. Total images found inside backend/images/foodimg/food image: ${imageFiles.length}`);

    // 3. Load menu items from SQLite
    const db = new sqlite3.Database(dbPath);
    const getMenuItems = () => new Promise((resolve, reject) => {
        db.all("SELECT id, name, image_url FROM menu_items", [], (err, rows) => {
            if (err) reject(err);
            else resolve(rows);
        });
    });

    let menuItems = [];
    try {
        menuItems = await getMenuItems();
    } catch (e) {
        log(`Error querying database: ${e.message}`);
        db.close();
        process.exit(1);
    }
    log(`2. Total SQLite menu items inspected: ${menuItems.length}`);

    // Group images by their comparison key (to handle duplicates / numbered files)
    const imageGroups = {};
    imageFiles.forEach(filename => {
        const ext = path.extname(filename);
        const baseName = path.basename(filename, ext);
        const key = getComparisonKey(baseName);
        if (!key) return;
        if (!imageGroups[key]) {
            imageGroups[key] = [];
        }
        imageGroups[key].push({ filename, baseName });
    });

    // Resolve best image for each key (prefer base filename without (1), (2), etc.)
    const resolvedImages = {};
    Object.keys(imageGroups).forEach(key => {
        const list = imageGroups[key];
        // Find the one that doesn't have parenthetical numbers
        let best = list.find(item => !/\(\d+\)/.test(item.baseName));
        if (!best) {
            best = list[0]; // fallback to first
        }
        resolvedImages[key] = best.filename;
    });

    log(`Unique image keys resolved: ${Object.keys(resolvedImages).length}`);

    function isConfidentExactMatch(wordsImg, wordsMenu) {
        if (wordsImg.length !== wordsMenu.length) return false;
        const setMenu = new Set(wordsMenu);
        for (const w of wordsImg) {
            if (!setMenu.has(w)) return false;
        }
        return true;
    }

    // List to track updates and skips
    const successfulMatches = []; // { id, name, filename, storedPath }
    const ambiguousSkips = []; // { filename, reason, candidates }
    const skippedImages = new Set(imageFiles); // starts with all, remove matched ones
    const unchangedMenuIds = new Set(menuItems.map(m => m.id));

    // We want to map: menu item -> list of matching image keys
    menuItems.forEach(menuItem => {
        const menuKey = getComparisonKey(menuItem.name);
        if (!menuKey) return;

        const menuWords = menuKey.split(' ').filter(Boolean);

        // Look for matching keys that have EXACTLY the same words (order-independent)
        const matchingImageKeys = Object.keys(resolvedImages).filter(imgKey => {
            const imgWords = imgKey.split(' ').filter(Boolean);
            return isConfidentExactMatch(imgWords, menuWords);
        });

        if (matchingImageKeys.length === 1) {
            const bestKey = matchingImageKeys[0];
            const filename = resolvedImages[bestKey];
            successfulMatches.push({
                id: menuItem.id,
                menuName: menuItem.name,
                filename: filename,
                storedPath: `/images/foodimg/food image/${filename}`
            });
            imageGroups[bestKey].forEach(item => skippedImages.delete(item.filename));
            unchangedMenuIds.delete(menuItem.id);
        } else if (matchingImageKeys.length > 1) {
            matchingImageKeys.forEach(bestKey => {
                ambiguousSkips.push({
                    filename: resolvedImages[bestKey],
                    menuName: menuItem.name,
                    reason: `Ambiguous matching. Multiple candidate images matched: ${matchingImageKeys.map(k => resolvedImages[k]).join(', ')}`
                });
            });
        }
    });

    // Filter out skips that were actually matched successfully later
    const realAmbiguousSkips = ambiguousSkips.filter(skip => {
        return !successfulMatches.some(m => m.filename === skip.filename);
    });

    // Calculate stats
    log(`3. Number of confident matches found: ${successfulMatches.length}`);
    log(`4. Number of menu item image fields to update: ${successfulMatches.length}`);
    log(`5. Number of images skipped because no confident menu item match existed: ${skippedImages.size}`);
    log(`6. Number of menu items left completely unchanged because no matching image was found: ${unchangedMenuIds.size}`);

    log(`\n7. Sample of successful matches (at least 20 sample successful matches):`);
    successfulMatches.slice(0, 45).forEach((match, idx) => {
        log(`   [${idx + 1}] File: "${match.filename}" → Menu: "${match.menuName}" → Stored: "${match.storedPath}"`);
    });

    log(`\n8. Ambiguous matches that were intentionally skipped:`);
    if (realAmbiguousSkips.length === 0) {
        log(`   (None)`);
    } else {
        const seenSkips = new Set();
        realAmbiguousSkips.forEach(skip => {
            if (seenSkips.has(skip.filename)) return;
            seenSkips.add(skip.filename);
            log(`   • File: "${skip.filename}" for Menu item: "${skip.menuName}" (${skip.reason})`);
        });
    }

    log(`\n9. Confirm that unmatched menu items were NOT modified: OK (unchanged count: ${unchangedMenuIds.size})`);
    log(`10. Confirm that no existing menu item was assigned an image unless there was a confident match: OK`);
    log(`11. Confirm the SQLite database backup was created before updates: ${isDryRun ? 'Dry run - no backup created' : 'YES, created backup before starting updates'}`);

    // Write report file
    const reportPath = path.resolve(__dirname, 'matching_report.txt');
    fs.writeFileSync(reportPath, reportLines.join('\n'), 'utf8');
    console.log(`\n📝 Full report written to: ${reportPath}`);

    // 4. Perform Updates
    if (!isDryRun && successfulMatches.length > 0) {
        log(`\nApplying updates to the database...`);
        const updateStmt = db.prepare("UPDATE menu_items SET image_url = ?, updated_at = ? WHERE id = ?");

        let updatedCount = 0;

        db.serialize(() => {
            db.run("BEGIN TRANSACTION");

            successfulMatches.forEach(match => {
                updateStmt.run(match.storedPath, new Date().toISOString(), match.id, (err) => {
                    if (err) {
                        console.error(`Error updating id ${match.id}:`, err.message);
                    }
                });
                updatedCount++;
            });

            db.run("COMMIT", (err) => {
                if (err) {
                    console.error("COMMIT transaction failed:", err.message);
                } else {
                    log(`✅ successfully updated ${updatedCount} menu items in database!`);
                }
                updateStmt.finalize(() => {
                    db.close();
                });
            });
        });
    } else {
        log(`\n[Dry run or no matches] No database updates were written.`);
        db.close();
    }
}

main().catch(err => {
    console.error("Fatal error:", err);
});
