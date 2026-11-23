import React, { useMemo, useState } from 'react';
import {
  CheckCircle2,
  Cloud,
  Contact,
  Download,
  FileSpreadsheet,
  FileText,
  Filter,
  Folder,
  Layers,
  Settings,
} from 'lucide-react';
import { ContactRecord, INDUSTRY_CATEGORIES } from '../types/card';
import {
  contactsToSpreadsheetRows,
  exportContactsToCSV,
  exportContactsToExcel,
  exportContactsToVCard,
  exportMultiEventWorkbookToExcel,
} from '../utils/exporter';
import { useModal } from '../context/ModalContext';
import { getLocalSheetsConfig } from '../services/googleSheetsService';

interface ExportViewProps {
  contacts: ContactRecord[];
  selectedIds: string[];
  activeEvent?: string;
  availableEvents?: string[];
  onSelectEvent?: (event: string) => void;
}

export type ExportScope =
  | 'ACTIVE_EVENT'
  | 'MULTI_EVENT_WORKBOOK'
  | 'CHOOSE_EVENT'
  | 'ALL'
  | 'VERIFIED_ONLY'
  | 'SELECTED'
  | 'CATEGORY';

export const ExportView: React.FC<ExportViewProps> = ({
  contacts,
  selectedIds,
  activeEvent = 'Default',
  availableEvents = ['Default'],
  onSelectEvent,
}) => {
  const { openSheetsModal } = useModal();
  const sheetsConfig = getLocalSheetsConfig();
  const isSheetsConnected = Boolean(sheetsConfig.webhookUrl && sheetsConfig.webhookUrl.trim().length > 0);

  const [exportScope, setExportScope] = useState<ExportScope>(() => {
    if (selectedIds.length > 0) return 'SELECTED';
    return 'ACTIVE_EVENT';
  });
  const [chosenEvent, setChosenEvent] = useState<string>(activeEvent || 'Default');
  const [selectedCategory, setSelectedCategory] = useState<string>(
    INDUSTRY_CATEGORIES[0]
  );
  const [lastExportResult, setLastExportResult] = useState<{
    filename: string;
    rowCount: number;
    format: 'Excel (.xlsx)' | 'CSV (.csv)' | 'vCard (.vcf)';
    timestamp: string;
  } | null>(null);

  const targetContacts = useMemo(() => {
    if (exportScope === 'ACTIVE_EVENT') {
      const target = activeEvent || 'Default';
      return contacts.filter((c) => (c.eventName || c.sheetTab || 'Default') === target);
    }
    if (exportScope === 'CHOOSE_EVENT') {
      return contacts.filter((c) => (c.eventName || c.sheetTab || 'Default') === chosenEvent);
    }
    if (exportScope === 'MULTI_EVENT_WORKBOOK') {
      return contacts;
    }
    if (exportScope === 'VERIFIED_ONLY') {
      return contacts.filter((c) => c.overallStatus === 'VERIFIED');
    }
    if (exportScope === 'SELECTED') {
      return contacts.filter((c) => selectedIds.includes(c.id));
    }
    if (exportScope === 'CATEGORY') {
      return contacts.filter((c) => c.fields.companyCategory.value === selectedCategory);
    }
    return contacts;
  }, [contacts, exportScope, activeEvent, chosenEvent, selectedIds, selectedCategory]);

  const previewRows = useMemo(
    () => contactsToSpreadsheetRows(targetContacts).slice(0, 8),
    [targetContacts]
  );

  const handleTriggerExport = (format: 'xlsx' | 'csv' | 'vcf') => {
    if (targetContacts.length === 0) return;

    if (exportScope === 'MULTI_EVENT_WORKBOOK') {
      if (format === 'xlsx') {
        const res = exportMultiEventWorkbookToExcel(
          contacts,
          availableEvents,
          'CardVault_Enterprise_MultiEvent'
        );
        setLastExportResult({
          filename: res.filename,
          rowCount: res.rowCount,
          format: 'Excel (.xlsx)',
          timestamp: new Date().toLocaleTimeString(),
        });
      } else if (format === 'csv') {
        const res = exportContactsToCSV(contacts, 'CardVault_All_Events_Master');
        setLastExportResult({
          filename: res.filename,
          rowCount: res.rowCount,
          format: 'CSV (.csv)',
          timestamp: new Date().toLocaleTimeString(),
        });
      } else {
        const res = exportContactsToVCard(contacts, 'CardVault_All_Events_Master');
        setLastExportResult({
          filename: res.filename,
          rowCount: res.rowCount,
          format: 'vCard (.vcf)',
          timestamp: new Date().toLocaleTimeString(),
        });
      }
      return;
    }

    const currentSheetName =
      exportScope === 'ACTIVE_EVENT'
        ? activeEvent
        : exportScope === 'CHOOSE_EVENT'
        ? chosenEvent
        : undefined;

    const filePrefix =
      exportScope === 'ACTIVE_EVENT'
        ? `CardVault_${activeEvent}_Leads`
        : exportScope === 'CHOOSE_EVENT'
        ? `CardVault_${chosenEvent}_Leads`
        : `CardVault_${exportScope}`;

    if (format === 'xlsx') {
      const res = exportContactsToExcel(targetContacts, filePrefix, currentSheetName);
      setLastExportResult({
        filename: res.filename,
        rowCount: res.rowCount,
        format: 'Excel (.xlsx)',
        timestamp: new Date().toLocaleTimeString(),
      });
    } else if (format === 'csv') {
      const res = exportContactsToCSV(targetContacts, filePrefix);
      setLastExportResult({
        filename: res.filename,
        rowCount: res.rowCount,
        format: 'CSV (.csv)',
        timestamp: new Date().toLocaleTimeString(),
      });
    } else {
      const res = exportContactsToVCard(targetContacts, filePrefix);
      setLastExportResult({
        filename: res.filename,
        rowCount: res.rowCount,
        format: 'vCard (.vcf)',
        timestamp: new Date().toLocaleTimeString(),
      });
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-5 space-y-5">
      <div>
        <h1 className="text-xl font-bold text-slate-900 tracking-tight">
          Export & Reporting
        </h1>
        <p className="text-xs text-slate-500 mt-0.5">
          Export individual event lead databases, multi-tab Excel workbooks where each event has its own dedicated sheet tab, or phone address books.
        </p>
      </div>

      {/* Real-time Google Sheets Cloud Sync Banner */}
      <div
        className={`p-4 rounded-xl border transition-colors shadow-2xs ${
          isSheetsConnected
            ? 'bg-emerald-50/50 border-emerald-200/80'
            : 'bg-slate-50/70 border-slate-200/80'
        }`}
      >
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div className="flex items-start gap-3">
            <div
              className={`p-2 rounded-lg shrink-0 border ${
                isSheetsConnected
                  ? 'bg-emerald-100 text-emerald-800 border-emerald-200'
                  : 'bg-white text-slate-700 border-slate-200 shadow-2xs'
              }`}
            >
              <Cloud className="w-4 h-4" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-bold text-slate-900">
                  Google Sheets Real-Time Sync
                </h3>
                <span
                  className={`px-2 py-0.5 rounded text-[10px] font-mono font-medium ${
                    isSheetsConnected
                      ? 'bg-emerald-100 text-emerald-800'
                      : 'bg-slate-100 text-slate-600 border border-slate-200'
                  }`}
                >
                  {isSheetsConnected ? 'Connected & Active' : 'Not Configured'}
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-0.5 max-w-xl">
                {isSheetsConnected
                  ? `Every scanned business card syncs to your Google Sheet with separate tabs created per event.`
                  : `Stream scanned business cards directly into your organization's Google Sheet in real time via Apps Script Webhook.`}
              </p>
              {isSheetsConnected && sheetsConfig.lastSyncTime && (
                <div className="text-[11px] text-emerald-700 mt-1 font-mono">
                  Last sync: {new Date(sheetsConfig.lastSyncTime).toLocaleString()}
                </div>
              )}
            </div>
          </div>
          <button
            type="button"
            onClick={openSheetsModal}
            className={`h-8 px-3.5 rounded-lg text-xs font-medium shrink-0 transition-colors flex items-center gap-1.5 shadow-2xs cursor-pointer ${
              isSheetsConnected
                ? 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-50'
                : 'bg-slate-900 text-white hover:bg-slate-800'
            }`}
          >
            <Settings className="w-3.5 h-3.5 text-slate-400" />
            <span>{isSheetsConnected ? 'Configure Sheet Sync' : 'Connect Google Sheets'}</span>
          </button>
        </div>
      </div>

      {lastExportResult && (
        <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-4 flex flex-wrap items-center justify-between gap-3 shadow-xs">
          <div className="flex items-center gap-2.5">
            <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
            <div>
              <div className="text-sm font-bold text-emerald-950">
                File Downloaded: {lastExportResult.filename}
              </div>
              <div className="text-xs text-emerald-800">
                Exported {lastExportResult.rowCount} deduplicated contact records in{' '}
                {lastExportResult.format} format at {lastExportResult.timestamp}.
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setLastExportResult(null)}
            className="text-xs text-emerald-800 underline font-medium"
          >
            Dismiss
          </button>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
        {/* Left Export Configuration Card */}
        <div className="lg:col-span-5 bg-white border border-slate-200/80 rounded-xl p-5 space-y-4 shadow-2xs">
          <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2">
            <Filter className="w-4 h-4 text-slate-500" />
            1. Select Lead Database / Scope
          </h2>

          <div className="space-y-2">
            {/* Active Event Database */}
            <label className={`flex items-center justify-between p-3 rounded-lg border cursor-pointer transition-colors ${
              exportScope === 'ACTIVE_EVENT' ? 'border-slate-900 bg-slate-50/80' : 'border-slate-200 bg-white hover:bg-slate-50'
            }`}>
              <div className="flex items-center gap-2.5">
                <input
                  id="scope-active-event"
                  type="radio"
                  name="scope"
                  checked={exportScope === 'ACTIVE_EVENT'}
                  onChange={() => setExportScope('ACTIVE_EVENT')}
                />
                <div>
                  <div className="text-xs font-semibold text-slate-900 flex items-center gap-1.5">
                    <Folder className="w-3.5 h-3.5 text-slate-500" />
                    <span>Active Database: "{activeEvent}"</span>
                  </div>
                  <div className="text-[11px] text-slate-500">
                    Exports only leads collected under the active event
                  </div>
                </div>
              </div>
              <span className="text-xs font-mono font-medium text-slate-700 tabular-nums">
                {contacts.filter((c) => (c.eventName || c.sheetTab || 'Default') === activeEvent).length} rows
              </span>
            </label>

            {/* Multi-Tab Excel Workbook */}
            <label className={`flex items-center justify-between p-3 rounded-lg border cursor-pointer transition-colors ${
              exportScope === 'MULTI_EVENT_WORKBOOK' ? 'border-slate-900 bg-slate-50/80' : 'border-slate-200 bg-white hover:bg-slate-50'
            }`}>
              <div className="flex items-center gap-2.5">
                <input
                  id="scope-multi-event"
                  type="radio"
                  name="scope"
                  checked={exportScope === 'MULTI_EVENT_WORKBOOK'}
                  onChange={() => setExportScope('MULTI_EVENT_WORKBOOK')}
                />
                <div>
                  <div className="text-xs font-semibold text-slate-900 flex items-center gap-1.5">
                    <Layers className="w-3.5 h-3.5 text-slate-500" />
                    <span>Multi-Tab Workbook (All Events)</span>
                  </div>
                  <div className="text-[11px] text-slate-500">
                    Generates 1 workbook with dedicated sheet tabs per event
                  </div>
                </div>
              </div>
              <span className="text-xs font-mono font-medium text-slate-700 tabular-nums">
                {availableEvents.length} Tabs
              </span>
            </label>

            {/* Choose Specific Event */}
            <div className="p-3 rounded-lg border border-slate-200 space-y-2">
              <label className="flex items-center justify-between cursor-pointer">
                <div className="flex items-center gap-2.5">
                  <input
                    type="radio"
                    name="scope"
                    checked={exportScope === 'CHOOSE_EVENT'}
                    onChange={() => setExportScope('CHOOSE_EVENT')}
                  />
                  <div className="text-xs font-semibold text-slate-900 flex items-center gap-1.5">
                    <Folder className="w-3.5 h-3.5 text-slate-500" />
                    <span>Choose Specific Event Database</span>
                  </div>
                </div>
                <span className="text-xs font-mono font-semibold text-slate-700 tabular-nums">
                  {contacts.filter((c) => (c.eventName || c.sheetTab || 'Default') === chosenEvent).length} rows
                </span>
              </label>
              {exportScope === 'CHOOSE_EVENT' && (
                <select
                  value={chosenEvent}
                  onChange={(e) => setChosenEvent(e.target.value)}
                  className="w-full px-2.5 py-1.5 text-xs rounded-lg border border-slate-300 bg-white font-medium"
                >
                  {availableEvents.map((evt) => (
                    <option key={evt} value={evt}>
                      {evt} ({contacts.filter((c) => (c.eventName || c.sheetTab || 'Default') === evt).length} leads)
                    </option>
                  ))}
                </select>
              )}
            </div>

            {/* All Scanned Contacts */}
            <label className="flex items-center justify-between p-3 rounded-lg border border-slate-200 hover:bg-slate-50 cursor-pointer transition-colors">
              <div className="flex items-center gap-2.5">
                <input
                  type="radio"
                  name="scope"
                  checked={exportScope === 'ALL'}
                  onChange={() => setExportScope('ALL')}
                />
                <div>
                  <div className="text-xs font-semibold text-slate-900">
                    Export All Scanned Contacts (Master)
                  </div>
                  <div className="text-[11px] text-slate-500">
                    Includes both Verified and Needs Review across all events
                  </div>
                </div>
              </div>
              <span className="text-xs font-mono font-semibold text-slate-800 tabular-nums">
                {contacts.length} rows
              </span>
            </label>

            {/* Verified Contacts Only */}
            <label className="flex items-center justify-between p-3 rounded-lg border border-slate-200 hover:bg-slate-50 cursor-pointer transition-colors">
              <div className="flex items-center gap-2.5">
                <input
                  type="radio"
                  name="scope"
                  checked={exportScope === 'VERIFIED_ONLY'}
                  onChange={() => setExportScope('VERIFIED_ONLY')}
                />
                <div>
                  <div className="text-xs font-semibold text-slate-900">
                    Export Verified Contacts Only
                  </div>
                  <div className="text-[11px] text-slate-500">
                    Only cards where all 4 mandatory fields are verified
                  </div>
                </div>
              </div>
              <span className="text-xs font-mono font-semibold text-emerald-700 tabular-nums">
                {contacts.filter((c) => c.overallStatus === 'VERIFIED').length} rows
              </span>
            </label>

            {/* Selected Contacts */}
            <label className="flex items-center justify-between p-3 rounded-lg border border-slate-200 hover:bg-slate-50 cursor-pointer transition-colors">
              <div className="flex items-center gap-2.5">
                <input
                  type="radio"
                  name="scope"
                  checked={exportScope === 'SELECTED'}
                  onChange={() => setExportScope('SELECTED')}
                />
                <div>
                  <div className="text-xs font-semibold text-slate-900">
                    Export Selected Contacts
                  </div>
                  <div className="text-[11px] text-slate-500">
                    Rows checked in the Contacts Database table
                  </div>
                </div>
              </div>
              <span className="text-xs font-mono font-semibold text-slate-800 tabular-nums">
                {selectedIds.length} rows
              </span>
            </label>

            {/* Category Filter */}
            <div className="p-3 rounded-lg border border-slate-200 space-y-2">
              <label className="flex items-center justify-between cursor-pointer">
                <div className="flex items-center gap-2.5">
                  <input
                    type="radio"
                    name="scope"
                    checked={exportScope === 'CATEGORY'}
                    onChange={() => setExportScope('CATEGORY')}
                  />
                  <span className="text-xs font-semibold text-slate-900">
                    Filter by Industry Category
                  </span>
                </div>
                <span className="text-xs font-mono font-semibold text-slate-700 tabular-nums">
                  {contacts.filter((c) => c.fields.companyCategory.value === selectedCategory).length} rows
                </span>
              </label>
              {exportScope === 'CATEGORY' && (
                <select
                  value={selectedCategory}
                  onChange={(e) => setSelectedCategory(e.target.value)}
                  className="w-full px-2.5 py-1.5 text-xs rounded-lg border border-slate-300 bg-white"
                >
                  {INDUSTRY_CATEGORIES.map((cat) => (
                    <option key={cat} value={cat}>
                      {cat}
                    </option>
                  ))}
                </select>
              )}
            </div>
          </div>

          <div className="pt-2 space-y-2">
            <h3 className="text-xs font-bold text-slate-900">
              2. Download Formatted File ({targetContacts.length} Records)
            </h3>

            <button
              id="btn-export-xlsx"
              type="button"
              disabled={targetContacts.length === 0}
              onClick={() => handleTriggerExport('xlsx')}
              className="w-full h-10 px-4 rounded-lg bg-slate-900 hover:bg-slate-800 disabled:opacity-40 text-white font-medium text-xs flex items-center justify-center gap-2 shadow-2xs transition-colors cursor-pointer"
            >
              <FileSpreadsheet className="w-4 h-4 text-slate-300" />
              {exportScope === 'MULTI_EVENT_WORKBOOK'
                ? 'Download Multi-Tab Workbook (.XLSX)'
                : 'Download Excel Workbook (.XLSX)'}
            </button>

            <button
              id="btn-export-csv"
              type="button"
              disabled={targetContacts.length === 0}
              onClick={() => handleTriggerExport('csv')}
              className="w-full h-10 px-4 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 disabled:opacity-40 text-slate-700 font-medium text-xs flex items-center justify-center gap-2 shadow-2xs transition-colors cursor-pointer"
            >
              <FileText className="w-4 h-4 text-slate-500" />
              <span>Download UTF-8 Spreadsheet (.CSV)</span>
            </button>

            <button
              id="btn-export-vcf"
              type="button"
              disabled={targetContacts.length === 0}
              onClick={() => handleTriggerExport('vcf')}
              className="w-full h-10 px-4 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 disabled:opacity-40 text-slate-700 font-medium text-xs flex items-center justify-center gap-2 shadow-2xs transition-colors cursor-pointer"
            >
              <Contact className="w-4 h-4 text-slate-500" />
              <span>Save Phone Address Book (.VCF vCard)</span>
            </button>
          </div>
        </div>

        {/* Right Live Column Structure Preview */}
        <div className="lg:col-span-7 bg-white border border-slate-200/80 rounded-xl p-5 space-y-3 overflow-hidden shadow-2xs">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-sm font-semibold text-slate-900">
                Live Spreadsheet Column Preview
              </h2>
              <p className="text-xs text-slate-500">
                Includes structured columns: Record ID, Event/Database Tab, Verification Status, Contact, Company, Provenance, and Raw OCR.
              </p>
            </div>
            <span className="text-xs font-mono text-slate-500 tabular-nums">
              {targetContacts.length} rows ready
            </span>
          </div>

          <div className="overflow-x-auto border border-slate-200/80 rounded-lg">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-[11px] font-semibold text-slate-600 whitespace-nowrap">
                  <th className="py-2.5 px-3">Record ID</th>
                  <th className="py-2.5 px-3">Event / Tab</th>
                  <th className="py-2.5 px-3">Status</th>
                  <th className="py-2.5 px-3">Missing Core</th>
                  <th className="py-2.5 px-3">Full Name</th>
                  <th className="py-2.5 px-3">Designation</th>
                  <th className="py-2.5 px-3">Company</th>
                  <th className="py-2.5 px-3">Industry</th>
                  <th className="py-2.5 px-3">Phone</th>
                  <th className="py-2.5 px-3">Email</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 font-mono text-[11px]">
                {previewRows.map((row) => (
                  <tr key={row['Record ID']} className="whitespace-nowrap">
                    <td className="py-2 px-3 text-slate-500">{row['Record ID']}</td>
                    <td className="py-2 px-3 font-sans font-medium text-slate-800">
                      {row['Event / Database'] || 'Default'}
                    </td>
                    <td className="py-2 px-3 font-sans font-semibold">
                      {row['Verification Status']}
                    </td>
                    <td className="py-2 px-3 font-sans text-rose-600">
                      {row['Missing Core Fields']}
                    </td>
                    <td className="py-2 px-3 font-sans font-medium text-slate-900">
                      {row['Full Name'] || '—'}
                    </td>
                    <td className="py-2 px-3 font-sans text-slate-600">
                      {row['Designation / Job Title'] || '—'}
                    </td>
                    <td className="py-2 px-3 font-sans text-slate-800">
                      {row['Company Name'] || '—'}
                    </td>
                    <td className="py-2 px-3 font-sans text-slate-600">
                      {row['Company Category / Industry'] || '—'}
                    </td>
                    <td className="py-2 px-3">
                      {row['Mobile Number'] || row['Office Phone'] || '—'}
                    </td>
                    <td className="py-2 px-3">{row['Email Address'] || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
};
