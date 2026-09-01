const { chromium } = require('playwright-core');
const path = require('path');
const fs = require('fs');

// tiny valid PNG (1x1 red)
const PNG = Buffer.from('89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d49444154789c626001000000ffff03000006000557bfabd40000000049454e44ae426082', 'hex');
fs.writeFileSync(path.join(__dirname, 'shot.png'), PNG);

(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = [];
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  const url = 'file:///home/user/Work/index.html';
  const shot = n => page.screenshot({ path: path.join(__dirname, n), fullPage: false });
  const R = {};

  // UC1: login → account picker resolves identity from email
  await page.goto(url); await page.waitForTimeout(400);
  await shot('v4-01-login.png');
  await page.click('#btnLogin'); await page.waitForTimeout(300);
  R.acctCount = await page.locator('.acct').count();
  await shot('v4-02-picker.png');

  // UC2: login as ADMIN (lkhagvadari) → admin nav visible
  await page.click('.acct[data-email="lkhagvadari.a@netgroup.mn"]'); await page.waitForTimeout(400);
  R.adminTag = await page.isVisible('#adminTag');
  R.navDash = await page.isVisible('#navDash');
  R.navReg = await page.isVisible('#navReg');
  R.chooser = await page.isVisible('#cardGoReq');
  R.remindAdminHidden = (await page.evaluate(() => document.getElementById('cfRemindWrap').style.display)) !== 'flex';
  await shot('v4-03-chooser.png');

  // UC3: request flow — F08 early withdrawal (link required, product field)
  await page.click('#cardGoReq'); await page.waitForTimeout(700);
  R.tour = await page.isVisible('#tour');
  if (R.tour) { await page.click('#tourSkip'); await page.waitForTimeout(150); }
  R.senderAuto = await page.textContent('#deptName');
  R.catCount = await page.locator('#catGrid .cat').count();
  R.urgLevels = await page.locator('#segUrg button').count();
  await page.fill('#catSearch', 'буцаалт'); await page.waitForTimeout(150);
  await page.click('.cat:has-text("буцаалтын")');
  R.prodVisible = await page.isVisible('#fldProduct');
  R.linkReq = await page.isVisible('#linkReq');
  await page.selectOption('#ptype', { label: 'Итгэлцэл ₮' });
  await page.selectOption('#term', { label: '12 сар' });
  await page.fill('#amount', '250000000');
  R.amountFmt = await page.inputValue('#amount');
  await page.fill('#desc', 'Харилцагч эмнэлгийн шалтгаанаар 250 сая ₮-ийн итгэлцлээ хугацаанаас өмнө буцаах хүсэлт гаргасан — торгуульгүй зөвшөөрөх боломж?');
  R.disabledNoAtt = await page.isDisabled('#btnSubmit');

  // UC4: attach image + link with type select
  await page.setInputFiles('#fileR', path.join(__dirname, 'shot.png')); await page.waitForTimeout(400);
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
  await page.selectOption('#ptype', { label: 'Итгэлцэл ₮' });
  await page.selectOption('#term', { label: '12 сар' }); await page.waitForTimeout(100);
  R.baseAuto = await page.inputValue('#rateNow');
  await page.fill('#amount', '250000000');
  await page.fill('#desc', 'Байнгын харилцагч 12 сарын итгэлцэлдээ 18.5% хүү хүсэж байна, яаралтай шийдвэрлүүлэх шаардлагатай.');
  await page.waitForTimeout(800);
  R.aiPanel = await page.isVisible('#aiCard');
  R.aiHasRate = (await page.textContent('#aiBody')).includes('17.5');
  R.urgSuggest = await page.textContent('#urgSuggest');
  await page.fill('#rateAsk', '18.5');
  await page.setInputFiles('#fileR', require('path').join(__dirname, 'shot.png')); await page.waitForTimeout(300);
  R.verdict185 = await page.textContent('#rateVerdict');
  R.enabled185 = !(await page.isDisabled('#btnSubmit'));
  await page.fill('#rateAsk', '25'); await page.waitForTimeout(100);
  R.tuz25enabled = !(await page.isDisabled('#btnSubmit'));
  R.tuz25 = (await page.textContent('#rateVerdict')).includes('ТУЗ');
  await page.fill('#bonus', '0.5');
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

  // UC6: feedback flow — G05 bug, severity critical
  await page.click('nav.views button[data-view="newview"]'); await page.waitForTimeout(200);
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
  await page.click('nav.views button[data-view="myview"]'); await page.waitForTimeout(300);
  R.myItems = await page.locator('.req-item').count();
  R.myBadges = await page.locator('.kind-badge').count();
  await shot('v4-07-my.png');

  // UC8: dashboard with seed data + filter
  await page.click('nav.views button[data-view="dashview"]'); await page.waitForTimeout(300);
  await page.click('#btnSeed'); await page.waitForTimeout(500);
  R.tiles = await page.locator('.tile').count();
  R.trendSvg = await page.isVisible('#chTrendSvg');
  R.hbars = await page.locator('#chCats .hbar').count();
  R.donut = await page.locator('#chStatus svg circle').count();
  await page.click('#dashSeg button[data-v="FBK"]'); await page.waitForTimeout(200);
  R.tileAfterFilter = await page.textContent('.tile .tv');
  await shot('v4-08-dash.png');

  // UC9: registry — admin status change
  await page.click('nav.views button[data-view="regview"]'); await page.waitForTimeout(300);
  R.regRows = await page.locator('#regBody tr').count();
  R.stSelects = await page.locator('.st-select').count();
  await page.locator('.st-select').first().selectOption('Шийдвэрлэсэн'); await page.waitForTimeout(200);
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
  await page.click('nav.views button[data-view="myview"]'); await page.waitForTimeout(300);
  R.clarifyBox = await page.isVisible('.cf-reply');
  await page.fill('.cf-reply', 'Хавсаргалаа, Drive линкийг шинэчилсэн.');
  await page.click('.cf-reply-btn'); await page.waitForTimeout(300);
  R.historyDetails = await page.locator('#reqList details').count();
  await shot('v7-clarify.png');
  await page.click('nav.views button[data-view="regview"]'); await page.waitForTimeout(300);
  await shot('v4-09-reg.png');

  // UC10: logout → login as branch USER → no admin nav
  await page.click('#btnLogout'); await page.waitForTimeout(200);
  await page.click('#btnLogin'); await page.waitForTimeout(200);
  await page.click('.acct[data-email="baterdene.b@netgroup.mn"]'); await page.waitForTimeout(300);
  R.userNavDash = await page.isVisible('#navDash');
  R.userAdminTag = await page.isVisible('#adminTag');
  R.userSender = await page.evaluate(() => document.getElementById('deptName').textContent);

  // UC11: persistence across reload
  await page.reload(); await page.waitForTimeout(400);
  await page.click('#btnLogin'); await page.waitForTimeout(200);
  await page.click('.acct[data-email="lkhagvadari.a@netgroup.mn"]'); await page.waitForTimeout(300);
  await page.click('nav.views button[data-view="regview"]'); await page.waitForTimeout(300);
  R.regAfterReload = await page.locator('#regBody tr').count();

  // UC11b: cashflow — tiles, calendar, decision fill, persistence
  await page.click('nav.views button[data-view="cfview"]'); await page.waitForTimeout(400);
  R.cfTiles = await page.locator('#cfTiles .tile').count();
  R.cfCalDays = await page.locator('#cfCal .day.has').count();
  R.cfRows = await page.locator('#cfBody tr:not(.cf-det)').count();
  R.cfMonth = await page.textContent('#cfMonthLbl');
  await page.locator('#cfBody select.cf-dec').first().selectOption('Сунгана'); await page.waitForTimeout(200);
  R.cfDetVisible = await page.locator('#cfBody tr.cf-det').first().isVisible();
  R.cfSunFields = await page.locator('#cfBody tr.cf-det').first().locator('.cf-sun:visible').count();
  await page.locator('#cfBody select.cf-dec').nth(1).selectOption('Гарна'); await page.waitForTimeout(200);
  R.cfExitVisible = await page.locator('#cfBody tr.cf-det').nth(1).locator('.cf-how').isVisible();
  await page.locator('#cfBody tr.cf-det').nth(1).locator('.cf-how').selectOption('Данс руу шилжүүлэх');
  await page.locator('#cfBody tr.cf-det').nth(1).locator('.cf-note').fill('Харилцагч орон сууц авна.');
  await page.waitForTimeout(200);
  await page.locator('#cfBody .cf-rate').first().fill('18.0'); await page.waitForTimeout(150);
  R.cfProgress = await page.textContent('#cfProgress');
  await page.locator('#cfCal .day.has').first().click(); await page.waitForTimeout(200);
  R.cfDayFiltered = await page.locator('#cfBody tr:not(.cf-det)').count();
  await page.click('#cfAllBtn'); await page.waitForTimeout(150);
  await shot('v6-cashflow.png');
  // branch user sees only own unit
  await page.click('#btnLogout'); await page.waitForTimeout(150);
  await page.click('#btnLogin'); await page.waitForTimeout(150);
  await page.click('.acct[data-email="sarnai.d@netgroup.mn"]'); await page.waitForTimeout(900);
  R.remindShown = (await page.evaluate(() => document.getElementById('cfRemindWrap').style.display)) === 'flex';
  R.cfNavCnt = await page.textContent('#cfNavCnt');
  await shot('v7-remind.png');
  await page.click('#cfRemindGo'); await page.waitForTimeout(300);
  R.remindGoesCf = await page.isVisible('#cfCal');
  R.cfBranchUnits = await page.evaluate(() => [...new Set([...document.querySelectorAll('#cfBody tr:not(.cf-det) td:nth-child(7)')].map(t => t.textContent))]);
  R.cfUnitSelHidden = !(await page.isVisible('#cfUnit'));
  // persistence of decision after reload (as admin)
  await page.reload(); await page.waitForTimeout(400);
  await page.click('#btnLogin'); await page.waitForTimeout(150);
  await page.click('.acct[data-email="lkhagvadari.a@netgroup.mn"]'); await page.waitForTimeout(300);
  await page.click('nav.views button[data-view="cfview"]'); await page.waitForTimeout(300);
  R.cfDecPersist = await page.locator('#cfBody select.cf-dec').first().inputValue();

  // UC12: theme toggle
  await page.click('#btnTheme'); await page.waitForTimeout(300);
  R.theme = await page.evaluate(() => document.documentElement.getAttribute('data-theme'));
  await page.click('nav.views button[data-view="dashview"]'); await page.waitForTimeout(300);
  await shot('v4-10-dark-dash.png');

  R.errors = errors;
  console.log(JSON.stringify(R, null, 1));
  await browser.close();
})().catch(e => { console.error('FATAL', e); process.exit(1); });
