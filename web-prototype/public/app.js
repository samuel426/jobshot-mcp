// Public, synthetic UI data only. No storage, uploads, APIs, credentials or authentication.
const $ = id => document.getElementById(id);
const dateParts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date());
const part = type => Number(dateParts.find(p => p.type === type).value);
const today = new Date(Date.UTC(part('year'), part('month') - 1, part('day')));
const dateAt = days => new Date(today.getTime() + days * 86400000);
const key = date => date.toISOString().slice(0, 10);
const postings = [
  { company: '가상 오로라테크', role: '백엔드 개발', date: dateAt(2), stage: '서류 준비', mark: 'A', tags: ['서버 개발', 'TypeScript', '주니어'] },
  { company: '가상 모노스튜디오', role: '프론트엔드 개발', date: dateAt(4), stage: '작성 중', mark: 'M', tags: ['웹 서비스', 'React', '주니어'] },
  { company: '가상 그린데이터', role: '데이터 엔지니어', date: dateAt(6), stage: '관심 공고', mark: 'G', tags: ['데이터 파이프라인', 'SQL', '주니어'] },
  { company: '가상 온다컴퍼니', role: '서비스 기획', date: dateAt(10), stage: '관심 공고', mark: 'O', tags: ['서비스 기획', '사용자 조사', '주니어'] },
  { company: '가상 리프웍스', role: '플랫폼 개발', date: dateAt(14), stage: '관심 공고', mark: 'L', tags: ['플랫폼', 'API', '주니어'] },
  { company: '가상 포레스트랩', role: '제품 디자이너', date: null, stage: '확인 필요', mark: 'F', tags: ['제품 디자인', '프로토타이핑', '주니어'] },
];
let year = today.getUTCFullYear(), month = today.getUTCMonth();
let view = matchMedia('(max-width:520px)').matches ? 'list' : 'month';
let documentKind = 'essay', toastTimer;
const titles = { calendar: ['지원 달력', '놓치지 않도록, 다음 마감부터 확인하세요.'], postings: ['공고 보관함', '관심 있는 기회를 한곳에 모아두세요.'], documents: ['지원 서류', '나의 경험을 공고에 맞게 정리하세요.'], settings: ['관리 설정', '작업공간과 연결 상태를 확인하세요.'] };
const dateLabel = date => date ? `${date.getUTCMonth() + 1}월 ${date.getUTCDate()}일` : '날짜 미정';
const dday = date => date ? `D-${Math.round((date - today) / 86400000)}` : '확인 필요';
function notify(message) { clearTimeout(toastTimer); $('toast').textContent = message; $('toast').hidden = false; toastTimer = setTimeout(() => { $('toast').hidden = true; }, 4000); }
function scheduleRow(p, i) {
  return `<button class="schedule-row" data-posting="${i}"><span class="date-badge">${p.date.getUTCMonth() + 1}월<strong>${p.date.getUTCDate()}</strong></span><span class="row-content"><strong>${p.company}</strong><p>${p.role}</p><small>${dday(p.date)} · ${p.stage}</small></span><span class="row-arrow">↗</span></button>`;
}
function renderCalendar() {
  $('month-title').textContent = `${year}년 ${month + 1}월`;
  const first = new Date(Date.UTC(year, month, 1)).getUTCDay();
  const total = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  const cells = Math.ceil((first + total) / 7) * 7;
  const html = [];
  for (let i = 0; i < cells; i++) {
    const day = i - first + 1, date = new Date(Date.UTC(year, month, day));
    const outside = day < 1 || day > total, isToday = key(date) === key(today);
    const events = outside ? '' : postings.map((p, index) => p.date && key(p.date) === key(date) ? `<button class="event" data-posting="${index}" aria-label="${p.company} ${p.role} ${dateLabel(p.date)} 마감"><strong>${p.company.replace('가상 ', '')}</strong><span>${p.role}</span></button>` : '').join('');
    html.push(`<div class="day${outside ? ' outside' : ''}${isToday ? ' today' : ''}"><div class="day-number"${isToday ? ' aria-current="date"' : ''}>${outside ? '' : day}${isToday ? '<small>오늘</small>' : ''}</div>${events}</div>`);
  }
  $('calendar-grid').innerHTML = html.join('');
  const current = postings.map((p, i) => ({ p, i })).filter(({ p }) => p.date?.getUTCFullYear() === year && p.date?.getUTCMonth() === month);
  $('calendar-list').innerHTML = current.length ? current.map(({ p, i }) => scheduleRow(p, i)).join('') : '<p class="empty-list">이번 달에는 가상 마감 일정이 없습니다.</p>';
  $('calendar-list').hidden = view !== 'list';
  document.querySelector('.calendar-scroll').hidden = view !== 'month';
  $('month-view').setAttribute('aria-pressed', String(view === 'month'));
  $('list-view').setAttribute('aria-pressed', String(view === 'list'));
}
function renderPostings() {
  const search = $('posting-search').value.trim().toLowerCase();
  const filtered = postings.map((p, i) => ({ p, i })).filter(({ p }) => `${p.company} ${p.role}`.toLowerCase().includes(search));
  $('posting-list').innerHTML = filtered.length ? filtered.map(({ p, i }) => `<button class="posting-row" data-posting="${i}"><span class="company-mark">${p.mark}</span><span><strong>${p.company}</strong><small>${p.role}</small></span><span class="posting-date">${dateLabel(p.date)}${p.date ? ' 마감' : ''}</span><span class="status">${p.stage}</span><span class="row-arrow">↗</span></button>`).join('') : '<p class="empty-list">검색 결과가 없습니다. 다른 기업명이나 직무로 찾아보세요.</p>';
}
function renderDocument() {
  document.querySelectorAll('[data-document]').forEach(button => { const selected = button.dataset.document === documentKind; button.classList.toggle('selected', selected); button.setAttribute('aria-pressed', String(selected)); });
  $('document-content').innerHTML = documentKind === 'essay' ? `
    <p class="document-tag">가상 오로라테크 · 백엔드 개발 / 초안 v2</p><h2>문제를 끝까지 따라가는 개발자</h2>
    <h3>직무와 관련된 경험을 소개해 주세요.</h3><p>가상 팀 프로젝트에서 서비스의 API 구현을 맡았습니다. 사용자가 입력한 정보가 화면과 서버에서 서로 다르게 처리되는 문제를 발견했고, 팀원과 입력 규칙을 정리했습니다. 이후 정상 입력과 잘못된 입력을 나누어 테스트하며 기능을 보완했습니다.</p><p>이 경험을 통해 기능을 만드는 것뿐 아니라, 예상하지 못한 상황에서도 사용자가 다음 행동을 알 수 있도록 설계하는 것이 중요하다는 점을 배웠습니다.</p>
    <div class="review"><p class="document-tag">참고 평가 · 가상 예시</p><div class="review-score"><strong>80</strong><span>/ 100점</span></div>
    <div class="review-line"><strong>질문에 대한 답변 22/25 · 직무 연결 20/25</strong>API 구현 경험과 담당 역할이 보입니다. 지원 기업의 구체적인 업무와 연결하는 설명은 부족합니다.</div>
    <div class="review-line"><strong>구체적 근거 22/30 · 가독성 12/15 · 형식 4/5</strong>문제와 행동은 드러나지만 실제 테스트 결과와 판단 근거를 더 확인해야 합니다. 형식 점수는 화면 설명용 가상 기준입니다.</div>
    <h3>다음 수정에서</h3><p>어떤 입력에서 문제가 생겼는지, 테스트로 무엇을 확인했는지 실제 근거를 추가해 보세요.</p></div><p class="reference-note">사전 작성된 가상 초안·평가입니다. 실제 AI 평가나 합격 확률이 아닙니다.</p>` : `
    <p class="document-tag">가상 모노스튜디오 · 프론트엔드 개발 / 초안 v1</p><h2>프로젝트 경험</h2><h3>가상 일정 관리 서비스</h3><p>팀 프로젝트에서 일정 목록과 입력 화면을 구현했습니다. 입력 누락과 긴 제목이 있는 경우를 확인하며 오류 안내와 화면 줄바꿈을 보완했습니다.</p>
    <div class="review"><p class="document-tag">이력서 항목별 평가 · 숫자 점수 없음</p><div class="review-line"><strong>강점</strong>담당 화면과 개선한 문제가 간결하게 드러납니다.</div><div class="review-line"><strong>부족한 근거</strong>테스트한 환경과 개선 결과를 확인할 자료가 없습니다.</div><div class="review-line"><strong>개선안</strong>실제로 확인 가능한 테스트 사례와 본인의 기여 범위를 추가하세요.</div></div><p class="reference-note">사전 작성된 가상 이력서입니다. 원본 자료를 읽거나 저장하지 않습니다.</p>`;
}
function route() {
  if (location.hash === '#main') return;
  const requested = location.hash.slice(1), page = Object.hasOwn(titles, requested) ? requested : 'calendar';
  for (const name of Object.keys(titles)) $(`${name}-page`).hidden = name !== page;
  document.querySelectorAll('[data-page]').forEach(link => { if (link.dataset.page === page) link.setAttribute('aria-current', 'page'); else link.removeAttribute('aria-current'); });
  $('page-title').textContent = titles[page][0]; $('page-subtitle').textContent = titles[page][1];
  $('breadcrumb').textContent = `내 작업공간 / ${titles[page][0]}`;
  document.title = `${titles[page][0]} · JobShot`;
  renderPostings(); renderDocument();
}
function openPosting(index) {
  const p = postings[index]; if (!p) return;
  $('detail-content').innerHTML = `<p class="dialog-company">${p.company}</p><h2 id="detail-title">${p.role}</h2><dl class="detail-meta"><div><dt>지원 마감</dt><dd>${dateLabel(p.date)}</dd></div><div><dt>준비 상태</dt><dd>${p.stage}</dd></div><div><dt>공고 유형</dt><dd>가상 예시</dd></div></dl><h3>이런 일을 하는 역할이에요</h3><p class="muted">사용자의 불편을 이해하고, 팀과 함께 제품을 개선하는 역할을 가정한 공고입니다.</p><h3>살펴볼 키워드</h3><ul>${p.tags.map(t => `<li>${t}</li>`).join('')}</ul><div class="dialog-actions"><button class="primary" data-open-documents>서류 화면 보기</button><button data-demo="실제 공고가 아니므로 원문 링크를 제공하지 않습니다.">공고 원문</button></div><p class="muted">화면 확인용 가상 공고입니다. 실제 채용 정보가 아닙니다.</p>`;
  $('detail-dialog').showModal();
}
$('upcoming-list').innerHTML = postings.slice(0, 3).map((p, i) => `<button class="upcoming-row" data-posting="${i}"><span class="date-badge">${p.date.getUTCMonth() + 1}월<strong>${p.date.getUTCDate()}</strong></span><span class="row-content"><strong>${p.company}</strong><p>${p.role}</p><small>${dday(p.date)} · ${p.stage}</small></span></button>`).join('');
$('posting-search').addEventListener('input', renderPostings);
$('previous-month').addEventListener('click', () => { if (year <= 1900 && month === 0) return; const date = new Date(Date.UTC(year, month - 1)); year = date.getUTCFullYear(); month = date.getUTCMonth(); renderCalendar(); });
$('next-month').addEventListener('click', () => { if (year >= 2199 && month === 11) return; const date = new Date(Date.UTC(year, month + 1)); year = date.getUTCFullYear(); month = date.getUTCMonth(); renderCalendar(); });
$('today').addEventListener('click', () => { year = today.getUTCFullYear(); month = today.getUTCMonth(); renderCalendar(); });
$('month-view').addEventListener('click', () => { view = 'month'; renderCalendar(); });
$('list-view').addEventListener('click', () => { view = 'list'; renderCalendar(); });
matchMedia('(max-width:520px)').addEventListener('change', event => { if (event.matches) { view = 'list'; renderCalendar(); } });
$('add-posting').addEventListener('click', () => $('add-dialog').showModal());
$('close-add').addEventListener('click', () => $('add-dialog').close());
$('close-detail').addEventListener('click', () => $('detail-dialog').close());
$('browse-demo').addEventListener('click', () => { $('add-dialog').close(); location.hash = 'postings'; });
document.addEventListener('click', event => {
  const posting = event.target.closest('[data-posting]'); if (posting) openPosting(Number(posting.dataset.posting));
  const demo = event.target.closest('[data-demo]'); if (demo) notify(demo.dataset.demo);
  const doc = event.target.closest('[data-document]'); if (doc) { documentKind = doc.dataset.document; renderDocument(); }
  if (event.target.closest('[data-open-documents]')) { $('detail-dialog').close(); location.hash = 'documents'; }
});
window.addEventListener('hashchange', route);
renderCalendar(); route();
