/* Нэткапитал WorkOS — хэрэглээний кейсийн иж бүрдэл (UC-01..UC-14).
   Бодит хүмүүсийн өдөр тутмын үйлдлийг дуурайж, бүтэн урсгалыг шалгана. */
import { chromium } from '@playwright/test';
const SC = process.env.WORKOS_DIR || new URL('..', import.meta.url).pathname;
const URL = 'file://' + SC + '/workos-demo.html';
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const ctx = await b.newContext({ viewport: { width: 1440, height: 1000 }, permissions: ['clipboard-read','clipboard-write'] });
const p = await ctx.newPage();
const errs = []; p.on('pageerror', e => errs.push(e.message));
const R = [];
const ok = (id, cond, note) => { R.push({ id, pass: !!cond, note }); console.log((cond ? '✅' : '❌') + ' ' + id + (note ? ' — ' + note : '')); };
const login = async n => { await p.click(`#acctList button:has-text("${n}")`); await p.waitForSelector('#app:not([hidden])'); };
const logout = async () => { await p.click('.topbar [data-act="logout"]'); await p.waitForSelector('#acctList button'); };
const openW = async id => p.evaluate(w => { S.tab = "work"; S.workId = w; render(); }, id);
await p.goto(URL);

// UC-01 Шинэ ажилтан анх нэвтрэх: өөрийн OKR-ээ харах
await login('А.Лхагвадарь');
await p.click('[role=tab][data-tab="okr"]');
const uc1 = await p.evaluate(() => ({ h1: document.querySelector('main h1').textContent, krs: myKrs().length,
  others: krList().filter(k => (k.owner||'LA') !== S.p).length }));
ok('UC-01 ажилтан өөрийн OKR', /А\.Лхагвадарь/.test(uc1.h1) && uc1.krs === 10, uc1.krs + ' KR, бусдынх ' + uc1.others);

// UC-02 Ажилтан ажлаа хийж захиралд илгээх (хянагчгүй)
await p.click('[role=tab][data-tab="home"]');
await p.click('tr[data-open="W002"]');
await p.click('summary:has-text("Deliverable холбох")');
for (const [req, nm] of [["Checklist","Checklist v1.0"],["Стандарт","Стандарт v1.0"],["Журам","Журам v1.0"]]) {
  await p.selectOption('[data-f="req"]', req);
  await p.fill('[data-f="name"]', nm);
  await p.fill('[data-f="url"]', 'https://docs.google.com/document/d/1abcdefghij/edit');
  await p.check('[data-f="final"]');
  await p.click('button[data-act="addDeliverable"]');
  await p.waitForTimeout(80);
}
await p.click('summary:has-text("Нотолгоо холбох")');
await p.fill('[data-f="etitle"]', 'Батлагдсан багц');
await p.fill('[data-f="eurl"]', 'https://drive.google.com/file/d/1x/view');
await p.click('button[data-act="addEvidence"]');
await p.click('button[data-act="selfQc"]');
await p.click('main [data-act="submitReview"]');
const uc2 = await p.evaluate(() => S.works.W002.status);
ok('UC-02 ажилтан → захирал (хянагчгүй)', uc2 === 'WAITING_APPROVAL', uc2);

// UC-03 Ажилтан өөрийгөө батлах гэж оролдох → хориглох
const uc3 = await p.evaluate(() => {
  const t = f => { try { f(); return "ЗӨВШӨӨРӨГДСӨН"; } catch (e) { return "хориглов"; } };
  const a = S.works.W002.approvals.find(x => x.decision === "PENDING");
  return { app: t(() => A.decideApproval("W002", a.id, "APPROVE", "")), sign: t(() => A.signClosure("W002","APPROVE","")) };
});
ok('UC-03 өөрийгөө батлах хориотой', uc3.app === 'хориглов' && uc3.sign === 'хориглов', JSON.stringify(uc3));

// UC-04 Захирал нэг дараалалдаа ирж, хянаж батлах
await logout(); await login('О.Мөнх-Эрдэнэ');
const badge = await p.evaluate(() => document.querySelector('[data-tab=queue] .cnt')?.textContent);
await p.click('[role=tab][data-tab="queue"]');
await p.click('main button[data-app="APPROVE"]');
const uc4 = await p.evaluate(() => S.works.W002.status + '|' + S.works.W002.approvals.slice(-1)[0].by);
ok('UC-04 захирлын нэг дараалал', uc4.startsWith('APPROVED') && /Захирал/.test(uc4), 'badge=' + badge + ' · ' + uc4);

// UC-05 Захирал баримтыг хүнээр хянаж G8 хангах
await openW('W002');
await p.click('button[data-act="eomManual"]');
await p.click('button[data-endorse="APPROVE"]');
const uc5 = await p.evaluate(() => !!S.works.W002.eomManual && (S.works.W002.endorsements||[]).length);
ok('UC-05 G8 хүний хяналт + зөвшөөрөлт', uc5 >= 1, 'зөвшөөрөлт ' + uc5);

// UC-06 CIO дараалалдаа ирж зөвшөөрөх
await logout(); await login('Х.Нургүл');
await p.click('[role=tab][data-tab="queue"]');
await p.click('main button[data-ciosign="APPROVE"]');
const uc6 = await p.evaluate(() => S.works.W002.cioSign.decision);
ok('UC-06 CIO G9 зөвшөөрөлт', uc6 === 'APPROVE', uc6);

// UC-07 CIO өөрийн OKR импортлож, ажилтны KR-ийг холбоод cascade харах
await p.click('[role=tab][data-tab="okr"]');
await p.evaluate(() => {
  A.importOkr([{obj:"C1",objTitle:"Хөрөнгө оруулалтын үр ашиг",objWeight:50,code:"KR1",title:"Итгэлцлийн өгөөж 12%",weight:60,deadline:"2026-09-30",status:"IN_PROGRESS",achievement:30},
               {obj:"C1",objTitle:"Хөрөнгө оруулалтын үр ашиг",objWeight:50,code:"KR2",title:"Данс нээлтийн процесс ISCMD-д нэвтрүүлэх",weight:40,deadline:"2026-09-23",status:"IN_PROGRESS",achievement:10}],
    "NG", "", "CIO OKR sheet");
  const parent = myKrs().find(k => k.code === "KR2").id;
  ["O1-KR1","O1-KR2","O2-KR1"].forEach(k => A.setKrParent(k, parent));
  render();
});
const uc7 = await p.evaluate(() => {
  const sec = [...document.querySelectorAll('section.card')].find(s => /Доош хуваарилалт/.test(s.textContent));
  return { my: myKrs().length, kids: /А\.Лхагвадарь/.test(sec.textContent),
    works: sec.querySelectorAll('ul.list li').length, rollup: sec.querySelectorAll('table tbody tr').length,
    verdicts: [...sec.querySelectorAll('.verdict')].map(v => v.textContent).filter(Boolean).length };
});
ok('UC-07 CIO OKR + cascade', uc7.my === 2 && uc7.kids && uc7.works >= 3 && uc7.rollup === 1 && uc7.verdicts >= 3, JSON.stringify(uc7));

// UC-08 Хаалт: гейт + sign-off (эзэмшигч → захирал)
await logout(); await login('А.Лхагвадарь');
await openW('W002');
await p.click('button[data-act="submitClosure"]');
const gate = await p.evaluate(() => S.works.W002.gate.result);
await logout(); await login('О.Мөнх-Эрдэнэ');
await p.click('[role=tab][data-tab="queue"]');
await p.click('main button[data-sign="APPROVE"]');
const uc8 = await p.evaluate(() => S.works.W002.status);
ok('UC-08 гейт + sign-off → ХААГДСАН', gate !== 'FAIL' && uc8 === 'CLOSED', 'гейт=' + gate + ' → ' + uc8);

// UC-09 Хүлээлцэх: зөвхөн газрын захиралд, зөвхөн тэр баталгаажуулна
await logout(); await login('А.Лхагвадарь');
await openW('W002');
const opts = await p.locator('[data-f="hoto"] option').allTextContents();
await p.selectOption('[data-f="hoto"]', await p.evaluate(() => document.querySelector('[data-f="hoto"]').options[0].value));
await p.fill('[data-f="honote"]', 'Эцсийн багц v1.0 — 3 баримт');
await p.click('button[data-act="handover"]');
await logout(); await login('Өлзийбаяр Сандагдорж');
const wrongBoss = await p.evaluate(() => { try { A.confirmHandover("W002", true); return "ЗӨВШӨӨРӨГДСӨН"; } catch (e) { return "хориглов"; } });
await logout(); await login('О.Мөнх-Эрдэнэ');
await p.click('[role=tab][data-tab="queue"]');
await p.click('main button[data-hoconf="1"]');
await openW('W002');
const chain = await p.locator('.chain2 li.done').count(), chainAll = await p.locator('.chain2 li').count();
ok('UC-09 хүлээлцэх дүрэм', opts.every(o => /захирал|CIO/i.test(o)) && wrongBoss === 'хориглов' && chain === chainAll,
   'сонголт=' + opts.length + ' · өөр захирал=' + wrongBoss + ' · гинж ' + chain + '/' + chainAll);

// UC-10 Аудитын гинж бүрэн бүтэн, чимхэхэд илэрнэ
const uc10a = await p.evaluate(() => verifyAuditChain(S.works.W002.audit).ok);
const uc10b = await p.evaluate(() => {
  const w = JSON.parse(JSON.stringify(S.works.W002));
  w.audit[2].action = "ЗАСВАРЛАСАН";
  return verifyAuditChain(w.audit);
});
ok('UC-10 tamper-evident аудит', uc10a === true && uc10b.ok === false, 'бүтэн=' + uc10a + ' · чимхсэн илрэв=' + (!uc10b.ok));

// UC-11 Check-in хурлын тайлан
await p.click('[role=tab][data-tab="checkin"]');
const uc11 = await p.evaluate(() => ({
  works: document.querySelectorAll('.ci-work').length,
  full: [...document.querySelectorAll('.ci-work .verdict')].filter(v => /Бүрэн/.test(v.textContent)).length,
  krRows: document.querySelectorAll('main table tbody tr').length,
  print: !!document.querySelector('[data-act="print"]') }));
ok('UC-11 check-in тайлан', uc11.works === 5 && uc11.full === 1 && uc11.krRows >= 10 && uc11.print, JSON.stringify(uc11));

// UC-12 Мэдэгдэл бэлтгэх (Chat/и-мэйлд хуулах)
await p.click('[role=tab][data-tab="home"]');
await p.click('button[data-act="digest"]');
const digest = await p.evaluate(() => navigator.clipboard.readText().catch(() => ''));
ok('UC-12 мэдэгдлийн товчлол', digest.length > 60 && /Нэткапитал WorkOS/.test(digest), digest.split('\n').length + ' мөр');

// UC-13 Нөөшлөх → сэргээх
await p.click('[role=tab][data-tab="admin"]');
await p.click('button[data-act="backup"]');
const bkp = await p.evaluate(() => navigator.clipboard.readText().catch(() => ''));
const restored = await p.evaluate(async (json) => {
  const before = Object.keys(S.works).length;
  delete S.works.W005; render();
  A.restore(json);
  return { before, after: Object.keys(S.works).length };
}, bkp);
ok('UC-13 нөөшлөх/сэргээх', bkp.length > 5000 && restored.after === restored.before, Math.round(bkp.length/1024) + 'KB · ' + JSON.stringify(restored));

// UC-14 500 ажилтай масштаб + хуудаслалт
const perf = await p.evaluate(() => {
  const base = JSON.parse(JSON.stringify(S.works.W001));
  for (let i = 0; i < 500; i++) { const w = JSON.parse(JSON.stringify(base)); w.id = "X" + i; w.code = "IPPDD-X" + i; S.works[w.id] = w; }
  S.tab = "home"; S.page = 0;
  const t0 = performance.now(); render(); const home = performance.now() - t0;
  const rows = document.querySelectorAll('main tbody tr').length;
  const pager = !!document.querySelector('[data-page]');
  S.tab = "checkin"; const t2 = performance.now(); render(); const ci = performance.now() - t2;
  return { works: Object.keys(S.works).length, homeMs: Math.round(home), rows, pager, checkinMs: Math.round(ci) };
});
ok('UC-14 масштаб + хуудаслалт', perf.homeMs < 120 && perf.rows === 50 && perf.pager, JSON.stringify(perf));

console.log('\nERRORS: ' + JSON.stringify(errs.slice(0, 6)));
console.log('ДҮН: ' + R.filter(r => r.pass).length + '/' + R.length + ' кейс ногоон');
await b.close();
process.exit(R.every(r => r.pass) && !errs.length ? 0 : 1);
