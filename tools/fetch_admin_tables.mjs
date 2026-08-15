import fetch from 'node-fetch';
const url = 'http://localhost:5000/api/admin/tables';
(async () => {
  try {
    const res = await fetch(url, { headers: { Authorization: 'Bearer rustic-charm-admin-token' } });
    console.log('status', res.status);
    const text = await res.text();
    console.log('body:', text);
  } catch (err) {
    console.error('fetch error', err.message);
    process.exit(1);
  }
})();
