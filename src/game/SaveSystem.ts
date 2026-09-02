// ============================================================
// SaveSystem — прогресс в localStorage, картины/черновики в IndexedDB.
// ============================================================
import { newSave, type SaveData } from './types';

const KEY = 'mansarda_save_v1';
const DB_NAME = 'mansarda-db';
const STORE = 'files';

export class SaveSystem {
  static load(): SaveData | null {
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) return null;
      const data = JSON.parse(raw) as SaveData;
      const base = newSave();
      return { ...base, ...data, papers: { ...base.papers, ...(data.papers || {}) }, stats: { ...base.stats, ...(data.stats || {}) } };
    } catch {
      return null;
    }
  }

  static save(data: SaveData) {
    try { localStorage.setItem(KEY, JSON.stringify(data)); } catch { /* переполнение — молча */ }
  }

  static hasSave(): boolean {
    try { return !!localStorage.getItem(KEY); } catch { return false; }
  }

  static clear() {
    try { localStorage.removeItem(KEY); } catch { /* noop */ }
  }

  // ---------- IndexedDB (полные картины и черновик) ----------
  private static db(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => {
        if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE);
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  static async idbSet(key: string, value: string): Promise<void> {
    try {
      const db = await SaveSystem.db();
      await new Promise<void>((res, rej) => {
        const tx = db.transaction(STORE, 'readwrite');
        tx.objectStore(STORE).put(value, key);
        tx.oncomplete = () => res();
        tx.onerror = () => rej(tx.error);
      });
      db.close();
    } catch { /* IDB недоступен — игра работает дальше */ }
  }

  static async idbGet(key: string): Promise<string | null> {
    try {
      const db = await SaveSystem.db();
      const val = await new Promise<string | null>((res, rej) => {
        const tx = db.transaction(STORE, 'readonly');
        const rq = tx.objectStore(STORE).get(key);
        rq.onsuccess = () => res((rq.result as string) ?? null);
        rq.onerror = () => rej(rq.error);
      });
      db.close();
      return val;
    } catch { return null; }
  }

  static async idbDel(key: string): Promise<void> {
    try {
      const db = await SaveSystem.db();
      await new Promise<void>((res) => {
        const tx = db.transaction(STORE, 'readwrite');
        tx.objectStore(STORE).delete(key);
        tx.oncomplete = () => res();
        tx.onerror = () => res();
      });
      db.close();
    } catch { /* noop */ }
  }
}
