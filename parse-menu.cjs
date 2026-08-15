const fs = require('fs');
const { PdfReader } = require('pdfreader');

const rows = {};
const menuItems = [];
let currentCategory = "General";

console.log("Assembling PDF rows and parsing menu data...");

new PdfReader().parseFileItems("menu.pdf", (err, item) => {
    if (err) {
        console.error("Error parsing PDF:", err);
    } else if (!item) {
        console.log("\n--- Processing Assembled Lines ---");
        const sortedY = Object.keys(rows).sort((a, b) => parseFloat(a) - parseFloat(b));
        
        sortedY.forEach(y => {
            const line = rows[y].join(" ").trim();
            if (line.length === 0) return;
            console.log("ASSEMBLED ROW:", line);

            if (["SOUPS", "APPETIZERS", "MAIN COURSES", "DESSERTS", "DRINKS", "BEVERAGES"].includes(line.toUpperCase())) {
                currentCategory = line;
                return;
            }

            const priceMatch = line.match(/(\d+\.\d{2})/);
            if (priceMatch) {
                const price = parseFloat(priceMatch[1]);
                const name = line.replace(priceMatch[0], '').replace(/[$\s,-]+$/, '').trim();
                
                if (name.length > 2) {
                    menuItems.push({
                        id: name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, ''),
                        name: name,
                        category: currentCategory,
                        price: price,
                        ingredients: []
                    });
                }
            }
        });

        const tsContent = `export interface MenuItem {
  id: string;
  name: string;
  category: string;
  price: number;
  ingredients: string[];
}

export const menuData: MenuItem[] = ${JSON.stringify(menuItems, null, 2)};
`;

        fs.writeFileSync('menudata.ts', tsContent);
        console.log(`\x1b[32m✔ Success! Combined text rows and generated menudata.ts with ${menuItems.length} items.\x1b[0m`);

    } else if (item.text) {
        if (!rows[item.y]) {
            rows[item.y] = [];
        }
        rows[item.y].push(item.text);
    }
});
