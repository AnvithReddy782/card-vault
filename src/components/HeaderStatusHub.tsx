import React, { useState, useRef, useEffect } from 'react';
import {
  CreditCard,
  FileSpreadsheet,
  Smartphone,
  Plus,
  ChevronDown,
  FolderPlus,
  LayoutDashboard,
  Camera,
  Database,
  Download,
  Check,
  Cpu,
} from 'lucide-react';
import { useModal } from '../context/ModalContext';

export interface HeaderStatusHubProps {
  activeTab: 'dashboard' | 'scanner' | 'contacts' | 'export';
  onNavigateTab: (tab: 'dashboard' | 'scanner' | 'contacts' | 'export') => void;
  hasGeminiKey: boolean;
  ocrEnginePreference: 'hybrid' | 'rapid_ocr' | 'ai_studio';
  isSheetsConnected: boolean;
  hasMobileDevice: boolean;
  activeEvent: string;
  availableEvents: string[];
  onSelectEvent: (event: string) => void;
  onCreateEvent: (event: string) => void;
  onQuickScan: () => void;
  totalContacts: number;
}

export const HeaderStatusHub: React.FC<HeaderStatusHubProps> = ({
  activeTab,
  onNavigateTab,
  hasGeminiKey,
  ocrEnginePreference,
  isSheetsConnected,
  hasMobileDevice,
  activeEvent,
  availableEvents,
  onSelectEvent,
  onCreateEvent,
  onQuickScan,
  totalContacts,
}) => {
  const { openOcrSettings, openSheetsModal, openMobileModal } = useModal();
  const [isEventMenuOpen, setIsEventMenuOpen] = useState(false);
  const [isCreatingEvent, setIsCreatingEvent] = useState(false);
  const [newEventName, setNewEventName] = useState('');
  const eventMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      if (eventMenuRef.current && !eventMenuRef.current.contains(e.target as Node)) {
        setIsEventMenuOpen(false);
        setIsCreatingEvent(false);
      }
    };
    document.addEventListener('mousedown', handleOutsideClick);
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, []);

  const handleCreateSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (newEventName.trim()) {
      onCreateEvent(newEventName.trim());
      setNewEventName('');
      setIsCreatingEvent(false);
      setIsEventMenuOpen(false);
    }
  };

  return (
    <header className="sticky top-0 z-30 w-full bg-white/95 backdrop-blur-md border-b border-slate-200/80 px-3 sm:px-6 py-2 transition-all">
      <div className="max-w-7xl mx-auto flex items-center justify-between gap-2 sm:gap-4">
        {/* Left: Brand & Event Context */}
        <div className="flex items-center gap-2 sm:gap-3 min-w-0">
          <div
            onClick={() => onNavigateTab('dashboard')}
            className="flex items-center gap-2 cursor-pointer select-none shrink-0"
          >
            <div className="w-7 h-7 rounded-lg bg-slate-900 flex items-center justify-center text-white shadow-2xs">
              <CreditCard className="w-3.5 h-3.5" />
            </div>
            <span className="text-sm font-semibold tracking-tight text-slate-900 hidden xs:inline">
              CardVault
            </span>
          </div>

          <div className="h-4 w-[1px] bg-slate-200 hidden sm:block" />

          {/* Event Context Selector */}
          <div className="relative min-w-0" ref={eventMenuRef}>
            <button
              type="button"
              onClick={() => setIsEventMenuOpen((prev) => !prev)}
              className="h-7 px-2 sm:px-2.5 rounded-lg bg-slate-50 hover:bg-slate-100 border border-slate-200/80 text-xs font-medium text-slate-700 flex items-center gap-1.5 transition-colors cursor-pointer max-w-[120px] sm:max-w-none"
              title="Target event or campaign"
            >
              <span className="w-1.5 h-1.5 rounded-full bg-slate-400 shrink-0" />
              <span className="font-medium text-slate-900 truncate max-w-[65px] sm:max-w-[130px]">
                {activeEvent || 'Default'}
              </span>
              <ChevronDown className="w-3 h-3 text-slate-400 shrink-0" />
            </button>

            {isEventMenuOpen && (
              <div className="absolute left-0 top-full mt-1.5 w-60 bg-white border border-slate-200 rounded-xl shadow-lg p-1.5 z-50 animate-in fade-in zoom-in-95 duration-100">
                <div className="px-2.5 py-1 text-[11px] font-medium text-slate-400">
                  Target Event / Database
                </div>
                <div className="max-h-48 overflow-y-auto space-y-0.5 mt-0.5">
                  {availableEvents.map((evt) => (
                    <button
                      key={evt}
                      type="button"
                      onClick={() => {
                        onSelectEvent(evt);
                        setIsEventMenuOpen(false);
                      }}
                      className={`w-full px-2.5 py-1.5 text-xs rounded-lg flex items-center justify-between font-medium transition-colors ${
                        activeEvent === evt
                          ? 'bg-slate-100 text-slate-900 font-semibold'
                          : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                      }`}
                    >
                      <span className="truncate">{evt}</span>
                      {activeEvent === evt && <Check className="w-3.5 h-3.5 text-slate-900" />}
                    </button>
                  ))}
                </div>

                <div className="pt-1.5 mt-1 border-t border-slate-100">
                  {isCreatingEvent ? (
                    <form onSubmit={handleCreateSubmit} className="flex gap-1 p-1">
                      <input
                        type="text"
                        autoFocus
                        value={newEventName}
                        onChange={(e) => setNewEventName(e.target.value)}
                        placeholder="Event name"
                        className="flex-1 bg-slate-50 border border-slate-200 rounded-lg px-2 py-1 text-xs text-slate-900 placeholder-slate-400 focus:outline-none focus:border-slate-400"
                      />
                      <button
                        type="submit"
                        className="px-2.5 py-1 bg-slate-900 hover:bg-slate-800 text-white rounded-lg text-xs font-medium"
                      >
                        Add
                      </button>
                    </form>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setIsCreatingEvent(true)}
                      className="w-full px-2.5 py-1.5 text-xs text-slate-600 hover:bg-slate-50 hover:text-slate-900 rounded-lg flex items-center gap-1.5 font-medium transition-colors"
                    >
                      <FolderPlus className="w-3.5 h-3.5 text-slate-400" />
                      <span>New Event Database</span>
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Center: Quiet Segmented Navigation */}
        <nav className="hidden lg:flex items-center gap-0.5 bg-slate-100/80 p-0.5 rounded-lg border border-slate-200/60">
          <button
            type="button"
            onClick={() => onNavigateTab('dashboard')}
            className={`px-3 py-1.5 rounded-md text-xs font-medium flex items-center gap-1.5 transition-colors ${
              activeTab === 'dashboard'
                ? 'bg-white text-slate-900 shadow-xs font-semibold'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <LayoutDashboard className="w-3.5 h-3.5" />
            <span>Dashboard</span>
          </button>

          <button
            type="button"
            onClick={() => onNavigateTab('scanner')}
            className={`px-3 py-1.5 rounded-md text-xs font-medium flex items-center gap-1.5 transition-colors ${
              activeTab === 'scanner'
                ? 'bg-white text-slate-900 shadow-xs font-semibold'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Camera className="w-3.5 h-3.5" />
            <span>Scanner</span>
          </button>

          <button
            type="button"
            onClick={() => onNavigateTab('contacts')}
            className={`px-3 py-1.5 rounded-md text-xs font-medium flex items-center gap-1.5 transition-colors ${
              activeTab === 'contacts'
                ? 'bg-white text-slate-900 shadow-xs font-semibold'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Database className="w-3.5 h-3.5" />
            <span>Contacts</span>
            {totalContacts > 0 && (
              <span className={`px-1.5 py-0.2 rounded text-[10px] font-mono tabular-nums ${
                activeTab === 'contacts' ? 'bg-slate-100 text-slate-900 font-medium' : 'text-slate-400'
              }`}>
                {totalContacts}
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={() => onNavigateTab('export')}
            className={`px-3 py-1.5 rounded-md text-xs font-medium flex items-center gap-1.5 transition-colors ${
              activeTab === 'export'
                ? 'bg-white text-slate-900 shadow-xs font-semibold'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Download className="w-3.5 h-3.5" />
            <span>Export & Sync</span>
          </button>
        </nav>

        {/* Right: Refined Integration Status & Primary Action */}
        <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
          {/* AI Engine Status */}
          <button
            type="button"
            onClick={openOcrSettings}
            className="h-7 w-7 sm:w-auto sm:px-2.5 rounded-lg bg-white hover:bg-slate-50 border border-slate-200/80 text-xs font-medium text-slate-700 flex items-center justify-center sm:justify-start gap-1.5 transition-colors cursor-pointer shrink-0"
            title="Configure Vision & OCR Engine"
          >
            <Cpu className="w-3.5 h-3.5 text-slate-400" />
            <span className="hidden sm:inline">
              {ocrEnginePreference === 'ai_studio' ? 'AI Studio' : ocrEnginePreference === 'rapid_ocr' ? 'RapidOCR' : 'Hybrid'}
            </span>
          </button>

          {/* Sheets Webhook Status */}
          <button
            type="button"
            onClick={openSheetsModal}
            className="h-7 w-7 sm:w-auto px-0 sm:px-2.5 rounded-lg bg-white hover:bg-slate-50 border border-slate-200/80 text-xs font-medium text-slate-700 flex items-center justify-center sm:justify-start gap-1.5 transition-colors cursor-pointer shrink-0"
            title="Google Sheets Sync Status"
          >
            <span
              className={`w-1.5 h-1.5 rounded-full ${
                isSheetsConnected ? 'bg-emerald-500' : 'bg-slate-300'
              }`}
            />
            <FileSpreadsheet className="w-3.5 h-3.5 text-slate-400" />
            <span className="hidden md:inline">Sheets</span>
            <span className="hidden sm:inline text-[10px] text-slate-400 font-mono">
              {isSheetsConnected ? 'Live' : 'Setup'}
            </span>
          </button>

          {/* Mobile Bridge */}
          <button
            type="button"
            onClick={openMobileModal}
            className="hidden md:flex h-7 px-2.5 rounded-lg bg-white hover:bg-slate-50 border border-slate-200/80 text-xs font-medium text-slate-700 items-center gap-1.5 transition-colors cursor-pointer"
            title="Pair Mobile Companion"
          >
            <Smartphone className="w-3.5 h-3.5 text-slate-400" />
            <span>Mobile</span>
          </button>

          {/* Primary Action Button */}
          <button
            type="button"
            onClick={onQuickScan}
            className="h-7 px-2.5 sm:px-3 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-xs font-medium flex items-center gap-1 shadow-xs transition-colors cursor-pointer active:scale-98 shrink-0"
          >
            <Plus className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Scan Card</span>
            <span className="sm:hidden font-medium">Scan</span>
          </button>
        </div>
      </div>
    </header>
  );
};
