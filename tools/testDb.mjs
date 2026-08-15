import { getSqliteDb } from '../config/database.js';

(async function(){
  const db = getSqliteDb();
  console.log('db.all type:', typeof db.all);
  console.log('db.run type:', typeof db.run);
  try {
    const maybePromise = db.all("SELECT name FROM sqlite_master WHERE type='table'");
    console.log('db.all returned:', maybePromise && typeof maybePromise.then === 'function' ? 'Promise' : typeof maybePromise);
    if (maybePromise && typeof maybePromise.then === 'function') {
      const rows = await maybePromise;
      console.log('rows length:', rows.length);
    } else {
      console.log('db.all did not return promise');
    }
  } catch (e) {
    console.error('error running db.all', e && e.stack ? e.stack : e);
  }
  process.exit(0);
})();
