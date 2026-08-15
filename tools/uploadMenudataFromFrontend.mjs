import fs from 'fs';
import path from 'path';

const adminToken = process.env.ADMIN_TOKEN || 'rustic-charm-admin-token';
const baseUrl = process.env.BACKEND_URL || 'http://localhost:5000';

function extractArrayFromTs(filePath) {
  const txt = fs.readFileSync(filePath, 'utf8');
  const m = txt.match(/export\s+const\s+menuItems\s*=\s*(\[([\s\S]*?)\])\s*;/m);
  if (!m) throw new Error('menuItems export not found in ' + filePath);
  const arrText = m[1];
  return JSON.parse(arrText);
}

async function http(pathUrl, opts = {}) {
  const url = `${baseUrl}${pathUrl}`;
  const headers = opts.headers || {};
  headers['Content-Type'] = headers['Content-Type'] || 'application/json';
  if (!headers['Authorization']) headers['Authorization'] = `Bearer ${adminToken}`;
  const res = await fetch(url, { method: opts.method || 'GET', headers, body: opts.body ? JSON.stringify(opts.body) : undefined });
  const text = await res.text();
  try { return JSON.parse(text); } catch(e) { return text; }
}

async function post(pathUrl, body) { return http(pathUrl, { method: 'POST', body }); }
async function get(pathUrl) { return http(pathUrl, { method: 'GET' }); }

async function run() {
  const filePath = path.join('frontend','src','data','menudata.ts');
  if (!fs.existsSync(filePath)) {
    console.error('menudata.ts not found at', filePath);
    process.exit(1);
  }

  const items = extractArrayFromTs(filePath);
  console.log('Found', items.length, 'items');

  // collect categories and avoid duplicates by querying existing ones
  const categories = Array.from(new Set(items.map(i => i.category || 'Uncategorized')));
  console.log('Detected', categories.length, 'unique categories in source');
  const catMap = {};
  try {
    const existingResp = await get('/api/admin/categories');
    const existing = existingResp && existingResp.data ? existingResp.data : existingResp || [];
    const existingByName = new Map(existing.map(c => [c.name, c.id]));
    for (const name of categories) {
      if (existingByName.has(name)) {
        catMap[name] = existingByName.get(name);
        console.log('Using existing category', name, '->', catMap[name]);
        continue;
      }
      try {
        const res = await post('/api/admin/categories', { name, isActive: true });
        const created = res && res.data ? res.data : res;
        catMap[name] = created.id || created;
        console.log('Created category', name, '->', catMap[name]);
      } catch (e) {
        console.error('category create error', e && e.message ? e.message : e);
      }
    }
  } catch (e) {
    console.error('Failed to fetch existing categories, will create all:', e && e.message ? e.message : e);
    for (const name of categories) {
      try {
        const res = await post('/api/admin/categories', { name, isActive: true });
        const created = res && res.data ? res.data : res;
        catMap[name] = created.id || created;
        console.log('Created category', name, '->', catMap[name]);
      } catch (e2) {
        console.error('category create error', e2 && e2.message ? e2.message : e2);
      }
    }
  }

  // fetch existing menu items to avoid duplicates (by name+category)
  let existingItemsMap = new Map();
  try {
    const existingMenuResp = await get('/api/admin/menu');
    const existingMenu = existingMenuResp && existingMenuResp.data ? existingMenuResp.data : existingMenuResp || [];
    for (const m of existingMenu) {
      const key = `${m.name}||${m.categoryId || m.category_id || ''}`;
      existingItemsMap.set(key.toLowerCase(), m.id);
    }
  } catch (e) {
    console.warn('Could not fetch existing menu items, will attempt to create all:', e && e.message ? e.message : e);
  }

  // create menu items
  let created = 0;
  for (const it of items) {
    const body = {
      id: it.id || undefined,
      name: it.name || it.title || 'Unnamed',
      description: it.description || '',
      price: Number(it.price || 0) || 0,
      image_url: it.image || it.image_url || '',
      category_id: catMap[it.category] || null,
      is_veg: it.isVeg === false ? 0 : 1,
      is_available: it.isAvailable === false ? 0 : 1,
      is_popular: it.isPopular ? 1 : 0,
    };
    const key = `${body.name}||${body.category_id || ''}`.toLowerCase();
    if (existingItemsMap.has(key)) {
      // skip duplicates
      continue;
    }
    try {
      const res = await post('/api/admin/menu', body);
      created++;
      if (created % 50 === 0) console.log('created', created, 'items');
    } catch (e) {
      console.error('menu post error', e && e.message ? e.message : e);
    }
  }
  console.log('Done. Created approximately', created, 'menu items.');
}

run().catch(e=>{ console.error(e); process.exit(1); });
