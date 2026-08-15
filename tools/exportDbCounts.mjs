import { openDatabase, getDatabasePath } from "../config/database.js";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function run() {
  const db = openDatabase();
  const all = (sql, params=[]) => new Promise((res, rej) => db.all(sql, params, (err, rows) => err ? rej(err) : res(rows)));
  try {
    const counts = {};
    const c = await all("SELECT COUNT(*) as cnt FROM categories");
    const m = await all("SELECT COUNT(*) as cnt FROM menu_items");
    const t = await all("SELECT COUNT(*) as cnt FROM tables");
    counts.categories = c[0]?.cnt || 0;
    counts.menu_items = m[0]?.cnt || 0;
    counts.tables = t[0]?.cnt || 0;
    counts.sampleCategories = await all('SELECT id,name FROM categories LIMIT 20');
    counts.sampleMenu = await all('SELECT id,name,category_id,price FROM menu_items LIMIT 20');
    counts.dbPath = getDatabasePath();
    const outPath = path.join(__dirname, 'inspect-output.json');
    fs.writeFileSync(outPath, JSON.stringify(counts, null, 2));
    console.log('wrote', outPath);
  } catch (e) {
    console.error('error', e);
    process.exit(1);
  } finally {
    db.close(() => process.exit(0));
  }
}

run();
