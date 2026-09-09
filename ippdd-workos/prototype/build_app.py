#!/usr/bin/env python3
"""Assemble the working IPPDD WorkOS prototype from parts + real pilot data."""
import json
from pathlib import Path

BASE = Path(__file__).parent
D = json.load(open(BASE / "demo_data.json"))
SPRITE = (BASE / "logo_sprite.html").read_text().strip()

# ── SEED: artifact-db shape, generated from the real exported dataset ────────
krs = []
for o in D["objectives"]:
    for k in o["krs"]:
        krs.append({
            "id": f'{o["objective_code"]}-{k["kr_code"]}',
            "obj": o["objective_code"], "objTitle": o["title"],
            "objWeight": float(o["weight"]), "code": k["kr_code"],
            "title": k["title"], "weight": float(k["weight"]),
            "deadline": k["deadline"], "status": k["status"],
            "achievement": float(k["achievement_percent"] or 0),
        })

work = []
for w in D["work"]:
    wid = w["work_code"].split("-")[-1]  # W001…
    work.append({
        "id": wid, "code": w["work_code"], "kr": w["kr"], "title": w["title"],
        "type": w["work_type"], "priority": w["priority"], "deadline": w["deadline"],
        "dod": w["definition_of_done"], "status": w["status"],
        "owner": "LA", "reviewer": "OO", "approver": "ME",
        "implReq": w["work_type"] == "AI_AGENT",
        "validReq": bool(w["metrics"]),
        "requirements": w["requirements"] or [],
        "deliverables": [], "evidence": [], "reviews": [], "approvals": [],
        "impl": [],
        "metrics": [
            {"name": m["name"], "op": m["op"], "target": float(m["target"]),
             "unit": m["unit"], "actual": None, "status": "PENDING"}
            for m in (w["metrics"] or [])
        ],
        "gate": None, "closure": None,
        "audit": [{"ts": "2026-09-09T02:00:00Z", "by": "seed",
                   "action": "Пилот өгөгдлөөс үүсгэв (workbook IPPDD_OKR_Q3_2026-08-01_v1.0)"}],
    })

for w in work:
    w["dept"] = "IPPDD"
    w["handover"] = None

seed = {
    "meta": {"code": D["quarter"]["code"], "start": D["quarter"]["start_date"],
             "end": D["quarter"]["end_date"], "status": "ACTIVE", "closure": None},
    "config": {"frameworkFolder": "https://drive.google.com/drive/folders/1ImPU6zw_NerVxy2CC7Vk_iNx8WF6EK1u",
               "depts": [
        {"code": "IPPDD", "name": "Investment Product & Process Development (ХОБПХГ)"},
        {"code": "ISCMD", "name": "Investment Sales & Client Management (ХОБХУГ)"},
    ]},
    "users": [
        {"id": "LA", "name": "А.Лхагвадарь", "email": "lkhagvadari.a@netgroup.mn", "role": "Ажилтан", "dept": "IPPDD"},
        {"id": "OO", "name": "Б.Онон", "email": "onon.or@netgroup.mn", "role": "Хянагч", "dept": "IPPDD"},
        {"id": "ME", "name": "О.Мөнх-Эрдэнэ", "email": "munkh-erdene.o@netgroup.mn", "role": "Захирал", "dept": "IPPDD"},
        {"id": "OB", "name": "Өлзийбаяр Сандагдорж", "email": "", "role": "Захирал", "dept": "ISCMD"},
        {"id": "NG", "name": "Х.Нургүл", "email": "", "role": "CIO", "dept": "IPPDD"},
    ],
    "krs": krs, "work": work,
}

body = f"""
{SPRITE}
<div id="login" hidden>
  <div class="login-brand">
    <div class="lb-top"><div class="mark"><svg class="lg"><use href="#nfgMark"/></svg></div>
      <div><div class="w1">Нэткапитал Санхүүгийн Групп</div>
      <div class="w2">IPPDD · Investment Product &amp; Process Development</div></div></div>
    <div class="lb-mid">
      <div class="eyebrow">OKR · Work · Evidence · Approval · Governance</div>
      <h1>IPPDD WorkOS</h1>
      <p>Улирлын OKR, засаглалтай ажил, нотолгоо, батлал, хаалтын гейтийг нэг дороос.
      «Баримт үүссэн» ≠ «ажил дууссан» — хаалт бүр гейт + хүний sign-off-оор баталгаажна.</p>
    </div>
    <div class="vals">
      <div class="v"><span class="tick">✓</span><span><b>Deterministic Gate Engine</b> — G1–G9 шалгалт (EOM нийцэл, CIO sign-off орсон), дутагдлын зөвлөмжтэй</span></div>
      <div class="v"><span class="tick">✓</span><span><b>Багийн хамтын сан</b> — өөрчлөлт бүх гишүүнд шууд харагдана</span></div>
      <div class="v"><span class="tick">✓</span><span><b>AI туслах</b> — зөвхөн системийн өгөгдлөөс, зөвлөх эрхтэй</span></div>
    </div>
    <div class="lb-foot">Netcapital Financial Group · Дотоод прототип · 2026 Q3</div>
  </div>
  <div class="login-side"><div class="login-card">
    <span class="proto-badge">Прототип · Google нэвтрэлтийг дуурайсан</span>
    <h2>Нэвтрэх</h2>
    <p class="sub">Ажлын бүртгэлээ сонгоно уу. Албан ёсны системд энэ алхам Google Workspace
    нэвтрэлтээр солигдоно (@netgroup.mn).</p>
    <div class="acct-box">
      <div class="ph">Бүртгэлтэй хэрэглэгчид</div>
      <div id="acctList"></div>
      <div class="picker-note"><b>Прототип нэвтрэлт:</b> хэрэглэгч бүртгэлээ өөрөө сонгодог тул батлал,
      гарын үсэг хувь хүнээр баталгаажаагүй — дотоод туршилт, хурлын бэлтгэлд зориулав. Бичих эрх нь
      линкийг «засварлах» эрхтэй хуваалцсан хүнд л ажиллана. Идэвхгүй 20 минутын дараа автоматаар
      гарна. Шинэ газар/хэрэглэгчийг захирал «Админ» хэсгээс нэмнэ.</div>
    </div>
    <p class="foot">Пилот OKR: IPPDD_OKR_Q3_2026-08-01_v1.0 workbook · 3 зорилт · 10 KR</p>
  </div></div>
</div>

<div id="app" hidden>
  <aside id="sideNav">
    <div class="sn-brand"><div class="logo2"><svg class="lg"><use href="#nfgMark"/></svg></div>
      <div><b>IPPDD WorkOS</b><span>Netcapital FG</span></div></div>
    <nav class="views" role="tablist" aria-label="Цэс">
      <button role="tab" data-tab="home" aria-selected="true">Нүүр</button>
      <button role="tab" data-tab="okr" aria-selected="false">Миний OKR</button>
      <button role="tab" data-tab="rev" aria-selected="false">Хяналт <span class="cnt" hidden></span></button>
      <button role="tab" data-tab="app" aria-selected="false">Батлал <span class="cnt" hidden></span></button>
      <button role="tab" data-tab="checkin" aria-selected="false">Check-in</button>
      <button role="tab" data-tab="doccheck" aria-selected="false">Баримт шалгах</button>
      <button role="tab" data-tab="process" aria-selected="false">Процесс</button>
      <button role="tab" data-tab="report" aria-selected="false">Тайлан</button>
      <button role="tab" data-tab="admin" aria-selected="false" id="navAdmin" hidden>Админ</button>
    </nav>
    <div class="sn-foot">
      <div class="sn-user"><span class="uav" id="snAv"></span>
        <div><b id="snName"></b><span id="snRole"></span></div></div>
      <div class="sn-actions">
        <button data-act="theme" title="Гэрэл / харанхуй">◐ Theme</button>
        <button data-act="logout">Гарах</button>
      </div>
      <p class="sn-note">Прототип — албан ёсны систем (Supabase + RLS + Google OAuth) репод бэлэн.</p>
    </div>
  </aside>
  <div class="topbar">
    <span class="demo-chip">Прототип</span>
    <span class="conn" id="conn">Хамтын сан: холбогдож байна…</span>
    <span class="sp"></span>
    <span class="userchip"><span class="uav" id="tbAv"></span>
      <span><span class="un" id="tbName"></span><br><span class="ur" id="tbRole"></span></span></span>
    <button class="icon-btn" data-act="theme" title="Гэрэл / харанхуй" aria-label="Theme">◐</button>
    <button class="ghost-btn" data-act="logout">Гарах</button>
  </div>
  <main id="app-main"><p class="sub">Ачаалж байна…</p></main>
  <button id="chatFab" data-act="chat" aria-label="AI туслах" title="AI туслах">✦</button>
  <div id="chatDrawer" hidden>
    <div class="ch-h"><div><b>IPPDD туслах</b><span>Зөвлөх эрхтэй — батлах, хаах эрхгүй</span></div>
      <button data-act="chat" aria-label="Хаах">✕</button></div>
    <div id="chatLog"></div>
    <div class="ch-sugg">
      <button data-sug="O2-KR1-ээ хаахад юу дутуу байна?">O2-KR1 хаахад юу дутуу?</button>
      <button data-sug="Хугацаа хэтэрсэн ажлууд юу байна?">Хугацаа хэтэрсэн?</button>
      <button data-sug="Дараагийн алхам юу вэ?">Дараагийн алхам?</button>
    </div>
    <form data-chat><input type="text" data-f="aiq" placeholder="Асуулт бичих…" maxlength="500" aria-label="Асуулт">
      <button class="btn sm2" type="submit">Асуух</button></form>
  </div>
</div>
"""

parts = [
    (BASE / "app_head.html").read_text(),
    body,
    "<script>\nvar SEED = " + json.dumps(seed, ensure_ascii=False) + ";\n</script>",
    "<script>\n" + (BASE / "app_engine.js").read_text() + "\n</script>",
    "<script>\n" + (BASE / "app_main.js").read_text() + "\n</script>",
    "<script>\n" + (BASE / "app_render.js").read_text() + "\n</script>",
    "<script>\n" + (BASE / "app_wire.js").read_text() + "\n</script>",
]
out = BASE / "workos-demo.html"
out.write_text("\n".join(parts))
print("wrote", out, out.stat().st_size, "bytes ·", len(work), "work ·", len(krs), "krs")
