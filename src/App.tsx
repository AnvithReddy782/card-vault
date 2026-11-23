/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useCallback, useEffect, useState } from 'react';
import {
  Camera,
  Check,
  ChevronDown,
  Cpu,
  Database,
  Download,
  FileSpreadsheet,
  Folder,
  FolderPlus,
  LayoutDashboard,
  Plus,
  Smartphone,
  Sparkles,
  UploadCloud,
  Zap,
} from 'lucide-react';
import { OcrEnginePreference } from './components/OcrSettingsModal';
import {
  ContactFields,
  ContactRecord,
  CustomCardField,
  FrontBackConflict,
  ImageQualityIssue,
  PendingOfflineScan,
  ScanSessionStats,
} from './types/card';
import {
  createEmptyContactFields,
  evaluateCoreAndRecordStatus,
  evaluateSingleField,
  findDuplicateContact,
} from './utils/cardValidator';
import {
  deleteLocalContact,
  getPendingOfflineQueue,
  putPendingOfflineScan,
  removePendingOfflineScan,
  saveLocalContact,
  saveLocalContactsBatch,
  syncContactsWithServer,
} from './utils/storage';
import {
  exportContactsToCSV,
  exportContactsToExcel,
} from './utils/exporter';
import { HeaderStatusHub } from './components/HeaderStatusHub';
import { DashboardView } from './components/DashboardView';
import { ScannerStation } from './components/ScannerStation';
import { ContactsDatabase } from './components/ContactsDatabase';
import { ExportView } from './components/ExportView';
import { ContactReviewModal } from './components/ContactReviewModal';
import { DuplicateMergeModal } from './components/DuplicateMergeModal';
import { GoogleSheetsModal } from './components/GoogleSheetsModal';
import { BulkUploadModal } from './components/BulkUploadModal';
import { MobileConnectModal } from './components/MobileConnectModal';
import { OcrSettingsModal } from './components/OcrSettingsModal';
import {
  createGoogleSheetsTab,
  deleteContactFromGoogleSheets,
  fetchServerSheetsConfig,
  getLocalSheetsConfig,
  pullContactsFromGoogleSheets,
  syncContactToGoogleSheets,
} from './services/googleSheetsService';
import { ModalProvider, useModal } from './context/ModalContext';

type ActiveTab = 'dashboard' | 'scanner' | 'contacts' | 'export';

function AppContent() {
  const [activeTab, setActiveTabState] = useState<ActiveTab>(() => {
    if (typeof window !== 'undefined') {
      const hash = window.location.hash.replace('#', '') as ActiveTab;
      if (['dashboard', 'scanner', 'contacts', 'export'].includes(hash)) {
        return hash;
      }
    }
    return 'scanner';
  });

  const setActiveTab = useCallback((tab: ActiveTab) => {
    setActiveTabState(tab);
    if (typeof window !== 'undefined' && window.location.hash !== `#${tab}`) {
      window.location.hash = tab;
    }
  }, []);

  useEffect(() => {
    const handleHashChange = () => {
      const hash = window.location.hash.replace('#', '') as ActiveTab;
      if (['dashboard', 'scanner', 'contacts', 'export'].includes(hash)) {
        setActiveTabState(hash);
      }
    };
    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, []);
  const [contacts, setContacts] = useState<ContactRecord[]>([]);
  const [pendingOfflineQueue, setPendingOfflineQueue] = useState<PendingOfflineScan[]>([]);
  const [isOfflineMode, setIsOfflineMode] = useState<boolean>(false);
  const [selectedContactIds, setSelectedContactIds] = useState<string[]>([]);

  const [sessionStats, setSessionStats] = useState<ScanSessionStats>({
    totalScanned: 0,
    autoSavedVerified: 0,
    savedNeedsReview: 0,
    failedScans: 0,
  });

  const [lastAutoSavedContact, setLastAutoSavedContact] =
    useState<ContactRecord | null>(null);
  const {
    openOcrSettings,
    closeOcrSettings,
    isOcrSettingsOpen: isOcrModalOpen,
    openSheetsModal,
    closeSheetsModal,
    isSheetsModalOpen,
    openMobileModal,
    closeMobileModal,
    isMobileModalOpen,
    openBulkUpload,
    closeBulkUpload,
    isBulkUploadOpen,
    openDuplicateMerge,
    closeDuplicateMerge,
    mergingPair,
    openContactReview,
    closeContactReview,
    reviewingContact: inspectingContact,
  } = useModal();
  const [hasGeminiKey, setHasGeminiKey] = useState<boolean>(false);
  const [ocrEnginePreference, setOcrEnginePreference] = useState<OcrEnginePreference>(
    () => (localStorage.getItem('cardvault_engine_pref') as OcrEnginePreference) || 'hybrid'
  );
  const [isSheetsConnected, setIsSheetsConnected] = useState<boolean>(() => {
    const cfg = getLocalSheetsConfig();
    return Boolean(cfg?.webhookUrl && cfg.webhookUrl.trim());
  });
  const [syncToast, setSyncToast] = useState<{ show: boolean; message: string } | null>(null);

  // Notify server of active client session & fetch initial server config
  useEffect(() => {
    fetch('/api/mobile-ping', { method: 'POST' }).catch(() => {});
    fetch('/api/config')
      .then((r) => r.json())
      .then((data) => {
        setHasGeminiKey(Boolean(data.hasGeminiKey));
        if (data.ocrEnginePreference) {
          setOcrEnginePreference(data.ocrEnginePreference);
          localStorage.setItem('cardvault_engine_pref', data.ocrEnginePreference);
        }
      })
      .catch(() => {});
  }, []);

  // Event / Multi-Sheet Tab Management (Central Multi-User State)
  const [activeEvent, setActiveEvent] = useState<string>('Default');
  const [availableEvents, setAvailableEvents] = useState<string[]>(['Default']);

  const [isGlobalEventDropdownOpen, setIsGlobalEventDropdownOpen] = useState<boolean>(false);
  const [isCreatingEventGlobal, setIsCreatingEventGlobal] = useState<boolean>(false);
  const [globalNewEventInput, setGlobalNewEventInput] = useState<string>('');

  const handleSelectEvent = useCallback((event: string) => {
    const trimmed = event.trim() || 'Default';
    setActiveEvent(trimmed);
    setAvailableEvents((prev) => (!prev.includes(trimmed) ? [...prev, trimmed] : prev));
    fetch('/api/config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ activeEvent: trimmed }),
    }).catch(() => {});
  }, []);

  const handleCreateEvent = useCallback((name: string) => {
    const trimmed = name.trim();
    if (!trimmed) return;
    setActiveEvent(trimmed);
    setAvailableEvents((prev) => {
      const next = prev.includes(trimmed) ? prev : [...prev, trimmed];
      fetch('/api/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ activeEvent: trimmed, availableEvents: next }),
      }).catch(() => {});
      return next;
    });

    // Auto-provision tab in connected Google Sheets
    createGoogleSheetsTab(trimmed).then((res) => {
      if (res.success) {
        setSyncToast({
          show: true,
          message: `Event '${trimmed}' active & Google Sheet tab ready`,
        });
      } else {
        setSyncToast({
          show: true,
          message: `Active Database set to: ${trimmed}`,
        });
      }
      setTimeout(() => setSyncToast(null), 3000);
    }).catch(() => {
      setSyncToast({
        show: true,
        message: `Active Database set to: ${trimmed}`,
      });
      setTimeout(() => setSyncToast(null), 3000);
    });
  }, []);

  const handleRenameEvent = useCallback(
    async (oldName: string, newName: string) => {
      const trimmedNew = newName.trim();
      if (!trimmedNew || oldName === trimmedNew) return;

      let nextEvents: string[] = [];
      setAvailableEvents((prev) => {
        const next = prev.map((ev) => (ev === oldName ? trimmedNew : ev));
        if (!next.includes(trimmedNew)) next.push(trimmedNew);
        nextEvents = Array.from(new Set(next));
        return nextEvents;
      });

      if (activeEvent === oldName) {
        setActiveEvent(trimmedNew);
      }

      fetch('/api/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ availableEvents: nextEvents, activeEvent: trimmedNew }),
      }).catch(() => {});

      let count = 0;
      const modifiedContacts: ContactRecord[] = [];
      const nextContacts = contacts.map((c) => {
        const cEv = c.eventName || c.sheetTab || 'Default';
        if (cEv === oldName) {
          count++;
          const updated: ContactRecord = {
            ...c,
            eventName: trimmedNew,
            sheetTab: trimmedNew,
            updatedAt: new Date().toISOString(),
          };
          modifiedContacts.push(updated);
          return updated;
        }
        return c;
      });

      setContacts(nextContacts);
      if (modifiedContacts.length > 0) {
        await saveLocalContactsBatch(modifiedContacts);
      }

      fetch('/api/contacts/batch-update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ renameEvent: { oldName, newName: trimmedNew } }),
      }).catch((err) => console.warn('Server rename failed:', err));

      createGoogleSheetsTab(trimmedNew).catch((e) =>
        console.warn('Could not auto-provision renamed tab in Google Sheets:', e)
      );

      setSyncToast({
        show: true,
        message: `Renamed "${oldName}" to "${trimmedNew}" (${count} leads updated)`,
      });
      setTimeout(() => setSyncToast(null), 4000);
    },
    [activeEvent, contacts]
  );

  const handleDeleteEvent = useCallback(
    async (eventName: string, moveToEvent: string = 'Default') => {
      if (eventName === 'Default') {
        alert('The Default event database cannot be deleted.');
        return;
      }
      const safeTarget = moveToEvent || 'Default';

      let nextEvents: string[] = [];
      setAvailableEvents((prev) => {
        const next = prev.filter((ev) => ev !== eventName);
        if (!next.includes(safeTarget)) next.push(safeTarget);
        nextEvents = next;
        return next;
      });

      if (activeEvent === eventName) {
        setActiveEvent(safeTarget);
      }

      fetch('/api/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ availableEvents: nextEvents, activeEvent: safeTarget }),
      }).catch(() => {});

      let count = 0;
      const modifiedContacts: ContactRecord[] = [];
      const nextContacts = contacts.map((c) => {
        const cEv = c.eventName || c.sheetTab || 'Default';
        if (cEv === eventName) {
          count++;
          const updated: ContactRecord = {
            ...c,
            eventName: safeTarget,
            sheetTab: safeTarget,
            updatedAt: new Date().toISOString(),
          };
          modifiedContacts.push(updated);
          return updated;
        }
        return c;
      });

      setContacts(nextContacts);
      if (modifiedContacts.length > 0) {
        await saveLocalContactsBatch(modifiedContacts);
      }

      fetch('/api/contacts/batch-update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ deleteEvent: { eventName, moveToEvent: safeTarget } }),
      }).catch((err) => console.warn('Server delete event failed:', err));

      setSyncToast({
        show: true,
        message: `Deleted "${eventName}". Reassigned ${count} leads to "${safeTarget}".`,
      });
      setTimeout(() => setSyncToast(null), 4000);
    },
    [activeEvent, contacts]
  );

  const handleMoveContactsToEvent = useCallback(
    async (contactIds: string[], targetEvent: string) => {
      const trimmedTarget = targetEvent.trim();
      if (!trimmedTarget || contactIds.length === 0) return;

      setAvailableEvents((prev) => {
        if (!prev.includes(trimmedTarget)) {
          const next = [...prev, trimmedTarget];
          fetch('/api/config', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ availableEvents: next }),
          }).catch(() => {});
          return next;
        }
        return prev;
      });

      const idSet = new Set(contactIds);
      const modifiedContacts: ContactRecord[] = [];
      const nextContacts = contacts.map((c) => {
        if (idSet.has(c.id)) {
          const updated: ContactRecord = {
            ...c,
            eventName: trimmedTarget,
            sheetTab: trimmedTarget,
            updatedAt: new Date().toISOString(),
          };
          modifiedContacts.push(updated);
          return updated;
        }
        return c;
      });

      setContacts(nextContacts);
      if (modifiedContacts.length > 0) {
        await saveLocalContactsBatch(modifiedContacts);
      }

      fetch('/api/contacts/batch-update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contactIds, targetEvent: trimmedTarget }),
      }).catch((err) => console.warn('Server batch move failed:', err));

      setSyncToast({
        show: true,
        message: `Moved ${contactIds.length} lead${contactIds.length === 1 ? '' : 's'} to "${trimmedTarget}" database!`,
      });
      setTimeout(() => setSyncToast(null), 4000);
    },
    [contacts]
  );

  // Load & synchronize contacts and shared config from Central Server on startup
  useEffect(() => {
    let mounted = true;
    (async () => {
      const synced = await syncContactsWithServer();
      const queue = await getPendingOfflineQueue();
      const sheetsCfg = await fetchServerSheetsConfig();

      // Fetch central configuration (shared across all team members)
      try {
        const cfgRes = await fetch('/api/config');
        if (cfgRes.ok && mounted) {
          const cfg = await cfgRes.json();
          if (cfg.activeEvent) setActiveEvent(cfg.activeEvent);
          if (Array.isArray(cfg.availableEvents) && cfg.availableEvents.length > 0) {
            setAvailableEvents(cfg.availableEvents);
          }
        }
      } catch {}

      if (mounted) {
        setContacts(synced);
        setPendingOfflineQueue(queue);
        setIsSheetsConnected(Boolean(sheetsCfg?.webhookUrl && sheetsCfg.webhookUrl.trim()));

        // Auto-discover distinct events from loaded contacts
        setAvailableEvents((prev) => {
          const set = new Set(prev);
          synced.forEach((c) => {
            const ev = (c.eventName || c.sheetTab || '').trim();
            if (ev) set.add(ev);
          });
          const merged = Array.from(set);
          return merged;
        });

        // Treat Google Sheets as Primary Database: pull any rows from sheets
        if (sheetsCfg?.webhookUrl && sheetsCfg.autoSync) {
          pullContactsFromGoogleSheets().then((pullRes) => {
            if (pullRes.success && pullRes.contacts.length > 0 && mounted) {
              setContacts((prev) => {
                const map = new Map<string, ContactRecord>();
                prev.forEach((c) => map.set(c.id, c));
                pullRes.contacts.forEach((c) => {
                  const existing = map.get(c.id);
                  if (existing && existing.frontImageBase64) {
                    map.set(c.id, {
                      ...c,
                      frontImageBase64: existing.frontImageBase64,
                      backImageBase64: existing.backImageBase64,
                    });
                  } else {
                    map.set(c.id, c);
                  }
                });
                const merged = Array.from(map.values());
                saveLocalContactsBatch(merged).catch(() => {});
                return merged;
              });

              if (pullRes.eventTabs.length > 0) {
                setAvailableEvents((prev) => {
                  const set = new Set(prev);
                  pullRes.eventTabs.forEach((t) => {
                    if (t && t.trim()) set.add(t.trim());
                  });
                  return Array.from(set);
                });
              }
            }
          }).catch(() => {});
        }
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  // Multi-Member Real-Time Live Sync: continuously poll central server & sheets
  useEffect(() => {
    let active = true;

    const pollCentralServer = async () => {
      if (!navigator.onLine) return;
      try {
        const [contactsRes, configRes] = await Promise.all([
          fetch('/api/contacts'),
          fetch('/api/config'),
        ]);

        if (contactsRes.ok && active) {
          const cData = await contactsRes.json();
          if (Array.isArray(cData.contacts)) {
            setContacts((prev) => {
              // Only update state if there are actual new/modified contacts to avoid re-render flicker
              if (cData.contacts.length !== prev.length) {
                return cData.contacts;
              }
              const prevMap = new Map(prev.map((c) => [c.id, c.updatedAt]));
              const hasDiff = cData.contacts.some(
                (c: ContactRecord) => prevMap.get(c.id) !== c.updatedAt
              );
              return hasDiff ? cData.contacts : prev;
            });
          }
        }

        if (configRes.ok && active) {
          const cfg = await configRes.json();
          if (cfg.googleSheetsWebhookUrl) {
            setIsSheetsConnected(true);
          }
          if (Array.isArray(cfg.availableEvents) && cfg.availableEvents.length > 0) {
            setAvailableEvents((prev) => {
              const prevSet = new Set(prev);
              const hasNew = cfg.availableEvents.some((e: string) => !prevSet.has(e));
              if (hasNew || cfg.availableEvents.length !== prev.length) {
                return cfg.availableEvents;
              }
              return prev;
            });
          }
        }
      } catch {}
    };

    const interval = setInterval(pollCentralServer, 3500);
    window.addEventListener('focus', pollCentralServer);

    return () => {
      active = false;
      clearInterval(interval);
      window.removeEventListener('focus', pollCentralServer);
    };
  }, []);

  const handlePullFromGoogleSheets = useCallback(async () => {
    try {
      const res = await pullContactsFromGoogleSheets();
      if (res.success && res.contacts.length > 0) {
        setContacts((prev) => {
          const map = new Map<string, ContactRecord>();
          prev.forEach((c) => map.set(c.id, c));
          res.contacts.forEach((c) => {
            const existing = map.get(c.id);
            if (existing && existing.frontImageBase64) {
              map.set(c.id, {
                ...c,
                frontImageBase64: existing.frontImageBase64,
                backImageBase64: existing.backImageBase64,
              });
            } else {
              map.set(c.id, c);
            }
          });
          const merged = Array.from(map.values());
          saveLocalContactsBatch(merged).catch(() => {});
          return merged;
        });

        if (res.eventTabs.length > 0) {
          setAvailableEvents((prev) => {
            const set = new Set(prev);
            res.eventTabs.forEach((t) => {
              if (t && t.trim()) set.add(t.trim());
            });
            const nextTabs = Array.from(set);
            fetch('/api/config', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ availableEvents: nextTabs }),
            }).catch(() => {});
            return nextTabs;
          });
        }

        setSyncToast({
          show: true,
          message: `Pulled ${res.contacts.length} leads across ${res.eventTabs.length || 1} sheet tabs!`,
        });
        setTimeout(() => setSyncToast(null), 4000);
      } else {
        setSyncToast({
          show: true,
          message: res.message || 'No rows found in Google Sheet.',
        });
        setTimeout(() => setSyncToast(null), 4000);
      }
    } catch (err: any) {
      console.warn('Pull from sheets failed:', err);
    }
  }, []);

  // Save or update a contact in both IndexedDB and backend server
  const handleSaveContact = useCallback(
    async (contact: ContactRecord, isAutoSave: boolean) => {
      const targetEvent = (contact.eventName || activeEvent || 'Default').trim() || 'Default';
      const toSave: ContactRecord = {
        ...contact,
        eventName: targetEvent,
        sheetTab: (contact.sheetTab || targetEvent).trim() || targetEvent,
        syncStatus: isOfflineMode || !navigator.onLine ? 'PENDING_SYNC' : 'SYNCED',
        updatedAt: new Date().toISOString(),
      };

      await saveLocalContact(toSave);

      if (!isOfflineMode && navigator.onLine) {
        try {
          await fetch('/api/contacts', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ contact: toSave, allowOverwrite: true }),
          });
        } catch {
          toSave.syncStatus = 'PENDING_SYNC';
          await saveLocalContact(toSave);
        }
      }

      setContacts((prev) => {
        const exists = prev.some((c) => c.id === toSave.id);
        if (exists) {
          return prev.map((c) => (c.id === toSave.id ? toSave : c));
        }
        return [toSave, ...prev];
      });

      setSessionStats((prev) => ({
        ...prev,
        totalScanned: prev.totalScanned + 1,
        autoSavedVerified:
          toSave.overallStatus === 'VERIFIED'
            ? prev.autoSavedVerified + 1
            : prev.autoSavedVerified,
        savedNeedsReview:
          toSave.overallStatus !== 'VERIFIED'
            ? prev.savedNeedsReview + 1
            : prev.savedNeedsReview,
      }));

      if (isAutoSave) {
        setLastAutoSavedContact(toSave);
      }

      // Option A: Real-Time Auto-Append to Google Sheets Webhook
      const sheetsCfg = getLocalSheetsConfig();
      if (sheetsCfg.autoSync ?? true) {
        syncContactToGoogleSheets(toSave, undefined, targetEvent)
          .then((res) => {
            if (res.success) {
              setSyncToast({
                show: true,
                message: `Synced to ${res.sheet || targetEvent}: ${
                  toSave.fields.fullName.value ||
                  toSave.fields.companyName.value ||
                  'New Contact'
                }${res.rowAdded ? ` (Row #${res.rowAdded})` : ''}`,
              });
              setTimeout(() => setSyncToast(null), 4500);
            }
          })
          .catch((err) => {
            console.warn('[Google Sheets] Webhook auto-append error:', err);
          });
      }
    },
    [activeEvent, isOfflineMode]
  );

  // Update existing contact from ContactReviewModal without double-counting new scans
  const handleUpdateReviewedContact = useCallback(
    async (updatedContact: ContactRecord) => {
      const isNew = !contacts.some((c) => c.id === updatedContact.id);
      if (isNew) {
        await handleSaveContact(updatedContact, false);
      } else {
        await saveLocalContact(updatedContact);
        if (!isOfflineMode && navigator.onLine) {
          try {
            await fetch(`/api/contacts/${updatedContact.id}`, {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ contact: updatedContact }),
            });
          } catch {
            // stays saved in IndexedDB
          }
        }
        setContacts((prev) =>
          prev.map((c) => (c.id === updatedContact.id ? updatedContact : c))
        );
      }
      closeContactReview();
    },
    [contacts, handleSaveContact, isOfflineMode, closeContactReview]
  );

  // Undo last save in continuous scanning mode
  const handleUndoLastSave = useCallback(async () => {
    if (!lastAutoSavedContact) return;
    const idToRemove = lastAutoSavedContact.id;
    await deleteLocalContact(idToRemove);
    try {
      await fetch(`/api/contacts/${idToRemove}`, { method: 'DELETE' });
    } catch {
      // ignore if offline
    }
    deleteContactFromGoogleSheets(idToRemove, lastAutoSavedContact.eventName || activeEvent).catch(() => {});
    setContacts((prev) => prev.filter((c) => c.id !== idToRemove));
    setSessionStats((prev) => ({
      ...prev,
      totalScanned: Math.max(0, prev.totalScanned - 1),
      autoSavedVerified: Math.max(0, prev.autoSavedVerified - 1),
    }));
    setLastAutoSavedContact(null);
  }, [activeEvent, lastAutoSavedContact]);

  // Delete single contact
  const handleDeleteContact = useCallback(async (id: string) => {
    const target = contacts.find((c) => c.id === id);
    const targetEvent = target?.eventName || activeEvent;
    await deleteLocalContact(id);
    try {
      await fetch(`/api/contacts/${id}`, { method: 'DELETE' });
    } catch {
      // ignore if offline
    }
    deleteContactFromGoogleSheets(id, targetEvent).catch(() => {});
    setContacts((prev) => prev.filter((c) => c.id !== id));
    setSelectedContactIds((prev) => prev.filter((sel) => sel !== id));
    setSyncToast({
      show: true,
      message: `Deleted ${target?.fields.fullName.value || id} from local database & Google Sheet.`,
    });
    setTimeout(() => setSyncToast(null), 3500);
  }, [contacts, activeEvent]);

  // Bulk delete contacts
  const handleBulkDeleteContacts = useCallback(async (ids: string[]) => {
    for (const id of ids) {
      const target = contacts.find((c) => c.id === id);
      const targetEvent = target?.eventName || activeEvent;
      await deleteLocalContact(id);
      try {
        await fetch(`/api/contacts/${id}`, { method: 'DELETE' });
      } catch {
        // ignore
      }
      deleteContactFromGoogleSheets(id, targetEvent).catch(() => {});
    }
    const idSet = new Set(ids);
    setContacts((prev) => prev.filter((c) => !idSet.has(c.id)));
    setSelectedContactIds([]);
    setSyncToast({
      show: true,
      message: `Deleted ${ids.length} contacts from database & Google Sheets.`,
    });
    setTimeout(() => setSyncToast(null), 3500);
  }, [contacts, activeEvent]);

  // Merge two duplicate contacts
  const handleConfirmDuplicateMerge = useCallback(
    async (mergedContact: ContactRecord, removeContactId: string) => {
      await deleteLocalContact(removeContactId);
      await saveLocalContact(mergedContact);
      try {
        await fetch('/api/contacts/merge', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ mergedContact, removeContactId }),
        });
      } catch {
        // local state updated
      }
      // Propagate removal and update to Google Sheets so merged duplicates are not resurrected upon pull
      deleteContactFromGoogleSheets(removeContactId).catch(() => {});
      syncContactToGoogleSheets(mergedContact).catch(() => {});
      setContacts((prev) =>
        prev
          .filter((c) => c.id !== removeContactId)
          .map((c) => (c.id === mergedContact.id ? mergedContact : c))
      );
      closeDuplicateMerge();
    },
    [closeDuplicateMerge]
  );

  // Add a scan to offline queue
  const handleQueueOfflineScan = useCallback(async (item: PendingOfflineScan) => {
    await putPendingOfflineScan(item);
    setPendingOfflineQueue((prev) => [...prev, item]);
  }, []);

  // Process all queued offline scans when online
  const handleProcessOfflineQueue = useCallback(async () => {
    if (pendingOfflineQueue.length === 0) return;
    setIsOfflineMode(false);

    for (const item of pendingOfflineQueue) {
      try {
        const res = await fetch('/api/cards/extract', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            frontImageBase64: item.frontImageBase64,
            backImageBase64: item.backImageBase64,
            scanHash: item.scanHash,
            forceReprocess: false,
          }),
        });
        if (!res.ok) continue;
        const data = await res.json();
        if (data.alreadyProcessed && data.existingContact) {
          await removePendingOfflineScan(item.id);
          continue;
        }
        const ext = data.extraction;
        if (!ext || ext.isUnreadable) {
          await removePendingOfflineScan(item.id);
          continue;
        }

        const rawFields = ext.fields || {};
        const validatedFields: ContactFields = createEmptyContactFields();
        (Object.keys(validatedFields) as (keyof ContactFields)[]).forEach((key) => {
          validatedFields[key] = evaluateSingleField(key, rawFields[key]);
        });

        const dupCheck = findDuplicateContact(validatedFields, contacts);
        const frontBackConflicts: FrontBackConflict[] = Array.isArray(
          ext.frontBackConflicts
        )
          ? ext.frontBackConflicts
          : [];
        const imageQualityIssues: ImageQualityIssue[] = Array.isArray(
          ext.imageQualityIssues
        )
          ? ext.imageQualityIssues
          : [];

        const coreValidation = evaluateCoreAndRecordStatus(
          validatedFields,
          frontBackConflicts,
          imageQualityIssues,
          dupCheck.reason
        );

        const customFields: CustomCardField[] = Array.isArray(ext.customFields)
          ? ext.customFields
              .filter((cf: any) => cf?.label && cf?.value)
              .map((cf: any, idx: number) => ({
                id: `cf_${Date.now()}_${idx}`,
                label: String(cf.label).trim(),
                value: String(cf.value).trim(),
                confidence: Number(cf.confidence) || 85,
                source: cf.source || 'FRONT',
              }))
          : [];

        const syncedRecord: ContactRecord = {
          id: `CV-2026-${Math.floor(1000 + Math.random() * 9000)}`,
          scanHash: item.scanHash,
          createdAt: item.capturedAt,
          updatedAt: new Date().toISOString(),
          overallStatus: coreValidation.overallStatus,
          savedWithoutCoreFields: coreValidation.missingCoreFields.length > 0,
          missingCoreFieldLabels: coreValidation.missingCoreFields.map((m) => m.label),
          reviewReasons: [
            ...coreValidation.missingCoreFields.map((m) => `Missing ${m.label}`),
            ...coreValidation.uncertainCoreFields.map((u) => `${u.label}: ${u.reason}`),
            ...coreValidation.otherReviewIssues,
          ],
          duplicateOfId: dupCheck.duplicate?.id,
          duplicateMatchReason: dupCheck.reason,
          frontImageBase64: item.frontImageBase64,
          backImageBase64: item.backImageBase64,
          rawOcrFront: ext.rawOcrFront || '',
          rawOcrBack: ext.rawOcrBack || '',
          cardOrientation:
            ext.cardOrientation === 'vertical' ? 'vertical' : 'horizontal',
          imageQualityIssues,
          frontBackConflicts,
          fields: validatedFields,
          customFields,
          syncStatus: 'SYNCED',
        };

        await handleSaveContact(syncedRecord, false);
        await removePendingOfflineScan(item.id);
      } catch (err) {
        console.warn('Offline queue item retry deferred:', err);
      }
    }

    const remaining = await getPendingOfflineQueue();
    setPendingOfflineQueue(remaining);
  }, [pendingOfflineQueue, contacts, handleSaveContact]);

  // Direct export handler from ContactsDatabase
  const handleQuickExport = useCallback(
    (
      scope: 'all' | 'filtered' | 'selected',
      format: 'xlsx' | 'csv',
      records: ContactRecord[]
    ) => {
      if (records.length === 0) return;
      if (format === 'xlsx') {
        exportContactsToExcel(records, `CardVault_${scope}`);
      } else {
        exportContactsToCSV(records, `CardVault_${scope}`);
      }
    },
    []
  );

  // Create a manual contact draft when a lead has no physical business card
  const handleCreateManualContact = useCallback(() => {
    const emptyFields = createEmptyContactFields();
    const blankCanvasSvg =
      'data:image/svg+xml;utf8,' +
      encodeURIComponent(
        '<svg xmlns="http://www.w3.org/2000/svg" width="600" height="360" viewBox="0 0 600 360"><rect width="600" height="360" fill="#0f172a"/><text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle" fill="#94a3b8" font-family="sans-serif" font-size="18">Manual Contact Entry (No Physical Card Image)</text></svg>'
      );
    const draft: ContactRecord = {
      id: `CV-2026-${Math.floor(1000 + Math.random() * 9000)}`,
      scanHash: `manual_${Date.now()}`,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      overallStatus: 'NEEDS_REVIEW',
      savedWithoutCoreFields: true,
      missingCoreFieldLabels: [
        'Full Name',
        'Company Name',
        'Mobile / Phone Number',
        'Email Address',
      ],
      reviewReasons: ['Manual entry draft — fill in mandatory fields'],
      frontImageBase64: blankCanvasSvg,
      rawOcrFront: '',
      cardOrientation: 'horizontal',
      imageQualityIssues: [],
      frontBackConflicts: [],
      fields: emptyFields,
      customFields: [],
      syncStatus: 'SYNCED',
    };
    openContactReview(draft);
  }, [openContactReview]);

  return (
    <div className="w-full max-w-full min-h-screen flex flex-col bg-[#F8FAFC] text-slate-900 overflow-x-hidden">
      <HeaderStatusHub
        activeTab={activeTab}
        onNavigateTab={setActiveTab}
        hasGeminiKey={hasGeminiKey}
        ocrEnginePreference={ocrEnginePreference}
        isSheetsConnected={isSheetsConnected}
        hasMobileDevice={false}
        activeEvent={activeEvent}
        availableEvents={availableEvents}
        onSelectEvent={handleSelectEvent}
        onCreateEvent={handleCreateEvent}
        onQuickScan={() => setActiveTab('scanner')}
        totalContacts={contacts.length}
      />

      {/* Main Content Viewport: Full Width Containerized */}
      <main className="flex-1 w-full max-w-full min-w-0 overflow-x-hidden pb-24 md:pb-8">
        {activeTab === 'dashboard' && (
          <DashboardView
            contacts={contacts}
            sessionStats={sessionStats}
            pendingOfflineQueue={pendingOfflineQueue}
            isOfflineMode={isOfflineMode}
            activeEvent={activeEvent}
            availableEvents={availableEvents}
            onSelectEvent={(evt: string) => {
              handleSelectEvent(evt);
              setActiveTab('contacts');
            }}
            onStartScanning={() => setActiveTab('scanner')}
            onOpenContactsWithFilter={(evt?: string) => {
              if (evt) handleSelectEvent(evt);
              setActiveTab('contacts');
            }}
            onInspectContact={(c) => openContactReview(c)}
            onProcessOfflineQueue={handleProcessOfflineQueue}
            onOpenExport={() => setActiveTab('export')}
          />
        )}

        {activeTab === 'scanner' && (
          <ScannerStation
            existingContacts={contacts}
            sessionStats={sessionStats}
            pendingOfflineQueue={pendingOfflineQueue}
            isOfflineMode={isOfflineMode}
            onToggleOfflineMode={() => setIsOfflineMode((prev) => !prev)}
            onSaveContact={handleSaveContact}
            onDeleteContact={handleDeleteContact}
            onUndoLastSave={handleUndoLastSave}
            lastAutoSavedContact={lastAutoSavedContact}
            onQueueOfflineScan={handleQueueOfflineScan}
            onProcessOfflineQueue={handleProcessOfflineQueue}
            activeEvent={activeEvent}
            availableEvents={availableEvents}
            onSelectEvent={handleSelectEvent}
            onIncrementFailedScan={() =>
              setSessionStats((prev) => ({
                ...prev,
                totalScanned: prev.totalScanned + 1,
                failedScans: prev.failedScans + 1,
              }))
            }
            onOpenFullReview={(draft) => openContactReview(draft)}
          />
        )}

        {activeTab === 'contacts' && (
          <ContactsDatabase
            contacts={contacts}
            selectedIds={selectedContactIds}
            onChangeSelectedIds={setSelectedContactIds}
            onInspectContact={(c) => openContactReview(c)}
            onCreateManualContact={handleCreateManualContact}
            onOpenBulkUpload={openBulkUpload}
            onDeleteContact={handleDeleteContact}
            onBulkDeleteContacts={handleBulkDeleteContacts}
            onOpenMergeModal={(primary, duplicate) =>
              openDuplicateMerge(primary, duplicate)
            }
            onExportRecords={handleQuickExport}
            activeEvent={activeEvent}
            availableEvents={availableEvents}
            onSelectEvent={handleSelectEvent}
            onCreateEvent={handleCreateEvent}
            onRenameEvent={handleRenameEvent}
            onDeleteEvent={handleDeleteEvent}
            onMoveContactsToEvent={handleMoveContactsToEvent}
            onPullFromGoogleSheets={handlePullFromGoogleSheets}
          />
        )}

        {activeTab === 'export' && (
          <ExportView
            contacts={contacts}
            selectedIds={selectedContactIds}
            activeEvent={activeEvent}
            availableEvents={availableEvents}
            onSelectEvent={handleSelectEvent}
          />
        )}
      </main>

      {/* Mobile Fixed Bottom Thumb-Zone Navigation Bar (Executive Light) */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-50 bg-white/95 backdrop-blur-md border-t border-slate-200/80 grid grid-cols-4 items-center h-16 pb-[max(env(safe-area-inset-bottom),6px)] shadow-lg">
        <button
          type="button"
          onClick={() => setActiveTab('dashboard')}
          className={`min-h-[48px] flex flex-col items-center justify-center transition-colors cursor-pointer ${
            activeTab === 'dashboard' ? 'text-slate-900 font-semibold' : 'text-slate-400 hover:text-slate-700'
          }`}
        >
          <div className={`p-1 rounded-lg transition-colors ${activeTab === 'dashboard' ? 'bg-slate-100 text-slate-900' : ''}`}>
            <LayoutDashboard className="w-4 h-4" />
          </div>
          <span className="text-[10px] mt-0.5 whitespace-nowrap">
            Dashboard
          </span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('scanner')}
          className={`min-h-[48px] flex flex-col items-center justify-center transition-colors cursor-pointer ${
            activeTab === 'scanner' ? 'text-slate-900 font-semibold' : 'text-slate-400 hover:text-slate-700'
          }`}
        >
          <div className={`p-1 rounded-lg transition-colors ${activeTab === 'scanner' ? 'bg-slate-100 text-slate-900' : ''}`}>
            <Camera className="w-4 h-4" />
          </div>
          <span className="text-[10px] mt-0.5 whitespace-nowrap">
            Scanner
          </span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('contacts')}
          className={`min-h-[48px] flex flex-col items-center justify-center transition-colors cursor-pointer ${
            activeTab === 'contacts' ? 'text-slate-900 font-semibold' : 'text-slate-400 hover:text-slate-700'
          }`}
        >
          <div className={`relative p-1 rounded-lg transition-colors ${activeTab === 'contacts' ? 'bg-slate-100 text-slate-900' : ''}`}>
            <Database className="w-4 h-4" />
            {contacts.length > 0 && (
              <span className="absolute -top-1 -right-2 px-1 py-0.2 bg-slate-900 text-white rounded-full text-[9px] font-mono shadow-2xs">
                {contacts.length}
              </span>
            )}
          </div>
          <span className="text-[10px] mt-0.5 whitespace-nowrap">
            Contacts
          </span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('export')}
          className={`min-h-[48px] flex flex-col items-center justify-center transition-colors cursor-pointer ${
            activeTab === 'export' ? 'text-slate-900 font-semibold' : 'text-slate-400 hover:text-slate-700'
          }`}
        >
          <div className={`p-1 rounded-lg transition-colors ${activeTab === 'export' ? 'bg-slate-100 text-slate-900' : ''}`}>
            <Download className="w-4 h-4" />
          </div>
          <span className="text-[10px] mt-0.5 whitespace-nowrap">
            Export
          </span>
        </button>
      </nav>

      {/* Contact Review & Evidence Inspector Modal */}
      {inspectingContact && (
        <ContactReviewModal
          contact={inspectingContact}
          availableEvents={availableEvents}
          onCreateEvent={handleCreateEvent}
          onSaveAndContinue={handleUpdateReviewedContact}
          onDeleteContact={handleDeleteContact}
          onClose={closeContactReview}
        />
      )}

      {/* Duplicate Contact Field-by-Field Merge Modal */}
      {mergingPair && (
        <DuplicateMergeModal
          primaryContact={mergingPair.primary}
          duplicateContact={mergingPair.duplicate}
          onConfirmMerge={handleConfirmDuplicateMerge}
          onClose={closeDuplicateMerge}
        />
      )}

      {/* Google Sheets Live Webhook Sync Modal */}
      {isSheetsModalOpen && (
        <GoogleSheetsModal
          isOpen={isSheetsModalOpen}
          onClose={closeSheetsModal}
          onConfigSaved={(cfg) => {
            setIsSheetsConnected(Boolean(cfg.webhookUrl && cfg.webhookUrl.trim()));
          }}
          onPullFromSheets={handlePullFromGoogleSheets}
          existingContacts={contacts}
          activeEvent={activeEvent}
        />
      )}

      {/* Connect Mobile Phone Modal */}
      {isMobileModalOpen && (
        <MobileConnectModal
          isOpen={isMobileModalOpen}
          onClose={closeMobileModal}
        />
      )}

      {/* Google AI Studio & OCR Engine Settings Modal */}
      {isOcrModalOpen && (
        <OcrSettingsModal
          isOpen={isOcrModalOpen}
          onClose={closeOcrSettings}
          onKeyUpdated={(key) => setHasGeminiKey(Boolean(key && key.trim()))}
          onConfigUpdated={(cfg) => {
            setHasGeminiKey(cfg.hasGeminiKey);
            setOcrEnginePreference(cfg.ocrEnginePreference);
          }}
        />
      )}

      {/* Global Bulk Card Upload & Batch Review Modal */}
      {isBulkUploadOpen && (
        <BulkUploadModal
          isOpen={isBulkUploadOpen}
          onClose={closeBulkUpload}
          onSaveContact={handleSaveContact}
          existingContacts={contacts}
          activeEvent={activeEvent}
          availableEvents={availableEvents}
          onOpenFullReview={(c) => openContactReview(c)}
          onNavigateToContacts={() => setActiveTab('contacts')}
        />
      )}

      {/* Floating Google Sheets Real-Time Sync Toast */}
      {syncToast && (
        <div className="fixed top-16 right-3 sm:right-6 z-50 bg-slate-900 text-white px-3.5 py-2 rounded-lg shadow-xl flex items-center gap-2.5 text-xs font-medium border border-slate-800 animate-fade-in">
          <FileSpreadsheet className="w-4 h-4 text-emerald-400 shrink-0" />
          <span>{syncToast.message}</span>
        </div>
      )}
    </div>
  );
}

export default function App() {
  return (
    <ModalProvider>
      <AppContent />
    </ModalProvider>
  );
}
