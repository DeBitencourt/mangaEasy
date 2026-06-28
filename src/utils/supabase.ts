import { Platform } from 'react-native';
import { createClient } from '@supabase/supabase-js';
import { getDatabase, getDeviceId, Favorite, ToReadItem, ReadingHistory, ReadingProgress } from './database';

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL || '';
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || '';

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

export interface SyncStats {
  favoritesSynced: number;
  toReadSynced: number;
  historySynced: number;
  progressSynced: number;
}

/**
 * Synchronizes local non-synced data with Supabase.
 */
export async function syncLocalDataWithCloud(): Promise<SyncStats> {
  const deviceId = await getDeviceId();
  const stats: SyncStats = {
    favoritesSynced: 0,
    toReadSynced: 0,
    historySynced: 0,
    progressSynced: 0,
  };

  // --- 1. Sincronizar Favoritos ---
  let favoritesToSync: Favorite[] = [];
  if (Platform.OS === 'web') {
    const listKey = 'web_favorites';
    const allFavs: Favorite[] = JSON.parse(window.localStorage.getItem(listKey) || '[]');
    favoritesToSync = allFavs.filter((f) => f.synced === 0);
  } else {
    const db = await getDatabase();
    if (db) {
      favoritesToSync = await db.getAllAsync<Favorite>(
        'SELECT * FROM favorites WHERE device_id = ? AND synced = 0',
        [deviceId]
      );
    }
  }

  if (favoritesToSync.length > 0) {
    // Map objects to match database column structure
    const payload = favoritesToSync.map((f) => ({
      id: f.id,
      device_id: f.device_id,
      title: f.title,
      cover_url: f.cover_url,
      updated_at: f.updated_at,
      is_deleted: f.is_deleted === 1,
    }));

    const { error } = await supabase.from('favorites').upsert(payload, { onConflict: 'device_id,title' });
    if (!error) {
      stats.favoritesSynced = favoritesToSync.length;
      if (Platform.OS === 'web') {
        const listKey = 'web_favorites';
        const allFavs: Favorite[] = JSON.parse(window.localStorage.getItem(listKey) || '[]');
        favoritesToSync.forEach((f) => {
          const idx = allFavs.findIndex((item) => item.id === f.id);
          if (idx >= 0) allFavs[idx].synced = 1;
        });
        // Limpar registros excluídos fisicamente após sincronização
        const cleaned = allFavs.filter((f) => !(f.is_deleted === 1 && f.synced === 1));
        window.localStorage.setItem(listKey, JSON.stringify(cleaned));
      } else {
        const db = await getDatabase();
        if (db) {
          // Atualiza status local para sincronizado
          for (const f of favoritesToSync) {
            await db.runAsync('UPDATE favorites SET synced = 1 WHERE id = ?', [f.id]);
          }
          // Limpa registros excluídos fisicamente após sincronizar a exclusão
          await db.runAsync('DELETE FROM favorites WHERE is_deleted = 1 AND synced = 1', []);
        }
      }
    } else {
      console.error('[SYNC ERROR] Favorites sync failed:', error);
    }
  }

  // --- 2. Sincronizar Lista "A Ler" ---
  let toReadToSync: ToReadItem[] = [];
  if (Platform.OS === 'web') {
    const listKey = 'web_to_read';
    const allList: ToReadItem[] = JSON.parse(window.localStorage.getItem(listKey) || '[]');
    toReadToSync = allList.filter((item) => item.synced === 0);
  } else {
    const db = await getDatabase();
    if (db) {
      toReadToSync = await db.getAllAsync<ToReadItem>(
        'SELECT * FROM to_read_list WHERE device_id = ? AND synced = 0',
        [deviceId]
      );
    }
  }

  if (toReadToSync.length > 0) {
    const payload = toReadToSync.map((item) => ({
      id: item.id,
      device_id: item.device_id,
      title: item.title,
      cover_url: item.cover_url,
      status: item.status,
      updated_at: item.updated_at,
      is_deleted: item.is_deleted === 1,
    }));

    const { error } = await supabase.from('to_read_list').upsert(payload, { onConflict: 'device_id,title' });
    if (!error) {
      stats.toReadSynced = toReadToSync.length;
      if (Platform.OS === 'web') {
        const listKey = 'web_to_read';
        const allList: ToReadItem[] = JSON.parse(window.localStorage.getItem(listKey) || '[]');
        toReadToSync.forEach((item) => {
          const idx = allList.findIndex((x) => x.id === item.id);
          if (idx >= 0) allList[idx].synced = 1;
        });
        const cleaned = allList.filter((item) => !(item.is_deleted === 1 && item.synced === 1));
        window.localStorage.setItem(listKey, JSON.stringify(cleaned));
      } else {
        const db = await getDatabase();
        if (db) {
          for (const item of toReadToSync) {
            await db.runAsync('UPDATE to_read_list SET synced = 1 WHERE id = ?', [item.id]);
          }
          await db.runAsync('DELETE FROM to_read_list WHERE is_deleted = 1 AND synced = 1', []);
        }
      }
    } else {
      console.error('[SYNC ERROR] ToRead list sync failed:', error);
    }
  }

  // --- 3. Sincronizar Histórico de Leitura ---
  let historyToSync: ReadingHistory[] = [];
  if (Platform.OS === 'web') {
    const listKey = 'web_history';
    const allHistory: ReadingHistory[] = JSON.parse(window.localStorage.getItem(listKey) || '[]');
    historyToSync = allHistory.filter((h) => h.synced === 0);
  } else {
    const db = await getDatabase();
    if (db) {
      historyToSync = await db.getAllAsync<ReadingHistory>(
        'SELECT * FROM reading_history WHERE device_id = ? AND synced = 0',
        [deviceId]
      );
    }
  }

  if (historyToSync.length > 0) {
    const payload = historyToSync.map((h) => ({
      id: h.id,
      device_id: h.device_id,
      title: h.title,
      chapter_title: h.chapter_title,
      read_at: h.read_at,
      updated_at: h.updated_at,
      is_deleted: h.is_deleted === 1,
    }));

    const { error } = await supabase.from('reading_history').upsert(payload, { onConflict: 'device_id,title,chapter_title' });
    if (!error) {
      stats.historySynced = historyToSync.length;
      if (Platform.OS === 'web') {
        const listKey = 'web_history';
        const allHistory: ReadingHistory[] = JSON.parse(window.localStorage.getItem(listKey) || '[]');
        historyToSync.forEach((h) => {
          const idx = allHistory.findIndex((x) => x.id === h.id);
          if (idx >= 0) allHistory[idx].synced = 1;
        });
        const cleaned = allHistory.filter((h) => !(h.is_deleted === 1 && h.synced === 1));
        window.localStorage.setItem(listKey, JSON.stringify(cleaned));
      } else {
        const db = await getDatabase();
        if (db) {
          for (const h of historyToSync) {
            await db.runAsync('UPDATE reading_history SET synced = 1 WHERE id = ?', [h.id]);
          }
          await db.runAsync('DELETE FROM reading_history WHERE is_deleted = 1 AND synced = 1', []);
        }
      }
    } else {
      console.error('[SYNC ERROR] Reading history sync failed:', error);
    }
  }

  // --- 4. Sincronizar Progresso de Página ---
  let progressToSync: ReadingProgress[] = [];
  if (Platform.OS === 'web') {
    const listKey = 'web_progress';
    const allProgress: ReadingProgress[] = JSON.parse(window.localStorage.getItem(listKey) || '[]');
    progressToSync = allProgress.filter((p) => p.synced === 0);
  } else {
    const db = await getDatabase();
    if (db) {
      progressToSync = await db.getAllAsync<ReadingProgress>(
        'SELECT * FROM reading_progress WHERE device_id = ? AND synced = 0',
        [deviceId]
      );
    }
  }

  if (progressToSync.length > 0) {
    const payload = progressToSync.map((p) => ({
      id: p.id,
      device_id: p.device_id,
      title: p.title,
      chapter_title: p.chapter_title,
      last_page_read: p.last_page_read,
      total_pages: p.total_pages,
      updated_at: p.updated_at,
      is_deleted: p.is_deleted === 1,
    }));

    const { error } = await supabase.from('reading_progress').upsert(payload, { onConflict: 'device_id,title,chapter_title' });
    if (!error) {
      stats.progressSynced = progressToSync.length;
      if (Platform.OS === 'web') {
        const listKey = 'web_progress';
        const allProgress: ReadingProgress[] = JSON.parse(window.localStorage.getItem(listKey) || '[]');
        progressToSync.forEach((p) => {
          const idx = allProgress.findIndex((x) => x.id === p.id);
          if (idx >= 0) allProgress[idx].synced = 1;
        });
        const cleaned = allProgress.filter((p) => !(p.is_deleted === 1 && p.synced === 1));
        window.localStorage.setItem(listKey, JSON.stringify(cleaned));
      } else {
        const db = await getDatabase();
        if (db) {
          for (const p of progressToSync) {
            await db.runAsync('UPDATE reading_progress SET synced = 1 WHERE id = ?', [p.id]);
          }
          await db.runAsync('DELETE FROM reading_progress WHERE is_deleted = 1 AND synced = 1', []);
        }
      }
    } else {
      console.error('[SYNC ERROR] Reading progress sync failed:', error);
    }
  }

  return stats;
}

/**
 * Downloads all backup data from Supabase for a specific device code/ID and overwrites local database.
 */
export async function downloadCloudBackup(backupDeviceId: string): Promise<boolean> {
  try {
    // 1. Fetch from Supabase
    const favsRes = await supabase.from('favorites').select('*').eq('device_id', backupDeviceId).eq('is_deleted', false);
    const toReadRes = await supabase.from('to_read_list').select('*').eq('device_id', backupDeviceId).eq('is_deleted', false);
    const historyRes = await supabase.from('reading_history').select('*').eq('device_id', backupDeviceId).eq('is_deleted', false);
    const progressRes = await supabase.from('reading_progress').select('*').eq('device_id', backupDeviceId).eq('is_deleted', false);

    if (favsRes.error || toReadRes.error || historyRes.error || progressRes.error) {
      console.error('[RESTORE ERROR] Cloud fetch failed:', favsRes.error || toReadRes.error || historyRes.error || progressRes.error);
      return false;
    }

    // 2. Save locally
    if (Platform.OS === 'web') {
      const transform = (items: any[]) => items.map((x) => ({ ...x, is_deleted: 0, synced: 1 }));
      window.localStorage.setItem('web_favorites', JSON.stringify(transform(favsRes.data || [])));
      window.localStorage.setItem('web_to_read', JSON.stringify(transform(toReadRes.data || [])));
      window.localStorage.setItem('web_history', JSON.stringify(transform(historyRes.data || [])));
      window.localStorage.setItem('web_progress', JSON.stringify(transform(progressRes.data || [])));
      window.localStorage.setItem('device_id', backupDeviceId);
    } else {
      const db = await getDatabase();
      if (!db) return false;

      // Update device_id
      await db.runAsync('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)', ['device_id', backupDeviceId]);

      // Clear local tables
      await db.runAsync('DELETE FROM favorites', []);
      await db.runAsync('DELETE FROM to_read_list', []);
      await db.runAsync('DELETE FROM reading_history', []);
      await db.runAsync('DELETE FROM reading_progress', []);

      // Import favorites
      for (const item of (favsRes.data || [])) {
        await db.runAsync(
          'INSERT INTO favorites (id, device_id, title, cover_url, updated_at, is_deleted, synced) VALUES (?, ?, ?, ?, ?, 0, 1)',
          [item.id, item.device_id, item.title, item.cover_url, item.updated_at]
        );
      }

      // Import to read list
      for (const item of (toReadRes.data || [])) {
        await db.runAsync(
          'INSERT INTO to_read_list (id, device_id, title, cover_url, status, updated_at, is_deleted, synced) VALUES (?, ?, ?, ?, ?, ?, 0, 1)',
          [item.id, item.device_id, item.title, item.cover_url, item.status, item.updated_at]
        );
      }

      // Import history
      for (const item of (historyRes.data || [])) {
        await db.runAsync(
          'INSERT INTO reading_history (id, device_id, title, chapter_title, read_at, updated_at, is_deleted, synced) VALUES (?, ?, ?, ?, ?, ?, 0, 1)',
          [item.id, item.device_id, item.title, item.chapter_title, item.read_at, item.updated_at]
        );
      }

      // Import progress
      for (const item of (progressRes.data || [])) {
        await db.runAsync(
          'INSERT INTO reading_progress (id, device_id, title, chapter_title, last_page_read, total_pages, updated_at, is_deleted, synced) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, 1)',
          [item.id, item.device_id, item.title, item.chapter_title, item.last_page_read, item.total_pages, item.updated_at]
        );
      }
    }

    return true;
  } catch (err) {
    console.error('[RESTORE ERROR] Restore process crashed:', err);
    return false;
  }
}
