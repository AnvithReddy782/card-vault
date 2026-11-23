import assert from 'node:assert';

const BASE_URL = 'http://localhost:3000';

async function runTests() {
  console.log('--- Running CardVault Backend API Tests ---');

  // 1. GET /api/config
  const cfgRes = await fetch(`${BASE_URL}/api/config`);
  assert.strictEqual(cfgRes.status, 200, 'GET /api/config must return 200');
  const cfg = await cfgRes.json();
  console.log('✓ /api/config:', {
    hasGeminiKey: cfg.hasGeminiKey,
    engine: cfg.ocrEnginePreference,
  });

  // 2. GET /api/network-info
  const netRes = await fetch(`${BASE_URL}/api/network-info`);
  assert.strictEqual(netRes.status, 200, 'GET /api/network-info must return 200');
  const net = await netRes.json();
  console.log('✓ /api/network-info:', {
    primaryIp: net.primaryIp,
    httpPort: net.httpPort,
  });

  // 3. GET /api/contacts
  const contactsRes = await fetch(`${BASE_URL}/api/contacts`);
  assert.strictEqual(contactsRes.status, 200, 'GET /api/contacts must return 200');
  const contactsData = await contactsRes.json();
  const contacts = Array.isArray(contactsData) ? contactsData : contactsData.contacts || [];
  console.log('✓ /api/contacts count:', contacts.length);

  // 4. Batch update / upsert test with non-destructive contact
  const testContactId = `test-e2e-${Date.now()}`;
  const mockContact = {
    id: testContactId,
    scanHash: `hash-${testContactId}`,
    overallStatus: 'NEEDS_REVIEW',
    missingCoreFieldLabels: ['Work Phone', 'Email'],
    reviewReasons: ['Saved without phone and email for review'],
    frontImageBase64: 'data:image/jpeg;base64,/9j/mock',
    rawOcrFront: 'Anvit Sharma Chief Architect TechVentures Global',
    cardOrientation: 'horizontal',
    imageQualityIssues: [],
    frontBackConflicts: [],
    fields: {
      fullName: { value: 'Anvit Sharma', confidence: 98, status: 'VERIFIED', source: 'FRONT' },
      firstName: { value: 'Anvit', confidence: 98, status: 'VERIFIED', source: 'FRONT' },
      lastName: { value: 'Sharma', confidence: 98, status: 'VERIFIED', source: 'FRONT' },
      designation: { value: 'Chief Architect', confidence: 94, status: 'VERIFIED', source: 'FRONT' },
      department: { value: 'Engineering', confidence: 90, status: 'VERIFIED', source: 'FRONT' },
      mobileNumber: { value: '', confidence: 0, status: 'MISSING', source: 'NONE' },
      officePhone: { value: '', confidence: 0, status: 'MISSING', source: 'NONE' },
      companyTelephone: { value: '', confidence: 0, status: 'MISSING', source: 'NONE' },
      whatsappNumber: { value: '', confidence: 0, status: 'MISSING', source: 'NONE' },
      faxNumber: { value: '', confidence: 0, status: 'MISSING', source: 'NONE' },
      email: { value: '', confidence: 0, status: 'MISSING', source: 'NONE' },
      secondaryEmail: { value: '', confidence: 0, status: 'MISSING', source: 'NONE' },
      website: { value: 'https://acmecorp.example', confidence: 95, status: 'VERIFIED', source: 'FRONT' },
      companyWebsite: { value: 'https://acmecorp.example', confidence: 95, status: 'VERIFIED', source: 'FRONT' },
      linkedIn: { value: '', confidence: 0, status: 'MISSING', source: 'NONE' },
      otherSocialMedia: { value: '', confidence: 0, status: 'MISSING', source: 'NONE' },
      companyName: { value: 'Acme Corporation', confidence: 99, status: 'VERIFIED', source: 'FRONT' },
      companyCategory: { value: 'Information Technology', confidence: 90, status: 'VERIFIED', source: 'FRONT' },
      businessActivity: { value: 'Software Engineering', confidence: 90, status: 'VERIFIED', source: 'FRONT' },
      companyAddress: { value: 'Dubai Internet City', confidence: 92, status: 'VERIFIED', source: 'FRONT' },
      city: { value: 'Dubai', confidence: 95, status: 'VERIFIED', source: 'FRONT' },
      country: { value: 'UAE', confidence: 95, status: 'VERIFIED', source: 'FRONT' },
      poBox: { value: '', confidence: 0, status: 'MISSING', source: 'NONE' },
      officeLocation: { value: '', confidence: 0, status: 'MISSING', source: 'NONE' },
      registrationInfo: { value: '', confidence: 0, status: 'MISSING', source: 'NONE' },
      qrCodeInfo: { value: '', confidence: 0, status: 'MISSING', source: 'NONE' },
      otherRelevantText: { value: '', confidence: 0, status: 'MISSING', source: 'NONE' },
    },
    customFields: [],
    eventName: 'GITEX 2026',
    sheetTab: 'GITEX 2026',
    syncStatus: 'LOCAL_ONLY',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  const batchRes = await fetch(`${BASE_URL}/api/contacts/batch-update`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ contacts: [mockContact] }),
  });
  assert.strictEqual(batchRes.status, 200, 'Batch update should return 200');
  console.log('✓ /api/contacts/batch-update upserted test contact');

  // Verify it exists in contacts list and was NOT discarded
  const verifyRes = await fetch(`${BASE_URL}/api/contacts`);
  const updatedList = await verifyRes.json();
  const allContacts = Array.isArray(updatedList) ? updatedList : updatedList.contacts || [];
  const found = allContacts.find((c: any) => c.id === testContactId);
  assert.ok(found, 'Partial contact with name & company MUST be saved and preserved on disk');
  assert.strictEqual(found.fields.fullName.value, 'Anvit Sharma');
  assert.strictEqual(found.fields.companyName.value, 'Acme Corporation');
  console.log('✓ Verified non-destructive persistence: contact correctly stored on disk');

  // Clean up test contact
  const delRes = await fetch(`${BASE_URL}/api/contacts/${testContactId}`, {
    method: 'DELETE',
  });
  assert.strictEqual(delRes.status, 200, 'Delete contact should return 200');
  console.log('✓ Cleaned up test contact, delete status: 200');

  console.log('--- All Backend API Tests Passed Perfectly! ---');
}

runTests().catch((err) => {
  console.error('API Test Error:', err);
  process.exit(1);
});
