import { randomUUID } from 'node:crypto';
import type { CalendarEntry } from './calendar.js';
import { monthCells, mountDashboard, todayKey } from './dashboard-view.js';

export function renderDashboard(entries: CalendarEntry[]): string {
  const nonce = randomUUID();
  const data = JSON.stringify({ entries }).replace(/[<>&\u2028\u2029]/g, c => `\\u${c.charCodeAt(0).toString(16).padStart(4, '0')}`);
  return `<!doctype html>
<html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'nonce-${nonce}'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'">
<title>지원 일정 · JobShot</title><style>
:root{font-family:'Segoe UI','Malgun Gothic',sans-serif;color:#282824;background:#faf9f6;font-synthesis:none;font-size:14px;--line:#deddd6;--muted:#696960;--accent:#a3442e}
*{box-sizing:border-box}body{margin:0}button,a,summary{touch-action:manipulation}button{font:inherit;cursor:pointer}a{color:inherit}button:focus-visible,a:focus-visible,summary:focus-visible{outline:2px solid var(--accent);outline-offset:3px}[hidden]{display:none!important}
header{height:60px;border-bottom:1px solid var(--line);display:flex;align-items:center;justify-content:space-between;gap:16px;padding:0 max(24px,calc((100vw - 1360px)/2));background:#fff}
.brand{font-size:20px;font-weight:700;letter-spacing:-.8px}.private{font-size:12px;color:var(--muted)}
main{max-width:1408px;margin:auto;padding:32px 24px}.intro{display:flex;align-items:baseline;justify-content:space-between;gap:20px;margin-bottom:28px}h1{font-size:24px;letter-spacing:-.8px;font-weight:650;margin:0}
.stats{display:flex;gap:24px;margin:0}.stats div{display:flex;align-items:baseline;gap:8px}.stats dt{font-size:12px;color:var(--muted)}.stats dd{margin:0;font-size:15px;font-weight:600;font-variant-numeric:tabular-nums}
.calendar{background:#fff;border:1px solid var(--line)}.toolbar{padding:18px 20px;display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:12px}.toolbar h2{font-size:20px;font-weight:650;letter-spacing:-.5px;margin:0;white-space:nowrap}.toolbar p{font-size:12px;color:var(--muted);margin:5px 0 0}
.nav{display:flex;flex-shrink:0;gap:6px}.nav button{background:#fff;border:1px solid #c9c8c0;border-radius:3px;min-width:40px;min-height:40px;padding:6px 12px;color:#353530;white-space:nowrap}.nav button:hover{background:#f2f1ec}.nav button:disabled{opacity:.4;cursor:default}.nav #today{padding-inline:16px}
.scroll{overflow-x:auto}.scroll:focus-visible{outline:2px solid var(--accent);outline-offset:-2px}.scroll-hint{display:none;margin:0;padding:0 16px 12px;font-size:12px;color:var(--muted);line-height:1.6}
.weekdays,#days{display:grid;grid-template-columns:repeat(7,minmax(120px,1fr));min-width:840px}.weekdays{border-top:1px solid var(--line);font-size:12px;color:var(--muted)}.weekdays span{padding:10px 12px}.weekdays span:first-child{color:#a14737}
.day{min-height:112px;padding:10px 8px;border-top:1px solid var(--line);border-right:1px solid var(--line)}.day:nth-child(7n){border-right:0}.outside{background:#f7f6f2}.day-number{font-size:12px;display:flex;align-items:center;gap:5px;min-height:23px;margin:0 3px 8px;color:#5c5c55;font-variant-numeric:tabular-nums}.day-number small{font-size:10px;font-weight:400}.day.today{background:#fcf7f1;box-shadow:inset 0 2px var(--accent)}.today .day-number{color:var(--accent);font-weight:700}
.posting{padding:7px 9px;margin-top:8px;border-left:2px solid #c0b6a6;background:#f4f3ef;overflow-wrap:anywhere}.company{display:block;font-size:13px;font-weight:600;line-height:1.5}.role{display:block;font-size:12px;line-height:1.5;color:#62625b;margin-top:2px}.deadline-label{display:block;font-size:10px;line-height:1.5;color:#6f6e65;margin-top:6px}.source-link{display:inline-block;font-size:12px;line-height:1.5;text-underline-offset:3px;margin-top:3px;padding:4px 0}.source-link:hover{color:var(--accent)}.missing-link{display:block;font-size:11px;color:var(--muted);margin-top:7px}
.note{font-size:13px;padding:16px 20px;margin:0;border-top:1px solid var(--line);color:var(--muted)}.empty{border-top:1px solid var(--line);padding:20px 0;margin-bottom:20px}.empty strong{font-size:15px;font-weight:600}.empty p{font-size:13px;color:var(--muted);line-height:1.7;margin:6px 0 0}
.undated{margin-top:30px}.section-title{display:flex;align-items:baseline;gap:10px;border-bottom:1px solid var(--line);padding-bottom:12px}.section-title h2{font-size:16px;font-weight:600;margin:0}.badge{font-size:13px;color:var(--muted);font-variant-numeric:tabular-nums}#undated-list{display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:0 24px}.undated .posting{background:transparent;border:0;border-bottom:1px solid var(--line);padding:16px 0;margin:0}.undated p{font-size:13px;color:var(--muted)}
footer{margin-top:30px;padding-top:16px;border-top:1px solid var(--line);font-size:12px;color:var(--muted);line-height:1.7}footer>p{margin:0 0 8px}.local-notice summary{cursor:pointer;width:fit-content;text-decoration:underline;text-underline-offset:3px}.local-notice p{margin:8px 0;max-width:780px}.local-notice strong{font-weight:500}
@media(max-width:890px){.scroll-hint{display:block}}
@media(max-width:640px){header{height:52px;padding:0 16px}.brand{font-size:18px}.private{font-size:11px}main{padding:24px 12px}.intro{display:block;margin-bottom:20px}h1{font-size:22px}.stats{margin-top:16px;gap:0;justify-content:space-between}.stats div{gap:6px}.stats dt{font-size:11px}.stats dd{font-size:14px}.toolbar{padding:14px 12px}.toolbar h2{font-size:18px}.toolbar p{font-size:11px}.nav{gap:4px}.nav button{padding:6px 9px}.nav #today{padding-inline:12px}.scroll-hint{padding-inline:12px;font-size:11px}.undated{margin-top:24px}#undated-list{grid-template-columns:1fr}.section-title h2{font-size:15px}}
</style></head><body>
<header><div class="brand">JobShot</div><span class="private">내 기기에 저장된 일정</span></header>
<main>
<section class="intro" aria-label="일정 요약"><h1>지원 일정</h1><dl class="stats"><div><dt>전체 공고</dt><dd id="all-count">0</dd></div><div><dt>선택한 달</dt><dd id="month-count">0</dd></div><div><dt>7일 이내</dt><dd id="soon-count">0</dd></div></dl></section>
<div id="empty" class="empty" hidden><strong>등록된 공고가 없습니다.</strong><p>대화에서 “이 공고를 로컬 달력에 등록해줘”라고 요청하세요.<br>보관하거나 분석만 한 공고는 달력에 표시되지 않습니다.</p></div>
<section class="calendar" aria-label="지원 마감 달력"><div class="toolbar"><div><h2 id="month-title" aria-live="polite"></h2><p id="today-label"></p></div><nav class="nav" aria-label="월 이동"><button id="prev" aria-label="이전 달">←</button><button id="today">오늘</button><button id="next" aria-label="다음 달">→</button></nav></div>
<p id="scroll-hint" class="scroll-hint">좌우로 스크롤하면 다른 날짜를 볼 수 있습니다.<br>키보드: 달력에 초점을 맞춘 뒤 방향키로 이동</p><div class="scroll" role="region" aria-label="날짜별 공고" aria-describedby="scroll-hint" tabindex="0"><div class="weekdays" aria-hidden="true"><span>일</span><span>월</span><span>화</span><span>수</span><span>목</span><span>금</span><span>토</span></div><div id="days"></div></div><p id="month-empty" class="note" hidden>이번 달에는 등록한 마감 일정이 없습니다.</p></section>
<section class="undated"><div class="section-title"><h2>날짜 미정 · 상시 채용</h2><span id="undated-count" class="badge">0</span></div><div id="undated-list"></div><p id="undated-empty">날짜 미정 또는 상시 채용 공고가 없습니다.</p></section>
<footer><p>로컬에 등록한 일정입니다. Google 전송 결과는 대화에서 확인하세요.</p><details class="local-notice"><summary>일정 관리 안내</summary><p><strong>Google 연결 없이도 이 달력을 사용할 수 있습니다.</strong> Google 등록에 실패한 공고도 로컬에 등록되면 표시됩니다. 이 화면에 보이는 것만으로 Google 등록이 완료된 것은 아닙니다.</p><p>날짜만 확인된 공고는 마감 시각을 추측하지 않습니다. 공고 변경 후 달력을 다시 만들고 페이지를 새로고침하세요.</p></details></footer>
<noscript><p>달력을 표시하려면 브라우저에서 JavaScript를 허용하세요.</p></noscript></main>
<script id="jobshot-data" type="application/json" nonce="${nonce}">${data}</script>
<script nonce="${nonce}">${todayKey.toString()}\n${monthCells.toString()}\n(${mountDashboard.toString()})();</script></body></html>`;
}
