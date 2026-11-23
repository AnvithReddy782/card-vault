import React, { createContext, useContext, useState, useCallback } from 'react';
import { ContactRecord } from '../types/card.ts';

export interface ModalContextType {
  // OCR Settings
  openOcrSettings: () => void;
  closeOcrSettings: () => void;
  isOcrSettingsOpen: boolean;

  // Google Sheets
  openSheetsModal: () => void;
  closeSheetsModal: () => void;
  isSheetsModalOpen: boolean;

  // Mobile Connect
  openMobileModal: () => void;
  closeMobileModal: () => void;
  isMobileModalOpen: boolean;

  // Bulk Upload
  openBulkUpload: () => void;
  closeBulkUpload: () => void;
  isBulkUploadOpen: boolean;

  // Duplicate Merge
  openDuplicateMerge: (primary: ContactRecord, duplicate: ContactRecord) => void;
  closeDuplicateMerge: () => void;
  mergingPair: { primary: ContactRecord; duplicate: ContactRecord } | null;

  // Full Review
  openContactReview: (contact: ContactRecord) => void;
  closeContactReview: () => void;
  reviewingContact: ContactRecord | null;
}

const ModalContext = createContext<ModalContextType | undefined>(undefined);

export const ModalProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [isOcrSettingsOpen, setIsOcrSettingsOpen] = useState(false);
  const [isSheetsModalOpen, setIsSheetsModalOpen] = useState(false);
  const [isMobileModalOpen, setIsMobileModalOpen] = useState(false);
  const [isBulkUploadOpen, setIsBulkUploadOpen] = useState(false);
  const [mergingPair, setMergingPair] = useState<{ primary: ContactRecord; duplicate: ContactRecord } | null>(null);
  const [reviewingContact, setReviewingContact] = useState<ContactRecord | null>(null);

  const openOcrSettings = useCallback(() => setIsOcrSettingsOpen(true), []);
  const closeOcrSettings = useCallback(() => setIsOcrSettingsOpen(false), []);

  const openSheetsModal = useCallback(() => setIsSheetsModalOpen(true), []);
  const closeSheetsModal = useCallback(() => setIsSheetsModalOpen(false), []);

  const openMobileModal = useCallback(() => setIsMobileModalOpen(true), []);
  const closeMobileModal = useCallback(() => setIsMobileModalOpen(false), []);

  const openBulkUpload = useCallback(() => setIsBulkUploadOpen(true), []);
  const closeBulkUpload = useCallback(() => setIsBulkUploadOpen(false), []);

  const openDuplicateMerge = useCallback((primary: ContactRecord, duplicate: ContactRecord) => {
    setMergingPair({ primary, duplicate });
  }, []);
  const closeDuplicateMerge = useCallback(() => setMergingPair(null), []);

  const openContactReview = useCallback((contact: ContactRecord) => {
    setReviewingContact(contact);
  }, []);
  const closeContactReview = useCallback(() => setReviewingContact(null), []);

  return (
    <ModalContext.Provider
      value={{
        openOcrSettings,
        closeOcrSettings,
        isOcrSettingsOpen,
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
        reviewingContact,
      }}
    >
      {children}
    </ModalContext.Provider>
  );
};

export function useModal(): ModalContextType {
  const context = useContext(ModalContext);
  if (!context) {
    throw new Error('useModal must be used within a ModalProvider');
  }
  return context;
}
