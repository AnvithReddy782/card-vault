import React from 'react';
import {
  AlertTriangle,
  ArrowRight,
  Camera,
  CheckCircle2,
  Database,
  Download,
  Edit3,
  Folder,
  Layers,
  RefreshCw,
  WifiOff,
  XCircle,
} from 'lucide-react';
import {
  ContactRecord,
  PendingOfflineScan,
  ScanSessionStats,
} from '../types/card';

interface DashboardViewProps {
  contacts: ContactRecord[];
  sessionStats: ScanSessionStats;
  pendingOfflineQueue: PendingOfflineScan[];
  isOfflineMode: boolean;
  activeEvent?: string;
  availableEvents?: string[];
  onSelectEvent?: (event: string) => void;
  onStartScanning: () => void;
  onOpenContactsWithFilter: (eventFilter?: string) => void;
  onInspectContact: (contact: ContactRecord) => void;
  onProcessOfflineQueue: () => Promise<void>;
  onOpenExport: () => void;
}

export const DashboardView: React.FC<DashboardViewProps> = ({
  contacts,
  sessionStats,
  pendingOfflineQueue,
  isOfflineMode,
  activeEvent = 'Default',
  availableEvents = ['Default'],
  onSelectEvent,
  onStartScanning,
  onOpenContactsWithFilter,
  onInspectContact,
  onProcessOfflineQueue,
  onOpenExport,
}) => {
  const verifiedCount = contacts.filter((c) => c.overallStatus === 'VERIFIED').length;
  const needsReviewContacts = contacts.filter(
    (c) => c.overallStatus === 'NEEDS_REVIEW' || c.savedWithoutCoreFields
  );
  const recentContacts = contacts.slice(0, 6);

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-5 space-y-6">
      {/* Hero Action Strip */}
      <div className="bg-white border border-slate-200/80 rounded-xl p-5 sm:p-6 flex flex-col md:flex-row md:items-center justify-between gap-4 shadow-xs">
        <div className="space-y-1 max-w-2xl">
          <h1 className="text-xl sm:text-2xl font-semibold text-slate-900 tracking-tight">
            Dashboard
          </h1>
          <p className="text-xs sm:text-sm text-slate-500">
            Card extraction activity, verification accuracy, and event lead records.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={onStartScanning}
            className="h-8 px-3.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-white font-medium text-xs flex items-center gap-2 whitespace-nowrap transition-colors shadow-xs"
          >
            <Camera className="w-3.5 h-3.5" />
            <span>Open Scanner</span>
          </button>
          <button
            type="button"
            onClick={onOpenExport}
            className="h-8 px-3.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 font-medium text-xs flex items-center gap-2 whitespace-nowrap transition-colors"
          >
            <Download className="w-3.5 h-3.5 text-slate-400" />
            <span>Export Data</span>
          </button>
        </div>
      </div>

      {/* 4-Column KPI Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5">
        <div className="bg-white border border-slate-200/80 rounded-xl p-4 shadow-xs">
          <div className="text-xs font-medium text-slate-500">
            Total Leads
          </div>
          <div className="text-2xl sm:text-3xl font-semibold font-mono tabular-nums text-slate-900 mt-1.5">
            {contacts.length}
          </div>
          <div className="text-[11px] text-slate-400 mt-1 font-mono">
            {sessionStats.totalScanned} session scans
          </div>
        </div>

        <div className="bg-white border border-slate-200/80 rounded-xl p-4 shadow-xs">
          <div className="flex items-center gap-1.5 text-xs font-medium text-slate-500">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
            <span>Verified Leads</span>
          </div>
          <div className="text-2xl sm:text-3xl font-semibold font-mono tabular-nums text-slate-900 mt-1.5">
            {verifiedCount}
          </div>
          <div className="text-[11px] text-emerald-700 mt-1">
            {contacts.length > 0 ? Math.round((verifiedCount / contacts.length) * 100) : 0}% complete core data
          </div>
        </div>

        <div className="bg-white border border-slate-200/80 rounded-xl p-4 shadow-xs">
          <div className="flex items-center gap-1.5 text-xs font-medium text-slate-500">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
            <span>Needs Review</span>
          </div>
          <div className="text-2xl sm:text-3xl font-semibold font-mono tabular-nums text-slate-900 mt-1.5">
            {needsReviewContacts.length}
          </div>
          <div className="text-[11px] text-amber-700 mt-1">
            Missing phone, email or low confidence
          </div>
        </div>

        <div className="bg-white border border-slate-200/80 rounded-xl p-4 shadow-xs">
          <div className="text-xs font-medium text-slate-500">
            Current Target Event
          </div>
          <div className="text-base sm:text-xl font-semibold text-slate-900 truncate mt-1.5" title={activeEvent}>
            {activeEvent || 'Default'}
          </div>
          <div className="text-[11px] text-slate-400 mt-1 truncate">
            {availableEvents.length} event databases active
          </div>
        </div>
      </div>

      {/* Event Lead Databases & Google Sheets Tabs */}
      <div className="bg-white border border-slate-200/80 rounded-xl p-5 space-y-4 shadow-xs">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold text-slate-900">
              Event Databases ({availableEvents.length})
            </h2>
            <p className="text-xs text-slate-500">
              Dedicated databases mapped to individual Google Sheets tabs.
            </p>
          </div>
          <button
            type="button"
            onClick={() => onOpenContactsWithFilter()}
            className="text-xs font-medium text-slate-700 hover:text-slate-900 flex items-center gap-1 transition-colors"
          >
            <span>All Leads</span>
            <ArrowRight className="w-3.5 h-3.5 text-slate-400" />
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {availableEvents.map((evt) => {
            const evContacts = contacts.filter(
              (c) => (c.eventName || c.sheetTab || 'Default') === evt
            );
            const evVerified = evContacts.filter((c) => c.overallStatus === 'VERIFIED').length;
            const evNeedsReview = evContacts.filter((c) => c.overallStatus !== 'VERIFIED').length;
            const isActive = activeEvent === evt;

            return (
              <div
                key={evt}
                className={`p-3.5 rounded-lg border transition-colors ${
                  isActive
                    ? 'border-slate-400 bg-slate-50/60'
                    : 'border-slate-200 bg-white hover:border-slate-300'
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <Folder className={`w-3.5 h-3.5 shrink-0 ${isActive ? 'text-slate-900' : 'text-slate-400'}`} />
                    <span className="font-semibold text-xs text-slate-900 truncate">{evt}</span>
                  </div>
                  {isActive && (
                    <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-slate-900 text-white shrink-0">
                      Active
                    </span>
                  )}
                </div>

                <div className="grid grid-cols-3 gap-2 py-2.5 mt-2 border-y border-slate-100 text-center">
                  <div>
                    <div className="text-[10px] text-slate-400">Total</div>
                    <div className="text-xs font-semibold font-mono text-slate-800 tabular-nums">
                      {evContacts.length}
                    </div>
                  </div>
                  <div>
                    <div className="text-[10px] text-emerald-600">Verified</div>
                    <div className="text-xs font-semibold font-mono text-emerald-700 tabular-nums">
                      {evVerified}
                    </div>
                  </div>
                  <div>
                    <div className="text-[10px] text-amber-600">Review</div>
                    <div className="text-xs font-semibold font-mono text-amber-700 tabular-nums">
                      {evNeedsReview}
                    </div>
                  </div>
                </div>

                <div className="flex items-center justify-between gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => onOpenContactsWithFilter(evt)}
                    className="text-xs font-medium text-slate-700 hover:text-slate-900 flex items-center gap-1"
                  >
                    <span>View Database</span>
                    <ArrowRight className="w-3 h-3 text-slate-400" />
                  </button>

                  {!isActive && onSelectEvent && (
                    <button
                      type="button"
                      onClick={() => onSelectEvent(evt)}
                      className="text-[11px] font-medium text-slate-500 hover:text-slate-800"
                    >
                      Make Active
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Offline Pending Sync Queue Banner */}
      {pendingOfflineQueue.length > 0 && (
        <div className="bg-white border border-amber-200 rounded-xl p-4 flex flex-wrap items-center justify-between gap-3 shadow-xs">
          <div className="flex items-center gap-3">
            <WifiOff className="w-4 h-4 text-amber-600 shrink-0" />
            <div>
              <h3 className="text-xs font-semibold text-slate-900">
                {pendingOfflineQueue.length} Business Card
                {pendingOfflineQueue.length > 1 ? 's' : ''} in Offline Queue
              </h3>
              <p className="text-[11px] text-slate-500">
                Cached in local IndexedDB. Sync to trigger OCR extraction.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onProcessOfflineQueue}
            className="h-7 px-3 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-xs font-medium flex items-center gap-1.5 transition-colors"
          >
            <RefreshCw className="w-3 h-3" />
            <span>Process Queue</span>
          </button>
        </div>
      )}

      {/* Split Content: Left Needs Review Queue | Right Recent Contacts */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-start">
        {/* Needs Review Queue */}
        <div className="lg:col-span-5 bg-white border border-slate-200/80 rounded-xl p-4 sm:p-5 space-y-3.5 shadow-xs">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-sm font-semibold text-slate-900">
                Needs Review ({needsReviewContacts.length})
              </h2>
              <p className="text-xs text-slate-500">
                Cards requiring human verification before export.
              </p>
            </div>
          </div>

          {needsReviewContacts.length === 0 ? (
            <div className="p-6 text-center rounded-lg bg-slate-50 text-xs text-slate-500 border border-slate-100">
              All scanned contacts are fully verified with zero pending warnings.
            </div>
          ) : (
            <div className="space-y-2">
              {needsReviewContacts.slice(0, 5).map((c) => (
                <div
                  key={c.id}
                  className="p-3 rounded-lg border border-slate-200 bg-slate-50/50 flex items-start justify-between gap-3"
                >
                  <div className="space-y-0.5 min-w-0">
                    <div className="text-xs font-semibold text-slate-900 truncate">
                      {c.fields.fullName.value || 'Unnamed Lead'}
                      {c.fields.companyName.value && (
                        <span className="font-normal text-slate-500 ml-1">
                          · {c.fields.companyName.value}
                        </span>
                      )}
                    </div>
                    {c.missingCoreFieldLabels.length > 0 && (
                      <div className="text-[11px] text-amber-700">
                        Missing: {c.missingCoreFieldLabels.join(', ')}
                      </div>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => onInspectContact(c)}
                    className="h-6 px-2.5 rounded-md bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 text-[11px] font-medium flex items-center gap-1 shrink-0"
                  >
                    <Edit3 className="w-3 h-3 text-slate-400" />
                    <span>Review</span>
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Recent Contacts List */}
        <div className="lg:col-span-7 bg-white border border-slate-200/80 rounded-xl p-4 sm:p-5 space-y-3.5 shadow-xs">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-sm font-semibold text-slate-900">
                Recent Business Cards
              </h2>
              <p className="text-xs text-slate-500">
                Latest cards scanned across active campaigns.
              </p>
            </div>
            <button
              type="button"
              onClick={() => onOpenContactsWithFilter()}
              className="text-xs font-medium text-slate-700 hover:text-slate-900 flex items-center gap-1"
            >
              <span>View All ({contacts.length})</span>
              <ArrowRight className="w-3 h-3 text-slate-400" />
            </button>
          </div>

          {recentContacts.length === 0 ? (
            <div className="p-8 text-center rounded-lg bg-slate-50 border border-slate-100 space-y-2.5">
              <div className="w-10 h-10 rounded-lg bg-white border border-slate-200 flex items-center justify-center mx-auto text-slate-400">
                <Camera className="w-5 h-5" />
              </div>
              <div className="text-xs font-semibold text-slate-800">No Business Cards Scanned Yet</div>
              <p className="text-xs text-slate-500 max-w-xs mx-auto">
                Scan or drop business cards to build your verified lead pipeline.
              </p>
              <button
                type="button"
                onClick={onStartScanning}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-slate-900 hover:bg-slate-800 text-white rounded-lg text-xs font-medium"
              >
                <Camera className="w-3 h-3" />
                <span>Scan First Card</span>
              </button>
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {recentContacts.map((c) => (
                <div
                  key={c.id}
                  onClick={() => onInspectContact(c)}
                  className="py-3 flex items-center justify-between gap-3 hover:bg-slate-50/80 px-2.5 rounded-xl cursor-pointer transition-colors"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    {c.frontImageBase64 ? (
                      <img
                        src={c.frontImageBase64}
                        alt={c.fields.fullName.value}
                        referrerPolicy="no-referrer"
                        className="w-14 h-10 object-cover rounded-lg border border-slate-200 bg-slate-900 shrink-0"
                      />
                    ) : (
                      <div className="w-14 h-10 rounded-lg bg-slate-100 border border-slate-200 flex items-center justify-center text-slate-500 shrink-0">
                        <Database className="w-4 h-4" />
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="text-xs font-semibold text-slate-900 truncate">
                        {c.fields.fullName.value || 'Unnamed Contact'}
                      </div>
                      <div className="text-[11px] text-slate-500 truncate">
                        {[c.fields.designation.value, c.fields.companyName.value].filter(Boolean).join(' · ') || 'Business Card'}
                      </div>
                      <div className="text-[10px] text-slate-400 font-mono truncate mt-0.5">
                        {c.fields.mobileNumber.value || c.fields.officePhone.value || c.fields.email.value || 'No phone/email'}
                      </div>
                    </div>
                  </div>

                  <div className="text-right shrink-0">
                    <div
                      className={`text-[11px] font-bold ${
                        c.overallStatus === 'VERIFIED'
                          ? 'text-emerald-700'
                          : 'text-amber-700'
                      }`}
                    >
                      {c.overallStatus === 'VERIFIED' ? 'Verified' : 'Needs Review'}
                    </div>
                    {c.fields.companyCategory.value && (
                      <div className="text-[10px] text-slate-400 font-mono tabular-nums">
                        {c.fields.companyCategory.value}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
