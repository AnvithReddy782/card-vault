import React, { useState, useEffect, useRef } from 'react';
import {
  CheckCircle2,
  X,
  Sparkles,
  Cpu,
  Building2,
  User,
  Briefcase,
  Phone,
  Mail,
  Globe,
  MapPin,
  Tag,
  CornerDownLeft,
  RotateCcw,
} from 'lucide-react';
import { ContactFields, INDUSTRY_CATEGORIES } from '../types/card.ts';
import { evaluateSingleField } from '../utils/cardValidator.ts';

export interface ScannerReviewDrawerProps {
  isOpen: boolean;
  cardFrontUrl?: string;
  cardBackUrl?: string;
  extractedFields: ContactFields;
  confidence?: number;
  engineUsed?: string;
  activeEvent: string;
  availableEvents: string[];
  onApprove: (updatedFields: ContactFields, eventTag: string) => void;
  onDiscard: () => void;
}

export const ScannerReviewDrawer: React.FC<ScannerReviewDrawerProps> = ({
  isOpen,
  cardFrontUrl,
  cardBackUrl,
  extractedFields,
  confidence = 92,
  engineUsed = 'AI Studio',
  activeEvent,
  availableEvents,
  onApprove,
  onDiscard,
}) => {
  const [fields, setFields] = useState<ContactFields>(extractedFields);
  const [selectedEvent, setSelectedEvent] = useState<string>(activeEvent || 'General');
  const [activePhoto, setActivePhoto] = useState<'front' | 'back'>('front');
  const drawerRef = useRef<HTMLDivElement>(null);

  // Sync state whenever new extraction arrives
  useEffect(() => {
    setFields(extractedFields);
    setSelectedEvent(activeEvent || 'General');
    setActivePhoto('front');
  }, [extractedFields, activeEvent]);

  // Global Keyboard shortcuts: Enter = Approve, Esc = Discard
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onDiscard();
      } else if (e.key === 'Enter' && !e.shiftKey) {
        const target = e.target as HTMLElement;
        if (target && target.tagName === 'TEXTAREA') return;
        e.preventDefault();
        onApprove(fields, selectedEvent);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, fields, selectedEvent, onApprove, onDiscard]);

  if (!isOpen) return null;

  const handleFieldChange = (key: keyof ContactFields, value: string) => {
    setFields((prev) => ({
      ...prev,
      [key]: evaluateSingleField(key, {
        ...(prev[key] || { confidence: 95, source: 'MANUAL' }),
        value,
      }),
    }));
  };

  const getConfidenceBadge = (fieldConf?: number) => {
    const score = fieldConf ?? 0;
    if (score >= 90) {
      return (
        <span className="flex items-center gap-1 text-[10px] font-mono font-medium text-emerald-700 bg-emerald-50 border border-emerald-200 px-1.5 py-0.5 rounded">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
          {score}%
        </span>
      );
    }
    if (score >= 70) {
      return (
        <span className="flex items-center gap-1 text-[10px] font-mono font-medium text-amber-800 bg-amber-50 border border-amber-200 px-1.5 py-0.5 rounded">
          <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
          {score}%
        </span>
      );
    }
    return (
      <span className="flex items-center gap-1 text-[10px] font-mono font-medium text-rose-700 bg-rose-50 border border-rose-200 px-1.5 py-0.5 rounded">
        <span className="w-1.5 h-1.5 rounded-full bg-rose-500" />
        Low
      </span>
    );
  };

  return (
    <div
      ref={drawerRef}
      className="w-full h-full flex flex-col bg-white border-l border-slate-200 shadow-2xl text-slate-900 overflow-hidden animate-in slide-in-from-right duration-200"
    >
      {/* Drawer Top Header: Thumbnail Preview & Engine Indicator */}
      <div className="p-3.5 sm:p-4 bg-slate-50/80 border-b border-slate-200/80 flex items-center justify-between gap-3 shrink-0">
        <div className="flex items-center gap-2.5 min-w-0">
          {/* Card Thumbnail */}
          <div className="relative w-14 h-9 rounded-md bg-slate-100 border border-slate-200 overflow-hidden shrink-0 shadow-2xs">
            <img
              src={activePhoto === 'front' ? cardFrontUrl : cardBackUrl || cardFrontUrl}
              alt="Scanned Card"
              className="w-full h-full object-cover"
            />
            {cardBackUrl && (
              <button
                type="button"
                onClick={() => setActivePhoto((prev) => (prev === 'front' ? 'back' : 'front'))}
                className="absolute inset-0 bg-black/40 hover:bg-black/20 flex items-center justify-center text-[9px] font-bold text-white transition-colors"
                title="Toggle Front/Back Image"
              >
                {activePhoto.toUpperCase()}
              </button>
            )}
          </div>

          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h3 className="text-xs sm:text-sm font-bold text-slate-900 truncate">Card Verification</h3>
              <span className="px-1.5 py-0.2 rounded text-[10px] font-mono text-slate-600 bg-white border border-slate-200 flex items-center gap-1">
                {engineUsed}
              </span>
            </div>
            <p className="text-[11px] text-slate-500 truncate">
              Review extracted fields before saving to CRM
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={onDiscard}
          className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
          title="Discard scan (Esc)"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Drawer Scrollable Fields */}
      <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain p-3.5 sm:p-4 space-y-3.5 text-xs">
        {/* Full Name & Job Title */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-[11px] font-medium text-slate-600 flex items-center gap-1.5">
                <User className="w-3 h-3 text-slate-400" />
                Full Name
              </label>
              {getConfidenceBadge(fields.fullName?.confidence)}
            </div>
            <input
              type="text"
              value={fields.fullName?.value || ''}
              onChange={(e) => handleFieldChange('fullName', e.target.value)}
              placeholder="e.g. Dr. Alex Mercer"
              className="w-full bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs text-slate-900 placeholder-slate-400 focus:outline-none focus:border-slate-900 font-medium"
            />
          </div>

          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-[11px] font-medium text-slate-600 flex items-center gap-1.5">
                <Briefcase className="w-3 h-3 text-slate-400" />
                Designation
              </label>
              {getConfidenceBadge(fields.designation?.confidence)}
            </div>
            <input
              type="text"
              value={fields.designation?.value || ''}
              onChange={(e) => handleFieldChange('designation', e.target.value)}
              placeholder="e.g. Managing Director"
              className="w-full bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs text-slate-900 placeholder-slate-400 focus:outline-none focus:border-slate-900"
            />
          </div>
        </div>

        {/* Company & Industry */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-[11px] font-medium text-slate-600 flex items-center gap-1.5">
                <Building2 className="w-3 h-3 text-slate-400" />
                Company Name
              </label>
              {getConfidenceBadge(fields.companyName?.confidence)}
            </div>
            <input
              type="text"
              value={fields.companyName?.value || ''}
              onChange={(e) => handleFieldChange('companyName', e.target.value)}
              placeholder="e.g. Apex Global Solutions"
              className="w-full bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs text-slate-900 placeholder-slate-400 focus:outline-none focus:border-slate-900 font-medium"
            />
          </div>

          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-[11px] font-medium text-slate-600 flex items-center gap-1.5">
                <Tag className="w-3 h-3 text-slate-400" />
                Industry
              </label>
              {getConfidenceBadge(fields.companyCategory?.confidence)}
            </div>
            <select
              value={fields.companyCategory?.value || 'Technology & Software'}
              onChange={(e) => handleFieldChange('companyCategory', e.target.value)}
              className="w-full bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs text-slate-900 focus:outline-none focus:border-slate-900"
            >
              {INDUSTRY_CATEGORIES.map((cat) => (
                <option key={cat} value={cat}>
                  {cat}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Mobile & Email */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-[11px] font-medium text-slate-600 flex items-center gap-1.5">
                <Phone className="w-3 h-3 text-slate-400" />
                Mobile Number
              </label>
              {getConfidenceBadge(fields.mobileNumber?.confidence)}
            </div>
            <input
              type="text"
              value={fields.mobileNumber?.value || ''}
              onChange={(e) => handleFieldChange('mobileNumber', e.target.value)}
              placeholder="e.g. +971 50 123 4567"
              className="w-full bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs text-slate-900 placeholder-slate-400 focus:outline-none focus:border-slate-900 font-mono"
            />
          </div>

          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-[11px] font-medium text-slate-600 flex items-center gap-1.5">
                <Mail className="w-3 h-3 text-slate-400" />
                Email Address
              </label>
              {getConfidenceBadge(fields.email?.confidence)}
            </div>
            <input
              type="email"
              value={fields.email?.value || ''}
              onChange={(e) => handleFieldChange('email', e.target.value)}
              placeholder="e.g. alex@apex.com"
              className="w-full bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs text-slate-900 placeholder-slate-400 focus:outline-none focus:border-slate-900"
            />
          </div>
        </div>

        {/* Website & Address */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-[11px] font-medium text-slate-600 flex items-center gap-1.5">
                <Globe className="w-3 h-3 text-slate-400" />
                Website
              </label>
              {getConfidenceBadge(fields.website?.confidence)}
            </div>
            <input
              type="text"
              value={fields.website?.value || ''}
              onChange={(e) => handleFieldChange('website', e.target.value)}
              placeholder="e.g. www.apex.com"
              className="w-full bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs text-slate-900 placeholder-slate-400 focus:outline-none focus:border-slate-900"
            />
          </div>

          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-[11px] font-medium text-slate-600 flex items-center gap-1.5">
                <Tag className="w-3 h-3 text-slate-400" />
                Event / Campaign
              </label>
            </div>
            <select
              value={selectedEvent}
              onChange={(e) => setSelectedEvent(e.target.value)}
              className="w-full bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs text-slate-900 focus:outline-none focus:border-slate-900 font-medium"
            >
              {availableEvents.map((evt) => (
                <option key={evt} value={evt}>
                  {evt}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Company Address */}
        <div>
          <div className="flex items-center justify-between mb-1">
            <label className="text-[11px] font-medium text-slate-600 flex items-center gap-1.5">
              <MapPin className="w-3 h-3 text-slate-400" />
              Office Address
            </label>
            {getConfidenceBadge(fields.companyAddress?.confidence)}
          </div>
          <input
            type="text"
            value={fields.companyAddress?.value || ''}
            onChange={(e) => handleFieldChange('companyAddress', e.target.value)}
            placeholder="e.g. Suite 402, Al Yasmeen Tower, Dubai, UAE"
            className="w-full bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs text-slate-900 placeholder-slate-400 focus:outline-none focus:border-slate-900"
          />
        </div>
      </div>

      {/* Drawer Action Bar */}
      <div className="p-3.5 sm:p-4 pb-[max(env(safe-area-inset-bottom),14px)] bg-slate-50/90 border-t border-slate-200 flex items-center justify-between gap-3 shrink-0">
        <button
          type="button"
          onClick={onDiscard}
          className="px-3 py-2 rounded-lg bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 text-xs font-medium flex items-center gap-1.5 transition-colors cursor-pointer"
        >
          <RotateCcw className="w-3.5 h-3.5" />
          <span>Discard</span>
          <span className="text-[10px] text-slate-400 font-mono hidden sm:inline">(Esc)</span>
        </button>

        <button
          type="button"
          onClick={() => onApprove(fields, selectedEvent)}
          className="px-4 py-2 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-xs font-medium flex items-center gap-2 transition-colors cursor-pointer shadow-2xs"
        >
          <CheckCircle2 className="w-4 h-4 text-emerald-400" />
          <span>Approve & Save</span>
          <span className="text-[10px] bg-slate-800 text-slate-300 px-1.5 py-0.5 rounded font-mono font-normal flex items-center gap-0.5">
            <CornerDownLeft className="w-2.5 h-2.5" /> Enter
          </span>
        </button>
      </div>
    </div>
  );
};
