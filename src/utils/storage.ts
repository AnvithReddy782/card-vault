import { ContactRecord, PendingOfflineScan } from '../types/card';
import {
  isGarbageContactRecord,
  repairContactRecordFields,
} from './cardValidator';

const DB_NAME = 'cardvault_enterprise_db';
const DB_VERSION = 1;
const STORE_CONTACTS = 'contacts';
const STORE_QUEUE = 'pending_queue';

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_CONTACTS)) {
        db.createObjectStore(STORE_CONTACTS, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(STORE_QUEUE)) {
        db.createObjectStore(STORE_QUEUE, { keyPath: 'id' });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function getAllLocalContacts(): Promise<ContactRecord[]> {
  try {
    const db = await openDatabase();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_CONTACTS, 'readwrite');
      const store = tx.objectStore(STORE_CONTACTS);
      const req = store.getAll();
      req.onsuccess = () => {
        const rawList = (req.result || []) as ContactRecord[];
        const cleanList: ContactRecord[] = [];
        for (const item of rawList) {
          if (isGarbageContactRecord(item)) {
            store.delete(item.id);
          } else {
            const repaired = repairContactRecordFields(item);
            store.put(repaired);
            cleanList.push(repaired);
          }
        }
        cleanList.sort(
          (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
        );
        resolve(cleanList);
      };
      req.onerror = () => reject(req.error);
    });
  } catch (err) {
    console.warn('IndexedDB read fallback:', err);
    return [];
  }
}

export async function saveLocalContact(contact: ContactRecord): Promise<void> {
  if (isGarbageContactRecord(contact)) {
    return;
  }
  try {
    const repaired = repairContactRecordFields(contact);
    const db = await openDatabase();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_CONTACTS, 'readwrite');
      const store = tx.objectStore(STORE_CONTACTS);
      store.put(repaired);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch (err) {
    console.warn('IndexedDB write fallback:', err);
  }
}

export async function saveLocalContactsBatch(contacts: ContactRecord[]): Promise<void> {
  if (!contacts || contacts.length === 0) return;
  try {
    const db = await openDatabase();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_CONTACTS, 'readwrite');
      const store = tx.objectStore(STORE_CONTACTS);
      for (const contact of contacts) {
        if (!isGarbageContactRecord(contact)) {
          store.put(repairContactRecordFields(contact));
        }
      }
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch (err) {
    console.warn('IndexedDB batch write fallback:', err);
  }
}

export async function deleteLocalContact(id: string): Promise<void> {
  try {
    const db = await openDatabase();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_CONTACTS, 'readwrite');
      const store = tx.objectStore(STORE_CONTACTS);
      store.delete(id);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch (err) {
    console.warn('IndexedDB delete error:', err);
  }
}

export async function getPendingOfflineQueue(): Promise<PendingOfflineScan[]> {
  try {
    const db = await openDatabase();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_QUEUE, 'readonly');
      const store = tx.objectStore(STORE_QUEUE);
      const req = store.getAll();
      req.onsuccess = () => {
        const items = (req.result || []) as PendingOfflineScan[];
        items.sort(
          (a, b) => new Date(a.capturedAt).getTime() - new Date(b.capturedAt).getTime()
        );
        resolve(items);
      };
      req.onerror = () => reject(req.error);
    });
  } catch {
    return [];
  }
}

export async function putPendingOfflineScan(item: PendingOfflineScan): Promise<void> {
  try {
    const db = await openDatabase();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_QUEUE, 'readwrite');
      const store = tx.objectStore(STORE_QUEUE);
      store.put(item);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch (err) {
    console.warn('Queue save error:', err);
  }
}

export async function removePendingOfflineScan(id: string): Promise<void> {
  try {
    const db = await openDatabase();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_QUEUE, 'readwrite');
      const store = tx.objectStore(STORE_QUEUE);
      store.delete(id);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch (err) {
    console.warn('Queue remove error:', err);
  }
}

export async function computeScanHash(
  frontBase64: string,
  backBase64?: string
): Promise<string> {
  const combined = `${frontBase64.slice(0, 4096)}|${frontBase64.length}|${
    backBase64 ? backBase64.slice(0, 4096) + '|' + backBase64.length : 'single'
  }`;
  if (typeof crypto !== 'undefined' && crypto.subtle) {
    const encoder = new TextEncoder();
    const data = encoder.encode(combined);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('').slice(0, 24);
  }
  let hash = 0;
  for (let i = 0; i < combined.length; i++) {
    hash = (hash << 5) - hash + combined.charCodeAt(i);
    hash |= 0;
  }
  return `scan_${Math.abs(hash)}_${frontBase64.length}`;
}

export async function syncContactsWithServer(): Promise<ContactRecord[]> {
  const localContacts = await getAllLocalContacts();
  try {
    const res = await fetch('/api/contacts');
    if (!res.ok) throw new Error('Server unreachable');
    const data = await res.json();
    const rawServerContacts: ContactRecord[] = Array.isArray(data.contacts)
      ? data.contacts
      : [];

    const validServerContacts: ContactRecord[] = [];
    for (const sc of rawServerContacts) {
      if (isGarbageContactRecord(sc)) {
        // Delete garbage record from server as well
        fetch(`/api/contacts/${sc.id}`, { method: 'DELETE' }).catch(() => {});
      } else {
        validServerContacts.push(repairContactRecordFields(sc));
      }
    }

    const mergedMap = new Map<string, ContactRecord>();
    for (const sc of validServerContacts) {
      mergedMap.set(sc.id, sc);
    }
    const toSync: ContactRecord[] = [];
    for (const lc of localContacts) {
      if (isGarbageContactRecord(lc)) continue;
      if (!mergedMap.has(lc.id) || lc.syncStatus !== 'SYNCED') {
        toSync.push(lc);
      }
    }

    if (toSync.length > 0) {
      try {
        const batchRes = await fetch('/api/contacts/batch-update', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ contacts: toSync }),
        });
        if (batchRes.ok) {
          const data = await batchRes.json();
          const serverUpdated: ContactRecord[] = Array.isArray(data.contacts) ? data.contacts : [];
          for (const su of serverUpdated) {
            mergedMap.set(su.id, repairContactRecordFields(su));
          }
        } else {
          for (const item of toSync) {
            mergedMap.set(item.id, item);
          }
        }
      } catch {
        for (const item of toSync) {
          mergedMap.set(item.id, item);
        }
      }
    }

    const finalContacts = Array.from(mergedMap.values()).sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
    await saveLocalContactsBatch(finalContacts);
    return finalContacts;
  } catch {
    return localContacts;
  }
}
