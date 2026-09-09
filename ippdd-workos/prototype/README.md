# IPPDD WorkOS — ажиллаж буй прототип (artifact)

Хэрэглэгчид шууд ашиглуулж буй нэг файлын прототип. Албан ёсны систем (энэ репогийн
Next.js + Supabase апп) идэвхжтэл түр хэрэглэгдэнэ; «Прототип» гэж үнэнчээр шошготой.

- **Нийтлэгдсэн хаяг:** https://claude.ai/code/artifact/b338c8df-30be-49b5-8fb6-b9a04e78e2ff
- **Угсрах:** `python3 build_app.py` → `workos-demo.html` (эх хэсгүүд + пилот өгөгдөл `demo_data.json`)
- **Capabilities:** `db` (багийн хамтын сан) + `sample` (AI туслах) + `mcp` (Google Drive read_file_content — G8 EOM шалгалт) — дахин нийтлэхдээ
  `capabilities`-ийг орхивол хэвээр үлдэнэ.
- **Пилот өгөгдөл:** `demo_data.json` — IPPDD_OKR_Q3_2026-08-01_v1.0 workbook-оос экспортолсон
  (3 зорилт, 10 KR, 5 ажил). Юу ч зохиогоогүй.

## Хэсгүүд

| Файл | Агуулга |
| --- | --- |
| `app_head.html` | Theme токен (3 блок), нэвтрэлт/side nav/карт/chain/check-in CSS, print CSS |
| `app_engine.js` | Gate Engine порт: PROFILES, TRANSITIONS, `evaluateGate` |
| `app_main.js` | Төлөв, session (20 мин), theme, хамтын сан (db), бүх үйлдэл `A.*` |
| `app_render.js` | Бүх дэлгэц: нүүр, OKR, хяналт/батлал, 7 алхамт chain, Check-in, тайлан, админ |
| `app_wire.js` | Event delegation, AI туслах (`sample`), Check-in AI дүгнэлт |

## Хувилбарууд

- v4.1 — **G8 EOM нийцэл + G9 CIO хүлээн зөвшөөрөлт**: эцсийн deliverable бүрийн агуулгыг
  Google Drive-аас уншиж (`mcp` capability, зөвхөн read_file_content) EOM Handbook v5.0-ийн
  10 шалгуурт AI-аар тулгадаг зөвлөх шалгалт (DGS загвар, §2.5a — эцсийн шийдвэр хүнийх);
  CIO Х.Нургүл ажил, баримтыг хүлээн авч зөвшөөрснөө APPROVE + sign-off-оор тэмдэглэдэг
  G9 шалгуур — хоёулаа хаалтын гейтийн заавал нөхцөл.

- v4.0 — **Check-in**: ажил бүр дээр гейт шинээр тооцсон детерминист үнэлгээ, DoD шалгалт,
  KR товчоо, хэвлэх/PDF, «AI дүгнэлт бэлтгэх» (хурлын санал, шийдвэр, асуултууд)
- v3.x — олон газрын дэмжлэг, ажил үүсгэх, 7 алхамт sign-off + хүлээлцэх баталгаажуулалт, админ CRUD
- v2.x — портал брэнд систем (Manrope, гэрэл/харанхуй), нэвтрэлтийн дэлгэц, AI туслах
- v1.x — OKR/ажил/гейт үндсэн урсгал

Аюулгүй байдал: гар оруулгатай утга бүр `esc()`-ээр шүүгдэнэ; Drive линк зөвхөн
drive.google.com / docs.google.com; owner ≠ хянагч/батлагч/хүлээн авагч (үүргийн тусгаарлалт).
