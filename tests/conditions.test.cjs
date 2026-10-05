const { test } = require('node:test');
const assert = require('node:assert/strict');
const { evaluateConditions } = require('../apps/api/dist/http-cache/conditions');
const current = { etag: 'W/"opaque,tag"', lastModified: new Date('2026-01-01T12:00:00.999Z') };
test('weak comparison accepts the strong form and commas inside quoted entity tags', () => {
  assert.equal(evaluateConditions('GET', { 'if-none-match': '"other", "opaque,tag"' }, current), 'not-modified');
});
test('mismatching ETag takes precedence over a future modification date', () => {
  assert.equal(evaluateConditions('GET', { 'if-none-match': '"old"', 'if-modified-since': 'Fri, 02 Jan 2026 12:00:00 GMT' }, current), 'proceed');
});
test('modification dates compare at HTTP second precision', () => {
  assert.equal(evaluateConditions('HEAD', { 'if-modified-since': 'Thu, 01 Jan 2026 12:00:00 GMT' }, current), 'not-modified');
});
test('invalid HTTP dates are ignored', () => {
  assert.equal(evaluateConditions('GET', { 'if-modified-since': '2099-01-01' }, current), 'proceed');
});
test('write preconditions reject matching If-None-Match rather than returning 304', () => {
  assert.equal(evaluateConditions('PATCH', { 'if-none-match': '*' }, current), 'precondition-failed');
  assert.equal(evaluateConditions('PATCH', { 'if-modified-since': 'Fri, 02 Jan 2026 12:00:00 GMT' }, current), 'proceed');
});
test('If-Match uses strong comparison and overrides If-Unmodified-Since', () => {
  assert.equal(evaluateConditions('GET', { 'if-match': '"opaque,tag"' }, current), 'precondition-failed');
  assert.equal(evaluateConditions('PATCH', { 'if-match': '*', 'if-unmodified-since': 'Wed, 31 Dec 2025 12:00:00 GMT' }, current), 'proceed');
});
test('malformed entity tag lists are rejected', () => {
  for (const value of ['*,”other”', '"a" "b"', '"a",', 'garbage', '']) {
    assert.throws(() => evaluateConditions('GET', { 'if-none-match': value }, current));
  }
});
