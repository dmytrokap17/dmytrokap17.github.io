import { app, BrowserWindow } from 'electron';
import { join } from 'node:path';
import { format } from 'node:url';
import { existsSync, mkdirSync } from 'node:fs';
import { openDatabase } from './db';
import { registerIpc } from './ipc';

const isDev = process.env.VITE_DEV_SERVER_URL || process.env.NODE_ENV === 'development';

function getPreloadPath(): string {
  const devPreload = join(process.cwd(), 'dist', 'preload', 'index.cjs');
  const prodPreload = join(__dirname, 'preload', 'index.cjs');
  return existsSync(devPreload) ? devPreload : prodPreload;
}

async function createWindow(): Promise<void> {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    backgroundColor: '#0a0a0a',
    autoHideMenuBar: true,
    webPreferences: {
      preload: getPreloadPath(),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });

  if (process.env.VITE_DEV_SERVER_URL) {
    await win.loadURL(process.env.VITE_DEV_SERVER_URL);
    win.webContents.openDevTools({ mode: 'detach' });
  } else {
    const indexHtml = format({
      pathname: join(__dirname, '..', 'renderer', 'index.html'),
      protocol: 'file:',
      slashes: true
    });
    await win.loadURL(indexHtml);
  }
}

let cleanup: (() => void) | null = null;
app.whenReady().then(async () => {
  const dataDir = join(app.getPath('userData'));
  const dbCtx = await openDatabase(dataDir);
  registerIpc(dbCtx);
  cleanup = () => {
    try { dbCtx.save(); } catch {}
    try { dbCtx.backup(); } catch {}
  };

  await createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) void createWindow();
  });
});

app.on('window-all-closed', () => {
  if (cleanup) cleanup();
  if (process.platform !== 'darwin') app.quit();
});

// Ensure app data folder exists (will be used later for DB and backups)
const dataDir = join(app.getPath('userData'));
if (!existsSync(dataDir)) {
  mkdirSync(dataDir, { recursive: true });
}
