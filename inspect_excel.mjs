import XLSX from 'xlsx';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const excelPath = path.join(__dirname, '..', 'frontend', 'src', 'data', 'menu-translation.xlsx');
console.log('Reading:', excelPath);

const workbook = XLSX.readFile(excelPath);
console.log('Sheets:', workbook.SheetNames);

const sheet = workbook.Sheets[workbook.SheetNames[0]];
const data = XLSX.utils.sheet_to_json(sheet);

console.log('Total rows:', data.length);
console.log('\nColumn headers:', Object.keys(data[0] || {}));
console.log('\nFirst 3 rows:');
data.slice(0, 3).forEach((row, i) => {
  console.log(`Row ${i+1}:`, JSON.stringify(row, null, 2));
});
