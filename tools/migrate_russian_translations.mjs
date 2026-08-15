/**
 * Migration script to import Russian translations from the frontend data file
 * Usage: node migrate_russian_translations.mjs
 */

import sqlite3 from 'sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';
import { promisify } from 'util';
import crypto from 'crypto';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// The Russian translations from frontend
const RUSSIAN_TRANSLATIONS = {
  // Categories (Luxury Fine Dining Style)
  "Coffee / Barista": "Кофейная карта",
  "Hot Beverages": "Горячие напитки",
  "Cold Beverages": "Холодные напитки и Коктейли",
  "Soft Drinks & Water": "Безалкогольные напитки и Вода",
  "Mocktails": "Авторские безалкогольные коктейли",
  "Fresh Juices": "Свежевыжатые соки (Фреши)",
  "Shakes, Lassi & Smoothies": "Шейки, Ласси и Смузи",
  "Eggs to Order": "Авторские блюда из яиц",
  "Combo Breakfast": "Комбо-завтраки от шефа",
  "Pancakes & Waffles": "Блины, Оладьи и Вафли",
  "Toasts & French Toast": "Тосты и Французские бриоши",
  "Cereals & Healthy Bowls": "Полезные гранолы и Боулы",
  "Sandwiches": "Сэндвичи и Брускетты",
  "Burgers": "Фирменные бургеры",
  "Wraps & Rolls": "Роллы и Врапы",
  "Pasta": "Итальянская паста",
  "Pizza": "Римская и Классическая пицца",
  "Appetizers / Starters": "Изысканные закуски",
  "Soups": "Ароматные супы",
  "Salads": "Свежие салаты",
  "Rice & Bowls": "Рис и Авторские боулы",
  "Indian Specialties": "Традиционная индийская кухня",
  "Continental Dishes": "Европейская кухня",
  "Asian Favorites": "Паназиатские блюда",
  "Fries & Sides": "Гарниры и Картофель",
  "Chef's Recommendation": "Рекомендация шеф-повара",
  "Something Sweet": "Десерты и Выпечка",

  "Espresso": "Эспрессо",
  "Espresso Double": "Двойной Эспрессо",
  "Cappuccino": "Капучино",
  "Cappuccino Double": "Двойной Капучино",
  "Espresso Macchiato": "Эспрессо Макиато",
  "Espresso Macchiato Double": "Двойной Эспрессо Макиато",
  "Espresso Bombon": "Эспрессо Бомбон",
  "Espresso Bombon Double": "Двойной Эспрессо Бомбон",
  "Espresso Affogato": "Эспрессо Аффогато",
  "Espresso Affogato Double": "Двойной Эспрессо Аффогато",
  "Espresso Con Panna": "Эспрессо Кон Панна",
  "Espresso Con Panna Double": "Двойной Эспрессо Кон Панна",
  "Espresso Cortado": "Эспрессо Кортадо",
  "Americano": "Американо",
  "Americano Double": "Двойной Американо",
  "Flat White": "Флэт Уайт",
  "Cafe Latte": "Кофе Латте",
  "Latte Macchiato": "Латте Макиато",
  "Latte Macchiato Double": "Двойной Латте Макиато",
  "Matcha Latte (Regular/Iced)": "Матча Латте (Классический / Со льдом)",
  "Mochaccino": "Мокачино",
  "Mochaccino Double": "Двойной Мокачино",
  "Caramel Macchiato": "Карамельный Макиато",
  "Vanilla Flavoured Latte": "Ванильный Латте",
  "Hazelnut Flavoured Latte": "Ореховый Латте (Фундук)",
  "Caramel Flavoured Latte": "Карамельный Латте",
  "Honey Flavoured Latte": "Медовый Латте",
  "Iced Spanish Latte": "Испанский Айс-Латте",
  "Iced Americano": "Айс Американо",
  "Iced Americano Double": "Двойной Айс Американо",
  "Iced Latte": "Айс Латте",
  "Iced Cappuccino": "Айс Капучино",
  "Iced Mocha": "Айс Мокко",
  "Mocha Madness": "Мокко Маднесс",
  "Iced Caramel Macchiato": "Айс Карамельный Макиато",
  "Hazelnut Iced Flavoured Latte": "Айс Латте с фундуком",
  "Vanilla Iced Flavoured Latte": "Айс Латте с ванилью",
  "Caramel Iced Flavoured Latte": "Айс Латте с карамелью",
  "Honey Iced Flavoured Latte": "Айс Латте с медом",
  "Black Tea": "Элитный черный чай",
  "Green Tea": "Зеленый чай",
  "Lemon Tea": "Лимонный чай",
  "Masala Tea": "Чай Масала со специями",
  "Milk Tea": "Чай с молоком",
  "Mint Tea": "Мятный чай",
  "Tea with Soya Milk": "Чай с соевым молоком",
  "Black Coffee": "Черный кофе",
  "Milk Coffee": "Кофе с молоком",
  "Hot Chocolate": "Густой горячий шоколад",
  "Ginger Lemon Honey": "Имбирный чай с лимоном и медом",
  "Hot Milk": "Горячее молоко",
  "Tea Pot": "Чайник чая",
  "Orange Juice": "Свежевыжатый апельсиновый сок",
  "Pineapple Juice": "Свежевыжатый ананасовый сок",
  "Lemon Juice": "Свежевыжатый лимонный сок",
  "Papaya Juice": "Свежевыжатый сок из папайи",
  "Watermelon Juice": "Свежевыжатый арбузный сок",
  "Orange + Beetroot Juice": "Фреш Апельсин и Свекла",
  "Mixed Fruit Juice": "Мультифруктовый фреш",
  "ABC Juice": "Витаминный фреш ABC (Яблоко, Свекла, Морковь)",
  "Mango Juice": "Манговый фреш",
  "Lemon Nana": "Лимонад Лемон Нана с мятной свежестью",
  "Herbal Juice": "Травяной напиток",
  "Gingershot Juice": "Имбирный шот",
  "Basil + Pineapple Juice": "Ананасовый фреш с базиликом",
  "Orange + carrot Juice": "Фреш Апельсин и Морковь",
  "Pomegranate Juice": "Свежевыжатый гранатовый сок",
  "Orange + beetroot Juice": "Фреш Апельсин и Свекла",
  "Strawberry Juice": "Клубничный сок",
  "Kambucha": "Чайный гриб Комбуча",
  "Vanilla Milkshake": "Ванильный милкшейк",
  "Chocolate Milkshake": "Шоколадный милкшейк",
  "Strawberry Milkshake": "Клубничный милкшейк",
  "Mango Milkshake": "Манговый милкшейк",
  "Banana Milkshake": "Банановый милкшейк",
  "Avocado Milkshake": "Авокадо милкшейк",
  "Butterscotch Milkshake": "Милкшейк Баттерскотч",
  "Cold Coffee": "Холодный кофе",
  "Chocolate + banana Milkshake": "Шоколадно-банановый милкшейк",
  "Papaya Milkshake": "Милкшейк с папайей",
  "Berry bliss Smoothie": "Ягодный смузи «Блисс»",
  "Tropical mango Smoothie": "Тропический смузи с манго",
  "Green detox Smoothie": "Зеленый детокс-смузи",
  "Peanut butter banana Smoothie": "Смузи с арахисовым маслом и бананом",
  "Avocado Lassi": "Авокадо Ласси",
  "Butter Milk": "Индийский Баттермилк (Пахта)",
  "Papaya Lassi": "Ласси с папайей",
  "Plain Lassi (Sweet)": "Классический сладкий Ласси",
  "Banana Lassi": "Банановый Ласси",
  "Mango Lassi": "Манговый Ласси",
  "Plain Lassi (Salted)": "Соленый Ласси со специями",
  "Strawberry Lassi": "Клубничный Ласси",
  "Mushroom Pizza": "Грибная пицца",
  "Tuna Pizza": "Пицца с тунцом",
  "Al Pollo Pizza": "Пицца Аль Полло (с курицей)",
  "Mix Vegetable Pizza": "Пицца со свежими овощами",
  "Exotic Pizza": "Экзотическая пицца",
  "Jalapeno Pizza": "Пицца с острым халапеньо",
  "Margherita Pizza": "Пицца Маргарита с моцареллой",
  "Prawns Pizza": "Пицца с тигровыми креветками",
  "Pepperoni Pizza": "Пицца Пепперони",
  "Bacon Pizza": "Пицца с беконом",
  "Zebra Pizza": "Пицца Зебра",
  "Special Pizza": "Фирменная пицца от шефа",
  "Crispy Corn": "Хрустящая кукуруза со специями",
  "Masala Papad": "Запеченный Папад с овощами и масалой",
  "Mushroom Chilli": "Острые грибы Чили",
  "Mushroom Red Pepper Dry": "Грибы с красным перцем",
  "Paneer Chilli": "Сыр Панир Чили",
  "Peanut Masala": "Острый арахис Пенат Масала",
  "Potato Chilli Honey Dry": "Хрустящий картофель с медом и чили",
  "Tofu Chilli": "Тофу Чили",
  "Veg Pakoda": "Овощные пакоды в нуковой панировке",
  "Egg Chilli": "Яйца Чили со специями",
};

async function migrateRussianTranslations() {
  const dbPath = path.join(__dirname, '../database/rustic-charm.sqlite');
  
  return new Promise((resolve, reject) => {
    const db = new sqlite3.Database(dbPath, async (err) => {
      if (err) {
        console.error('Database connection error:', err);
        reject(err);
        return;
      }

      try {
        console.log('Starting Russian translation migration...\n');

        // Enable foreign keys
        await promisify(db.run.bind(db))('PRAGMA foreign_keys = ON');

        // Get all menu items
        const menuItems = await promisify(db.all.bind(db))(
          'SELECT id, name FROM menu_items ORDER BY name ASC'
        );

        console.log(`Found ${menuItems.length} menu items in database.\n`);

        let matched = 0;
        let updated = 0;
        let skipped = 0;
        const unmatched = [];

        // Process each menu item
        for (const item of menuItems) {
          const englishName = typeof item.name === 'string' 
            ? item.name 
            : (item.name && item.name.English) || item.name || '';
          
          // Look up Russian translation
          const russianName = RUSSIAN_TRANSLATIONS[englishName];

          if (russianName) {
            matched++;
            
            // Check if translation already exists
            const existing = await promisify(db.get.bind(db))(
              'SELECT id FROM menu_translations WHERE menu_item_id = ? AND language_code = ? LIMIT 1',
              [item.id, 'ru']
            );

            if (existing) {
              // Update existing
              await promisify(db.run.bind(db))(
                'UPDATE menu_translations SET name = ?, updated_at = ? WHERE menu_item_id = ? AND language_code = ?',
                [russianName, new Date().toISOString(), item.id, 'ru']
              );
              updated++;
              console.log(`✓ Updated: ${englishName} → ${russianName}`);
            } else {
              // Insert new
              const transId = crypto.randomUUID();
              await promisify(db.run.bind(db))(
                'INSERT INTO menu_translations (id, menu_item_id, language_code, name, description, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
                [transId, item.id, 'ru', russianName, '', new Date().toISOString(), new Date().toISOString()]
              );
              updated++;
              console.log(`✓ Created: ${englishName} → ${russianName}`);
            }
          } else {
            skipped++;
            unmatched.push(englishName);
          }
        }

        console.log('\n=== Migration Summary ===');
        console.log(`Total menu items: ${menuItems.length}`);
        console.log(`Matched with translations: ${matched}`);
        console.log(`Updated/Created: ${updated}`);
        console.log(`Skipped (no Russian found): ${skipped}`);
        
        if (unmatched.length > 0) {
          console.log('\nUnmatched items (first 10):');
          unmatched.slice(0, 10).forEach(name => console.log(`  - ${name}`));
          if (unmatched.length > 10) {
            console.log(`  ... and ${unmatched.length - 10} more`);
          }
        }

        console.log('\n✓ Migration completed successfully!');
        resolve();
      } catch (error) {
        console.error('Migration error:', error);
        reject(error);
      } finally {
        db.close();
      }
    });
  });
}

// Run the migration
migrateRussianTranslations()
  .then(() => {
    console.log('\nAll done!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
