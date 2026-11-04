// Manual real-browser verification fixture. No workspace data or credentials are read.
import { createServer } from 'node:http';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { renderDashboard } from '../dist/dashboard.js';
import { todayKey } from '../dist/dashboard-view.js';

const today = todayKey(new Date());
const nextMonth = new Date(`${today.slice(0, 7)}-01T00:00:00Z`);
nextMonth.setUTCMonth(nextMonth.getUTCMonth() + 1);
const later = new Date(`${today}T00:00:00Z`); later.setUTCDate(later.getUTCDate() + 2);
const hits = [];
const listen = server => new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const sink = createServer((req, res) => {
  hits.push(req.url); res.writeHead(200, { 'Content-Type': 'text/plain' }); res.end('unexpected resource request');
});
await listen(sink);
const blockedOrigin = `http://127.0.0.1:${sink.address().port}`;
let html, probe;
const server = createServer((req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  if (req.url === '/' || req.url === '/index.html' || req.url === '/csp.html') {
    res.setHeader('Content-Type', 'text/html; charset=utf-8'); res.end(req.url === '/csp.html' ? probe : html);
  } else if (req.url === '/posting/example') {
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.end('<!doctype html><html lang="ko"><meta charset="utf-8"><title>가상 공고 원문 확인</title><h1>가상 공고 원문 확인</h1><p>링크 검증용 페이지입니다. 실제 채용공고가 아닙니다.</p></html>');
  } else if (req.url === '/results') {
    res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify({ blocked_resource_requests: hits }));
  } else { res.writeHead(404); res.end('not found'); }
});
await listen(server);
const origin = `http://127.0.0.1:${server.address().port}`;
const entries = [
  ['가상 오로라테크', '백엔드 개발', today, 'date'],
  ['가상 긴이름기업 — 플랫폼 서비스 개발 및 운영 연구소', 'TypeScript 기반 서비스 개발과 자동 테스트', today, 'date'],
  ['가상 그린데이터', '데이터 엔지니어', later.toISOString().slice(0, 10), 'date'],
  ['가상 다음기회', '다음 달 채용', nextMonth.toISOString().slice(0, 10), 'date'],
  ['가상 날짜미정', '직무 확인 필요', null, 'unknown'],
  ['가상 상시채용', '서버 개발', null, 'rolling'],
].map(([company, role, date, kind], i) => ({ id: String(i + 1).repeat(64), company, role, date, kind, source_url: i === 4 ? null : `${origin}/posting/example` }));
html = renderDashboard(entries);
const nonce = /<script nonce="([^"]+)"/.exec(html)[1];
const harness = `
(() => {
 const outcomes = {inline:false, handler:false, external:false, fetch:false, image:false, eval:false};
 const violations = [];
 document.addEventListener('securitypolicyviolation', e => violations.push({directive:e.effectiveDirective, blocked:e.blockedURI}));
 const root=document.createElement('section'); root.id='csp-check'; root.style.cssText='background:white;padding:24px;border:3px solid #163e4d;margin:16px';
 const heading=document.createElement('h2'); heading.textContent='CSP 실제 브라우저 검사';root.append(heading);document.body.prepend(root);
 window.__unexpectedCspExecution=false;
 const inline=document.createElement('script');inline.textContent='window.__unexpectedCspExecution=true';document.head.append(inline);
 const external=document.createElement('script');external.src='${blockedOrigin}/blocked/script.js';document.head.append(external);
 const button=document.createElement('button');button.hidden=true;button.setAttribute('onclick','window.__unexpectedCspExecution=true');root.append(button);button.click();
 const img=document.createElement('img');img.alt='';img.hidden=true;img.src='${blockedOrigin}/blocked/image.png';root.append(img);
 fetch('${blockedOrigin}/blocked/fetch').then(()=>{}).catch(()=>{});
 try { new Function('window.__unexpectedCspExecution=true')(); } catch(e) { outcomes.eval=e.name==='EvalError'; }
 setTimeout(()=>{
  outcomes.inline=violations.some(v=>v.directive==='script-src-elem'&&v.blocked==='inline');
  outcomes.handler=violations.some(v=>v.directive==='script-src-attr');
  outcomes.external=violations.some(v=>v.directive==='script-src-elem'&&v.blocked.includes('/blocked/script.js'));
  outcomes.fetch=violations.some(v=>v.directive==='connect-src');
  outcomes.image=violations.some(v=>v.directive==='img-src');
  const result={allowed_dashboard_script:!!document.getElementById('month-title').textContent,unexpected_script_executed:window.__unexpectedCspExecution,blocked:outcomes,violations};
  const pre=document.createElement('pre');pre.id='csp-results';pre.style.whiteSpace='pre-wrap';pre.textContent=JSON.stringify(result,null,2);root.append(pre);
  const status=document.createElement('strong');status.id='csp-status';status.textContent=result.allowed_dashboard_script&&!result.unexpected_script_executed&&Object.values(outcomes).every(Boolean)?'PASS: 6개 차단 + 정상 달력 실행':'FAIL: 검사 결과 확인 필요';root.prepend(status);
 },500);
})();`;
probe = html.replace('</body>', `<script nonce="${nonce}">${harness}</script></body>`);
const output = resolve('tmp/dashboard-browser-check'); mkdirSync(output, { recursive: true });
writeFileSync(resolve(output, 'index.html'), html);
writeFileSync(resolve(output, 'csp.html'), probe);
writeFileSync(resolve(output, 'session.json'), JSON.stringify({ origin, blockedOrigin, today, entries: entries.length }, null, 2));
console.log(JSON.stringify({ preview: origin, csp: `${origin}/csp.html`, results: `${origin}/results`, output, today }));
function close() { server.close(); sink.close(); }
process.on('SIGINT', close); process.on('SIGTERM', close);
