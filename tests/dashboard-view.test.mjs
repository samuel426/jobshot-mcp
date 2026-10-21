import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM, VirtualConsole } from 'jsdom';
import { renderDashboard } from '../dist/dashboard.js';

// Execute only our generated application and synthetic fixtures; no resources are loaded.
function page(t, entries = [], start = '2026-10-21T14:59:59Z') {
  let now = Date.parse(start), tick;
  const errors = [];
  const console = new VirtualConsole(); console.on('jsdomError', error => errors.push(error));
  const dom = new JSDOM(renderDashboard(entries), {
    runScripts: 'dangerously', pretendToBeVisual: true, virtualConsole: console,
    beforeParse(window) {
      window.Date = class extends Date { constructor(...args) { super(...(args.length ? args : [now])); } static now() { return now; } };
      window.setInterval = callback => { tick = callback; return 1; };
    },
  });
  t.after(() => { dom.window.close(); assert.deepEqual(errors, []); });
  return { window: dom.window, $: id => dom.window.document.getElementById(id), setNow: value => { now = Date.parse(value); }, tick: () => tick() };
}
const entry = (date, company = '가상기업', extra = {}) => ({ id: 'a'.repeat(64), company, role: '백엔드 개발', date, kind: date ? 'date' : 'unknown', source_url: 'https://example.com/job', ...extra });

test('standalone HTML starts on current month, highlights today and navigates December/January', t => {
  const p = page(t, [entry('2026-10-21')]);
  assert.equal(p.$('month-title').textContent, '2026년 10월');
  assert.equal(p.window.document.querySelector('[aria-current=date]').parentElement.dataset.date, '2026-10-21');
  p.$('next').click(); assert.equal(p.$('month-title').textContent, '2026년 11월');
  p.$('next').click(); p.$('next').click(); assert.equal(p.$('month-title').textContent, '2027년 1월');
  p.$('prev').click(); assert.equal(p.$('month-title').textContent, '2026년 12월');
  p.$('today').click(); assert.equal(p.$('month-title').textContent, '2026년 10월');
});

test('midnight timer updates today and deadline labels without resetting a selected month', t => {
  const p = page(t, [entry('2026-10-21')]);
  assert.match(p.window.document.querySelector('.deadline-label').textContent, /오늘 마감/);
  p.setNow('2026-10-21T15:00:00Z'); p.tick();
  assert.equal(p.window.document.querySelector('[aria-current=date]').parentElement.dataset.date, '2026-10-22');
  assert.match(p.window.document.querySelector('.deadline-label').textContent, /마감일 지남/);
  p.$('next').click(); p.setNow('2026-10-22T15:00:00Z'); p.tick();
  assert.equal(p.$('month-title').textContent, '2026년 11월');
  assert.match(p.$('today-label').textContent, /2026.10.23/);
});

test('focus and visibility refresh after sleep including year rollover', t => {
  const p = page(t, [], '2026-12-31T14:59:59Z');
  p.setNow('2026-12-31T15:00:00Z'); p.window.dispatchEvent(new p.window.Event('focus'));
  assert.equal(p.$('month-title').textContent, '2026년 12월');
  assert.match(p.$('today-label').textContent, /2027.01.01/);
  p.setNow('2027-01-01T15:00:00Z'); p.window.document.dispatchEvent(new p.window.Event('visibilitychange'));
  assert.match(p.$('today-label').textContent, /2027.01.02/);
  p.$('today').click(); assert.equal(p.$('month-title').textContent, '2027년 1월');
});

test('empty, unknown, rolling, links and script-like company text are usable DOM content', t => {
  const empty = page(t); assert.equal(empty.$('empty').hidden, false);
  const text = '</script><img src=x onerror=alert(1)> & "';
  const p = page(t, [entry('2026-10-21', text), entry(null, '미정', { source_url: null }), entry(null, '상시', { kind: 'rolling' })]);
  assert.equal(p.$('empty').hidden, true);
  assert.equal(p.window.document.querySelector('.company').textContent, text);
  assert.equal(p.window.document.querySelectorAll('img').length, 0);
  assert.equal(p.$('undated-count').textContent, '2');
  assert.match(p.$('undated-list').textContent, /마감일 확인 필요/);
  assert.match(p.$('undated-list').textContent, /상시 채용/);
  assert.match(p.$('undated-list').textContent, /원문 링크 없음/);
  const link = p.window.document.querySelector('a');
  assert.equal(link.href, 'https://example.com/job'); assert.equal(link.target, '_blank'); assert.equal(link.rel, 'noopener noreferrer');
});
