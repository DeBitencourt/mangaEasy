import { Platform } from 'react-native';
import * as SQLite from 'expo-sqlite';

// Type definitions
export interface Favorite {
  id: string;
  device_id: string;
  title: string;
  cover_url: string | null;
  manga_url?: string | null;
  source?: string | null;
  updated_at: string;
  is_deleted: number; // 0 or 1
  synced: number; // 0 or 1
}

export interface ToReadItem {
  id: string;
  device_id: string;
  title: string;
  cover_url: string | null;
  manga_url?: string | null;
  source?: string | null;
  status: 'planning' | 'reading' | 'completed';
  updated_at: string;
  is_deleted: number;
  synced: number;
}

export interface ReadingHistory {
  id: string;
  device_id: string;
  title: string;
  chapter_title: string;
  read_at: string;
  updated_at: string;
  is_deleted: number;
  synced: number;
}

export interface ReadingProgress {
  id: string;
  device_id: string;
  title: string;
  chapter_title: string;
  last_page_read: number;
  total_pages: number;
  updated_at: string;
  is_deleted: number;
  synced: number;
}

// Memory fallback for Web platform
class WebDatabaseMock {
  private store: { [key: string]: string } = {};

  constructor() {
    if (typeof window !== 'undefined' && window.localStorage) {
      this.store = window.localStorage;
    }
  }

  getItem(key: string): string | null {
    return this.store[key] || null;
  }

  setItem(key: string, value: string) {
    this.store[key] = value;
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.setItem(key, value);
    }
  }
}

const webDb = new WebDatabaseMock();

let nativeDb: SQLite.SQLiteDatabase | null = null;

// Initialize SQLite database
export async function getDatabase(): Promise<SQLite.SQLiteDatabase | null> {
  if (Platform.OS === 'web') {
    return null;
  }
  if (!nativeDb) {
    nativeDb = await SQLite.openDatabaseAsync('mangaeasy.db');
    await initSchema(nativeDb);
  }
  return nativeDb;
}

// Generate a simple UUID
function generateUUID(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

// Get or create unique anonymous device ID
export async function getDeviceId(): Promise<string> {
  if (Platform.OS === 'web') {
    let id = webDb.getItem('device_id');
    if (!id) {
      id = 'web-' + generateUUID();
      webDb.setItem('device_id', id);
    }
    return id;
  }

  const db = await getDatabase();
  if (!db) return 'unknown';

  const row = await db.getFirstAsync<{ value: string }>(
    'SELECT value FROM settings WHERE key = ?',
    ['device_id']
  );

  if (row) {
    return row.value;
  }

  const newId = generateUUID();
  await db.runAsync('INSERT INTO settings (key, value) VALUES (?, ?)', ['device_id', newId]);
  return newId;
}

// Create tables
async function initSchema(db: SQLite.SQLiteDatabase) {
  // Settings table
  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT
    );
  `);

  // Favorites table
  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS favorites (
      id TEXT PRIMARY KEY,
      device_id TEXT NOT NULL,
      title TEXT NOT NULL,
      cover_url TEXT,
      manga_url TEXT,
      source TEXT,
      updated_at TEXT NOT NULL,
      is_deleted INTEGER DEFAULT 0,
      synced INTEGER DEFAULT 0,
      UNIQUE(device_id, title)
    );
  `);

  // To Read table
  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS to_read_list (
      id TEXT PRIMARY KEY,
      device_id TEXT NOT NULL,
      title TEXT NOT NULL,
      cover_url TEXT,
      manga_url TEXT,
      source TEXT,
      status TEXT DEFAULT 'planning',
      updated_at TEXT NOT NULL,
      is_deleted INTEGER DEFAULT 0,
      synced INTEGER DEFAULT 0,
      UNIQUE(device_id, title)
    );
  `);

  // History table
  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS reading_history (
      id TEXT PRIMARY KEY,
      device_id TEXT NOT NULL,
      title TEXT NOT NULL,
      chapter_title TEXT NOT NULL,
      read_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      is_deleted INTEGER DEFAULT 0,
      synced INTEGER DEFAULT 0,
      UNIQUE(device_id, title, chapter_title)
    );
  `);

  // Reading Progress table
  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS reading_progress (
      id TEXT PRIMARY KEY,
      device_id TEXT NOT NULL,
      title TEXT NOT NULL,
      chapter_title TEXT NOT NULL,
      last_page_read INTEGER NOT NULL,
      total_pages INTEGER NOT NULL,
      updated_at TEXT NOT NULL,
      is_deleted INTEGER DEFAULT 0,
      synced INTEGER DEFAULT 0,
      UNIQUE(device_id, title, chapter_title)
    );
  `);

  // Migrations for existing databases
  try {
    await db.execAsync('ALTER TABLE favorites ADD COLUMN manga_url TEXT;');
  } catch (e) {}
  try {
    await db.execAsync('ALTER TABLE favorites ADD COLUMN source TEXT;');
  } catch (e) {}
  try {
    await db.execAsync('ALTER TABLE to_read_list ADD COLUMN manga_url TEXT;');
  } catch (e) {}
  try {
    await db.execAsync('ALTER TABLE to_read_list ADD COLUMN source TEXT;');
  } catch (e) {}
}

// --- CRUD Operations ---

// 1. Favorites CRUD
export async function toggleFavoriteLocal(title: string, coverUrl: string | null, mangaUrl?: string, source?: string): Promise<boolean> {
  const deviceId = await getDeviceId();
  const timestamp = new Date().toISOString();

  if (Platform.OS === 'web') {
    const listKey = 'web_favorites';
    const favs: Favorite[] = JSON.parse(webDb.getItem(listKey) || '[]');
    const existingIdx = favs.findIndex((f) => f.title === title);

    if (existingIdx >= 0) {
      if (favs[existingIdx].is_deleted === 0) {
        favs[existingIdx].is_deleted = 1;
        favs[existingIdx].updated_at = timestamp;
        favs[existingIdx].synced = 0;
        webDb.setItem(listKey, JSON.stringify(favs));
        return false; // desfavoritado
      } else {
        favs[existingIdx].is_deleted = 0;
        favs[existingIdx].updated_at = timestamp;
        favs[existingIdx].synced = 0;
        if (mangaUrl) favs[existingIdx].manga_url = mangaUrl;
        if (source) favs[existingIdx].source = source;
        webDb.setItem(listKey, JSON.stringify(favs));
        return true; // favoritado novamente
      }
    } else {
      favs.push({
        id: generateUUID(),
        device_id: deviceId,
        title,
        cover_url: coverUrl,
        manga_url: mangaUrl || null,
        source: source || null,
        updated_at: timestamp,
        is_deleted: 0,
        synced: 0,
      });
      webDb.setItem(listKey, JSON.stringify(favs));
      return true;
    }
  }

  const db = await getDatabase();
  if (!db) return false;

  const existing = await db.getFirstAsync<Favorite>(
    'SELECT * FROM favorites WHERE device_id = ? AND title = ?',
    [deviceId, title]
  );

  if (existing) {
    const newIsDeleted = existing.is_deleted === 0 ? 1 : 0;
    await db.runAsync(
      'UPDATE favorites SET is_deleted = ?, updated_at = ?, synced = 0, manga_url = COALESCE(?, manga_url), source = COALESCE(?, source) WHERE id = ?',
      [newIsDeleted, timestamp, mangaUrl || null, source || null, existing.id]
    );
    return newIsDeleted === 0;
  } else {
    await db.runAsync(
      'INSERT OR REPLACE INTO favorites (id, device_id, title, cover_url, manga_url, source, updated_at, is_deleted, synced) VALUES (?, ?, ?, ?, ?, ?, ?, 0, 0)',
      [generateUUID(), deviceId, title, coverUrl, mangaUrl || null, source || null, timestamp]
    );
    return true;
  }
}

export async function isFavoriteLocal(title: string): Promise<boolean> {
  const deviceId = await getDeviceId();

  if (Platform.OS === 'web') {
    const favs: Favorite[] = JSON.parse(webDb.getItem('web_favorites') || '[]');
    const existing = favs.find((f) => f.title === title);
    return !!existing && existing.is_deleted === 0;
  }

  const db = await getDatabase();
  if (!db) return false;

  const res = await db.getFirstAsync<Favorite>(
    'SELECT * FROM favorites WHERE device_id = ? AND title = ? AND is_deleted = 0',
    [deviceId, title]
  );
  return !!res;
}

export async function getActiveFavoritesLocal(): Promise<Favorite[]> {
  const deviceId = await getDeviceId();

  if (Platform.OS === 'web') {
    const favs: Favorite[] = JSON.parse(webDb.getItem('web_favorites') || '[]');
    return favs.filter((f) => f.is_deleted === 0);
  }

  const db = await getDatabase();
  if (!db) return [];

  return await db.getAllAsync<Favorite>(
    'SELECT * FROM favorites WHERE device_id = ? AND is_deleted = 0 ORDER BY updated_at DESC',
    [deviceId]
  );
}

// 2. To Read List CRUD
export async function toggleToReadLocal(title: string, coverUrl: string | null, status: 'planning' | 'reading' | 'completed' = 'planning', mangaUrl?: string, source?: string): Promise<boolean> {
  const deviceId = await getDeviceId();
  const timestamp = new Date().toISOString();

  if (Platform.OS === 'web') {
    const listKey = 'web_to_read';
    const list: ToReadItem[] = JSON.parse(webDb.getItem(listKey) || '[]');
    const existingIdx = list.findIndex((item) => item.title === title);

    if (existingIdx >= 0) {
      if (list[existingIdx].is_deleted === 0) {
        list[existingIdx].is_deleted = 1;
        list[existingIdx].updated_at = timestamp;
        list[existingIdx].synced = 0;
        webDb.setItem(listKey, JSON.stringify(list));
        return false;
      } else {
        list[existingIdx].is_deleted = 0;
        list[existingIdx].status = status;
        list[existingIdx].updated_at = timestamp;
        list[existingIdx].synced = 0;
        if (mangaUrl) list[existingIdx].manga_url = mangaUrl;
        if (source) list[existingIdx].source = source;
        webDb.setItem(listKey, JSON.stringify(list));
        return true;
      }
    } else {
      list.push({
        id: generateUUID(),
        device_id: deviceId,
        title,
        cover_url: coverUrl,
        manga_url: mangaUrl || null,
        source: source || null,
        status,
        updated_at: timestamp,
        is_deleted: 0,
        synced: 0,
      });
      webDb.setItem(listKey, JSON.stringify(list));
      return true;
    }
  }

  const db = await getDatabase();
  if (!db) return false;

  const existing = await db.getFirstAsync<ToReadItem>(
    'SELECT * FROM to_read_list WHERE device_id = ? AND title = ?',
    [deviceId, title]
  );

  if (existing) {
    const newIsDeleted = existing.is_deleted === 0 ? 1 : 0;
    await db.runAsync(
      'UPDATE to_read_list SET is_deleted = ?, status = ?, updated_at = ?, synced = 0, manga_url = COALESCE(?, manga_url), source = COALESCE(?, source) WHERE id = ?',
      [newIsDeleted, status, timestamp, mangaUrl || null, source || null, existing.id]
    );
    return newIsDeleted === 0;
  } else {
    await db.runAsync(
      'INSERT OR REPLACE INTO to_read_list (id, device_id, title, cover_url, status, manga_url, source, updated_at, is_deleted, synced) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, 0)',
      [generateUUID(), deviceId, title, coverUrl, status, mangaUrl || null, source || null, timestamp]
    );
    return true;
  }
}

export async function isToReadLocal(title: string): Promise<boolean> {
  const deviceId = await getDeviceId();

  if (Platform.OS === 'web') {
    const list: ToReadItem[] = JSON.parse(webDb.getItem('web_to_read') || '[]');
    const existing = list.find((item) => item.title === title);
    return !!existing && existing.is_deleted === 0;
  }

  const db = await getDatabase();
  if (!db) return false;

  const res = await db.getFirstAsync<ToReadItem>(
    'SELECT * FROM to_read_list WHERE device_id = ? AND title = ? AND is_deleted = 0',
    [deviceId, title]
  );
  return !!res;
}

export async function getToReadListLocal(): Promise<ToReadItem[]> {
  const deviceId = await getDeviceId();

  if (Platform.OS === 'web') {
    const list: ToReadItem[] = JSON.parse(webDb.getItem('web_to_read') || '[]');
    return list.filter((item) => item.is_deleted === 0);
  }

  const db = await getDatabase();
  if (!db) return [];

  return await db.getAllAsync<ToReadItem>(
    'SELECT * FROM to_read_list WHERE device_id = ? AND is_deleted = 0 ORDER BY updated_at DESC',
    [deviceId]
  );
}

// 3. Reading History CRUD
export async function addReadingHistoryLocal(title: string, chapterTitle: string): Promise<void> {
  const deviceId = await getDeviceId();
  const timestamp = new Date().toISOString();

  if (Platform.OS === 'web') {
    const listKey = 'web_history';
    const history: ReadingHistory[] = JSON.parse(webDb.getItem(listKey) || '[]');
    const existingIdx = history.findIndex((h) => h.title === title && h.chapter_title === chapterTitle);

    if (existingIdx >= 0) {
      history[existingIdx].read_at = timestamp;
      history[existingIdx].updated_at = timestamp;
      history[existingIdx].is_deleted = 0;
      history[existingIdx].synced = 0;
    } else {
      history.push({
        id: generateUUID(),
        device_id: deviceId,
        title,
        chapter_title: chapterTitle,
        read_at: timestamp,
        updated_at: timestamp,
        is_deleted: 0,
        synced: 0,
      });
    }
    webDb.setItem(listKey, JSON.stringify(history));
    return;
  }

  const db = await getDatabase();
  if (!db) return;

  await db.runAsync(
    `INSERT OR REPLACE INTO reading_history (id, device_id, title, chapter_title, read_at, updated_at, is_deleted, synced)
     VALUES (
       COALESCE((SELECT id FROM reading_history WHERE device_id = ? AND title = ? AND chapter_title = ?), ?),
       ?, ?, ?, ?, ?, 0, 0
     )`,
    [deviceId, title, chapterTitle, generateUUID(), deviceId, title, chapterTitle, timestamp, timestamp]
  );
}

export async function getReadingHistoryLocal(): Promise<ReadingHistory[]> {
  const deviceId = await getDeviceId();

  if (Platform.OS === 'web') {
    const history: ReadingHistory[] = JSON.parse(webDb.getItem('web_history') || '[]');
    return history.filter((h) => h.is_deleted === 0).sort((a, b) => b.read_at.localeCompare(a.read_at));
  }

  const db = await getDatabase();
  if (!db) return [];

  return await db.getAllAsync<ReadingHistory>(
    'SELECT * FROM reading_history WHERE device_id = ? AND is_deleted = 0 ORDER BY read_at DESC',
    [deviceId]
  );
}

// 4. Reading Progress CRUD
export async function saveReadingProgressLocal(title: string, chapterTitle: string, lastPage: number, totalPages: number): Promise<void> {
  const deviceId = await getDeviceId();
  const timestamp = new Date().toISOString();

  if (Platform.OS === 'web') {
    const listKey = 'web_progress';
    const progressList: ReadingProgress[] = JSON.parse(webDb.getItem(listKey) || '[]');
    const existingIdx = progressList.findIndex((p) => p.title === title && p.chapter_title === chapterTitle);

    if (existingIdx >= 0) {
      progressList[existingIdx].last_page_read = lastPage;
      progressList[existingIdx].total_pages = totalPages;
      progressList[existingIdx].updated_at = timestamp;
      progressList[existingIdx].is_deleted = 0;
      progressList[existingIdx].synced = 0;
    } else {
      progressList.push({
        id: generateUUID(),
        device_id: deviceId,
        title,
        chapter_title: chapterTitle,
        last_page_read: lastPage,
        total_pages: totalPages,
        updated_at: timestamp,
        is_deleted: 0,
        synced: 0,
      });
    }
    webDb.setItem(listKey, JSON.stringify(progressList));
    return;
  }

  const db = await getDatabase();
  if (!db) return;

  await db.runAsync(
    `INSERT OR REPLACE INTO reading_progress (id, device_id, title, chapter_title, last_page_read, total_pages, updated_at, is_deleted, synced)
     VALUES (
       COALESCE((SELECT id FROM reading_progress WHERE device_id = ? AND title = ? AND chapter_title = ?), ?),
       ?, ?, ?, ?, ?, ?, 0, 0
     )`,
    [deviceId, title, chapterTitle, generateUUID(), deviceId, title, chapterTitle, lastPage, totalPages, timestamp]
  );
}

export async function getChapterProgressLocal(title: string, chapterTitle: string): Promise<ReadingProgress | null> {
  const deviceId = await getDeviceId();

  if (Platform.OS === 'web') {
    const progressList: ReadingProgress[] = JSON.parse(webDb.getItem('web_progress') || '[]');
    const progress = progressList.find((p) => p.title === title && p.chapter_title === chapterTitle && p.is_deleted === 0);
    return progress || null;
  }

  const db = await getDatabase();
  if (!db) return null;

  const res = await db.getFirstAsync<ReadingProgress>(
    'SELECT * FROM reading_progress WHERE device_id = ? AND title = ? AND chapter_title = ? AND is_deleted = 0',
    [deviceId, title, chapterTitle]
  );
  return res;
}

export async function getMangaLastReadChapterLocal(title: string): Promise<string | null> {
  const deviceId = await getDeviceId();
  const sanitized = title.replace(/[\\/:*?"<>|]/g, '_').trim();

  if (Platform.OS === 'web') {
    const history: ReadingHistory[] = JSON.parse(webDb.getItem('web_history') || '[]');
    const filtered = history
      .filter((h) => (h.title.toLowerCase() === title.toLowerCase() || h.title.toLowerCase() === sanitized.toLowerCase()) && h.is_deleted === 0)
      .sort((a, b) => b.read_at.localeCompare(a.read_at));
    return filtered.length > 0 ? filtered[0].chapter_title : null;
  }

  const db = await getDatabase();
  if (!db) return null;

  const res = await db.getFirstAsync<{ chapter_title: string }>(
    'SELECT chapter_title FROM reading_history WHERE device_id = ? AND (LOWER(title) = LOWER(?) OR LOWER(title) = LOWER(?)) AND is_deleted = 0 ORDER BY read_at DESC LIMIT 1',
    [deviceId, title, sanitized]
  );
  return res ? res.chapter_title : null;
}
