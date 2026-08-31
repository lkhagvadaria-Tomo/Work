const { chromium } = require('playwright-core');
const path = require('path');

(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = [];
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  const url = 'file:///home/user/Work/index.html';
  const shot = n => page.screenshot({ path: path.join(__dirname, n), fullPage: false });
  const R = {};

  // UC1 login renders
  await page.goto(url); await page.waitForTimeout(400);
  await shot('v2-01-login.png');

  // UC2 login → app + tour
  await page.click('#btnLogin'); await page.waitForTimeout(900);
  R.tour = await page.isVisible('#tour');
  await shot('v2-02-tour.png');
  for (let i = 0; i < 4; i++) { await page.click('#tourNext'); await page.waitForTimeout(200); }
  R.tourGone = !(await page.isVisible('#tour'));

  // UC3 branch change
  await page.click('#btnDept'); await page.waitForTimeout(150);
  await page.click('.dept-menu button:has-text("Дархан салбар")');
  R.branch = await page.textContent('#deptName');

  // UC4 search + select F01 → product/rate fields appear, link required
  await page.fill('#catSearch', 'хүү'); await page.waitForTimeout(150);
  R.filtered = await page.locator('.cat').count();
  await page.click('.cat:has-text("хүүгийн тохируулгын")');
  R.prodVisible = await page.isVisible('#fldProduct');
  R.ratesVisible = await page.isVisible('#fldRates');
  R.linkReq = await page.isVisible('#linkReq');
  R.drivePath = await page.textContent('#drivePath');

  // UC5 fill fields; amount formats with commas
  await page.selectOption('#product', { label: 'Итгэлцэл — 12 сар' });
  await page.fill('#amount', '250000000');
  R.amountFmt = await page.inputValue('#amount');
  await page.fill('#rateNow', '14.4'); await page.fill('#rateAsk', '15.0');
  await page.click('#segClient button[data-v="Байгууллага"]');
  await page.fill('#desc', '3 жил хамтарсан байгууллага харилцагч 250 сая ₮-ийн итгэлцлээ сунгах хүсэлтэй, өрсөлдөгчийн 15.2% саналтай тул хүү нэмэх боломж хүсэв.');
  R.disabledBeforeLink = await page.isDisabled('#btnSubmit');

  // UC6 bad rate blocks
  await page.fill('#rateAsk', '55');
  await page.fill('.link-row input', 'https://drive.google.com/file/d/abc/view');
  await page.waitForTimeout(150);
  R.badRateBlocks = await page.isDisabled('#btnSubmit');
  R.badRateNote = await page.textContent('#submitNote');
  await page.fill('#rateAsk', '15.0'); await page.waitForTimeout(150);
  R.enabled = !(await page.isDisabled('#btnSubmit'));
  R.pct = await page.textContent('#ringPct');
  R.sumRate = await page.textContent('#sumRate');
  await shot('v2-03-filled.png');

  // UC7 urgent changes SLA
  await page.click('#segUrg button[data-v="Яаралтай"]'); await page.waitForTimeout(100);
  R.slaUrgent = (await page.textContent('#slaText')).slice(0, 20);

  // UC8 submit → confirmation modal with email + drive
  await page.click('#btnSubmit'); await page.waitForTimeout(400);
  R.modal = await page.isVisible('#modalWrap.open');
  R.mTitle = await page.textContent('#mTitle');
  R.mSubj = await page.textContent('#mSubj');
  R.mDrive = (await page.textContent('#mDrive')).split('\n')[0];
  await shot('v2-04-modal.png');
  await page.click('#mOk'); await page.waitForTimeout(300);
  R.cnt = await page.textContent('#myCnt');

  // UC9 second request (F03, no link needed)
  await page.fill('#catSearch', ''); await page.waitForTimeout(100);
  await page.click('.cat:has-text("Зааварчилгаа")');
  await page.fill('#desc', 'Урьдчилсан хүүт итгэлцлийн гэрээ байгуулах дараалал, шаардлагатай баримтын жагсаалтыг илгээж өгнө үү.');
  await page.waitForTimeout(150);
  R.f03Enabled = !(await page.isDisabled('#btnSubmit'));
  await page.click('#btnSubmit'); await page.waitForTimeout(300);
  await page.click('#mOk'); await page.waitForTimeout(200);

  // UC10 my requests view
  await page.click('nav.views button[data-view="myview"]'); await page.waitForTimeout(300);
  R.myItems = await page.locator('.req-item').count();
  await shot('v2-05-myreqs.png');

  // UC11 registry view + filter + sequential ids
  await page.click('nav.views button[data-view="regview"]'); await page.waitForTimeout(300);
  R.regRows = await page.locator('#regBody tr').count();
  R.ids = await page.locator('#regBody td:first-child').allTextContents();
  await page.fill('#regSearch', 'Дархан'); await page.waitForTimeout(150);
  R.regFiltered = await page.locator('#regBody tr').count();
  await page.fill('#regSearch', '');
  await shot('v2-06-registry.png');

  // UC12 theme toggle + persistence after reload
  await page.click('#btnTheme'); await page.waitForTimeout(300);
  R.theme = await page.evaluate(() => document.documentElement.getAttribute('data-theme'));
  await shot('v2-07-theme.png');
  await page.reload(); await page.waitForTimeout(400);
  await page.click('#btnLogin'); await page.waitForTimeout(300);
  R.cntAfterReload = await page.textContent('#myCnt');

  R.errors = errors;
  console.log(JSON.stringify(R, null, 1));
  await browser.close();
})().catch(e => { console.error('FATAL', e); process.exit(1); });
