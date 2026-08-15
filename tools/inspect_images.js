import sqlite3 from 'sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const dbPath = path.join(__dirname, '..', 'database', 'rustic-charm.sqlite');

const db = new sqlite3.Database(dbPath, (err) => {
    if (err) {
        console.error('Error opening db:', err);
        process.exit(1);
    }

    db.all("SELECT DISTINCT image_url FROM menu_items", [], (err, rows) => {
        if (err) {
            console.error(err);
            db.close();
            process.exit(1);
        }
        console.log("Distinct image URLs:", rows);

        db.all("SELECT id, name, image_url FROM menu_items LIMIT 5", [], (err2, rows2) => {
            console.log("Sample records:", rows2);
            db.close();
        });
    });
});
