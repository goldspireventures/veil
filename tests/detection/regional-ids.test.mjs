import assert from 'node:assert/strict';
import { test } from 'node:test';
import { loadDetectionLib } from './load-lib.mjs';

const lib = loadDetectionLib();

test('findRegionalNationalIds detects Canadian SIN with label', () => {
  const hits = lib.findRegionalNationalIds('SIN: 130-692-502');
  assert.ok(hits.some((h) => h.tags?.includes('ca')));
});

test('findRegionalNationalIds detects Australian TFN with label', () => {
  const hits = lib.findRegionalNationalIds('TFN 123 456 789');
  assert.ok(hits.some((h) => h.tags?.includes('au')));
});

test('findRegionalNationalIds detects UK NINO with label', () => {
  const hits = lib.findRegionalNationalIds('NINO AA 12 34 56 A');
  assert.ok(hits.some((h) => h.tags?.includes('gb')));
});

test('findRegionalNationalIds detects Singapore NRIC', () => {
  const hits = lib.findRegionalNationalIds('patient S1234567D admitted');
  assert.ok(hits.some((h) => h.tags?.includes('sg')));
});

test('findRegionalNationalIds detects Indian Aadhaar with label', () => {
  const hits = lib.findRegionalNationalIds('Aadhaar 2345 6789 0107');
  assert.ok(hits.some((h) => h.tags?.includes('in')));
});

test('findMedicalRecordNumbers detects Australian Medicare', () => {
  const hits = lib.findMedicalRecordNumbers('Medicare 2123 45670 1');
  assert.ok(hits.some((h) => h.tags?.includes('medicare')));
});

test('analyzeAll includes regional national IDs', () => {
  const hits = lib.analyzeAll('TFN 123 456 789 and SIN: 130-692-502');
  assert.ok(hits.some((h) => h.category === 'national_id'));
});
