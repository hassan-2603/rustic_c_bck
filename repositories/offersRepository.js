import { getSqliteDb } from "../config/database.js";

const sqlite = {
  async all(sql, params = []) {
    const db = getSqliteDb();
    return new Promise((resolve, reject) => {
      db.all(sql, params, (error, rows) => {
        if (error) {
          reject(error);
          return;
        }
        resolve(rows || []);
      });
    });
  },

  async run(sql, params = []) {
    const db = getSqliteDb();
    return new Promise((resolve, reject) => {
      db.run(sql, params, function onRun(error) {
        if (error) {
          reject(error);
          return;
        }
        resolve({ changes: this.changes, lastID: this.lastID });
      });
    });
  },
};

const toBoolean = (value) => value === 1 || value === true || value === "1";

const normalizeOffer = (row) => ({
  id: row.id,
  title: row.title,
  description: row.description || "",
  code: row.code || "",
  discountTag: row.discount_tag || "",
  isActive: toBoolean(row.is_active),
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

export async function getOffersFromDb() {
  const rows = await sqlite.all("SELECT * FROM offers ORDER BY created_at DESC");
  return rows.map(normalizeOffer);
}

export async function addOfferToDb(offer) {
  const id = offer.id || (globalThis.crypto && crypto.randomUUID ? crypto.randomUUID() : `offer-${Date.now()}`);
  const payload = {
    id,
    title: offer.title || "",
    description: offer.description || "",
    code: offer.code || "",
    discount_tag: offer.discountTag || "",
    is_active: offer.isActive === false ? 0 : 1,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  await sqlite.run(
    "INSERT INTO offers (id, title, description, code, discount_tag, is_active, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
    [payload.id, payload.title, payload.description, payload.code, payload.discount_tag, payload.is_active, payload.created_at, payload.updated_at]
  );

  return normalizeOffer(payload);
}

export async function updateOfferInDb(id, updates) {
  const entry = { ...updates, updated_at: new Date().toISOString() };
  const entries = Object.entries({
    title: entry.title,
    description: entry.description,
    code: entry.code,
    discount_tag: entry.discountTag,
    is_active: entry.isActive === undefined ? undefined : entry.isActive ? 1 : 0,
    updated_at: entry.updated_at,
  }).filter(([, value]) => value !== undefined);

  if (!entries.length) {
    return { id, ...updates };
  }

  const clauses = entries.map(([key]) => `${key} = ?`).join(", ");
  const params = entries.map(([, value]) => value);
  params.push(id);

  await sqlite.run(`UPDATE offers SET ${clauses} WHERE id = ?`, params);
  return { id, ...updates };
}

export async function deleteOfferFromDb(id) {
  await sqlite.run("DELETE FROM offers WHERE id = ?", [id]);
  return { id };
}
