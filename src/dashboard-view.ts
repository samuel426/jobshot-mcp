// Shared date arithmetic is UTC-based; "today" always uses the display time zone.
export function todayKey(now: Date): string {
  const parts = new Intl.DateTimeFormat('en', { timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now);
  return ['year', 'month', 'day'].map(type => parts.find(part => part.type === type)!.value).join('-');
}
export function monthCells(year: number, month: number): (string | null)[] {
  const start = new Date(Date.UTC(year, month - 1, 1)).getUTCDay();
  const days = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return Array.from({ length: Math.ceil((start + days) / 7) * 7 }, (_, index) => {
    const day = index - start + 1;
    return day > 0 && day <= days ? `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}` : null;
  });
}

// Serialized into the standalone HTML after compilation; no imports or network calls.
export function mountDashboard() {
  const data = JSON.parse(document.getElementById('jobshot-data')!.textContent!);
  const entries = data.entries as { id: string; company: string; role: string; date: string | null; kind: string; source_url: string | null }[];
  let today = todayKey(new Date());
  let year = Number(today.slice(0, 4)), month = Number(today.slice(5, 7));
  const $ = (id: string) => document.getElementById(id)!;
  const node = (tag: string, className: string, text?: string) => {
    const element = document.createElement(tag); element.className = className;
    if (text !== undefined) element.textContent = text;
    return element;
  };
  function card(entry: typeof entries[number]) {
    const box = node('article', 'posting');
    box.append(node('strong', 'company', entry.company), node('span', 'role', entry.role));
    box.append(node('span', 'deadline-label', entry.date ? (entry.date < today ? '마감일 지남 · 시간 미확인' : entry.date === today ? '오늘 마감 · 시간 미확인' : '시간 미확인') : entry.kind === 'rolling' ? '상시 채용' : '마감일 확인 필요'));
    if (entry.source_url) {
      try {
        const url = new URL(entry.source_url);
        if (['https:', 'http:'].includes(url.protocol) && !url.username && !url.password) {
          const link = node('a', 'source-link', '공고 원문 ↗') as HTMLAnchorElement;
          link.href = url.href; link.target = '_blank'; link.rel = 'noopener noreferrer';
          link.setAttribute('aria-label', `${entry.company} ${entry.role} 공고 원문`); box.append(link);
        }
      } catch { /* Invalid links never become clickable. */ }
    } else box.append(node('span', 'missing-link', '원문 링크 없음'));
    return box;
  }
  function render() {
    $('month-title').textContent = `${year}년 ${month}월`;
    $('today-label').textContent = `오늘 ${today.replaceAll('-', '.')} · 한국 시간`;
    const prefix = `${year}-${String(month).padStart(2, '0')}`;
    const current = entries.filter(entry => entry.date?.startsWith(prefix));
    $('month-count').textContent = String(current.length);
    $('all-count').textContent = String(entries.length);
    $('soon-count').textContent = String(entries.filter(entry => entry.date && entry.date >= today && entry.date <= new Date(Date.parse(today + 'T00:00:00Z') + 6 * 86400000).toISOString().slice(0, 10)).length);
    const grid = $('days'); grid.replaceChildren();
    for (const key of monthCells(year, month)) {
      const cell = node('div', key ? 'day' : 'day outside');
      if (key) {
        cell.dataset.date = key;
        const label = node('span', 'day-number', String(Number(key.slice(8))));
        cell.setAttribute('aria-label', key);
        if (key === today) { cell.classList.add('today'); label.setAttribute('aria-current', 'date'); label.append(node('small', '', ' 오늘')); }
        cell.append(label);
        entries.filter(entry => entry.date === key).sort((a, b) => a.company.localeCompare(b.company, 'ko')).forEach(entry => cell.append(card(entry)));
      }
      grid.append(cell);
    }
    $('month-empty').hidden = current.length > 0;
    $('empty').hidden = entries.length > 0;
    const undated = entries.filter(entry => !entry.date);
    $('undated-count').textContent = String(undated.length);
    $('undated-list').replaceChildren(...undated.map(card));
    $('undated-empty').hidden = undated.length > 0;
    ($('prev') as HTMLButtonElement).disabled = year === 1900 && month === 1;
    ($('next') as HTMLButtonElement).disabled = year === 2199 && month === 12;
  }
  function shift(delta: number) {
    const date = new Date(Date.UTC(year, month - 1 + delta, 1));
    if (date.getUTCFullYear() < 1900 || date.getUTCFullYear() > 2199) return;
    year = date.getUTCFullYear(); month = date.getUTCMonth() + 1; render();
  }
  $('prev').addEventListener('click', () => shift(-1));
  $('next').addEventListener('click', () => shift(1));
  $('today').addEventListener('click', () => { today = todayKey(new Date()); year = Number(today.slice(0, 4)); month = Number(today.slice(5, 7)); render(); });
  function refresh() { const key = todayKey(new Date()); if (key !== today) { today = key; render(); } }
  window.addEventListener('focus', refresh);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) refresh(); });
  setInterval(refresh, 1000);
  render();
}
