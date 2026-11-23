import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowRightLeft,
  ArrowUpDown,
  Camera,
  Check,
  CheckCircle2,
  CreditCard,
  Download,
  Edit2,
  Edit3,
  Eye,
  FileSpreadsheet,
  FileText,
  Folder,
  FolderPlus,
  GitMerge,
  Mail,
  MessageCircle,
  Phone,
  RefreshCw,
  Search,
  SlidersHorizontal,
  Sparkles,
  Trash2,
  UploadCloud,
  UserPlus,
  X,
} from 'lucide-react';
import { ContactRecord, INDUSTRY_CATEGORIES } from '../types/card';
import { findDuplicateContact } from '../utils/cardValidator';
import {
  exportContactsToCSV,
  exportContactsToExcel,
  exportContactsToVCard,
  formatWhatsAppUrl,
} from '../utils/exporter';
import {
  fetchServerSheetsConfig,
  getLocalSheetsConfig,
  syncContactToGoogleSheets,
} from '../services/googleSheetsService';

interface ContactsDatabaseProps {
  contacts: ContactRecord[];
  selectedIds: string[];
  onChangeSelectedIds: (ids: string[]) => void;
  onInspectContact: (contact: ContactRecord) => void;
  onCreateManualContact?: () => void;
  onOpenBulkUpload?: () => void;
  onDeleteContact: (id: string) => Promise<void>;
  onBulkDeleteContacts: (ids: string[]) => Promise<void>;
  onOpenMergeModal: (primary: ContactRecord, duplicate: ContactRecord) => void;
  onExportRecords: (
    scope: 'all' | 'filtered' | 'selected',
    format: 'xlsx' | 'csv',
    records: ContactRecord[]
  ) => void;
  // Event Database Props
  activeEvent: string;
  availableEvents: string[];
  onSelectEvent: (event: string) => void;
  onCreateEvent: (name: string) => void;
  onRenameEvent: (oldName: string, newName: string) => Promise<void>;
  onDeleteEvent: (eventName: string, moveToEvent?: string) => Promise<void>;
  onMoveContactsToEvent: (contactIds: string[], targetEvent: string) => Promise<void>;
  onPullFromGoogleSheets?: () => Promise<void>;
}

export const ContactsDatabase: React.FC<ContactsDatabaseProps> = ({
  contacts,
  selectedIds,
  onChangeSelectedIds,
  onInspectContact,
  onCreateManualContact,
  onOpenBulkUpload,
  onDeleteContact,
  onBulkDeleteContacts,
  onOpenMergeModal,
  onExportRecords,
  activeEvent,
  availableEvents,
  onSelectEvent,
  onCreateEvent,
  onRenameEvent,
  onDeleteEvent,
  onMoveContactsToEvent,
  onPullFromGoogleSheets,
}) => {
  const [selectedEventTab, setSelectedEventTab] = useState<string>(activeEvent || 'ALL');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<
    'ALL' | 'VERIFIED' | 'NEEDS_REVIEW' | 'MISSING_CORE' | 'DUPLICATES'
  >('ALL');
  const [categoryFilter, setCategoryFilter] = useState<string>('ALL');
  const [countryFilter, setCountryFilter] = useState<string>('ALL');
  const [cityFilter, setCityFilter] = useState<string>('ALL');
  const [designationFilter, setDesignationFilter] = useState<string>('ALL');
  const [eventFilter, setEventFilter] = useState<string>('ALL');
  const [sortOrder, setSortOrder] = useState<'NEWEST' | 'OLDEST' | 'NAME_ASC'>('NEWEST');
  const [previewImagesContact, setPreviewImagesContact] =
    useState<ContactRecord | null>(null);
  const [isSyncingSheets, setIsSyncingSheets] = useState<boolean>(false);
  const [showMobileFilters, setShowMobileFilters] = useState<boolean>(false);
  const [sheetsSyncFeedback, setSheetsSyncFeedback] = useState<{
    type: 'success' | 'error';
    message: string;
  } | null>(null);

  // Dialog States for Event Tab Management
  const [showCreateModal, setShowCreateModal] = useState<boolean>(false);
  const [showRenameModal, setShowRenameModal] = useState<boolean>(false);
  const [showDeleteModal, setShowDeleteModal] = useState<boolean>(false);
  const [newEventNameInput, setNewEventNameInput] = useState<string>('');
  const [renameEventInput, setRenameEventInput] = useState<string>('');
  const [deleteFallbackEvent, setDeleteFallbackEvent] = useState<string>('Default');

  // Contact Delete Confirmation Modals
  const [contactToDelete, setContactToDelete] = useState<ContactRecord | null>(null);
  const [showBulkDeleteModal, setShowBulkDeleteModal] = useState<boolean>(false);
  const [isDeleting, setIsDeleting] = useState<boolean>(false);

  // Contacts belonging strictly to the currently selected tab
  const activeTabContacts = useMemo(() => {
    if (selectedEventTab === 'ALL') return contacts;
    return contacts.filter((c) => (c.eventName || c.sheetTab || 'Default') === selectedEventTab);
  }, [contacts, selectedEventTab]);

  const activeTabVerified = useMemo(() => {
    return activeTabContacts.filter((c) => c.overallStatus === 'VERIFIED').length;
  }, [activeTabContacts]);

  const activeTabNeedsReview = useMemo(() => {
    return activeTabContacts.filter((c) => c.overallStatus !== 'VERIFIED').length;
  }, [activeTabContacts]);

  const handleExportActiveTab = (format: 'xlsx' | 'csv') => {
    if (activeTabContacts.length === 0) return;
    const prefix = `CardVault_${selectedEventTab === 'ALL' ? 'Master' : selectedEventTab}_Leads`;
    if (format === 'xlsx') {
      exportContactsToExcel(activeTabContacts, prefix, selectedEventTab === 'ALL' ? undefined : selectedEventTab);
    } else {
      exportContactsToCSV(activeTabContacts, prefix);
    }
  };

  const handleSyncActiveTabToSheets = async () => {
    if (activeTabContacts.length === 0) return;
    setIsSyncingSheets(true);
    let synced = 0;
    let failed = 0;
    for (const c of activeTabContacts) {
      const res = await syncContactToGoogleSheets(
        c,
        undefined,
        selectedEventTab === 'ALL' ? undefined : selectedEventTab
      );
      if (res.success) synced++;
      else failed++;
    }
    setIsSyncingSheets(false);
    setSheetsSyncFeedback({
      type: synced > 0 ? 'success' : 'error',
      message: synced > 0
        ? `Synced ${synced} leads to Google Sheets tab "${selectedEventTab}"!`
        : `Failed to sync leads to tab "${selectedEventTab}". Check Sheets configuration.`,
    });
    setTimeout(() => setSheetsSyncFeedback(null), 5000);
  };

  const handleSyncToGoogleSheets = async () => {
    const targets = selectedIds.length > 0
      ? contacts.filter((c) => selectedIds.includes(c.id))
      : filteredContacts;

    if (targets.length === 0) {
      setSheetsSyncFeedback({
        type: 'error',
        message: 'No contacts available to sync.',
      });
      setTimeout(() => setSheetsSyncFeedback(null), 4000);
      return;
    }

    setIsSyncingSheets(true);
    setSheetsSyncFeedback(null);

    let syncedCount = 0;
    let failCount = 0;
    let lastError = '';

    for (const contact of targets) {
      const res = await syncContactToGoogleSheets(contact);
      if (res.success) {
        syncedCount++;
      } else {
        failCount++;
        lastError = res.message || 'Failed';
      }
    }

    setIsSyncingSheets(false);
    if (failCount === 0) {
      setSheetsSyncFeedback({
        type: 'success',
        message: `Successfully synced ${syncedCount} contact${syncedCount === 1 ? '' : 's'} directly to your Google Sheet!`,
      });
    } else if (syncedCount > 0) {
      setSheetsSyncFeedback({
        type: 'success',
        message: `Synced ${syncedCount} contacts to Google Sheets (${failCount} skipped/failed).`,
      });
    } else {
      setSheetsSyncFeedback({
        type: 'error',
        message: lastError || 'Google Sheets Webhook URL not configured. Click "Google Sheets" in header.',
      });
    }
    setTimeout(() => setSheetsSyncFeedback(null), 6000);
  };

  // Derive distinct filter lists from actual contacts
  const uniqueCountries = useMemo(() => {
    const set = new Set<string>();
    contacts.forEach((c) => {
      const val = c.fields.country.value.trim();
      if (val) set.add(val);
    });
    return Array.from(set).sort();
  }, [contacts]);

  const uniqueCities = useMemo(() => {
    const set = new Set<string>();
    contacts.forEach((c) => {
      const val = c.fields.city.value.trim();
      if (val) set.add(val);
    });
    return Array.from(set).sort();
  }, [contacts]);

  const uniqueDesignations = useMemo(() => {
    const set = new Set<string>();
    contacts.forEach((c) => {
      const val = c.fields.designation.value.trim();
      if (val) set.add(val);
    });
    return Array.from(set).sort();
  }, [contacts]);

  const uniqueEvents = useMemo(() => {
    const set = new Set<string>();
    contacts.forEach((c) => {
      const val = (c.eventName || c.sheetTab || '').trim();
      if (val) set.add(val);
    });
    return Array.from(set).sort();
  }, [contacts]);

  // Map duplicate relationships across current contacts
  const duplicatePairsMap = useMemo(() => {
    const map = new Map<string, { other: ContactRecord; reason: string }>();
    for (const c of contacts) {
      const found = findDuplicateContact(c.fields, contacts, c.id);
      if (found.duplicate && found.reason) {
        map.set(c.id, { other: found.duplicate, reason: found.reason });
      }
    }
    return map;
  }, [contacts]);

  // Filter and sort contacts
  const filteredContacts = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();

    const list = contacts.filter((c) => {
      if (statusFilter === 'VERIFIED' && c.overallStatus !== 'VERIFIED') return false;
      if (statusFilter === 'NEEDS_REVIEW' && c.overallStatus !== 'NEEDS_REVIEW')
        return false;
      if (
        statusFilter === 'MISSING_CORE' &&
        (!c.savedWithoutCoreFields && c.missingCoreFieldLabels.length === 0)
      ) {
        return false;
      }
      if (statusFilter === 'DUPLICATES' && !duplicatePairsMap.has(c.id)) return false;

      if (
        categoryFilter !== 'ALL' &&
        c.fields.companyCategory.value !== categoryFilter
      ) {
        return false;
      }
      if (countryFilter !== 'ALL' && c.fields.country.value !== countryFilter) {
        return false;
      }
      if (cityFilter !== 'ALL' && c.fields.city.value !== cityFilter) {
        return false;
      }
      if (
        designationFilter !== 'ALL' &&
        c.fields.designation.value !== designationFilter
      ) {
        return false;
      }
      if (selectedEventTab !== 'ALL') {
        const cEvt = (c.eventName || c.sheetTab || 'Default').trim();
        if (cEvt !== selectedEventTab) return false;
      } else if (
        eventFilter !== 'ALL' &&
        (c.eventName || c.sheetTab || 'Default') !== eventFilter
      ) {
        return false;
      }

      if (q) {
        const haystack = [
          c.id,
          c.fields.fullName.value,
          c.fields.companyName.value,
          c.fields.designation.value,
          c.fields.email.value,
          c.fields.mobileNumber.value,
          c.fields.officePhone.value,
          c.fields.city.value,
          c.fields.country.value,
          c.fields.companyCategory.value,
          c.rawOcrFront,
        ]
          .join(' ')
          .toLowerCase();
        if (!haystack.includes(q)) return false;
      }

      return true;
    });

    list.sort((a, b) => {
      if (sortOrder === 'NEWEST') {
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      }
      if (sortOrder === 'OLDEST') {
        return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
      }
      return (a.fields.fullName.value || '').localeCompare(b.fields.fullName.value || '');
    });

    return list;
  }, [
    contacts,
    searchQuery,
    statusFilter,
    categoryFilter,
    countryFilter,
    cityFilter,
    designationFilter,
    eventFilter,
    sortOrder,
    duplicatePairsMap,
    selectedEventTab,
  ]);

  const toggleSelectAllFiltered = () => {
    const filteredIds = filteredContacts.map((c) => c.id);
    const allSelected =
      filteredIds.length > 0 && filteredIds.every((id) => selectedIds.includes(id));
    if (allSelected) {
      onChangeSelectedIds(selectedIds.filter((id) => !filteredIds.includes(id)));
    } else {
      const merged = Array.from(new Set([...selectedIds, ...filteredIds]));
      onChangeSelectedIds(merged);
    }
  };

  const toggleSelectOne = (id: string) => {
    if (selectedIds.includes(id)) {
      onChangeSelectedIds(selectedIds.filter((item) => item !== id));
    } else {
      onChangeSelectedIds([...selectedIds, id]);
    }
  };

  const resetFilters = () => {
    setSearchQuery('');
    setStatusFilter('ALL');
    setCategoryFilter('ALL');
    setCountryFilter('ALL');
    setCityFilter('ALL');
    setDesignationFilter('ALL');
    setEventFilter('ALL');
  };

  return (
    <div className="w-full max-w-full overflow-x-hidden max-w-7xl mx-auto px-3 sm:px-6 py-3 sm:py-5 space-y-3 sm:space-y-4">
      {/* 1. Header & Quick Export Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 sm:gap-3">
        <div>
          <h1 className="text-lg sm:text-xl font-bold text-slate-900">
            Contacts Database
          </h1>
          <p className="text-xs text-slate-500 mt-0.5 hidden sm:block">
            Showing <span className="font-mono tabular-nums">{filteredContacts.length}</span>{' '}
            of <span className="font-mono tabular-nums">{contacts.length}</span> total
            scanned business cards · Every record links its original card image and verification status.
          </p>
        </div>

        <div className="flex items-center gap-2 overflow-x-auto no-scrollbar w-full sm:w-auto pb-1 sm:pb-0">
          {onCreateManualContact && (
            <button
              type="button"
              onClick={onCreateManualContact}
              className="h-8 px-3 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-xs font-medium flex items-center gap-1.5 whitespace-nowrap shrink-0 shadow-2xs transition-colors"
            >
              <UserPlus className="w-3.5 h-3.5 text-slate-300" />
              <span>Manual Entry</span>
            </button>
          )}

          {onOpenBulkUpload && (
            <button
              type="button"
              onClick={onOpenBulkUpload}
              className="h-8 px-3 rounded-lg bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 text-xs font-medium flex items-center gap-1.5 whitespace-nowrap shrink-0 transition-colors shadow-2xs"
              title="Bulk upload multiple business cards from photos"
            >
              <UploadCloud className="w-3.5 h-3.5 text-slate-500" />
              <span>Bulk Upload</span>
            </button>
          )}

          {onPullFromGoogleSheets && (
            <button
              type="button"
              id="btn-pull-from-sheets"
              onClick={async () => {
                setIsSyncingSheets(true);
                await onPullFromGoogleSheets();
                setIsSyncingSheets(false);
              }}
              disabled={isSyncingSheets}
              className="h-8 px-3 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs font-medium flex items-center gap-1.5 whitespace-nowrap shrink-0 transition-colors shadow-2xs disabled:opacity-50"
              title="Pull all contact rows & tabs from Google Sheets into CardVault"
            >
              <RefreshCw className={`w-3.5 h-3.5 text-slate-500 ${isSyncingSheets ? 'animate-spin' : ''}`} />
              <span>Pull Sheets</span>
            </button>
          )}

          <button
            type="button"
            onClick={handleSyncToGoogleSheets}
            disabled={isSyncingSheets}
            className="h-8 px-3 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs font-medium flex items-center gap-1.5 whitespace-nowrap shrink-0 transition-colors shadow-2xs disabled:opacity-50"
            title="Append contacts directly to Google Sheets via Webhook"
          >
            <span className="w-2 h-2 rounded-full bg-emerald-500 shrink-0" />
            <span className="hidden sm:inline">{isSyncingSheets ? 'Syncing...' : 'Sync View to Sheets'}</span>
            <span className="sm:hidden">Sync Sheets</span>
          </button>

          <button
            type="button"
            onClick={() => onExportRecords('filtered', 'xlsx', filteredContacts)}
            className="h-8 px-3 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs font-medium flex items-center gap-1.5 whitespace-nowrap shrink-0 transition-colors shadow-2xs"
          >
            <Download className="w-3.5 h-3.5 text-slate-500" />
            <span className="hidden sm:inline">Export (.XLSX)</span>
            <span className="sm:hidden">Export</span>
          </button>

          <button
            type="button"
            onClick={() => exportContactsToVCard(filteredContacts, 'CardVault_Contacts')}
            className="h-8 px-3 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs font-medium flex items-center gap-1.5 whitespace-nowrap shrink-0 transition-colors shadow-2xs"
          >
            <UserPlus className="w-3.5 h-3.5 text-slate-500" />
            <span className="hidden sm:inline">Address Book (.VCF)</span>
            <span className="sm:hidden">.VCF</span>
          </button>
        </div>
      </div>

      {/* 2. First-Class Event Databases Tab Bar */}
      <div className="w-full max-w-full bg-white border border-slate-200/80 rounded-xl p-1.5 sm:p-2 flex items-center justify-between gap-2 overflow-x-auto no-scrollbar shadow-2xs min-w-0">
        <div className="flex items-center gap-1.5 shrink-0 min-w-0">
          <button
            id="tab-all-leads"
            type="button"
            onClick={() => {
              setSelectedEventTab('ALL');
              setEventFilter('ALL');
            }}
            className={`h-7 px-2.5 rounded-lg text-xs font-medium flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0 ${
              selectedEventTab === 'ALL'
                ? 'bg-slate-900 text-white shadow-2xs'
                : 'bg-white hover:bg-slate-50 text-slate-700 border border-slate-200'
            }`}
          >
            <Folder className={`w-3.5 h-3.5 ${selectedEventTab === 'ALL' ? 'text-white' : 'text-slate-400'}`} />
            <span>All Leads</span>
            <span
              className={`text-[10px] font-mono px-1.5 py-0.2 rounded ${
                selectedEventTab === 'ALL' ? 'bg-slate-800 text-slate-300' : 'bg-slate-100 text-slate-600'
              }`}
            >
              {contacts.length}
            </span>
          </button>

          {availableEvents.map((evt) => {
            const count = contacts.filter((c) => (c.eventName || c.sheetTab || 'Default') === evt).length;
            const isTabSelected = selectedEventTab === evt;
            const isScanningTarget = activeEvent === evt;

            return (
              <button
                key={evt}
                id={`tab-event-${evt.toLowerCase().replace(/[^a-z0-9]/g, '-')}`}
                type="button"
                onClick={() => {
                  setSelectedEventTab(evt);
                  setEventFilter(evt);
                  onSelectEvent(evt);
                }}
                className={`h-7 px-2.5 rounded-lg text-xs font-medium flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0 ${
                  isTabSelected
                    ? 'bg-slate-900 text-white shadow-2xs'
                    : 'bg-white hover:bg-slate-50 text-slate-700 border border-slate-200'
                }`}
              >
                <Folder className={`w-3.5 h-3.5 ${isTabSelected ? 'text-white' : 'text-slate-400'}`} />
                <span>{evt}</span>
                <span
                  className={`text-[10px] font-mono px-1.5 py-0.2 rounded ${
                    isTabSelected ? 'bg-slate-800 text-slate-300' : 'bg-slate-100 text-slate-600'
                  }`}
                >
                  {count}
                </span>
                {isScanningTarget && (
                  <span
                    className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0"
                    title="Active Scanner Target"
                  />
                )}
              </button>
            );
          })}
        </div>

        <button
          type="button"
          onClick={() => {
            setNewEventNameInput('');
            setShowCreateModal(true);
          }}
          className="h-7 px-2.5 rounded-lg text-xs font-medium bg-white hover:bg-slate-50 text-slate-700 border border-dashed border-slate-300 flex items-center gap-1.5 whitespace-nowrap shrink-0 transition-colors"
        >
          <FolderPlus className="w-3.5 h-3.5 text-slate-500" />
          <span>New Event Tab</span>
        </button>
      </div>

      {/* 3. Dedicated Individual Database Header / Banner (shown when a specific event tab is active) */}
      {selectedEventTab !== 'ALL' && (
        <>
          {/* Mobile Compact Event Summary */}
          <div className="md:hidden bg-slate-50 border border-slate-200 rounded-xl p-3 flex items-center justify-between gap-2 shadow-2xs">
            <div className="flex items-center gap-2 min-w-0">
              <span className="p-1.5 rounded-md bg-slate-900 text-white shrink-0">
                <Folder className="w-3.5 h-3.5" />
              </span>
              <div className="min-w-0">
                <div className="text-xs font-bold text-slate-900 truncate">
                  {selectedEventTab}
                </div>
                <div className="text-[10px] text-slate-500 font-mono">
                  {activeTabContacts.length} leads · {activeTabVerified} verified
                </div>
              </div>
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              <button
                type="button"
                onClick={() => handleExportActiveTab('xlsx')}
                disabled={activeTabContacts.length === 0}
                className="h-7 px-2.5 rounded-md bg-slate-900 text-white text-[11px] font-medium flex items-center gap-1 shadow-2xs disabled:opacity-40"
              >
                <Download className="w-3 h-3" />
                <span>Export</span>
              </button>
            </div>
          </div>

          {/* Desktop Full Event Management Box */}
          <div className="hidden md:block bg-slate-50/70 border border-slate-200/80 rounded-xl p-4 sm:p-5 space-y-3 shadow-2xs">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="p-1.5 rounded-lg bg-slate-900 text-white shadow-2xs">
                    <Folder className="w-4 h-4" />
                  </span>
                  <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
                    <span>{selectedEventTab} Database</span>
                  </h2>
                  {activeEvent === selectedEventTab ? (
                    <span className="px-2 py-0.5 rounded text-[11px] font-medium bg-emerald-50 text-emerald-800 border border-emerald-200 flex items-center gap-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0" />
                      Active Scanner Target
                    </span>
                  ) : (
                    <button
                      type="button"
                      onClick={() => onSelectEvent(selectedEventTab)}
                      className="px-2 py-0.5 rounded text-[11px] font-medium bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 transition-colors"
                    >
                      Set as Active Scanning Target
                    </button>
                  )}
                  <span className="px-2 py-0.5 rounded text-[11px] font-mono text-slate-600 bg-white border border-slate-200">
                    Sheet Tab: "{selectedEventTab}"
                  </span>
                </div>
                <p className="text-xs text-slate-500">
                  Individual lead database for {selectedEventTab}. Scanned cards saved under this event route to this dedicated tab in Google Sheets.
                </p>
              </div>

              {/* Tab Specific Quick Action Buttons */}
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => handleExportActiveTab('xlsx')}
                  disabled={activeTabContacts.length === 0}
                  className="h-8 px-3 rounded-lg bg-slate-900 hover:bg-slate-800 disabled:opacity-40 text-white text-xs font-medium flex items-center gap-1.5 shadow-2xs transition-colors"
                >
                  <FileSpreadsheet className="w-3.5 h-3.5" />
                  <span>Export Tab (.XLSX)</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleExportActiveTab('csv')}
                  disabled={activeTabContacts.length === 0}
                  className="h-8 px-3 rounded-lg bg-white hover:bg-slate-50 disabled:opacity-40 text-slate-700 border border-slate-200 text-xs font-medium flex items-center gap-1.5 transition-colors shadow-2xs"
                >
                  <Download className="w-3.5 h-3.5 text-slate-500" />
                  <span>CSV</span>
                </button>
                <button
                  type="button"
                  onClick={handleSyncActiveTabToSheets}
                  disabled={isSyncingSheets || activeTabContacts.length === 0}
                  className="h-8 px-3 rounded-lg bg-white hover:bg-slate-50 disabled:opacity-40 text-slate-700 border border-slate-200 text-xs font-medium flex items-center gap-1.5 transition-colors shadow-2xs"
                  title="Append all leads in this tab directly to Google Sheets tab"
                >
                  <RefreshCw className={`w-3.5 h-3.5 text-slate-500 ${isSyncingSheets ? 'animate-spin' : ''}`} />
                  <span>{isSyncingSheets ? 'Syncing...' : 'Sync to Sheet Tab'}</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setRenameEventInput(selectedEventTab);
                    setShowRenameModal(true);
                  }}
                  className="h-8 px-2.5 rounded-lg bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 text-xs font-medium flex items-center gap-1 transition-colors shadow-2xs"
                  title="Rename this event database"
                >
                  <Edit2 className="w-3 h-3 text-slate-500" />
                  <span>Rename</span>
                </button>
                {selectedEventTab !== 'Default' && (
                  <button
                    type="button"
                    onClick={() => {
                      const fallback = availableEvents.find((e) => e !== selectedEventTab) || 'Default';
                      setDeleteFallbackEvent(fallback);
                      setShowDeleteModal(true);
                    }}
                    className="h-8 px-2.5 rounded-lg bg-white hover:bg-rose-50 text-rose-700 border border-rose-200 text-xs font-medium flex items-center gap-1 transition-colors shadow-2xs"
                    title="Delete this event database"
                  >
                    <Trash2 className="w-3 h-3 text-rose-600" />
                    <span>Delete</span>
                  </button>
                )}
              </div>
            </div>

            {/* Database Metrics Strip */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 pt-2 border-t border-slate-200/80">
              <div className="bg-white rounded-lg p-2.5 border border-slate-200/80 shadow-2xs">
                <div className="text-[11px] text-slate-500 font-medium">Total Leads in Tab</div>
                <div className="text-base font-bold font-mono text-slate-900 mt-0.5 tabular-nums">
                  {activeTabContacts.length}
                </div>
              </div>
              <div className="bg-white rounded-lg p-2.5 border border-slate-200/80 shadow-2xs">
                <div className="text-[11px] text-slate-500 font-medium">Mandatory Verified</div>
                <div className="text-base font-bold font-mono text-slate-900 mt-0.5 tabular-nums flex items-baseline gap-1.5">
                  <span className="text-emerald-700">{activeTabVerified}</span>
                  <span className="text-xs font-normal text-slate-400">
                    ({activeTabContacts.length > 0 ? Math.round((activeTabVerified / activeTabContacts.length) * 100) : 0}%)
                  </span>
                </div>
              </div>
              <div className="bg-white rounded-lg p-2.5 border border-slate-200/80 shadow-2xs">
                <div className="text-[11px] text-slate-500 font-medium">Needs Review</div>
                <div className="text-base font-bold font-mono text-amber-700 mt-0.5 tabular-nums">
                  {activeTabNeedsReview}
                </div>
              </div>
              <div className="bg-white rounded-lg p-2.5 border border-slate-200/80 shadow-2xs">
                <div className="text-[11px] text-slate-500 font-medium">Duplicates Flagged</div>
                <div className="text-base font-bold font-mono text-slate-700 mt-0.5 tabular-nums">
                  {activeTabContacts.filter((c) => duplicatePairsMap.has(c.id)).length}
                </div>
              </div>
            </div>
          </div>
        </>
      )}

      {sheetsSyncFeedback && (
        <div
          className={`p-3.5 rounded-xl text-xs font-medium flex items-center justify-between transition-all ${
            sheetsSyncFeedback.type === 'success'
              ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
              : 'bg-rose-50 text-rose-800 border border-rose-200'
          }`}
        >
          <div className="flex items-center gap-2">
            <FileSpreadsheet className="w-4 h-4 flex-shrink-0" />
            <span>{sheetsSyncFeedback.message}</span>
          </div>
          <button
            type="button"
            onClick={() => setSheetsSyncFeedback(null)}
            className="text-slate-400 hover:text-slate-600 font-bold"
          >
            ✕
          </button>
        </div>
      )}

      {/* Filter & Search Bar */}
      <div className="bg-white border border-slate-200/80 rounded-xl p-4 space-y-3 shadow-2xs">
        <div className="grid grid-cols-1 md:grid-cols-12 gap-3">
          {/* Search Input */}
          <div className="md:col-span-5 relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search name, company, email, phone, or OCR text..."
              className="w-full pl-9 pr-3 py-2 text-xs rounded-lg border border-slate-300 bg-white text-slate-900 focus:outline-none focus:border-slate-900"
            />
          </div>

          {/* Segmented Verification Status Filter */}
          <div className="md:col-span-7 flex items-center gap-1 bg-slate-100 p-1 rounded-lg overflow-x-auto scrollbar-thin">
            {(
              [
                { id: 'ALL', full: 'All Contacts', short: 'All' },
                { id: 'VERIFIED', full: 'Verified', short: 'Verified' },
                { id: 'NEEDS_REVIEW', full: 'Needs Review', short: 'Review' },
                { id: 'MISSING_CORE', full: 'Missing Mandatory', short: 'Missing' },
                {
                  id: 'DUPLICATES',
                  full: `Duplicates (${duplicatePairsMap.size})`,
                  short: `Dupes (${duplicatePairsMap.size})`,
                },
              ] as const
            ).map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setStatusFilter(tab.id)}
                className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                  statusFilter === tab.id
                    ? 'bg-white text-slate-900 shadow-2xs font-semibold'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <span className="hidden sm:inline">{tab.full}</span>
                <span className="sm:hidden">{tab.short}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Mobile Expandable Filters Toggle */}
        <div className="flex items-center justify-between sm:hidden pt-0.5">
          <button
            type="button"
            onClick={() => setShowMobileFilters((prev) => !prev)}
            className="text-xs font-medium text-slate-700 hover:text-slate-900 flex items-center gap-1.5 cursor-pointer"
          >
            <SlidersHorizontal className="w-3.5 h-3.5 text-slate-500" />
            <span>{showMobileFilters ? 'Hide Filters' : 'More Filters (Industry, City, Sort)'}</span>
          </button>
          {(categoryFilter !== 'ALL' || countryFilter !== 'ALL' || cityFilter !== 'ALL' || designationFilter !== 'ALL' || eventFilter !== 'ALL' || sortOrder !== 'NEWEST') && (
            <button
              type="button"
              onClick={resetFilters}
              className="text-xs text-rose-600 font-medium"
            >
              Reset Filters
            </button>
          )}
        </div>

        {/* Secondary Dimension Filters: Category, Country, City, Designation, Sort */}
        <div className={`${showMobileFilters ? 'grid' : 'hidden sm:grid'} grid-cols-2 sm:grid-cols-5 gap-2.5 pt-1`}>
          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            className="px-2.5 py-1.5 text-xs rounded-lg border border-slate-300 bg-white text-slate-700"
          >
            <option value="ALL">All Industries</option>
            {INDUSTRY_CATEGORIES.map((cat) => (
              <option key={cat} value={cat}>
                {cat}
              </option>
            ))}
          </select>

          <select
            value={countryFilter}
            onChange={(e) => setCountryFilter(e.target.value)}
            className="px-2.5 py-1.5 text-xs rounded-lg border border-slate-300 bg-white text-slate-700"
          >
            <option value="ALL">All Countries</option>
            {uniqueCountries.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>

          <select
            value={cityFilter}
            onChange={(e) => setCityFilter(e.target.value)}
            className="px-2.5 py-1.5 text-xs rounded-lg border border-slate-300 bg-white text-slate-700"
          >
            <option value="ALL">All Cities</option>
            {uniqueCities.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>

          <select
            value={designationFilter}
            onChange={(e) => setDesignationFilter(e.target.value)}
            className="px-2.5 py-1.5 text-xs rounded-lg border border-slate-300 bg-white text-slate-700"
          >
            <option value="ALL">All Designations</option>
            {uniqueDesignations.map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </select>

          {uniqueEvents.length > 0 && (
            <select
              value={eventFilter}
              onChange={(e) => setEventFilter(e.target.value)}
              className="px-2.5 py-1.5 text-xs rounded-lg border border-slate-300 bg-white text-slate-700"
              title="Filter by Google Sheets Tab / Event"
            >
              <option value="ALL">All Tabs / Events</option>
              {uniqueEvents.map((evt) => (
                <option key={evt} value={evt}>
                  Tab: {evt}
                </option>
              ))}
            </select>
          )}

          <div className="flex items-center gap-1.5 col-span-2 sm:col-span-1">
            <ArrowUpDown className="w-3.5 h-3.5 text-slate-400 shrink-0" />
            <select
              value={sortOrder}
              onChange={(e) => setSortOrder(e.target.value as any)}
              className="flex-1 px-2.5 py-1.5 text-xs rounded-lg border border-slate-300 bg-white text-slate-700"
            >
              <option value="NEWEST">Newest Scanned First</option>
              <option value="OLDEST">Oldest Scanned First</option>
              <option value="NAME_ASC">Name (A–Z)</option>
            </select>
          </div>
        </div>
      </div>

      {/* Contacts Table (Desktop) & Thumb-Friendly Card List (Mobile) */}
      {contacts.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-xl p-10 sm:p-14 text-center max-w-lg mx-auto space-y-4 my-8 shadow-2xs">
          <div className="w-12 h-12 rounded-xl bg-slate-100 border border-slate-200 flex items-center justify-center mx-auto text-slate-700">
            <CreditCard className="w-6 h-6" />
          </div>
          <div className="space-y-1">
            <h3 className="text-base font-bold text-slate-900">Your Contact Vault is Empty</h3>
            <p className="text-xs text-slate-500 max-w-sm mx-auto leading-relaxed">
              Scan business cards with the camera, import card images, or load rows from Google Sheets.
            </p>
          </div>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-2 pt-1">
            <a
              href="#scanner"
              className="w-full sm:w-auto h-9 px-4 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-xs font-medium transition-colors flex items-center justify-center gap-2 cursor-pointer shadow-2xs"
            >
              <Camera className="w-4 h-4" />
              <span>Launch Camera Scanner</span>
            </a>
            <button
              type="button"
              onClick={onOpenBulkUpload}
              className="w-full sm:w-auto h-9 px-4 rounded-lg bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 text-xs font-medium transition-colors flex items-center justify-center gap-2 cursor-pointer shadow-2xs"
            >
              <UploadCloud className="w-4 h-4 text-slate-500" />
              <span>Bulk Image Upload</span>
            </button>
          </div>
        </div>
      ) : filteredContacts.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-xl p-10 text-center space-y-3 my-6 shadow-2xs max-w-lg mx-auto">
          <div className="text-sm font-semibold text-slate-900">
            No contacts match {searchQuery ? `"${searchQuery}"` : 'your filters'}
          </div>
          <p className="text-xs text-slate-500 max-w-md mx-auto">
            Try adjusting your search query, status filters, or event selection.
          </p>
          <button
            type="button"
            onClick={resetFilters}
            className="h-8 px-3 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-xs font-medium transition-colors cursor-pointer shadow-2xs"
          >
            Clear all filters
          </button>
        </div>
      ) : (
        <>
          {/* Mobile Card List (md:hidden) */}
          <div className="md:hidden space-y-3">
            {filteredContacts.map((c) => {
              const f = c.fields;
              const dupInfo = duplicatePairsMap.get(c.id);
              return (
                <div
                  key={c.id}
                  className="bg-white border border-slate-200 rounded-2xl p-3.5 space-y-3 shadow-2xs"
                >
                  <div className="flex items-start justify-between gap-2.5">
                    <div className="flex items-start gap-2.5 min-w-0">
                      <input
                        type="checkbox"
                        checked={selectedIds.includes(c.id)}
                        onChange={() => toggleSelectOne(c.id)}
                        className="rounded border-slate-300 mt-1 shrink-0"
                      />
                      <button
                        type="button"
                        onClick={() => setPreviewImagesContact(c)}
                        className="relative w-20 h-12 rounded-lg overflow-hidden bg-slate-900 border border-slate-300 shrink-0"
                      >
                        <img
                          src={c.frontImageBase64}
                          alt={f.fullName.value || 'Scanned Card'}
                          referrerPolicy="no-referrer"
                          className="w-full h-full object-cover"
                        />
                        {c.backImageBase64 && (
                          <span className="absolute bottom-0.5 right-0.5 bg-slate-950/85 text-white text-[8px] font-mono px-1 rounded">
                            2 Sides
                          </span>
                        )}
                      </button>
                      <div className="min-w-0">
                        <div className="text-sm font-semibold text-slate-900 truncate">
                          {f.fullName.value || (
                            <span className="text-rose-600 font-normal">Name Missing</span>
                          )}
                        </div>
                        <div className="text-xs font-medium text-slate-600 truncate">
                          {f.companyName.value || (
                            <span className="text-rose-600 font-normal">Company Missing</span>
                          )}
                        </div>
                        {f.designation.value && (
                          <div className="text-[11px] text-slate-500 truncate">
                            {f.designation.value}
                          </div>
                        )}
                        <div className="flex items-center gap-1.5 mt-1">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              const targetEv = c.eventName || c.sheetTab || 'Default';
                              setSelectedEventTab(targetEv);
                              setEventFilter(targetEv);
                              onSelectEvent(targetEv);
                            }}
                            className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-mono text-slate-600 bg-slate-100 hover:bg-slate-200 border border-slate-200 transition-colors"
                            title="Switch view to this database"
                          >
                            <Folder className="w-2.5 h-2.5 text-slate-400" />
                            <span>{c.eventName || c.sheetTab || 'Default'}</span>
                          </button>
                        </div>
                      </div>
                    </div>

                    <div className="shrink-0 text-right">
                      {c.overallStatus === 'VERIFIED' && !dupInfo ? (
                        <span className="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-700">
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          Verified
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-[11px] font-medium text-amber-700">
                          <AlertTriangle className="w-3.5 h-3.5" />
                          Review
                        </span>
                      )}
                      <div className="text-[10px] font-mono text-slate-400 mt-0.5">
                        {c.id}
                      </div>
                    </div>
                  </div>

                  {/* Dynamic Contact Details - Tap to Review */}
                  <div
                    onClick={() => onInspectContact(c)}
                    className="grid grid-cols-1 gap-1 text-xs bg-slate-50/80 hover:bg-slate-100/80 cursor-pointer rounded-lg p-2.5 border border-slate-200/70 font-mono transition-colors"
                  >
                    <div className="truncate text-slate-800">
                      <span className="text-slate-400 font-sans mr-1.5">Phone:</span>
                      {f.mobileNumber.value || f.officePhone.value || f.companyTelephone.value || (
                        <span className="text-rose-600 font-sans">Missing</span>
                      )}
                    </div>
                    <div className="truncate text-slate-700">
                      <span className="text-slate-400 font-sans mr-1.5">Email:</span>
                      {f.email.value || (
                        <span className="text-amber-700 font-sans">Missing</span>
                      )}
                    </div>
                    {(f.city.value || f.country.value) && (
                      <div className="truncate text-slate-600 font-sans">
                        <span className="text-slate-400 mr-1.5">Location:</span>
                        {[f.city.value, f.country.value].filter(Boolean).join(', ')}
                      </div>
                    )}
                  </div>

                  {c.missingCoreFieldLabels.length > 0 && (
                    <div className="text-[11px] text-rose-600 font-medium">
                      Missing Mandatory: {c.missingCoreFieldLabels.join(', ')}
                    </div>
                  )}

                  {/* Clean Executive Mobile Action Row */}
                  <div className="flex items-center justify-between gap-1.5 pt-0.5">
                    {/* Outreach Shortcuts */}
                    <div className="flex items-center gap-1">
                      {(f.mobileNumber.value || f.officePhone.value || f.companyTelephone.value) && (
                        <a
                          href={`tel:${(
                            f.mobileNumber.value ||
                            f.officePhone.value ||
                            f.companyTelephone.value
                          ).replace(/[^\d+]/g, '')}`}
                          className="h-7 w-7 rounded-md bg-slate-100 hover:bg-slate-200 text-slate-700 flex items-center justify-center transition-colors"
                          title="Call Lead"
                        >
                          <Phone className="w-3.5 h-3.5" />
                        </a>
                      )}
                      {formatWhatsAppUrl(
                        f.mobileNumber.value || f.officePhone.value
                      ) && (
                        <a
                          href={formatWhatsAppUrl(
                            f.mobileNumber.value || f.officePhone.value
                          )}
                          target="_blank"
                          rel="noreferrer"
                          className="h-7 w-7 rounded-md bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200/80 flex items-center justify-center transition-colors"
                          title="WhatsApp Message"
                        >
                          <MessageCircle className="w-3.5 h-3.5 text-emerald-600" />
                        </a>
                      )}
                      {f.email.value && (
                        <a
                          href={`mailto:${f.email.value}`}
                          className="h-7 w-7 rounded-md bg-slate-100 hover:bg-slate-200 text-slate-700 flex items-center justify-center transition-colors"
                          title="Send Email"
                        >
                          <Mail className="w-3.5 h-3.5" />
                        </a>
                      )}
                      <button
                        type="button"
                        onClick={() =>
                          exportContactsToVCard(
                            [c],
                            f.fullName.value || f.companyName.value || 'Contact'
                          )
                        }
                        className="h-7 px-2 rounded-md bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 text-[11px] font-medium flex items-center gap-1 transition-colors cursor-pointer"
                        title="Save to Phone Book"
                      >
                        <UserPlus className="w-3 h-3 text-slate-500" />
                        <span>.VCF</span>
                      </button>
                    </div>

                    {/* Review & Delete */}
                    <div className="flex items-center gap-1.5 ml-auto">
                      <button
                        id={`mobile-review-btn-${c.id}`}
                        type="button"
                        onClick={() => onInspectContact(c)}
                        className="h-7 px-2.5 rounded-md bg-slate-900 hover:bg-slate-800 text-white text-xs font-medium flex items-center gap-1.5 transition-colors shadow-2xs cursor-pointer"
                      >
                        <Edit3 className="w-3 h-3 text-slate-300" />
                        <span>Review</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setContactToDelete(c)}
                        className="h-7 w-7 rounded-md border border-slate-200 bg-white hover:bg-rose-50 text-slate-400 hover:text-rose-600 flex items-center justify-center transition-colors cursor-pointer"
                        title="Delete Lead"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Desktop Table View (hidden md:block) */}
          <div className="hidden md:block bg-white border border-slate-200 rounded-2xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50 text-[11px] font-semibold text-slate-600">
                    <th className="py-3 px-3 w-10">
                      <input
                        type="checkbox"
                        checked={
                          filteredContacts.length > 0 &&
                          filteredContacts.every((c) => selectedIds.includes(c.id))
                        }
                        onChange={toggleSelectAllFiltered}
                        className="rounded border-slate-300"
                      />
                    </th>
                    <th className="py-3 px-3">Card Evidence</th>
                    <th className="py-3 px-3">Contact & Designation</th>
                    <th className="py-3 px-3">Company & Industry</th>
                    <th className="py-3 px-3">Phone & Email</th>
                    <th className="py-3 px-3">Location</th>
                    <th className="py-3 px-3">Verification & Mandatory Status</th>
                    <th className="py-3 px-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 text-xs">
                  {filteredContacts.map((c) => {
                    const f = c.fields;
                    const dupInfo = duplicatePairsMap.get(c.id);

                    return (
                      <tr
                        key={c.id}
                        className="hover:bg-slate-50/90 transition-colors align-top"
                      >
                        <td className="py-3 px-3">
                          <input
                            type="checkbox"
                            checked={selectedIds.includes(c.id)}
                            onChange={() => toggleSelectOne(c.id)}
                            className="rounded border-slate-300 mt-1"
                          />
                        </td>

                        {/* Original Card Thumbnail */}
                        <td className="py-3 px-3">
                          <button
                            type="button"
                            onClick={() => setPreviewImagesContact(c)}
                            className="group relative block w-24 h-14 rounded-lg overflow-hidden bg-slate-900 border border-slate-300"
                            title="View Front & Back Card Images"
                          >
                            <img
                              src={c.frontImageBase64}
                              alt={f.fullName.value || 'Scanned Card'}
                              referrerPolicy="no-referrer"
                              className="w-full h-full object-cover group-hover:opacity-80 transition-opacity"
                            />
                            {c.backImageBase64 && (
                              <span className="absolute bottom-1 right-1 bg-slate-950/85 text-white text-[9px] font-mono px-1 rounded">
                                2 Sides
                              </span>
                            )}
                          </button>
                          <div className="text-[10px] font-mono text-slate-400 mt-1 tabular-nums">
                            {c.id}
                          </div>
                          <button
                            type="button"
                            onClick={() => {
                              const targetEv = c.eventName || c.sheetTab || 'Default';
                              setSelectedEventTab(targetEv);
                              setEventFilter(targetEv);
                              onSelectEvent(targetEv);
                            }}
                            className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-mono text-slate-600 bg-slate-100 hover:bg-slate-200 border border-slate-200 mt-1 transition-colors"
                            title="Switch view to this event database"
                          >
                            <Folder className="w-2.5 h-2.5 text-slate-400" />
                            <span>{c.eventName || c.sheetTab || 'Default'}</span>
                          </button>
                        </td>

                        {/* Contact & Role */}
                        <td className="py-3 px-3">
                          <div className="font-bold text-slate-900">
                            {f.fullName.value || (
                              <span className="text-red-600">Name Missing</span>
                            )}
                          </div>
                          <div className="text-slate-600 mt-0.5">
                            {f.designation.value || (
                              <span className="text-slate-400">
                                Role not listed on card
                              </span>
                            )}
                          </div>
                          {f.department.value && (
                            <div className="text-[11px] text-slate-400">
                              {f.department.value}
                            </div>
                          )}
                        </td>

                        {/* Company & Industry */}
                        <td className="py-3 px-3">
                          <div className="font-semibold text-slate-900">
                            {f.companyName.value || (
                              <span className="text-red-600">Company Missing</span>
                            )}
                          </div>
                          {f.companyCategory.value && (
                            <div className="text-slate-600 mt-0.5">
                              <span>{f.companyCategory.value}</span>
                            </div>
                          )}
                          {f.companyWebsite.value && (
                            <div className="text-[11px] font-mono text-slate-500 truncate max-w-[180px]">
                              {f.companyWebsite.value}
                            </div>
                          )}
                        </td>

                        {/* Phone & Email */}
                        <td className="py-3 px-3 font-mono tabular-nums space-y-0.5">
                          <div
                            className={
                              f.mobileNumber.status === 'NEEDS_REVIEW'
                                ? 'text-amber-700 font-semibold'
                                : 'text-slate-800'
                            }
                          >
                            {f.mobileNumber.value || f.officePhone.value || f.companyTelephone.value || (
                              <span className="text-red-600 font-sans">Phone Missing</span>
                            )}
                          </div>
                          <div
                            className={`truncate max-w-[210px] ${
                              f.email.status === 'NEEDS_REVIEW'
                                ? 'text-amber-700 font-semibold'
                                : 'text-slate-600'
                            }`}
                          >
                            {f.email.value || (
                              <span className="text-amber-700 font-sans font-medium">
                                Email Missing
                              </span>
                            )}
                          </div>
                        </td>

                        {/* Location */}
                        <td className="py-3 px-3 text-slate-600">
                          <div>
                            {[f.city.value, f.country.value].filter(Boolean).join(', ') ||
                              '—'}
                          </div>
                          <div className="text-[11px] text-slate-400 font-mono tabular-nums mt-0.5">
                            {new Date(c.createdAt).toLocaleDateString()}
                          </div>
                        </td>

                        {/* Verification & Mandatory Status */}
                        <td className="py-3 px-3">
                          {c.overallStatus === 'VERIFIED' && !dupInfo ? (
                            <div className="text-emerald-700 font-semibold flex items-center gap-1">
                              <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                              <span>Verified (4 Mandatory Fields)</span>
                            </div>
                          ) : (
                            <div className="space-y-1">
                              <div className="text-amber-700 font-semibold flex items-center gap-1">
                                <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                                <span>
                                  {c.savedWithoutCoreFields
                                    ? 'Needs Review (Missing Mandatory)'
                                    : 'Needs Review'}
                                </span>
                              </div>
                              {c.missingCoreFieldLabels.length > 0 && (
                                <div className="text-[11px] text-red-600 font-medium">
                                  Missing: {c.missingCoreFieldLabels.join(', ')}
                                </div>
                              )}
                              {c.reviewReasons
                                .filter((r) => !r.startsWith('Missing '))
                                .slice(0, 2)
                                .map((reason, idx) => (
                                  <div key={idx} className="text-[11px] text-amber-800">
                                    {reason}
                                  </div>
                                ))}
                            </div>
                          )}

                          {dupInfo && (
                            <div className="mt-1.5 pt-1.5 border-t border-slate-200 flex items-center justify-between gap-2">
                              <span className="text-[11px] text-slate-500 font-medium">
                                Duplicate of {dupInfo.other.id}
                              </span>
                              <button
                                id={`btn-merge-${c.id}`}
                                type="button"
                                onClick={() => onOpenMergeModal(c, dupInfo.other)}
                                className="h-6 px-2 rounded bg-slate-900 hover:bg-slate-800 text-white text-[11px] font-medium flex items-center gap-1 whitespace-nowrap shrink-0 shadow-2xs transition-colors"
                              >
                                <GitMerge className="w-3 h-3" />
                                <span>Merge</span>
                              </button>
                            </div>
                          )}
                        </td>

                        {/* Actions */}
                        <td className="py-3 px-3 text-right">
                          <div className="flex items-center justify-end gap-1">
                            <button
                              id={`btn-review-${c.id}`}
                              type="button"
                              onClick={() => onInspectContact(c)}
                              className="min-h-[36px] px-2.5 py-1.5 rounded-lg border border-slate-200 hover:bg-slate-100 text-slate-700 font-medium flex items-center gap-1 whitespace-nowrap shrink-0"
                              title="Review & edit fields"
                            >
                              <Edit3 className="w-3.5 h-3.5" />
                              Review / Edit
                            </button>
                            <button
                              type="button"
                              onClick={() =>
                                exportContactsToVCard(
                                  [c],
                                  f.fullName.value || f.companyName.value || 'Contact'
                                )
                              }
                              className="min-h-[36px] p-1.5 rounded-lg border border-slate-200 hover:bg-blue-50 hover:border-blue-200 text-slate-600 hover:text-blue-700"
                              title="Save contact to Phone Address Book (.vcf)"
                            >
                              <UserPlus className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => setPreviewImagesContact(c)}
                              className="min-h-[36px] p-1.5 rounded-lg border border-slate-200 hover:bg-slate-100 text-slate-600"
                              title="View front & back images"
                            >
                              <Eye className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => setContactToDelete(c)}
                              className="min-h-[36px] p-1.5 rounded-lg border border-slate-200 hover:bg-red-50 hover:border-red-200 text-slate-500 hover:text-red-600"
                              title="Delete contact"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {/* Side-by-Side Front & Back Card Lightbox Modal */}
      {previewImagesContact && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-xs flex items-stretch sm:items-center justify-center p-0 sm:p-4 overflow-hidden">
          <div className="bg-white rounded-none sm:rounded-2xl max-w-4xl w-full h-[100dvh] sm:h-auto sm:max-h-[90vh] flex flex-col overflow-hidden shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-200 px-4 sm:px-5 pt-[max(env(safe-area-inset-top),12px)] pb-3 sm:py-3.5 bg-slate-50 shrink-0">
              <div className="min-w-0 mr-2">
                <h3 className="text-sm sm:text-base font-bold text-slate-900 truncate">
                  Original Business Card Evidence ·{' '}
                  {previewImagesContact.fields.fullName.value || previewImagesContact.id}
                </h3>
                <p className="text-[11px] sm:text-xs text-slate-500 truncate">
                  {previewImagesContact.fields.companyName.value} · Scanned{' '}
                  {new Date(previewImagesContact.createdAt).toLocaleString()}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setPreviewImagesContact(null)}
                className="px-3 py-1.5 rounded-lg bg-white border border-slate-300 hover:bg-slate-100 text-xs font-semibold text-slate-700 shrink-0"
              >
                Close
              </button>
            </div>

            <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain p-4 sm:p-5 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <div className="text-xs font-semibold text-slate-700">
                    Front Side Image
                  </div>
                  <div className="bg-slate-900 rounded-xl p-3 flex items-center justify-center h-64">
                    <img
                      src={previewImagesContact.frontImageBase64}
                      alt="Front card"
                      referrerPolicy="no-referrer"
                      className="max-h-full max-w-full object-contain rounded"
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <div className="text-xs font-semibold text-slate-700">
                    Back Side Image
                  </div>
                  <div className="bg-slate-900 rounded-xl p-3 flex items-center justify-center h-64">
                    {previewImagesContact.backImageBase64 ? (
                      <img
                        src={previewImagesContact.backImageBase64}
                        alt="Back card"
                        referrerPolicy="no-referrer"
                        className="max-h-full max-w-full object-contain rounded"
                      />
                    ) : (
                      <span className="text-xs text-slate-400">
                        Single-sided scan (No back image captured)
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </div>

            <div className="shrink-0 flex justify-end gap-2 px-4 sm:px-5 py-3 pb-[max(env(safe-area-inset-bottom),14px)] border-t border-slate-100 bg-slate-50">
              <button
                type="button"
                onClick={() => {
                  const target = previewImagesContact;
                  setPreviewImagesContact(null);
                  onInspectContact(target);
                }}
                className="px-4 py-2 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-xs font-medium shadow-2xs transition-colors"
              >
                Open Full Field Inspector
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Create Event Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/70 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-5 space-y-4 shadow-2xl border border-slate-200">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <div className="flex items-center gap-2">
                <FolderPlus className="w-5 h-5 text-blue-600" />
                <h3 className="text-base font-bold text-slate-900">Create New Event Database</h3>
              </div>
              <button
                type="button"
                onClick={() => setShowCreateModal(false)}
                className="text-slate-400 hover:text-slate-600"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3">
              <div>
                <label className="text-xs font-semibold text-slate-700 block mb-1">
                  Event / Google Sheets Tab Name:
                </label>
                <input
                  type="text"
                  autoFocus
                  value={newEventNameInput}
                  onChange={(e) => setNewEventNameInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && newEventNameInput.trim()) {
                      const trimmed = newEventNameInput.trim();
                      onCreateEvent(trimmed);
                      setSelectedEventTab(trimmed);
                      setEventFilter(trimmed);
                      setShowCreateModal(false);
                      setNewEventNameInput('');
                    }
                  }}
                  placeholder="e.g. GITEX Global 2026, CES 2026, VIP Leads"
                  className="w-full px-3 py-2 text-xs rounded-xl border border-slate-300 focus:outline-none focus:border-blue-600 font-medium"
                />
              </div>

              <div>
                <span className="text-[11px] text-slate-500 block mb-1.5 font-medium">Quick Suggestions:</span>
                <div className="flex flex-wrap gap-1.5">
                  {['GITEX Global 2026', 'CES Las Vegas 2026', 'Web Summit', 'VIP Clients', 'Healthcare Expo 2026'].map((sugg) => (
                    <button
                      key={sugg}
                      type="button"
                      onClick={() => setNewEventNameInput(sugg)}
                      className="px-2 py-1 text-[11px] font-medium bg-slate-100 hover:bg-blue-50 hover:text-blue-700 text-slate-700 rounded-lg border border-slate-200 transition-colors"
                    >
                      + {sugg}
                    </button>
                  ))}
                </div>
              </div>

              <p className="text-[11px] text-slate-500 leading-relaxed">
                Creates an independent lead database and assigns all new scans to this Google Sheets tab.
              </p>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setShowCreateModal(false)}
                className="px-3.5 py-2 rounded-xl text-xs font-medium text-slate-600 hover:bg-slate-100"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={!newEventNameInput.trim()}
                onClick={() => {
                  const trimmed = newEventNameInput.trim();
                  if (trimmed) {
                    onCreateEvent(trimmed);
                    setSelectedEventTab(trimmed);
                    setEventFilter(trimmed);
                    setShowCreateModal(false);
                    setNewEventNameInput('');
                  }
                }}
                className="px-4 py-2 rounded-xl text-xs font-semibold bg-blue-600 hover:bg-blue-700 disabled:opacity-40 text-white transition-colors"
              >
                Create Database Tab
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Rename Event Modal */}
      {showRenameModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/70 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-5 space-y-4 shadow-2xl border border-slate-200">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <div className="flex items-center gap-2">
                <Edit2 className="w-5 h-5 text-blue-600" />
                <h3 className="text-base font-bold text-slate-900">Rename "{selectedEventTab}"</h3>
              </div>
              <button
                type="button"
                onClick={() => setShowRenameModal(false)}
                className="text-slate-400 hover:text-slate-600"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3">
              <div>
                <label className="text-xs font-semibold text-slate-700 block mb-1">
                  New Event / Tab Name:
                </label>
                <input
                  type="text"
                  autoFocus
                  value={renameEventInput}
                  onChange={(e) => setRenameEventInput(e.target.value)}
                  onKeyDown={async (e) => {
                    if (e.key === 'Enter' && renameEventInput.trim()) {
                      const trimmed = renameEventInput.trim();
                      await onRenameEvent(selectedEventTab, trimmed);
                      setSelectedEventTab(trimmed);
                      setEventFilter(trimmed);
                      setShowRenameModal(false);
                    }
                  }}
                  className="w-full px-3 py-2 text-xs rounded-xl border border-slate-300 focus:outline-none focus:border-blue-600 font-medium"
                />
              </div>
              <p className="text-[11px] text-slate-500">
                This will automatically update all leads currently tagged under "{selectedEventTab}" to the new name across IndexedDB, disk storage, and Google Sheets exports.
              </p>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setShowRenameModal(false)}
                className="px-3.5 py-2 rounded-xl text-xs font-medium text-slate-600 hover:bg-slate-100"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={!renameEventInput.trim() || renameEventInput.trim() === selectedEventTab}
                onClick={async () => {
                  const trimmed = renameEventInput.trim();
                  if (trimmed && trimmed !== selectedEventTab) {
                    await onRenameEvent(selectedEventTab, trimmed);
                    setSelectedEventTab(trimmed);
                    setEventFilter(trimmed);
                    setShowRenameModal(false);
                  }
                }}
                className="px-4 py-2 rounded-xl text-xs font-semibold bg-blue-600 hover:bg-blue-700 disabled:opacity-40 text-white transition-colors"
              >
                Save New Name
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Event Modal */}
      {showDeleteModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/70 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-5 space-y-4 shadow-2xl border border-red-200">
            <div className="flex items-center justify-between border-b border-red-100 pb-3">
              <div className="flex items-center gap-2 text-red-600">
                <Trash2 className="w-5 h-5" />
                <h3 className="text-base font-bold text-slate-900">Delete Event Database</h3>
              </div>
              <button
                type="button"
                onClick={() => setShowDeleteModal(false)}
                className="text-slate-400 hover:text-slate-600"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3">
              <p className="text-xs text-slate-700">
                Are you sure you want to delete the <span className="font-bold">"{selectedEventTab}"</span> database?
              </p>
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-xs text-amber-900">
                There are <span className="font-bold font-mono">{activeTabContacts.length}</span> lead{activeTabContacts.length === 1 ? '' : 's'} in this event database. Select where they should be safely moved:
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-700 block mb-1">
                  Reassign existing leads to:
                </label>
                <select
                  value={deleteFallbackEvent}
                  onChange={(e) => setDeleteFallbackEvent(e.target.value)}
                  className="w-full px-3 py-2 text-xs rounded-xl border border-slate-300 bg-white text-slate-900 focus:outline-none focus:border-blue-600"
                >
                  {availableEvents
                    .filter((ev) => ev !== selectedEventTab)
                    .map((ev) => (
                      <option key={ev} value={ev}>
                        {ev} Database
                      </option>
                    ))}
                  {!availableEvents.includes('Default') && <option value="Default">Default Database</option>}
                </select>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setShowDeleteModal(false)}
                className="px-3.5 py-2 rounded-xl text-xs font-medium text-slate-600 hover:bg-slate-100"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={async () => {
                  await onDeleteEvent(selectedEventTab, deleteFallbackEvent);
                  setSelectedEventTab(deleteFallbackEvent);
                  setEventFilter(deleteFallbackEvent);
                  setShowDeleteModal(false);
                }}
                className="px-4 py-2 rounded-xl text-xs font-semibold bg-red-600 hover:bg-red-700 text-white transition-colors"
              >
                Delete & Reassign Leads
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Single Contact Confirmation Modal */}
      {contactToDelete && (
        <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-150">
          <div className="bg-white rounded-2xl max-w-md w-full p-5 space-y-4 shadow-2xl border border-red-200">
            <div className="flex items-center justify-between border-b border-red-100 pb-3">
              <div className="flex items-center gap-2 text-red-600">
                <Trash2 className="w-5 h-5" />
                <h3 className="text-base font-bold text-slate-900">Delete Contact Record</h3>
              </div>
              <button
                type="button"
                onClick={() => !isDeleting && setContactToDelete(null)}
                className="text-slate-400 hover:text-slate-600"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3">
              <p className="text-xs text-slate-700">
                Are you sure you want to permanently delete this business card lead?
              </p>

              <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 space-y-1">
                <div className="text-sm font-bold text-slate-900">
                  {contactToDelete.fields.fullName.value || 'Unnamed Contact'}
                </div>
                <div className="text-xs text-blue-700 font-medium">
                  {contactToDelete.fields.companyName.value || 'No Company'}
                </div>
                {contactToDelete.fields.designation.value && (
                  <div className="text-[11px] text-slate-500">
                    {contactToDelete.fields.designation.value}
                  </div>
                )}
                <div className="text-[10px] font-mono text-slate-400 pt-1 flex items-center gap-2">
                  <span>ID: {contactToDelete.id}</span>
                  <span>·</span>
                  <span className="text-cyan-700 font-semibold">Tab: {contactToDelete.eventName || contactToDelete.sheetTab || 'Default'}</span>
                </div>
              </div>

              <div className="bg-red-50 border border-red-200 rounded-xl p-2.5 text-[11px] text-red-800 leading-relaxed">
                <strong>Sync Note:</strong> Deleting will remove this card from CardVault, IndexedDB, local disk, and trigger an automated row deletion in your connected Google Sheet tab.
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
              <button
                type="button"
                disabled={isDeleting}
                onClick={() => setContactToDelete(null)}
                className="px-3.5 py-2 rounded-xl text-xs font-medium text-slate-600 hover:bg-slate-100 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={isDeleting}
                onClick={async () => {
                  setIsDeleting(true);
                  try {
                    await onDeleteContact(contactToDelete.id);
                    setContactToDelete(null);
                  } finally {
                    setIsDeleting(false);
                  }
                }}
                className="px-4 py-2 rounded-xl text-xs font-semibold bg-red-600 hover:bg-red-700 text-white transition-colors disabled:opacity-50 flex items-center gap-1.5"
              >
                {isDeleting ? 'Deleting...' : 'Delete Permanently'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Bulk Delete Contacts Confirmation Modal */}
      {showBulkDeleteModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-150">
          <div className="bg-white rounded-2xl max-w-md w-full p-5 space-y-4 shadow-2xl border border-red-200">
            <div className="flex items-center justify-between border-b border-red-100 pb-3">
              <div className="flex items-center gap-2 text-red-600">
                <Trash2 className="w-5 h-5" />
                <h3 className="text-base font-bold text-slate-900">
                  Delete {selectedIds.length} Selected Contacts
                </h3>
              </div>
              <button
                type="button"
                onClick={() => !isDeleting && setShowBulkDeleteModal(false)}
                className="text-slate-400 hover:text-slate-600"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3">
              <p className="text-xs text-slate-700">
                Are you sure you want to permanently delete all <strong className="font-mono">{selectedIds.length}</strong> selected contacts?
              </p>

              <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-xs text-red-900 leading-relaxed">
                This will purge all {selectedIds.length} records across your device storage, local disk backup, and transmit deletion requests to connected Google Sheets tabs. This action cannot be undone.
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
              <button
                type="button"
                disabled={isDeleting}
                onClick={() => setShowBulkDeleteModal(false)}
                className="px-3.5 py-2 rounded-xl text-xs font-medium text-slate-600 hover:bg-slate-100 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={isDeleting}
                onClick={async () => {
                  setIsDeleting(true);
                  try {
                    await onBulkDeleteContacts(selectedIds);
                    setShowBulkDeleteModal(false);
                  } finally {
                    setIsDeleting(false);
                  }
                }}
                className="px-4 py-2 rounded-xl text-xs font-semibold bg-red-600 hover:bg-red-700 text-white transition-colors disabled:opacity-50 flex items-center gap-1.5"
              >
                {isDeleting ? 'Deleting...' : `Delete ${selectedIds.length} Contacts`}
              </button>
            </div>
          </div>
        </div>
      )}
      {/* Floating Multi-Select Bulk Action Deck */}
      {selectedIds.length > 0 && (
        <div className="fixed bottom-20 md:bottom-8 left-1/2 -translate-x-1/2 z-40 bg-slate-950/95 backdrop-blur-md text-white px-4 py-2.5 rounded-2xl shadow-2xl border border-slate-700/80 flex flex-wrap items-center justify-center gap-2.5 animate-in fade-in slide-in-from-bottom-2 duration-200 max-w-[95vw]">
          <div className="flex items-center gap-1.5 text-xs font-bold shrink-0">
            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
            <span>{selectedIds.length} Selected</span>
          </div>

          <div className="h-4 w-px bg-slate-700 hidden sm:block" />

          {/* Move to Database */}
          <select
            defaultValue=""
            onChange={async (e) => {
              const val = e.target.value;
              if (!val) return;
              if (val === '__CREATE_NEW__') {
                setNewEventNameInput('');
                setShowCreateModal(true);
                e.target.value = '';
                return;
              }
              await onMoveContactsToEvent(selectedIds, val);
              e.target.value = '';
            }}
            className="px-2.5 py-1 rounded-xl bg-slate-800 border border-slate-600 text-white text-xs font-semibold cursor-pointer"
          >
            <option value="" disabled>
              Move to Event ▾
            </option>
            {availableEvents.map((evt) => (
              <option key={evt} value={evt}>
                Move to "{evt}"
              </option>
            ))}
            <option value="__CREATE_NEW__">+ New Event Database...</option>
          </select>

          {/* Export */}
          <button
            type="button"
            onClick={() =>
              onExportRecords(
                'selected',
                'xlsx',
                contacts.filter((c) => selectedIds.includes(c.id))
              )
            }
            className="px-3 py-1 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold flex items-center gap-1 shrink-0"
          >
            <FileSpreadsheet className="w-3.5 h-3.5" />
            <span>Export .XLSX</span>
          </button>

          {/* Delete */}
          <button
            type="button"
            onClick={() => setShowBulkDeleteModal(true)}
            className="px-3 py-1 rounded-xl bg-red-600/90 hover:bg-red-500 text-white text-xs font-semibold flex items-center gap-1 shrink-0"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>Delete ({selectedIds.length})</span>
          </button>

          {/* Clear selection */}
          <button
            type="button"
            onClick={() => onChangeSelectedIds([])}
            className="p-1 rounded-lg text-slate-400 hover:text-white"
            title="Deselect all"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}
    </div>
  );
};
