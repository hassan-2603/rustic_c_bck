import fetch from 'node-fetch';

const urls = [
  'http://localhost:3000/api/admin/tables',
  'http://localhost:3001/api/admin/tables',
  'http://localhost:5000/api/admin/tables',
];

async function test(url, token) {
  try {
    const headers = token ? { Authorization: `Bearer ${token}`, 'x-admin-token': token } : {};
    const res = await fetch(url, { headers });
    const text = await res.text();
    console.log(`URL: ${url}  status: ${res.status}`);
    console.log('response body:', text.slice(0, 1000));
  } catch (err) {
    console.log(`URL: ${url}  error:`, err.message);
  }
}

(async () => {
  for (const url of urls) {
    await test(url);
  }
  console.log('--- with token ---');
  for (const url of urls) {
    await test(url, 'rustic-charm-admin-token');
  }
})();
