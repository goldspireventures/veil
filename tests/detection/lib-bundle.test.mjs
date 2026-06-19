import assert from 'node:assert/strict';
import { test } from 'node:test';
import { loadDetectionLib } from './load-lib.mjs';

const lib = loadDetectionLib();

test('luhnCheck accepts Visa test number', () => {
  assert.equal(lib.luhnCheck('4111111111111111'), true);
  assert.equal(lib.luhnCheck('4111 1111 1111 1111'), true);
});

test('luhnCheck rejects invalid card number', () => {
  assert.equal(lib.luhnCheck('4111111111111112'), false);
  assert.equal(lib.luhnCheck('12345'), false);
});

test('findCreditCards detects grouped and continuous numbers', () => {
  const grouped = lib.findCreditCards('Card: 4111 1111 1111 1111 please');
  const continuous = lib.findCreditCards('4111111111111111');
  assert.equal(grouped.length, 1);
  assert.equal(continuous.length, 1);
  assert.equal(grouped[0].category, 'credit_card');
  assert.equal(grouped[0].severity, 'high');
  assert.ok(grouped[0].confidence >= 85);
  assert.ok(grouped[0].matchedText.includes('1111'));
  assert.equal('matchedTextRaw' in grouped[0], true);
});

test('findJwts detects standard JWT shape', () => {
  const token =
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c';
  const hits = lib.findJwts(token);
  assert.equal(hits.length, 1);
  assert.equal(hits[0].category, 'jwt');
  assert.ok(hits[0].confidence >= 90);
});

test('findIbans detects partial Irish IBAN while typing', () => {
  const hits = lib.findIbans('IE25AIBK');
  assert.equal(hits.length, 1);
  assert.equal(hits[0].category, 'iban');
  assert.ok(hits[0].confidence >= 50);
  assert.equal(lib.findApiKeys('IE25AIBK').length, 0);
});

test('findApiKeys generic fallback skips IBAN and SWIFT prefixes', () => {
  assert.equal(lib.findApiKeys('IE25AIBK9311').length, 0);
  assert.equal(lib.findApiKeys('AIBKIE2D').length, 0);
});

test('analyzeAll prefers IBAN over generic secret guess', () => {
  const hits = lib.analyzeAll('IE25AIBK');
  assert.equal(hits[0].category, 'iban');
});

test('spaced Irish IBAN is classified as IBAN, not phone or api key', () => {
  const sample = 'ie25 aibk 9900 3344 7649 8836';
  const hits = lib.analyzeAll(sample);
  assert.ok(hits.length > 0);
  assert.equal(hits[0].category, 'iban');
  assert.equal(hits.some((h) => h.category === 'phone'), false);
  assert.equal(hits.some((h) => h.category === 'api_key'), false);
});

test('partial Irish IBAN with account fragment is IBAN', () => {
  const hits = lib.analyzeAll('ie25 aibk 2193825B');
  assert.ok(hits.some((h) => h.category === 'iban'));
  assert.equal(lib.findApiKeys('ie25 aibk 2193825B').length, 0);
});

test('long IBAN-shaped string is not classified as api key', () => {
  const sample = 'IE25AIBK9900334476498836';
  const hits = lib.analyzeAll(sample);
  assert.equal(hits.some((h) => h.category === 'api_key'), false);
  assert.ok(hits.some((h) => h.category === 'iban'));
});

test('findSwiftBics detects BIC codes', () => {
  const hits = lib.findSwiftBics('pay via AIBKIE2D only');
  assert.equal(hits.length, 1);
  assert.equal(hits[0].category, 'swift_bic');
});

test('findTaxIds detects US EIN pattern', () => {
  const hits = lib.findTaxIds('EIN 12-3456789');
  assert.ok(hits.some((h) => h.category === 'tax_id'));
});

test('findDatesOfBirth detects labeled DOB', () => {
  const hits = lib.findDatesOfBirth('patient DOB: 14/03/1985');
  assert.equal(hits.length, 1);
  assert.equal(hits[0].category, 'date_of_birth');
});

test('isSensitiveSelectionText uses detectors and legacy heuristics', () => {
  assert.equal(lib.isSensitiveSelectionText('4111111111111111'), true);
  assert.equal(lib.isSensitiveSelectionText('Password1'), true);
  assert.equal(lib.isSensitiveSelectionText('hi'), false);
});
