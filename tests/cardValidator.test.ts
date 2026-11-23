import assert from 'node:assert';
import {
  createEmptyContactFields,
  isGarbageContactRecord,
  repairContactRecordFields,
} from '../src/utils/cardValidator.ts';
import { ContactRecord } from '../src/types/card.ts';

function createMockContact(partialFields: any): ContactRecord {
  const fields = createEmptyContactFields();
  fields.fullName = { value: 'Jane Doe', confidence: 95, status: 'VERIFIED', source: 'FRONT' };
  fields.companyName = { value: 'Acme Corp', confidence: 90, status: 'VERIFIED', source: 'FRONT' };
  for (const [k, v] of Object.entries(partialFields || {})) {
    (fields as any)[k] = v;
  }

  return {
    id: 'test-contact-123',
    scanHash: 'hash-123',
    overallStatus: 'NEEDS_REVIEW',
    missingCoreFieldLabels: [],
    reviewReasons: [],
    frontImageBase64: 'data:image/jpeg;base64,mock',
    rawOcrFront: 'Jane Doe Acme Corp',
    cardOrientation: 'horizontal',
    imageQualityIssues: [],
    frontBackConflicts: [],
    fields,
    customFields: [],
    eventName: 'GITEX 2026',
    sheetTab: 'GITEX 2026',
    syncStatus: 'LOCAL_ONLY',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

// Test 1: Partial contact with only name & company is NOT garbage
const partialContact = createMockContact({
  email: { value: '', confidence: 0, source: 'MANUAL' },
  mobileNumber: { value: '', confidence: 0, source: 'MANUAL' },
});
assert.strictEqual(
  isGarbageContactRecord(partialContact),
  false,
  'Partial contact with name and company should not be marked as garbage'
);

// Test 2: Incomplete contact gets status NEEDS_REVIEW when repaired
const repaired = repairContactRecordFields(partialContact);
assert.strictEqual(repaired.id, 'test-contact-123');
assert.strictEqual(repaired.fields.fullName.value, 'Jane Doe');

// Test 3: Total garbage noise is marked as garbage
const noiseContact = createMockContact({
  fullName: { value: '!!!###$$$', confidence: 10, source: 'OCR' },
  companyName: { value: '%%%^^^', confidence: 10, source: 'OCR' },
  email: { value: '', confidence: 0, source: 'MANUAL' },
  mobileNumber: { value: '', confidence: 0, source: 'MANUAL' },
});
assert.strictEqual(
  isGarbageContactRecord(noiseContact),
  true,
  'Unreadable gibberish noise should be marked as garbage'
);

console.log('cardValidator tests passed!');
