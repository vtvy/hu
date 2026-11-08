const test = require('node:test');
const assert = require('node:assert/strict');
const store = require('../store-core.js');
const core = require('../recurring-core.js');

test('rejects XSS-like transaction ids and oversized notes on import', () => {
  const base = store.seedStore();
  const bad = structuredClone(base);
  bad.months['202610'].tx[0].id = '"><img src=x onerror=alert(1)>';
  assert.equal(store.validateStore(bad, core), false);
  const long = structuredClone(base);
  long.months['202610'].tx[0].note = 'x'.repeat(200);
  assert.equal(store.validateStore(long, core), false);
  assert.ok(store.validateStore(base, core));
});

test('migrates v1 payloads to version 2 with jars and meta', () => {
  const v1 = {
    version: 1,
    months: {
      '202610': {
        budget: 1000000,
        alloc: Object.fromEntries(store.DEFAULT_JARS.map(j => [j.id, 100000])),
        tx: [{id: 'ok-id-1', jar: 'food', amount: 1000, date: '2026-10-01', note: 'A'}]
      }
    }
  };
  const migrated = store.migrateToV2(v1);
  assert.equal(migrated.version, 2);
  assert.ok(Array.isArray(migrated.jars));
  assert.ok(migrated.meta);
  assert.ok(store.validateStore(migrated, core));
});

test('parseSizeSafe blocks oversized JSON strings', () => {
  assert.equal(store.parseSizeSafe('{"a":1}').a, 1);
  assert.equal(store.parseSizeSafe('x'.repeat(store.MAX_JSON_CHARS + 1)), null);
});

test('carryLivingBalances only carries non-negative living leftovers', () => {
  const jars = store.cloneJars();
  const month = {
    budget: 1000000,
    alloc: {food: 100000, bills: 50000},
    tx: [
      {id: '1', jar: 'food', amount: 40000, date: '2026-10-01', note: 'a', kind: 'expense'},
      {id: '2', jar: 'bills', amount: 80000, date: '2026-10-02', note: 'b', kind: 'expense'}
    ]
  };
  // ensure other alloc keys exist
  for (const j of jars) month.alloc[j.id] ??= 0;
  const carry = store.carryLivingBalances(month, jars);
  assert.equal(carry.food, 60000);
  assert.equal(carry.bills, 0);
});

test('validId allows uuid and repeat keys within length', () => {
  assert.ok(store.validId('repeat-123e4567-e89b-12d3-a456-426614174000-2026-10-01'));
  assert.equal(store.validId('bad id'), false);
  assert.equal(store.validId('<script>'), false);
});

test('encryptStore and decryptStore round-trip with Web Crypto', async () => {
  const original = store.seedStore();
  const envelope = await store.encryptStore(original, '1234');
  assert.equal(envelope.encrypted, true);
  assert.ok(envelope.payload);
  const restored = await store.decryptStore(envelope, '1234');
  assert.equal(restored.version, 2);
  assert.equal(restored.months['202610'].budget, original.months['202610'].budget);
  await assert.rejects(() => store.decryptStore(envelope, '9999'));
});
