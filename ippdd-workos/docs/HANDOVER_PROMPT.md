# Нэткапитал WorkOS — өөр Claude session/аккаунт руу шилжүүлэх PROMPT

> Энэ файлыг БҮТНЭЭР нь хуулж шинэ Claude Code session-ий эхний мессеж болгож өгнө.
> Шинэ session нь энэ репод (`lkhagvadaria-Tomo/Work`, салбар `claude/ippdd-worcos-production-erf7v5`)
> хандах эрхтэй байх ёстой. Шилжүүлсэн огноо: 2026-09-10, хувилбар v10.1.

---

Чи **Нэткапитал WorkOS** төслийг үргэлжлүүлж буй инженер. Захиалагч: **А.Лхагвадарь**
(lkhagvadari.a@netgroup.mn), Нэткапитал Санхүүгийн Группийн ХОБПХГ (IPPDD). Харилцаа **монголоор**.
Өмнөх session-ий бүх ажил репод commit хийгдэж, артифакт хэлбэрээр нийтлэгдсэн. Эхлээд энэ
prompt-ийг бүтнээр унш, дараа нь «Эхлэх алхмууд» хэсгийг дарааллаар хий.

## 1. Хатуу дүрэм (хэзээ ч зөрчихгүй)

1. **Ажилтан ХЭЗЭЭ Ч өөрөө ажлыг CLOSED болгохгүй** — зөвхөн «хаалтад дэвшүүлнэ»; гейт G1–G9 +
   хүний sign-off л хаана. DELIVERED ≠ REVIEWED ≠ APPROVED ≠ IMPLEMENTED ≠ KR ACHIEVED ≠ CLOSED.
2. **AI зөвхөн зөвлөх** (EOM v5.0 §2.5a) — батлах, гарын үсэг зурах, хаах эрхгүй. AI шалгалтын
   үр дүн гейтийн орц болж болно, харин хүний шийдвэрийг орлохгүй.
3. **Дуурайлгасан зүйлийг үнэнчээр «прототип» гэж шошголо** — нэвтрэлт, эрх, аудит нь client тал.
   Production-д бэлэн гэж ХЭЗЭЭ Ч хэлэхгүй, external config (Supabase, OAuth) хийгдтэл.
4. Хэрэглэгчийн өгсөн бодит дата (нэр, и-мэйл, OKR текст, газрын нэр) миний таамгаас үргэлж
   дээгүүр. **Юу ч зохиохгүй** — OKR, огноо, тоо, и-мэйл. Мэдэхгүй бол хоосон орхиж, асуу.
5. Секрет (.env, түлхүүр, гарын үсэгтэй PDF) git-д хэзээ ч оруулахгүй.
6. Commit message **монголоор**; загварын нэр/ID-г commit, код, артифактад бичихгүй.
   Commit-ийн төгсгөлд системийн зааврын дагуу attribution footer.
7. Push зөвхөн `claude/ippdd-worcos-production-erf7v5` салбар руу (`git push -u origin <branch>`).
   PR үүсгэхгүй (хэрэглэгч шууд хүсэхгүй бол).
8. Гар оруулгатай ямар ч утгыг innerHTML руу буулгахын өмнө `esc()`; href-д зөвхөн `safeUrl()`
   (https drive.google.com / docs.google.com); хамтын сангийн өгөгдлийг итгэмжлэгдээгүй гэж үз.

## 2. Төслийн байршил

```
Work/                                  ← repo root (lkhagvadaria-Tomo/Work)
├── CLAUDE.md                          ← ӨӨР төслийн (Эх үүсвэрийн портал) заавар — энэ төсөлд хамаарахгүй,
│                                        гэхдээ домэйн баримт (хүмүүс, чиглүүлэлт, EOM) хэсэг нь ашигтай
└── ippdd-workos/                      ← ЭНЭ ТӨСӨЛ
    ├── prototype/                     ← ажиллаж буй артифакт прототипийн эх код (гол ажил энд)
    │   ├── build_app.py               ← угсрагч: SEED + body HTML + хэсгүүд → workos-demo.html
    │   ├── demo_data.json             ← пилот OKR (workbook-оос экспортолсон, юу ч зохиогоогүй)
    │   ├── app_head.html              ← <title>, CSS (theme 3 блок, mobile, print)
    │   ├── app_engine.js              ← Gate Engine (цэвэр функц, node тесттэй): PROFILES, evaluateGate,
    │   │                                eomSig, driveRef, fwMeta, chainHash/verifyAuditChain
    │   ├── app_main.js                ← төлөв S, session, db холболт, saveWork/mergeWork, бүх үйлдэл A.*
    │   ├── app_render.js              ← бүх дэлгэц (vHome, vOkr+cascade, vWorkDetail, vQueue, vCheckin,
    │   │                                vDocCheck, vProcess, vAdmin, vReport)
    │   ├── app_wire.js                ← event delegation, AI (sample), Drive (mcp), OKR импорт
    │   ├── logo_mark.svg / logo_sprite.html ← байгууллагын албан ёсны лого (Drive-аас)
    │   ├── tests/engine.test.js       ← 26 unit шалгалт (node)
    │   ├── tests/usercases.mjs        ← UC-01..UC-14 хэрэглээний кейс (Playwright)
    │   └── README.md                  ← хувилбарын түүх v1→v10 (заавал шинэчилж байх)
    ├── supabase/migrations/0000-0004  ← албан ёсны систем: roles, types, tables, functions, RLS
    ├── supabase/seed*.sql, scripts/   ← production-safe seed, provision.sh, local-setup.sh, import-okr
    ├── lib/, actions/, app/           ← Next.js 16 App Router апп (proxy.ts, withUser() RLS, gate-engine)
    ├── tests/{unit,integration,rls,e2e}
    └── docs/                          ← ARCHITECTURE, DATA_MODEL, GATE_ENGINE, AUTH_AND_RLS, DEPLOYMENT,
                                         BUILD_STATUS, АЖИЛЛУУЛАХ_ЗААВАР (монгол), энэ файл
```

## 3. Хоёр бүтээгдэхүүн — ялгааг андуурахгүй

### 3a. Артифакт прототип (хэрэглэгч ӨДӨР БҮР ашиглаж байгаа)

- **URL:** https://claude.ai/code/artifact/b338c8df-30be-49b5-8fb6-b9a04e78e2ff — **эзэмшигч нь өмнөх
  session-ий аккаунт.** Өөр аккаунтаас энэ URL руу дахин нийтлэх БОЛОМЖГҮЙ (зөвхөн эзэмшигч).
  Шинэ аккаунт бол: (а) шинэ артифакт нийтэлж шинэ URL өгөх, хуучин артифактын Админ →
  «Нөөц хуулбар авах (JSON)» → шинэ артифактын Админ → «Сэргээх» гэж датаг зөөх; эсвэл
  (б) хэрэглэгч хуучин аккаунтаараа нийтлүүлэх. Аль нь болохыг хэрэглэгчээс эхэнд асуу.
- **Capabilities** (нийтлэхдээ заавал энэ бүтнээр нь дамжуул, орхивол хэвээр үлдэнэ):
  ```json
  {"db": {"rules": [{"path": "", "read": "interact", "write": "admin"}]},
   "sample": {},
   "mcp": {"servers": [{"server": "Google Drive", "tools": ["read_file_content", "search_files"]}]}}
  ```
  `db` = хамтын сан (work/W001…, krs/O1_KR1…, users/LA…, meta/quarter, meta/config, meta/framework);
  `sample` = AI; `mcp` = нээгчийн өөрийн Google Drive эрхээр баримт унших. `write: admin` тул
  «зөвхөн харах» эрхээр хуваалцсан хүн бичиж чадахгүй — батлал хийх хүмүүст «засварлах» эрх өг.
- **Артифактын runtime хязгаар (өөрчлөх боломжгүй):** `user` capability байхгүй тул viewer хэн
  болохыг мэдэхгүй — нэвтрэлт нь бүртгэлээ өөрөө сонгох маягтай; батлал хувь хүнээр
  баталгаажаагүй (UI-д ил бичсэн). Хамтын сан last-writer-wins, транзакцгүй; 5000 баримт,
  1 баримт 256KB хязгаартай. Гадагш fetch хориотой; script зөвхөн cdnjs; `[hidden]` override заавал;
  theme токен 3 блок (light / prefers-dark guard / data-theme=dark) гурвууланд зэрэг засвар.
- Артифакт дээрх коммент надад автоматаар ирэхгүй (wake subscription бүртгэгдэхгүй) —
  «watch» хийж байна гэж хэзээ ч хэлэхгүй; хэрэглэгч коммент илгээвэл `comments` action-аар уншиж,
  reply + resolve хий.

### 3b. Албан ёсны систем (Next.js + Supabase) — CODE COMPLETE, EXTERNAL CONFIG PENDING

Бүх quality gate ногоон: lint, typecheck, unit 29, integration 10, RLS 10, E2E 7, build.
Идэвхжүүлэхэд хэрэглэгчийн талаас: Supabase төсөл (connection string, anon/service key),
Google OAuth client (@netgroup.mn), Vercel. Заавар: `docs/АЖИЛЛУУЛАХ_ЗААВАР.md`, `docs/DEPLOYMENT.md`.
Командууд: `npm run setup` (локал PG + .env.local), `npm run deploy:db`, `npm run import:okr`,
`npm test`, `npm run test:integration`, `npm run test:rls`, `npm run test:e2e`.
**Прототипийн сүүлийн өөрчлөлтүүд (хянагчгүй урсгал, KR owner/parent, G8/G9, endorsements,
хүлээлцэх дүрэм) энэ албан ёсны системд ХАРААХАН ПОРТЛОГДООГҮЙ** — Supabase идэвхжүүлэхээс өмнө
портлох ёстой (доорх «Хүлээгдэж буй» жагсаалт).

## 4. Домэйн баримт (хэрэглэгчийн өгсөн — өөрчлөгдвөл ЭНД шинэчил)

**Хүмүүс (id · нэр · и-мэйл · эрх · газар):**
- LA · А.Лхагвадарь · lkhagvadari.a@netgroup.mn · Ажилтан · IPPDD (ХОБПХГ) — захиалагч, OKR эзэн
- OO · Б.Онон · onon.or@netgroup.mn · Ажилтан · IPPDD (өмнө «Хянагч» байсныг хассан)
- ME · О.Мөнх-Эрдэнэ · munkh-erdene.o@netgroup.mn · Захирал · IPPDD (ХОБПХГ-ын захирал)
- OB · Өлзийбаяр Сандагдорж · ulziibayar.s@netgroup.mn · Захирал · ISCMD (ХОБХУГ-ын захирал)
- NG · Х.Нургүл · nurgul.kh@netgroup.mn · CIO · (хоёр газрын дээд түвшний хүлээн зөвшөөрөгч)

**Газрууд:** IPPDD = Investment Product & Process Development (ХОБПХГ); ISCMD = Investment Sales &
Client Management (ХОБХУГ). Шинэ газар/хэрэглэгчийг захирал Админ хэсгээс нэмнэ.

**Засаглалын шатлал (хэрэглэгчийн баталсан):** эзэмшигч → (Self QC) → **газрын захирал хянаж
батлах — НЭГ шийдвэр** (ажилтанд тусад нь хянагч томилогддоггүй; зөвхөн AI_AGENT ажилд IT-ийн
хараат хяналт) → **CIO Х.Нургүл хүлээн зөвшөөрөлт (G9)** → гейт → хаалтын sign-off (захирал/CIO,
эзэмшигчээс өөр) → хүлээлгэн өгөлт **зөвхөн газрын захиралд** (өөрийн ажил → өөрийн захирал;
өөр газарт хүргэх → тэр газрын захирал) → **зөвхөн нэрлэгдсэн хүлээн авагч захирал** баталгаажуулна.

**Гейт G1–G9:** G1 deliverable · G2 Self QC · G3 хараат хяналт (зөвхөн IT) · G4 захирлын хянаж
батлах · G5 хэрэгжилт · G6 метрик · G7 нотолгоо · **G8 EOM v5.0 нийцэл** (AI шалгалт PASS эсвэл
захирлын «хүнээр хянаж баталсан»; deliverable өөрчлөгдвөл хуучирна — `eomSig`) · **G9 CIO
зөвшөөрөлт**. Захирлуудын зөвшөөрлийн бүртгэл (endorsements) — албан ёсны хаалтаас тусдаа ил лог.

**OKR:** хүн бүрийн OKR тусдаа (`kr.owner`); LA-гийн 10 KR `demo_data.json`-д (3 зорилт 40/40/20,
2026-Q3, 2026-07-06 → 2026-10-02). CIO-гийн OKR: Google Sheet
`1mmBd1rI05xxVFZn8kO4XugtxpGReb5Y7R_pvrh7cl7U` — **өмнөх session-ий Drive холболтод нээгдээгүй**
(Requested entity was not found); апп доторх «OKR импорт» нээгчийн өөрийн эрхээр уншиж импортолно.
Cascade: `kr.parent` — захирал/CIO ажилтны KR-ийг өөрийн KR-т холбоод «Доош хуваарилалт» хэсэгт
хэн хэрхэн хийж байгааг харна.

**EOM Handbook v5.0** (upload-оор өгсөн docx; 10 шалгуур `EOM_CRITERIA` engine-д): нэршил,
Document Control, DRI/RACI, батлалын нотолгоо (DEC-YYYY-XXX), AI-Output Review Gate (§2.5a/§3.3),
стратегийн уялдаа, бүтэц, Review Cycle, эрсдэл/classification, Change Log. DGS агентын загвар
(A/S — detect/notify/report; хүн баталгаажуулна).

**Газрын баримтын хүрээ (framework) хавтас:** https://drive.google.com/drive/folders/1ImPU6zw_NerVxy2CC7Vk_iNx8WF6EK1u
(25 баримт: POL/STD/PRO/REG/RPT/PCK/PLB — `fwMeta()` нэрээс задална). `meta/config.frameworkFolder`-т
хадгалсан; «Баримт шалгах» → «Хүрээ ачаалах» → `meta/framework`.

## 5. Ажлын мөчлөг (хувилбар бүрд заавал, дарааллаар)

1. **Ойлго** — хүсэлтийг дээрх домэйн баримттай тулга; зөрвөл хэрэглэгчийнхийг дага.
2. **Засвар** — `python3 - <<'PYEOF'` heredoc, мөр бүр `assert old in s` хамгаалалттай;
   бүх assert давсны дараа л файл бич. **Функц бүтнээр нь орлуулахдаа хооронд байгаа өөр функцийг
   устгаагүйг git diff-ээр шалга** (өмнө vOkr орлуулахад actionButtons/decideForm устсан тохиолдол бий).
3. **Угсрах + синтакс** — `cd prototype && python3 build_app.py` → `workos-demo.html`;
   `new Function(<script>)`-аар бүх script блок шалга.
4. **Тест** — `node prototype/tests/engine.test.js` (26/26) ба
   `WORKOS_DIR=<workos-demo.html-ийн хавтас> node prototype/tests/usercases.mjs` (14/14, exit 0).
   Playwright скриптийг `ippdd-workos/` дотроос ажиллуул (node_modules resolution); chromium:
   `/opt/pw-browsers/chromium-1194/chrome-linux/chrome`. Шинэ функц бүрд тест НЭМ.
   Sandbox-д Drive/AI байхгүй тул mcp/sample хамаарах урсгал үнэнч toast-оор дуусдаг — тэрийг шалга.
5. **Нүдээр** — screenshot (гэрэл + харанхуй `data-theme=dark`, мобайл 390px viewport meta-тай).
6. **Нийтлэх** — эзэмшигч аккаунт бол `url` = дээрх артифакт, `label` бичнэ, capabilities орхи
   (хэвээр үлдэнэ). Өөр аккаунт бол §3a-г дага.
7. **Хамтын сан** — seed/хэрэглэгчийн өөрчлөлтийг `write_db` (batch/update)-аар шууд шинэчил
   (users/*, krs/*, meta/config). Ажлын дата (work/*) хэрэглэгчийнх — дур мэдэн бүү өөрчил.
8. **Commit + push** — монгол тайлбар, footer; `prototype/README.md`-д хувилбарын мөр нэм.
9. **Тайлагна** — юу зассан, юу тестэлсэн, юу ҮНЭНЧЭЭР боломжгүй (identity, immutability) гэж хэл.

## 6. Одоогийн байдал (v10.1, 2026-09-10)

- Executive scorecard (өмнөх session-ий үнэлгээ): **58/60**. Security 4, Risk Control 4 — сүүлийн
  2 оноо артифакт дотор авах боломжгүй (viewer identity байхгүй, client-side лог). Supabase +
  Google OAuth идэвхжвэл 60/60. Хэрэглэгч 60/60 хүсэж байгаа — үнэнчээр энэ хязгаарыг хэл.
- Тест: engine 26/26, user case 14/14, page error 0; 505 ажил дээр нүүр 11ms, check-in 80ms.
- QA аудит хийгдсэн (v8.1): javascript: URL, форм устах, мобайл цэс, LWW нэгтгэл, db rules зассан.
- Аудитын лог хэш гинжтэй (tamper-evident, tamper-proof БИШ); нөөшлөх/сэргээх Админ хэсэгт.

## 7. Хүлээгдэж буй / дараагийн ажлууд (эрэмбээр)

1. **Supabase идэвхжүүлэлт** — хэрэглэгч connection string, anon/service key, Google OAuth
   client ID/secret өгвөл `docs/АЖИЛЛУУЛАХ_ЗААВАР.md`-ийн дагуу; ~30–40 мин.
2. **Прототипийн дүрмүүдийг албан ёсны системд портлох**: хянагчгүй профайл (G3 зөвхөн IT),
   G8 EOM (eomCheck/eomManual + sig), G9 cioSign, endorsements, kr.owner/parent + cascade,
   хүлээлцэх зөвхөн захиралд, аудитын хэш гинж. Migration + функц + RLS + тест.
3. CIO-гийн OKR-ийг импортлох (Х.Нургүл өөрөө апп дотроос, эсвэл sheet-ийг хуваалцсаны дараа).
4. Мэдэгдэл (и-мэйл/Google Chat webhook — URL хэрэглэгчээс ирэх ёстой, одоо байхгүй).
5. Хүрээний 25 баримтын гүнзгий conformance аудит (`document-framework-compliance` skill,
   docx + xlsx тайлан Drive-д) — хэрэглэгч хүсвэл.
6. Онон (OO)-д ажил хуваарилах, ISCMD-ийн ажил үүсгэх — хэрэглэгчийн дата ирэхээр.

## 8. Эхлэх алхмууд (шинэ session-ий эхний 10 минут)

```bash
git fetch origin claude/ippdd-worcos-production-erf7v5
git checkout claude/ippdd-worcos-production-erf7v5
cd ippdd-workos && npm install
node prototype/tests/engine.test.js                       # 26/26 байх ёстой
cd prototype && python3 build_app.py && cd ..
WORKOS_DIR=$PWD/prototype node prototype/tests/usercases.mjs   # 14/14 байх ёстой
```
Дараа нь: `prototype/README.md` (хувилбарын түүх), `docs/BUILD_STATUS.md`, `docs/DECISIONS.md` унш.
Хэрэглэгчээс **эхэнд асуух 2 зүйл:** (1) артифактыг аль аккаунтаар нийтлэх вэ (§3a); (2) энэ
удаад юуг эхэлж хийх вэ (§7-гийн жагсаалтаас). Асуулт олон тавихгүй — үлдсэнийг өөрөө шийдэж,
хариултдаа ил тэмдэглэ.
