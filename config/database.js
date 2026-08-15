import sqlite3 from "sqlite3";
import path from "path";
import { fileURLToPath } from "url";
import { initializeSchema, seedDefaultData } from "../database/schema.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const databasePath = path.join(__dirname, "..", "database", "rustic-charm.sqlite");

let connection;

function createPromiseSqliteDb(rawDb) {
  const originalAll = rawDb.all.bind(rawDb);
  const originalGet = rawDb.get.bind(rawDb);
  const originalRun = rawDb.run.bind(rawDb);
  const originalExec = rawDb.exec.bind(rawDb);

  rawDb.all = function (sql, params = []) {
    return new Promise((resolve, reject) => {
      originalAll(sql, params, (error, rows) => {
        if (error) return reject(error);
        resolve(rows);
      });
    });
  };

  rawDb.get = function (sql, params = []) {
    return new Promise((resolve, reject) => {
      originalGet(sql, params, (error, row) => {
        if (error) return reject(error);
        resolve(row);
      });
    });
  };

  rawDb.run = function (sql, params = []) {
    return new Promise((resolve, reject) => {
      originalRun(sql, params, function (error) {
        if (error) return reject(error);
        resolve({ lastID: this.lastID, changes: this.changes });
      });
    });
  };

  rawDb.exec = function (sql) {
    return new Promise((resolve, reject) => {
      originalExec(sql, (error) => {
        if (error) return reject(error);
        resolve();
      });
    });
  };

  return rawDb;
}

export function getDatabasePath() {
  return databasePath;
}

export function openDatabase() {
  if (connection) {
    return connection;
  }

  const rawDb = new sqlite3.Database(
    databasePath,
    sqlite3.OPEN_READWRITE | sqlite3.OPEN_CREATE,
    (error) => {
      if (error) {
        console.error("Failed to open SQLite database:", error);
      }
    }
  );

  rawDb.serialize(() => {
    rawDb.run("PRAGMA foreign_keys = ON;");
  });

  connection = createPromiseSqliteDb(rawDb);

  initializeSchema(connection)
    .then(() => seedDefaultData(connection))
    .catch((error) => {
      console.error("Failed to initialize SQLite schema:", error);
    });

  return connection;
}

export function closeDatabase() {
  return new Promise((resolve, reject) => {
    if (!connection) {
      resolve();
      return;
    }

    connection.close((error) => {
      if (error) {
        reject(error);
        return;
      }

      connection = null;
      resolve();
    });
  });
}

export function getSqliteDb() {
  return openDatabase();
}
