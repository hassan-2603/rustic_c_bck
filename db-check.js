import sqlite3 from "sqlite3";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const dbPath = path.join(__dirname, "offers.db");
const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error("Error opening db:", err);
    process.exit(1);
  }
  
  db.all("SELECT name FROM sqlite_master WHERE type='table'", [], (err, tables) => {
    if (err) {
      console.error("Error getting tables:", err);
      process.exit(1);
    }
    console.log("Tables:", tables);
    
    if (tables.some(t => t.name === "offers")) {
      db.all("PRAGMA table_info(offers)", [], (err, info) => {
        if (err) {
          console.error("Error getting table info:", err);
        } else {
          console.log("Table info for 'offers':", info);
        }
        db.close();
      });
    } else {
      console.log("Table 'offers' does not exist.");
      db.close();
    }
  });
});
