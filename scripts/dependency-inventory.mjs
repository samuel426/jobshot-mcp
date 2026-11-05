// Lockfile declarations, including optional platforms. This is not legal clearance.
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const lock = JSON.parse(readFileSync(new URL('../package-lock.json', import.meta.url), 'utf8'));
const direct = { ...lock.packages[''].dependencies, ...lock.packages[''].devDependencies };
const rows = Object.entries(lock.packages).filter(([path]) => path).map(([path, p]) => {
  const name = path.slice(path.lastIndexOf('node_modules/') + 13);
  return { name, version: p.version, license: p.license || 'UNKNOWN',
    relation: path === `node_modules/${name}` && direct[name] ? '직접' : '전이',
    use: p.dev ? '개발' : '런타임', optional: p.optional ? '예' : '아니요',
  };
}).sort((a, b) => a.name.localeCompare(b.name, 'en') || a.version.localeCompare(b.version, 'en'));
const counts = {};
for (const row of rows) counts[row.license] = (counts[row.license] || 0) + 1;
const text = ['# 의존성 라이선스 선언 목록', '',
  '`node scripts/dependency-inventory.mjs`로 package-lock.json에서 재생성한다. `--check`는 저장된 목록의 최신성을 검사한다.', '',
  '모든 OS의 선택 의존성과 개발 의존성을 포함한 잠금 항목 목록이다. 설치된 패키지 수와 다를 수 있다. 라이선스 선언만으로 배포 의무 검토를 완료했다고 판단하지 않는다. 특히 sharp/libvips에 포함된 네이티브 라이브러리는 별도 확인이 필요하다. [배포 준비 안내](release-readiness.md)를 따른다.', '',
  `총 ${rows.length}개 항목. 누락 선언 ${rows.filter(r => r.license === 'UNKNOWN').length}개.`, '',
  ...Object.entries(counts).sort(([a], [b]) => a.localeCompare(b)).map(([license, count]) => `- ${license}: ${count}`), '',
  '| 패키지 | 버전 | 선언 라이선스 | 관계 | 용도 | 선택 |', '| --- | --- | --- | --- | --- | --- |',
  ...rows.map(r => `| ${r.name} | ${r.version} | ${r.license} | ${r.relation} | ${r.use} | ${r.optional} |`), '',
].join('\n');
const target = fileURLToPath(new URL('../docs/dependency-licenses.md', import.meta.url));
if (process.argv.includes('--check')) {
  if (readFileSync(target, 'utf8') !== text) throw new Error('Dependency inventory is stale. Run node scripts/dependency-inventory.mjs.');
  console.log(`PASS: ${rows.length} lockfile license declarations match the inventory.`);
} else {
  writeFileSync(target, text);
  console.log(`Wrote docs/dependency-licenses.md (${rows.length} entries).`);
}
