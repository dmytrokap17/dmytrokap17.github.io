import { ipcMain, dialog, app } from 'electron';
import type { AppDatabase } from './db';
import { join } from 'node:path';
import { copyFileSync, existsSync, mkdirSync } from 'node:fs';

export function registerIpc(dbCtx: AppDatabase): void {
  ipcMain.handle('auth:login', (_e, { email, password }: { email: string; password: string }) => {
    const res = dbCtx.db.exec('SELECT id, email, name, password_hash, role FROM users WHERE email = ?', [email]);
    const row = res?.[0]?.values?.[0];
    if (!row) return { ok: false };
    const [id, e, name, hash, role] = row as [number, string, string, string, string];
    const bcrypt = require('bcryptjs') as typeof import('bcryptjs');
    const valid = bcrypt.compareSync(password, hash);
    if (!valid) return { ok: false };
    return { ok: true, user: { id, email: e, name, role } };
  });

  ipcMain.handle('clients:create', (_e, payload: { name: string; contact_email?: string; phone?: string; notes?: string; payment_status?: 'paid'|'unpaid' }) => {
    const stmt = dbCtx.db.prepare('INSERT INTO clients (name, contact_email, phone, notes, payment_status) VALUES (?, ?, ?, ?, ?)');
    stmt.run([payload.name, payload.contact_email ?? null, payload.phone ?? null, payload.notes ?? null, payload.payment_status ?? 'unpaid']);
    stmt.free();
    dbCtx.save();
    const id = dbCtx.db.exec('SELECT last_insert_rowid()')[0].values[0][0] as number;
    return { id };
  });

  ipcMain.handle('clients:list', () => {
    const res = dbCtx.db.exec('SELECT id, name, contact_email, phone, notes, payment_status, created_at FROM clients ORDER BY created_at DESC');
    const rows = res[0]?.values ?? [];
    return rows.map(r => ({
      id: r[0], name: r[1], contact_email: r[2], phone: r[3], notes: r[4], payment_status: r[5], created_at: r[6]
    }));
  });

  ipcMain.handle('clients:addFile', async (_e, { clientId }: { clientId: number }) => {
    const result = await dialog.showOpenDialog({ properties: ['openFile', 'multiSelections'] });
    if (result.canceled || result.filePaths.length === 0) return { added: 0 };
    const dataDir = app.getPath('userData');
    const attachDir = join(dataDir, 'attachments', String(clientId));
    if (!existsSync(attachDir)) mkdirSync(attachDir, { recursive: true });
    let added = 0;
    for (const p of result.filePaths) {
      const dest = join(attachDir, require('node:path').basename(p));
      copyFileSync(p, dest);
      const stmt = dbCtx.db.prepare('INSERT INTO client_files (client_id, filename, path) VALUES (?, ?, ?)');
      stmt.run([clientId, require('node:path').basename(dest), dest]);
      stmt.free();
      added++;
    }
    dbCtx.save();
    return { added };
  });

  ipcMain.handle('analytics:summary', () => {
    const revenue = dbCtx.db.exec("SELECT COALESCE(SUM(amount),0) FROM invoices WHERE status = 'paid'")?.[0]?.values?.[0]?.[0] ?? 0;
    const expenses = dbCtx.db.exec('SELECT COALESCE(SUM(amount),0) FROM expenses')?.[0]?.values?.[0]?.[0] ?? 0;
    const projects = dbCtx.db.exec("SELECT SUM(CASE WHEN status='active' THEN 1 ELSE 0 END) as active, SUM(CASE WHEN status='in_progress' THEN 1 ELSE 0 END) as in_progress, SUM(CASE WHEN status='completed' THEN 1 ELSE 0 END) as completed FROM projects")?.[0]?.values?.[0] ?? [0,0,0];
    return { revenue, expenses, projects: { active: projects[0], in_progress: projects[1], completed: projects[2] } };
  });

  ipcMain.handle('backup:now', () => {
    const path = dbCtx.backup();
    return { path };
  });
}
