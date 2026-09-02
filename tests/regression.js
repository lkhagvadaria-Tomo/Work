// Эх үүсвэрийн порталын бүрэн регрессийн тест.
// Ажиллуулах: npm test  (эсвэл node tests/regression.js)
// playwright-core локалд суугаагүй бол: PW_NODE_MODULES=<node_modules зам> node tests/regression.js
// Chromium-ийн зам: CHROME_PATH env-ээр давхарлан зааж болно.
const path = require('path');
const fs = require('fs');
function req(m) {
  try { return require(m); }
  catch (e) { if (process.env.PW_NODE_MODULES) return require(path.join(process.env.PW_NODE_MODULES, m)); throw e; }
}
const { chromium } = req('playwright-core');
const EXE = process.env.CHROME_PATH || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const OUT = path.join(__dirname, 'out');
fs.mkdirSync(OUT, { recursive: true });

// tiny valid PNG (1x1 red)
const PNG = Buffer.from('89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d49444154789c626001000000ffff03000006000557bfabd40000000049454e44ae426082', 'hex');
fs.writeFileSync(path.join(OUT, 'shot.png'), PNG);

(async () => {
  const browser = await chromium.launch({ executablePath: EXE });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = [];
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  const url = 'file://' + path.resolve(__dirname, '..', 'index.html');
  const shot = n => page.screenshot({ path: path.join(OUT, n), fullPage: false });
  const R = {};

  // UC1: login → account picker resolves identity from email
  await page.goto(url); await page.waitForTimeout(400);
  await shot('v4-01-login.png');
  R.badge = await page.textContent('.proto-badge');
  await page.click('#btnLogin'); await page.waitForTimeout(300);
  R.acctCount = await page.locator('.acct').count();
  await shot('v4-02-picker.png');

  // UC2: login as ADMIN (lkhagvadari) → admin nav visible
  await page.click('.acct[data-email="lkhagvadari.a@netgroup.mn"]'); await page.waitForTimeout(900);
  R.welcomeShown = (await page.evaluate(() => document.getElementById('welcomeWrap').style.display)) === 'flex';
  await page.click('#wcStart'); await page.waitForTimeout(300);
  R.adminTag = await page.isVisible('#sideNav');
  R.navDash = await page.isVisible('#sideDash');
  R.navReg = await page.isVisible('#sideReg');
  R.chooser = await page.isVisible('#cardGoReq');
  R.remindAdminHidden = (await page.evaluate(() => document.getElementById('cfRemindWrap').style.display)) !== 'flex';
  await shot('v4-03-chooser.png');

  // UC3: request flow — F08 early withdrawal (link required, product field)
  await page.click('#cardGoReq'); await page.waitForTimeout(700);
  R.tour = await page.isVisible('#tour');
  if (R.tour) { await page.click('#tourSkip'); await page.waitForTimeout(150); }
  R.senderAuto = await page.textContent('#deptName');
  await page.click('#btnDept'); await page.waitForTimeout(150);
  R.deptBtns = await page.locator('#deptMenu button').count();      // 1 + 20 UB + 29 rural = 50
  R.deptHasZuu = await page.locator('#deptMenu button', { hasText: 'Замын-Үүд салбар' }).count();
  R.deptHeads = await page.locator('#deptMenu div').count();        // 2 бүлгийн гарчиг
  await page.mouse.click(720, 60); await page.waitForTimeout(150);
  R.catCount = await page.locator('#catGrid .cat').count();
  R.urgLevels = await page.locator('#segUrg button').count();
  await page.fill('#catSearch', 'буцаалт'); await page.waitForTimeout(150);
  await page.click('.cat:has-text("буцаалтын")');
  R.prodVisible = await page.isVisible('#fldProduct');
  R.linkReq = await page.isVisible('#linkReq');
  await page.selectOption('#product', { label: '203 · ИТГЭЛЦЭЛ MNT 12.0' });
  await page.fill('#amount', '250000000');
  R.amountFmt = await page.inputValue('#amount');
  await page.fill('#desc', 'Харилцагч эмнэлгийн шалтгаанаар 250 сая ₮-ийн итгэлцлээ хугацаанаас өмнө буцаах хүсэлт гаргасан — торгуульгүй зөвшөөрөх боломж?');
  R.disabledNoAtt = await page.isDisabled('#btnSubmit');

  // UC4: attach image + link with type select
  await page.setInputFiles('#fileR', path.join(OUT, 'shot.png')); await page.waitForTimeout(400);
  R.imgRow = await page.locator('#attReq .att-row').count();
  R.enabledAfterImg = !(await page.isDisabled('#btnSubmit'));
  await page.click('#btnAddLinkR');
  await page.fill('#attReq .att-row input[type=url]', 'https://docs.google.com/document/d/xyz');
  await page.selectOption('#attReq .att-row:nth-child(2) select.type', { label: 'Харилцагчийн хүсэлт' });
  await page.waitForTimeout(150);
  R.attSummary = await page.textContent('#sumAtt');
  R.pct = await page.textContent('#ringPct');
  await shot('v4-04-reqfilled.png');

  // UC5: submit → modal with СГ? no — ЭҮ id, email preview lists typed attachments
  await page.click('#btnSubmit'); await page.waitForTimeout(400);
  R.mTitle = await page.textContent('#mTitle');
  R.mBodyHasAtt = (await page.textContent('#mBody')).includes('[Дэлгэцийн зураг]');
  await shot('v4-05-modal.png');
  await page.click('#mOk'); await page.waitForTimeout(200);

  // UC5b: F01 rate order — base auto-fill, matrix verdict, block over limit
  await page.fill('#catSearch', ''); await page.waitForTimeout(100);
  await page.click('.cat:has-text("Хүүгийн тохируулгын")'); await page.waitForTimeout(150);
  await page.selectOption('#product', { label: '203 · ИТГЭЛЦЭЛ MNT 12.0' }); await page.waitForTimeout(100);
  R.baseAuto = await page.inputValue('#rateNow');
  await page.fill('#amount', '250000000');
  await page.fill('#desc', 'Байнгын харилцагч 12 сарын итгэлцэлдээ 18.5% хүү хүсэж байна, яаралтай шийдвэрлүүлэх шаардлагатай.');
  await page.waitForTimeout(800);
  R.aiPanel = await page.isVisible('#aiCard');
  R.aiHasRate = (await page.textContent('#aiBody')).includes('17.5');
  R.urgSuggest = await page.textContent('#urgSuggest');
  await page.fill('#rateAsk', '18.5');
  await page.setInputFiles('#fileR', path.join(OUT, 'shot.png')); await page.waitForTimeout(300);
  R.verdict185 = await page.textContent('#rateVerdict');
  R.enabled185 = !(await page.isDisabled('#btnSubmit'));
  await page.fill('#rateAsk', '25'); await page.waitForTimeout(100);
  R.tuz25enabled = !(await page.isDisabled('#btnSubmit'));
  R.tuz25 = (await page.textContent('#rateVerdict')).includes('ТУЗ');
  // v1.4: 300 · NET ИТГЭЛЦЭЛ — F01 дээр хориглоно (бүрэн дижитал)
  await page.selectOption('#product', { label: '300 · NET ИТГЭЛЦЭЛ' }); await page.waitForTimeout(150);
  R.p300verdict = await page.textContent('#rateVerdict');
  R.p300blocked = await page.isDisabled('#btnSubmit');
  await page.selectOption('#product', { label: '203 · ИТГЭЛЦЭЛ MNT 12.0' }); await page.waitForTimeout(150);
  await page.fill('#bonus', '0.5'); await page.waitForTimeout(700);
  R.aiCp09 = (await page.textContent('#aiBody')).includes('CP-09');
  R.sumBonus = await page.textContent('#sumBonus');
  await page.fill('#custName', 'Б.Тэст /АА00112233/');
  await page.fill('#rateAsk', '18.0'); await page.waitForTimeout(100);
  await page.click('#btnSubmit'); await page.waitForTimeout(300);
  const mb = await page.textContent('#mBody');
  R.mailHasOrder = mb.includes('NC-01/54-2025');
  R.mailHasBonus = mb.includes('Урамшууллын хувь: 0.5%');
  R.mailHasCust = mb.includes('Б.Тэст');
  R.mailAssignee = mb.includes('Хариуцагч:');
  await shot('v5-order.png');
  await page.click('#mOk'); await page.waitForTimeout(200);

  // UC5c: gdoc link extraction — button appears; graceful degrade outside claude.ai
  await page.click('.cat:has-text("Хүүгийн тохируулгын")'); await page.waitForTimeout(150);
  await page.click('#btnAddLinkR');
  await page.fill('#attReq .att-row input[type=url]', 'https://docs.google.com/document/d/1-fUr1JsQcooqftHpCIUDF5OzSHSzYam55WXahfINRmQ/edit');
  await page.waitForTimeout(150);
  R.extBtnVisible = await page.isVisible('#attReq .ext-btn');
  await page.click('#attReq .ext-btn'); await page.waitForTimeout(400);
  R.extPanel = await page.isVisible('#extractPanel');
  R.extDegrade = (await page.textContent('#extBody')).includes('claude.ai');
  await shot('v6-extract-degrade.png');

  // parser unit test in page context (same structure as approval template, synthetic data)
  R.parser = await page.evaluate(() => {
    const t = [
      '| ХОБХУГ менежер | [АЖИЛТАН_НЭГ](mailto:a1@x.mn) | Боловсруулах |',
      '| ГЗ | [АЖИЛТАН_ХОЁР](mailto:a2@x.mn) | Батлах |',
      '| Харилцагчийн нэр /РД/ | Т.Туршилт /АБ12345678/ |',
      '| Эх үүсвэрийн дүн | 120,000,000.00 ₮ Шинэ |',
      '| Хүү, Хүү төлөх давтамж, Хугацаа | 18.5%, Хугацааны эцэст, 12 сар |',
      '| Гэрээний хүүний хувь | Урамшууллын хувь | Нэмэлт | Нийт |',
      '| 18.5% | 0.5 | 0 | 19.0% |',
      '| Стандарт хүү | ХОУГ | ГЗ | ТУЗ | Гэрээний | Тайлбар |',
      '| 17.5% | 0.5% | 0.5% | 0% | 18.5% | тайлбар |',
    ].join('\n');
    const ex = parseApprovalDoc(t);
    return {
      apr: ex.approvers.length,
      name: ex.fields.custName,
      amt: ex.fields.amount,
      rate: ex.fields.contractRate,
      bonus: ex.fields.bonus,
      std: ex.fields.stdRate,
      term: ex.fields.term,
      payout: ex.fields.payout,
    };
  });

  // v1.4: F10 Дансны тохиргоо + 300 — банкны данс солих хүсэлт зөвшөөрөгдөнө
  await page.fill('#catSearch', ''); await page.waitForTimeout(100);
  await page.click('.cat:has-text("Дансны тохиргооны")'); await page.waitForTimeout(150);
  await page.selectOption('#product', { label: '300 · NET ИТГЭЛЦЭЛ' });
  await page.fill('#amount', '50000000');
  await page.fill('#desc', 'NET ИТГЭЛЦЭЛ 300 бүтээгдэхүүний харилцагч банкны дансаа Хаан банкнаас Голомт банк руу солиулах хүсэлт гаргав.');
  await page.waitForTimeout(700);
  R.f10ok300 = !(await page.isDisabled('#btnSubmit'));
  R.ai300 = (await page.textContent('#aiBody')).includes('NET ИТГЭЛЦЭЛ (300)');
  await shot('v14-f10-300.png');

  // UC6: feedback flow — G05 bug, severity critical
  await page.click('#sideNav .snav[data-view="newview"]'); await page.waitForTimeout(200);
  await page.click('#cardGoFbk'); await page.waitForTimeout(400);
  await page.click('#gtypeGrid .cat:has-text("Системийн алдаа")');
  R.sevVisible = await page.isVisible('#sevRow');
  await page.selectOption('#area', { label: 'Систем, аппликэйшн' });
  await page.click('#segSev button[data-v="Критик"]');
  await page.fill('#fdesc', 'Итгэлцлийн гэрээ хэвлэхэд системийн тооцоолсон хүү гараар оруулсан хүүгээс 0.2 пунктээр зөрж байна.');
  await page.waitForTimeout(150);
  R.slaCritical = await page.textContent('#slaTextF');
  R.fbkEnabled = !(await page.isDisabled('#btnSubmitF'));
  await shot('v4-06-fbk.png');
  await page.click('#btnSubmitF'); await page.waitForTimeout(400);
  R.fbkId = await page.textContent('#mTitle');
  await page.click('#mOk'); await page.waitForTimeout(200);

  // UC7: my records shows both kinds
  await page.click('#sideNav .snav[data-view="myview"]'); await page.waitForTimeout(300);
  R.myItems = await page.locator('.req-item').count();
  R.myBadges = await page.locator('.kind-badge').count();
  await shot('v4-07-my.png');

  // UC8: dashboard with seed data + filter
  await page.click('#sideNav .snav[data-view="dashview"]'); await page.waitForTimeout(300);
  await page.click('#btnSeed'); await page.waitForTimeout(500);
  R.tiles = await page.locator('.tile').count();
  R.trendSvg = await page.isVisible('#chTrendSvg');
  R.hbars = await page.locator('#chCats .hbar').count();
  R.donut = await page.locator('#chStatus svg circle').count();
  await page.click('#dashSeg button[data-v="FBK"]'); await page.waitForTimeout(200);
  R.tileAfterFilter = await page.textContent('.tile .tv');
  await shot('v4-08-dash.png');

  // UC8b: Google Chat alert settings — save, test, log per-submit
  R.chatCard = await page.isVisible('#chatCard');
  await page.fill('#chatUrl', 'https://chat.googleapis.com/v1/spaces/TEST/messages?key=x');
  await page.click('#btnChatTest'); await page.waitForTimeout(600);
  R.chatLogRows = await page.locator('#chatLog > div').count();
  R.chatStatus = (await page.textContent('#chatStatus')).slice(0, 30);
  await shot('v10-chat.png');

  // UC9: registry — admin status change
  await page.click('#sideNav .snav[data-view="regview"]'); await page.waitForTimeout(300);
  R.regRows = await page.locator('#regBody tr').count();
  R.stSelects = await page.locator('.st-select').count();
  await page.locator('.st-select').first().selectOption('Шийдвэрлэсэн'); await page.waitForTimeout(250);
  R.decModal = (await page.evaluate(() => document.getElementById('dModalWrap').style.display)) === 'flex';
  R.decSendDisabled = await page.isDisabled('#dModalSend');
  await page.fill('#dModalText', 'Хүсэлтийг хянаад зөвшөөрөв — нөхцөлийн дагуу шийдвэрлэлээ.');
  await page.fill('#dModalExtra', 'Гэрээг ажлын 1 өдөрт шинэчилнэ үү.');
  await page.click('#dModalSend'); await page.waitForTimeout(300);
  R.decPreview = await page.isVisible('#dPreview');
  R.decMailHasExtra = (await page.textContent('#dBody')).includes('Нэмэлт мэдээлэл');
  await page.click('#dModalOk'); await page.waitForTimeout(200);
  // Болих дарвал статус буцна
  const sel2 = page.locator('#regBody select.st-select').nth(1);
  const prev2 = await sel2.inputValue();
  await sel2.selectOption('Татгалзсан'); await page.waitForTimeout(250);
  R.decRejectLb = await page.textContent('#dTextLb');
  await page.click('#dModalCancel'); await page.waitForTimeout(200);
  R.decCancelRevert = (await sel2.inputValue()) === prev2;
  await page.click('#regKind button[data-v="FBK"]'); await page.waitForTimeout(200);
  R.regFbkOnly = await page.locator('#regBody tr').count();
  await page.click('#regKind button[data-v="REQ"]'); await page.waitForTimeout(200);
  R.assigneeCol = await page.locator('#regBody tr', { hasText: 'ЭҮ-2026-0002' }).locator('td:nth-child(8)').textContent();
  // clarify flow: ask on own request → answer in my records
  await page.locator('#regBody tr', { hasText: 'ЭҮ-2026-0002' }).locator('button:has-text("Тодруулга")').click();
  await page.waitForTimeout(200);
  await page.fill('#cModalText', 'Гэрээний хуулбараа хавсаргаж өгнө үү.');
  await page.click('#cModalSend'); await page.waitForTimeout(300);
  R.clarifyStatus = await page.locator('#regBody tr', { hasText: 'ЭҮ-2026-0002' }).locator('select.st-select').inputValue();
  await page.click('#sideNav .snav[data-view="myview"]'); await page.waitForTimeout(300);
  R.clarifyBox = await page.isVisible('.cf-reply');
  await page.fill('.cf-reply', 'Хавсаргалаа, Drive линкийг шинэчилсэн.');
  await page.click('.cf-reply-btn'); await page.waitForTimeout(300);
  R.historyDetails = await page.locator('#reqList details').count();
  await shot('v7-clarify.png');
  await page.click('#sideNav .snav[data-view="regview"]'); await page.waitForTimeout(300);
  // v1.6: ЭҮ-2026-0002-т шийдвэрийн хариу илгээх — мэйл илгээгч рүү очно
  await page.locator('#regBody tr', { hasText: 'ЭҮ-2026-0002' }).locator('select.st-select').selectOption('Шийдвэрлэсэн');
  await page.waitForTimeout(250);
  await page.fill('#dModalText', '18.0% хүүг Х.Нургүлийн зөвшөөрлөөр баталлаа.');
  await page.fill('#dModalDec', 'DEC-2026-041');
  await page.click('#dModalSend'); await page.waitForTimeout(300);
  R.decMailTo = await page.textContent('#dTo');
  R.decMailDec = (await page.textContent('#dBody')).includes('DEC-2026-041');
  R.decMailSubj = await page.textContent('#dSubj');
  await shot('v16-decision.png');
  await page.click('#dModalOk'); await page.waitForTimeout(200);
  R.decStatusCell = await page.locator('#regBody tr', { hasText: 'ЭҮ-2026-0002' }).locator('select.st-select').inputValue();
  await page.click('#sideNav .snav[data-view="myview"]'); await page.waitForTimeout(300);
  R.decBoxVisible = (await page.textContent('#reqList')).includes('18.0% хүүг Х.Нургүлийн');
  await shot('v16-decision-box.png');
  await page.click('#sideNav .snav[data-view="regview"]'); await page.waitForTimeout(300);
  await shot('v4-09-reg.png');

  // UC10: logout → login as branch USER → no admin nav
  await page.click('#btnLogoutS'); await page.waitForTimeout(200);
  await page.click('#btnLogin'); await page.waitForTimeout(200);
  await page.click('.acct[data-email="baterdene.b@netgroup.mn"]'); await page.waitForTimeout(800);
  if ((await page.evaluate(() => document.getElementById('welcomeWrap').style.display)) === 'flex') {
    await page.click('#wcStart'); await page.waitForTimeout(200);
  }
  R.userNavDash = await page.isVisible('#sideDash');
  R.userAdminTag = await page.isVisible('#sideReg');
  R.userSender = await page.evaluate(() => document.getElementById('deptName').textContent);

  // UC11: persistence across reload
  await page.reload(); await page.waitForTimeout(400);
  await page.click('#btnLogin'); await page.waitForTimeout(200);
  await page.click('.acct[data-email="lkhagvadari.a@netgroup.mn"]'); await page.waitForTimeout(300);
  await page.click('#sideNav .snav[data-view="regview"]'); await page.waitForTimeout(300);
  R.regAfterReload = await page.locator('#regBody tr').count();

  // UC11b: cashflow — tiles, calendar, decision fill, persistence
  await page.click('#sideNav .snav[data-view="cfview"]'); await page.waitForTimeout(400);
  R.cfTiles = await page.locator('#cfTiles .tile').count();
  R.cfCalDays = await page.locator('#cfCal .day.has').count();
  R.cfRows = await page.locator('#cfBody tr:not(.cf-det)').count();
  R.cfMonth = await page.textContent('#cfMonthLbl');
  await page.locator('#cfBody select.cf-dec').first().selectOption('Сунгана'); await page.waitForTimeout(200);
  // v2.1: бүтээгдэхүүн кодоор, салбар «салбар»-гүй богино
  R.cfProdCode = /^\d{3}$/.test((await page.locator('#cfBody tr:not(.cf-det) td:nth-child(4)').first().textContent()).trim());
  R.cfUnitNoSuffix = !(await page.locator('#cfBody tr:not(.cf-det) td:nth-child(7)').first().textContent()).includes('салбар');
  R.cfTsvCode = await page.evaluate(() => /\t\d{3}\t/.test(cfTsv().split('\n')[1]));
  R.cfDetVisible = await page.locator('#cfBody tr.cf-det').first().isVisible();
  R.cfSunFields = await page.locator('#cfBody tr.cf-det').first().locator('.cf-sun:visible').count();
  await page.locator('#cfBody select.cf-dec').nth(1).selectOption('Гарна'); await page.waitForTimeout(200);
  R.cfExitVisible = await page.locator('#cfBody tr.cf-det').nth(1).locator('.cf-how').isVisible();
  await page.locator('#cfBody tr.cf-det').nth(1).locator('.cf-how').selectOption('Данс руу шилжүүлэх');
  await page.locator('#cfBody tr.cf-det').nth(1).locator('.cf-note').fill('Харилцагч орон сууц авна.');
  await page.waitForTimeout(200);
  await page.locator('#cfBody .cf-rate').first().fill('18.0'); await page.waitForTimeout(150);
  R.cfProgress = await page.textContent('#cfProgress');
  // v1.4: Excel рүү хуулах / Excel-ээс буулгах
  R.cfCopyVisible = await page.isVisible('#cfCopy');
  R.cfImportAdmin = await page.isVisible('#cfImport');
  R.cfTsvOk = await page.evaluate(() => { const t = cfTsv(); const L = t.split('\n');
    return L[0].includes('Шийдвэр') && L.length >= 5 && L[1].split('\t').length === 16; });
  await page.click('#cfCopy'); await page.waitForTimeout(300);
  R.cfCopyToast = (await page.textContent('#toast')).slice(0, 20);
  await page.locator('#cfCal .day.has').first().click(); await page.waitForTimeout(200);
  R.cfDayFiltered = await page.locator('#cfBody tr:not(.cf-det)').count();
  await page.click('#cfAllBtn'); await page.waitForTimeout(150);
  await shot('v6-cashflow.png');
  // branch user sees only own unit
  await page.click('#btnLogoutS'); await page.waitForTimeout(150);
  await page.click('#btnLogin'); await page.waitForTimeout(150);
  await page.click('.acct[data-email="sarnai.d@netgroup.mn"]'); await page.waitForTimeout(800);
  R.welcomeUser = (await page.evaluate(() => document.getElementById('welcomeWrap').style.display)) === 'flex';
  await page.click('#wcStart'); await page.waitForTimeout(600);
  R.remindShown = (await page.evaluate(() => document.getElementById('cfRemindWrap').style.display)) === 'flex';
  R.cfNavCnt = await page.textContent('#cfNavCntS');
  await shot('v7-remind.png');
  await page.click('#cfRemindGo'); await page.waitForTimeout(300);
  R.remindGoesCf = await page.isVisible('#cfCal');
  R.cfBranchUnits = await page.evaluate(() => [...new Set([...document.querySelectorAll('#cfBody tr:not(.cf-det) td:nth-child(7)')].map(t => t.textContent))]);
  R.cfUnitSelHidden = !(await page.isVisible('#cfUnit'));
  R.cfImportUserHidden = !(await page.isVisible('#cfImport'));
  // persistence of decision after reload (as admin)
  await page.reload(); await page.waitForTimeout(400);
  await page.click('#btnLogin'); await page.waitForTimeout(150);
  await page.click('.acct[data-email="lkhagvadari.a@netgroup.mn"]'); await page.waitForTimeout(300);
  await page.click('#sideNav .snav[data-view="cfview"]'); await page.waitForTimeout(300);
  R.cfDecPersist = await page.locator('#cfBody select.cf-dec').first().inputValue();

  // UC12: theme toggle
  await page.click('#btnThemeS'); await page.waitForTimeout(300);
  R.theme = await page.evaluate(() => document.documentElement.getAttribute('data-theme'));
  await page.click('#sideNav .snav[data-view="dashview"]'); await page.waitForTimeout(300);
  await shot('v4-10-dark-dash.png');

  // v1.4: Excel-ээс буулгах — админ жагсаалт солино
  await page.click('#sideNav .snav[data-view="cfview"]'); await page.waitForTimeout(300);
  await page.click('#cfImport'); await page.waitForTimeout(200);
  R.cfImpModal = (await page.evaluate(() => document.getElementById('cfImpWrap').style.display)) === 'flex';
  await page.fill('#cfImpTxt', 'Өдөр\tДанс\tХарилцагч\tБүтээгдэхүүн\tДүн\tХүү\tСалбар\n'
    + '15\t500111222\tТ.Туршилт\tИТГЭЛЦЭЛ MNT 12.0\t120,000,000\t17.5\tБаянгол салбар\n'
    + '2026.10.22\t500333444\tД.Демо\tИТГЭЛЦЭЛ MNT 6.0\t60000000\t15\tЗамын-Үүд салбар');
  await page.waitForTimeout(200);
  R.cfImpInfo = await page.textContent('#cfImpInfo');
  await page.click('#cfImpApply'); await page.waitForTimeout(400);
  R.cfImpRows = await page.locator('#cfBody tr:not(.cf-det)').count();
  R.cfImpUnits = await page.evaluate(() => [...document.querySelectorAll('#cfBody tr:not(.cf-det) td:nth-child(7)')].map(t => t.textContent));
  await shot('v14-cf-import.png');

  // v1.7: процессын заавар — nav, panel switching, агуулга, CTA, нүүрийн хайлт
  await page.click('#sideNav .snav[data-view="guideview"]'); await page.waitForTimeout(300);
  R.guideExt = await page.isVisible('#gExt');
  await shot('v17-guide.png');
  await page.click('#gSeg button[data-v="part"]'); await page.waitForTimeout(150);
  R.guidePart = (await page.isVisible('#gPart')) && !(await page.isVisible('#gExt'));
  await page.click('#gSeg button[data-v="close"]'); await page.waitForTimeout(150);
  R.guideCloseHasBreakage = (await page.textContent('#gClose')).includes('2.4%');
  R.guideContacts = (await page.textContent('#guideview')).includes('Э.Эрхбаяр');
  await page.click('[data-gcat="F08"]'); await page.waitForTimeout(350);
  R.guideCtaF08 = (await page.textContent('#sumCat')).includes('F08');
  await page.click('#sideNav .snav[data-view="newview"]'); await page.waitForTimeout(250);
  await page.fill('#homeSearch', 'сунгах процесс'); await page.waitForTimeout(250);
  R.guideSearch = (await page.textContent('#homeResults')).includes('Процессын заавар');
  await page.keyboard.press('Escape'); await page.waitForTimeout(100);

  // v1.8: сунгалтын 4 төрөл + хүүгийн зөвшөөрөл шалгагч
  await page.click('#sideNav .snav[data-view="guideview"]'); await page.waitForTimeout(250);
  await page.click('#gSeg button[data-v="ext"]'); await page.waitForTimeout(150);
  const gext = await page.textContent('#gExt');
  R.gTypes4 = gext.includes('Үндсэн төлбөр нэмэгдүүлж') && gext.includes('капиталжуулж') && gext.includes('Үндсэн төлбөр дангаар');
  await page.selectOption('#gcType', 'T2'); await page.waitForTimeout(100);
  R.gcExtraShown = await page.isVisible('#gcExtraWrap');
  await page.fill('#gcAmt', '190000000');
  await page.fill('#gcExtra', '15000000');
  await page.fill('#gcAsk', '18.5'); await page.waitForTimeout(150);
  const o1 = await page.textContent('#gcOut');
  R.gcTotal205 = o1.includes('205,000,000');
  R.gcNurgul = o1.includes('Нургүл') && o1.includes('В-8');
  await page.fill('#gcAsk', '19.5'); await page.waitForTimeout(150);
  R.gcKhunshagai = (await page.textContent('#gcOut')).includes('Хуншагай');
  await page.fill('#gcAsk', '21'); await page.waitForTimeout(150);
  R.gcTuz = (await page.textContent('#gcOut')).includes('ТУЗ');
  await shot('v18-guide-calc.png');
  await page.selectOption('#gcType', 'T1'); await page.waitForTimeout(100);
  R.gcExtraHidden = !(await page.isVisible('#gcExtraWrap'));
  await page.fill('#gcAmt', '40000000'); await page.fill('#gcAsk', '18'); await page.waitForTimeout(150);
  R.gcBlock49 = (await page.textContent('#gcOut')).includes('нэмэгдүүлэхгүй');
  await page.fill('#gcAsk', '17'); await page.waitForTimeout(150);
  R.gcBase = (await page.textContent('#gcOut')).includes('шаардахгүй');
  // v1.9: Данс нээлт — 12 шат таб
  R.gTabs = await page.locator('#gSeg button').count();
  await page.click('#gSeg button[data-v="open"]'); await page.waitForTimeout(150);
  const gop = await page.textContent('#gOpen');
  R.gOpenProc = gop.includes('PROC-IPPDD-FUND-001');
  R.gOpenGate = gop.includes('adverse media') && gop.includes('В-10');
  R.gOpenLadder = gop.includes('200–499 сая CIO');
  R.gOpenEom = gop.includes('Investment Product');
  await shot('v19-account-open.png');

  // v1.5: .xlsx файлаас import (SheetJS cdnjs-ээс — сүлжээгүй орчинд үнэнч fallback)
  const xf = path.join(__dirname, 'cf-test.xlsx');
  if (fs.existsSync(xf)) {
    await page.click('#sideNav .snav[data-view="cfview"]'); await page.waitForTimeout(200);
    await page.click('#cfImport'); await page.waitForTimeout(200);
    await page.setInputFiles('#cfImpFileIn', xf); await page.waitForTimeout(4000);
    R.cfFileInfo = await page.textContent('#cfImpInfo');
    R.cfFileTxt = (await page.inputValue('#cfImpTxt')).split('\n').length;
    await page.click('#cfImpCancel'); await page.waitForTimeout(150);
  }
  // v1.5: аль хэдийн угтагдсан хэрэглэгчид модал дахин гарахгүй
  await page.click('#btnLogoutS'); await page.waitForTimeout(150);
  await page.click('#btnLogin'); await page.waitForTimeout(150);
  await page.click('.acct[data-email="lkhagvadari.a@netgroup.mn"]'); await page.waitForTimeout(800);
  R.welcomeOnce = (await page.evaluate(() => document.getElementById('welcomeWrap').style.display)) !== 'flex';
  // «?» товч нүүрэн дээр угтах модалыг нээнэ
  await page.click('#btnHelpS'); await page.waitForTimeout(200);
  R.helpOpensWelcome = (await page.evaluate(() => document.getElementById('welcomeWrap').style.display)) === 'flex';
  await page.click('#wcStart'); await page.waitForTimeout(150);

  R.errors = errors;
  console.log(JSON.stringify(R, null, 1));
  await browser.close();
})().catch(e => { console.error('FATAL', e); process.exit(1); });
