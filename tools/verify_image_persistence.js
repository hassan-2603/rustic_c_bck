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

    // Get the first item
    db.get("SELECT id, name, image_url FROM menu_items LIMIT 1", [], (err, item) => {
        if (err || !item) {
            console.error("Could not fetch test item:", err);
            db.close();
            process.exit(1);
        }
        console.log("Original Item:", item);

        const testImagePath = `/images/uploads/verify-test-${Date.now()}.png`;

        // Try updating isAvailable first, then checking
        db.run("UPDATE menu_items SET image_url = ? WHERE id = ?", [testImagePath, item.id], function (updateErr) {
            if (updateErr) {
                console.error("Update failed:", updateErr);
                db.close();
                process.exit(1);
            }
            console.log(`Successfully updated item ${item.id} image_url to: ${testImagePath}`);

            // Verify it was saved
            db.get("SELECT id, name, image_url FROM menu_items WHERE id = ?", [item.id], (err2, updated) => {
                if (err2 || !updated) {
                    console.error("Fetch updated item failed:", err2);
                    db.close();
                    process.exit(1);
                }
                console.log("Verifying updated database state:", updated);
                const success = updated.image_url === testImagePath;
                console.log("Verification Success:", success);

                // Put the original image_url back
                db.run("UPDATE menu_items SET image_url = ? WHERE id = ?", [item.image_url, item.id], (restoreErr) => {
                    if (restoreErr) {
                        console.error("Failed to restore original image:", restoreErr);
                    } else {
                        console.log("Successfully restored original image path.");
                    }
                    db.close();
                    process.exit(success ? 0 : 1);
                });
            });
        });
    });
});
