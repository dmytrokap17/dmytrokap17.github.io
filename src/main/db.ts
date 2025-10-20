import initSqlJs, { Database, SqlJsStatic } from 'sql.js';
import { readFileSync, writeFileSync, existsSync, mkdirSync, copyFileSync, readdirSync, statSync } from 'node:fs';
import { join, basename } from 'node:path';

export type Role = 'admin' | 'staff';

export interface AppDatabase {
  sql: SqlJsStatic;
  db: Database;
  dbFilePath: string;
  backupsDir: string;
  save(): void;
  backup(): string;
}

export async function openDatabase(dataDir: string): Promise<AppDatabase> {
  const wasmPath = require.resolve('sql.js/dist/sql-wasm.wasm');
  const sql = await initSqlJs({ locateFile: () => wasmPath });

  const dbFilePath = join(dataDir, 'studio.sqlite');
  const backupsDir = join(dataDir, 'backups');
  if (!existsSync(backupsDir)) mkdirSync(backupsDir, { recursive: true });

  let db: Database;
  if (existsSync(dbFilePath)) {
    const fileBuffer = readFileSync(dbFilePath);
    db = new sql.Database(fileBuffer);
  } else {
    db = new sql.Database();
  }

  migrate(db);

  return {
    sql,
    db,
    dbFilePath,
    backupsDir,
    save: () => {
      const data = db.export();
      writeFileSync(dbFilePath, Buffer.from(data));
    },
    backup: () => {
      const ts = new Date().toISOString().replace(/[:.]/g, '-');
      const backupPath = join(backupsDir, `backup-${ts}.sqlite`);
      const data = db.export();
      writeFileSync(backupPath, Buffer.from(data));
      return backupPath;
    }
  };
}

function migrate(db: Database): void {
  db.exec(`
    PRAGMA journal_mode = WAL;

    CREATE TABLE IF NOT EXISTS meta (
      key TEXT PRIMARY KEY,
      value TEXT
    );

    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL CHECK (role IN ('admin','staff')),
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS clients (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      contact_email TEXT,
      phone TEXT,
      notes TEXT,
      payment_status TEXT NOT NULL DEFAULT 'unpaid' CHECK (payment_status IN ('paid','unpaid')),
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS client_files (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      client_id INTEGER NOT NULL,
      filename TEXT NOT NULL,
      path TEXT NOT NULL,
      uploaded_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS services (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      code TEXT UNIQUE,
      name TEXT NOT NULL,
      description TEXT,
      price_default REAL,
      active INTEGER NOT NULL DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS projects (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      client_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'in_progress' CHECK (status IN ('active','in_progress','completed')),
      budget REAL,
      start_date TEXT DEFAULT (datetime('now')),
      end_date TEXT,
      FOREIGN KEY (client_id) REFERENCES clients(id)
    );

    CREATE TABLE IF NOT EXISTS project_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      project_id INTEGER NOT NULL,
      service_id INTEGER,
      description TEXT,
      quantity REAL NOT NULL DEFAULT 1,
      price REAL NOT NULL DEFAULT 0,
      FOREIGN KEY (project_id) REFERENCES projects(id),
      FOREIGN KEY (service_id) REFERENCES services(id)
    );

    CREATE TABLE IF NOT EXISTS project_assignments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      project_id INTEGER NOT NULL,
      user_id INTEGER NOT NULL,
      role TEXT,
      assigned_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (project_id) REFERENCES projects(id),
      FOREIGN KEY (user_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS invoices (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      project_id INTEGER NOT NULL,
      amount REAL NOT NULL,
      status TEXT NOT NULL CHECK (status IN ('draft','sent','paid','void')),
      issued_at TEXT NOT NULL DEFAULT (datetime('now')),
      paid_at TEXT,
      FOREIGN KEY (project_id) REFERENCES projects(id)
    );

    CREATE TABLE IF NOT EXISTS expenses (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      project_id INTEGER,
      description TEXT,
      amount REAL NOT NULL,
      date TEXT NOT NULL DEFAULT (date('now')),
      FOREIGN KEY (project_id) REFERENCES projects(id)
    );

    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT
    );
  `);

  // Seed admin if no users
  const res = db.exec("SELECT COUNT(*) as c FROM users");
  const count = res?.[0]?.values?.[0]?.[0] as number | undefined;
  if (!count) {
    // default admin: email admin@local, password admin (to be changed on first login)
    const bcrypt = require('bcryptjs') as typeof import('bcryptjs');
    const hash = bcrypt.hashSync('admin', 10);
    const stmt = db.prepare('INSERT INTO users (email, name, password_hash, role) VALUES (?, ?, ?, ?)');
    stmt.run(['admin@local', 'Админ', hash, 'admin']);
    stmt.free();
  }
}

export function listServicesFromFolder(folder: string): Array<{ code: string; name: string; description?: string; price_default?: number }>{
  if (!existsSync(folder)) return [];
  const files = readdirSync(folder).filter(f => f.endsWith('.json'));
  const services: Array<{ code: string; name: string; description?: string; price_default?: number }> = [];
  for (const f of files) {
    const full = join(folder, f);
    const stat = statSync(full);
    if (!stat.isFile()) continue;
    try {
      const j = JSON.parse(readFileSync(full, 'utf-8'));
      if (j && j.name) {
        services.push({
          code: j.code || basename(f, '.json'),
          name: j.name,
          description: j.description,
          price_default: typeof j.price_default === 'number' ? j.price_default : undefined
        });
      }
    } catch {/* ignore malformed */}
  }
  return services;
}
