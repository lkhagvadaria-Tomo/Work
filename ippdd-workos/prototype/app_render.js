/* ── Rendering ─────────────────────────────────────────────────────────────── */
"use strict";

function workList() { return Object.values(S.works).sort(function (a, b) { return a.code < b.code ? -1 : 1; }); }
function krList() { return Object.values(S.krs).sort(function (a, b) { return a.id < b.id ? -1 : 1; }); }
function openWorks() { return workList().filter(function (w) { return w.status !== "CLOSED" && w.status !== "CANCELLED"; }); }
function pendingReviews() {
  var out = [];
  workList().forEach(function (w) {
    (w.reviews || []).forEach(function (r) {
      if (r.decision === "PENDING") out.push({ w: w, r: r });
    });
  });
  return out;
}
function pendingApprovals() {
  var out = [];
  workList().forEach(function (w) {
    (w.approvals || []).forEach(function (a) {
      if (a.decision === "PENDING") out.push({ w: w, a: a });
    });
    if (w.closure && w.closure.status === "READY") out.push({ w: w, sign: true });
  });
  return out;
}
function fmt(ts) { return ts ? new Date(ts).toLocaleString("mn-MN", { dateStyle: "short", timeStyle: "short" }) : "—"; }

function deptChips() {
  var depts = S.config.depts || [];
  if (depts.length < 2) return "";
  var chips = '<button class="chip" data-dept="ALL" style="' +
    (S.deptFilter === "ALL" ? "border-color:var(--brand);color:var(--brand)" : "") + '">Бүх газар</button>';
  depts.forEach(function (d) {
    chips += ' <button class="chip" data-dept="' + esc(d.code) + '" style="' +
      (S.deptFilter === d.code ? "border-color:var(--brand);color:var(--brand)" : "") + '">' + esc(d.code) + "</button>";
  });
  return '<div style="display:flex;gap:7px;flex-wrap:wrap;margin:0 0 14px">' + chips + "</div>";
}
function deptWorks() {
  return workList().filter(function (w) {
    return S.deptFilter === "ALL" || (w.dept || "IPPDD") === S.deptFilter;
  });
}
function vHome() {
  var ws = deptWorks(), open = ws.filter(function (w) { return w.status !== "CLOSED" && w.status !== "CANCELLED"; });
  var overdue = open.filter(function (w) { return w.deadline && w.deadline < TODAY; });
  var krs = krList(), closedKr = krs.filter(function (k) { return k.status === "CLOSED"; }).length;
  var myRev = S.p === "OO" ? pendingReviews().length : 0;
  var myApp = S.p === "ME" ? pendingApprovals().length : 0;
  var multiDept = (S.config.depts || []).length > 1;
  var rows = ws.map(function (w) {
    var ho = w.handover;
    return '<tr class="rowlink" data-open="' + esc(w.id) + '"><td class="mono">' + esc(w.code) + "</td>" +
      '<td class="wrap">' + esc(w.title) + '</td>' +
      (multiDept ? '<td class="mono sm">' + esc(w.dept || "IPPDD") + "</td>" : "") +
      '<td class="mono sm">' + esc(w.kr || "—") + "</td>" +
      "<td>" + wbadge(w.status) +
      (ho ? "<br>" + badge(ho.status === "CONFIRMED" ? "✓ Хүлээн авсан" : ho.status === "PENDING" ? "Хүлээлгэн өгсөн" : "ХӨ буцаагдсан",
        ho.status === "CONFIRMED" ? "pass" : ho.status === "PENDING" ? "warn" : "fail") : "") + "</td>" +
      '<td class="num ' + (w.status !== "CLOSED" && w.deadline && w.deadline < TODAY ? "late" : "") + '">' + esc(w.deadline || "—") + "</td>" +
      '<td class="num">' + (w.evidence || []).length + "</td></tr>";
  }).join("");
  return "<h1>Сайн байна уу, " + esc(me().name) + "</h1>" +
    '<p class="sub">' + esc(S.meta ? S.meta.code + " · " + S.meta.start + " → " + S.meta.end : "") + "</p>" +
    '<div class="stats">' +
    '<div class="stat"><div class="l">KR хаалт</div><div class="v' + (closedKr === krs.length && krs.length ? " good" : "") + '">' + closedKr + "/" + krs.length + "</div></div>" +
    '<div class="stat"><div class="l">Ажлын хаалт</div><div class="v">' + (ws.length - open.length) + "/" + ws.length + "</div></div>" +
    '<div class="stat"><div class="l">Хугацаа хэтэрсэн</div><div class="v' + (overdue.length ? " bad" : " good") + '">' + overdue.length + "</div></div>" +
    (myRev ? '<div class="stat"><div class="l">Таны хянах ээлж</div><div class="v bad">' + myRev + "</div></div>" : "") +
    (myApp ? '<div class="stat"><div class="l">Таны батлах ээлж</div><div class="v bad">' + myApp + "</div></div>" : "") +
    "</div>" +
    (!S.seeded && S.live
      ? '<div class="card"><div class="card-b"><p style="margin:0 0 10px"><b>Хамтын сан хоосон байна.</b> Пилот өгөгдлийг (3 зорилт, 10 KR, 5 ажил) нэг товчоор суулгана:</p><button class="btn" data-act="seed">Анхны өгөгдөл суулгах</button></div></div>'
      : "") +
    deptChips() +
    '<section class="card"><header class="card-h"><h3>Бүх ажил</h3>' +
    '<button class="btn sm2" data-act="newWork">+ Шинэ ажил</button></header>' +
    '<div class="scroll"><table><thead><tr><th>Код</th><th>Нэр</th>' +
    (multiDept ? "<th>Газар</th>" : "") +
    '<th>KR</th><th>Төлөв</th><th>Хугацаа</th><th>Нотолгоо</th></tr></thead><tbody>' +
    rows + "</tbody></table></div></section>";
}

function vOkr() {
  var groups = {};
  krList().forEach(function (k) { (groups[k.obj] = groups[k.obj] || []).push(k); });
  var canCloseQ = S.p === "ME" && krList().length && krList().every(function (k) { return k.status === "CLOSED"; }) &&
    !(S.meta && S.meta.closure);
  var html = "<h1>Миний OKR — " + esc(S.meta ? S.meta.code : "") + "</h1>" +
    '<p class="sub">Эх сурвалж: IPPDD_OKR_Q3_2026-08-01_v1.0 workbook (үг үсгээр нь)</p>';
  Object.keys(groups).sort().forEach(function (obj) {
    var ks = groups[obj];
    var rows = ks.map(function (k) {
      var open = openWorks().filter(function (w) { return w.kr === k.id; }).length;
      var canClose = S.p === "ME" && k.status !== "CLOSED" && open === 0 &&
        workList().some(function (w) { return w.kr === k.id; });
      return "<tr><td class='mono'>" + esc(k.code) + "</td><td class='wrap'>" + esc(k.title) + "</td>" +
        "<td class='num'>" + k.weight + "%</td><td class='num'>" + esc(k.deadline || "—") + "</td>" +
        "<td>" + badge(k.status === "CLOSED" ? "Хаагдсан" : k.status === "IN_PROGRESS" ? "Хийгдэж байна" : "Эхлээгүй",
          k.status === "CLOSED" ? "pass" : k.status === "IN_PROGRESS" ? "info" : "muted") + "</td>" +
        "<td class='num'>" +
        (S.p === "LA" && k.status !== "CLOSED"
          ? '<input type="number" min="0" max="100" value="' + (k.achievement || 0) + '" style="width:70px" data-krach="' + esc(k.id) + '" aria-label="Гүйцэтгэл">%'
          : (k.achievement || 0) + "%") + "</td>" +
        "<td class='num'>" + open + "</td>" +
        "<td>" + (canClose
          ? '<button class="btn sm2 pass" data-closekr="' + esc(k.id) + '">KR хаах</button>'
          : k.status === "CLOSED" ? '<span class="sm" style="color:var(--pass-ink)">✓ ' + esc(k.closedBy || "") + "</span>" : "") + "</td></tr>";
    }).join("");
    html += '<section class="card"><header class="card-h"><h3>' + esc(obj) + " · " + esc(ks[0].objTitle) +
      '</h3><span class="chip">жин ' + ks[0].objWeight + '%</span></header>' +
      '<div class="scroll"><table><thead><tr><th>KR</th><th>Нэр</th><th>Жин</th><th>Хугацаа</th><th>Төлөв</th><th>Гүйцэтгэл</th><th>Нээлттэй ажил</th><th></th></tr></thead><tbody>' +
      rows + "</tbody></table></div></section>";
  });
  if (canCloseQ) html += '<div class="card"><div class="card-b"><p style="margin:0 0 10px"><b>Бүх KR хаагдсан.</b> Улирлын хаалтад гарын үсэг зурж, байнгын бүртгэл (гэрчилгээ) үүсгэнэ:</p><button class="btn pass" data-act="closeq">Улирлын хаалт — SIGN OFF</button></div></div>';
  if (S.meta && S.meta.closure) html += '<p class="note">Улирал хаагдсан — гэрчилгээ «Тайлан» хэсэгт.</p>';
  return html;
}

function actionButtons(w) {
  var b = [];
  var isOwner = S.p === w.owner;
  if (isOwner && w.status === "NOT_STARTED") b.push('<button class="btn" data-act="start">START WORK</button>');
  if (isOwner && w.status === "IN_PROGRESS" && !profileOf(w).simplified) b.push('<button class="btn" data-act="submitReview">SUBMIT FOR REVIEW</button>');
  if (isOwner && ["RETURNED", "REJECTED", "BLOCKED"].indexOf(w.status) >= 0) b.push('<button class="btn" data-act="resubmit">RESUBMIT</button>');
  if (isOwner && w.status === "REVIEW_PASSED") b.push('<button class="btn" data-act="requestApproval">REQUEST APPROVAL</button>');
  if (isOwner && closableFrom(w) && !(w.closure && w.closure.status === "READY")) b.push('<button class="btn pass" data-act="submitClosure">SUBMIT FOR CLOSURE</button>');
  if (isOwner && profileOf(w).selfqc && w.status !== "NOT_STARTED" && w.status !== "CLOSED" &&
      !(w.reviews || []).some(function (r) { return r.type === "SELF_QC" && r.decision === "PASS"; }))
    b.push('<button class="btn sec" data-act="selfQc">Self QC PASS</button>');
  return b.join(" ");
}

function decideForm(kind, extra) {
  return '<div class="frow" style="align-items:flex-end">' +
    '<label class="field" style="flex:2"><span>Тайлбар (RETURN/REJECT-д заавал)</span><input type="text" data-f="comment"></label>' +
    '<div style="display:flex;gap:6px;padding-bottom:9px">' +
    '<button class="btn sm2 pass" data-' + kind + '="' + (kind === "sign" ? "APPROVE" : kind === "rev" ? "PASS" : "APPROVE") + '"' + (extra || "") + ">" + (kind === "sign" ? "SIGN OFF" : kind === "rev" ? "PASS" : "APPROVE") + "</button>" +
    '<button class="btn sm2 warn" data-' + kind + '="RETURN"' + (extra || "") + ">RETURN</button>" +
    '<button class="btn sm2 fail" data-' + kind + '="REJECT"' + (extra || "") + ">REJECT</button></div></div>";
}

function vWorkDetail(w) {
  var p = profileOf(w);
  var g = w.gate;
  var html = '<button class="backlink" data-act="back">← Бүх ажил</button>' +
    '<h1><span class="mono" style="color:var(--muted)">' + esc(w.code) + "</span> " + esc(w.title) + "</h1>" +
    '<p class="sub">' + wbadge(w.status) + " &nbsp;Эзэмшигч: <b>" + esc(U(w.owner).name) +
    "</b> · Хянагч: <b>" + esc(U(w.reviewer).name) + "</b> · Батлагч: <b>" + esc(U(w.approver).name) +
    '</b> · Төрөл: <b>' + esc(w.type) + '</b> · Хугацаа: <b class="' +
    (w.status !== "CLOSED" && w.deadline && w.deadline < TODAY ? "late" : "") + '">' + esc(w.deadline || "—") + "</b></p>" +
    (w.dod ? '<p class="sub" style="margin-top:-8px"><b>DoD:</b> ' + esc(w.dod) + "</p>" : "") +
    vFlowBar(w) +
    '<p class="sub" style="margin:-6px 0 10px;font-size:11.5px">Хянагч агуулгыг шалгана · захирал эрх мэдлээр батална · CIO хүлээн зөвшөөрнө · гейт бүрэн бүтэн байдлыг шалгана. Дэлгэрэнгүй: «Процесс» цэс.</p>' +
    '<div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:14px">' + actionButtons(w) + "</div>";

  // sign-off panel
  if (w.closure && w.closure.status === "READY") {
    html += '<section class="card" style="border-color:var(--pass-line)"><header class="card-h"><h3>Хаалтын sign-off — гейт ' +
      (g ? g.result : "?") + ", хүний шийдвэр хүлээж байна</h3></header><div class='card-b'>" +
      (S.p !== w.owner && (S.p === w.approver || isBoss())
        ? decideForm("sign")
        : '<p class="sub" style="margin:0">Гарын үсгийг ' + esc(U(w.approver).name) +
          ", эсвэл өөр газрын захирал/CIO зурна.</p>") +
      "</div></section>";
  }
  if (w.closure && w.closure.status === "CLOSED") {
    html += '<p class="note" style="border-color:var(--pass-line);background:var(--pass-bg);color:var(--pass-ink)">ХААГДСАН — гейт + ' +
      esc(w.closure.signedBy) + " sign-off · " + fmt(w.closure.ts) + "</p>";
  }

  // pending review / approval decision panels
  (w.reviews || []).forEach(function (r) {
    if (r.decision === "PENDING" && S.p !== w.owner && (S.p === w.reviewer || isBoss())) {
      html += '<section class="card" style="border-color:var(--info-line)"><header class="card-h"><h3>Таны шийдвэр — ' +
        esc(r.type) + ' review</h3></header><div class="card-b">' + decideForm("rev", ' data-rid="' + esc(r.id) + '"') + "</div></section>";
    }
  });
  (w.approvals || []).forEach(function (a) {
    if (a.decision === "PENDING" && S.p !== w.owner && (S.p === w.approver || isBoss())) {
      html += '<section class="card" style="border-color:var(--warn-line)"><header class="card-h"><h3>Таны батлал — ' +
        esc(a.type) + " (хувилбар: " + esc(a.version || "—") + ')</h3></header><div class="card-b">' + decideForm("app", ' data-aid="' + esc(a.id) + '"') + "</div></section>";
    }
  });

  // gate
  html += '<section class="card"><header class="card-h"><h3>Хаалтын гейт (G1–G9)</h3>' + (g ? gbadge(g.result) : "") + '</header><div class="card-b">';
  if (!g) html += '<p class="sub" style="margin:0">Гейт хараахан ажиллаагүй — SUBMIT FOR CLOSURE дарж ажиллуулна. Ажилтан CLOSED-ийг өөрөө тавьдаггүй.</p>';
  else {
    html += '<ul class="list">' + g.checks.map(function (c) {
      return "<li><span>" + esc(c.gate) + "</span>" + gbadge(c.result) + "</li>";
    }).join("") + "</ul>";
    if (g.findings.length) html += '<p class="sub" style="margin:12px 0 6px">Дутагдал:</p><ul class="list">' +
      g.findings.map(function (f) {
        return '<li class="block"><div>' + badge(f.sev, f.sev === "CRITICAL" || f.sev === "HIGH" ? "fail" : "warn") +
          " <b>" + esc(f.title) + "</b></div>" + (f.act ? "<p>→ " + esc(f.act) + "</p>" : "") + "</li>";
      }).join("") + "</ul>";
    html += '<p class="sub" style="margin:10px 0 0">Сүүлд: ' + fmt(g.ts) + " · " + esc(g.by) + "</p>";
  }
  html += "</div></section>";

  // ── EOM v5.0 нийцэл (G8) — AI зөвлөх шалгалт ─────────────────────────────
  var ec = w.eomCheck, ecStale = ec && ec.sig !== eomSig(w);
  html += '<section class="card"><header class="card-h"><h3>EOM v5.0 нийцэл (G8) — AI шалгалт</h3>' +
    (ec ? gbadge(ecStale ? "WARNING" : ec.result) : "") + '</header><div class="card-b">' +
    '<p class="sub" style="margin:0 0 8px">Эцсийн deliverable бүрийн агуулгыг Google Drive-аас уншиж, EOM v5.0 гарын авлагын ' +
    'баримтын стандартад тулгана (DGS — Document Governance Steward загвар). AI зөвхөн зөвлөх эрхтэй (§2.5a) — ' +
    'эцсийн хүлээн зөвшөөрөлт G9-ийн хүний sign-off-оор.</p>';
  if (S.eomBusy && S.eomWid === w.id) html += '<p class="note">' + esc(S.eomProg || "Ажиллаж байна…") + "</p>";
  if (ec) {
    if (ecStale) html += '<p class="note" style="border-color:var(--warn-line)">Шалгалтын дараа эцсийн deliverable өөрчлөгдсөн — дахин ажиллуулна уу.</p>';
    html += '<p class="sub" style="margin:0 0 6px"><b>' + esc(ec.result) + "</b>" + (ec.summary ? " — " + esc(ec.summary) : "") + "</p><ul class='list'>" +
      (ec.docs || []).map(function (dd) {
        return '<li class="block"><div style="display:flex;justify-content:space-between;gap:8px"><span>' + esc(dd.name) + "</span>" +
          gbadge(dd.verdict === "PASS" ? "PASS" : dd.verdict === "WARNING" ? "WARNING" : "FAIL") + "</div>" +
          (dd.issues || []).map(function (is2) { return "<p>• [" + esc(is2.crit) + "] " + esc(is2.note) + "</p>"; }).join("") + "</li>";
      }).join("") + "</ul>" +
      (ec.unread && ec.unread.length ? '<p class="sub" style="margin:6px 0 0">Уншиж чадаагүй: ' + esc(ec.unread.join(", ")) + "</p>" : "") +
      '<p class="sub" style="margin:8px 0 0">' + fmt(ec.ts) + " · " + esc(ec.byName || ec.by || "") + " · зөвхөн бүртгэлтэй линкийн агуулгаар</p>";
  } else html += '<p class="sub" style="margin:0 0 4px">Шалгалт хийгдээгүй — гейт G8 үүнийг шаардана.</p>';
  html += '<details class="adder"><summary>EOM v5.0 шалгуур (' + EOM_CRITERIA.length + ')</summary><div><ul class="list">' +
    EOM_CRITERIA.map(function (c2) {
      return '<li class="block"><div><b>' + esc(c2.id) + "</b> — " + esc(c2.t) + "</div><p>" + esc(c2.ref) + "</p></li>";
    }).join("") + "</ul></div></details>";
  var emr = w.eomManual;
  if (emr) html += '<p class="note" style="border-color:var(--pass-line);background:var(--pass-bg);color:var(--pass-ink)">' +
    "Хүнээр хянаж баталсан — " + esc(emr.byName) + " (" + esc(emr.role) + ") · " + fmt(emr.ts) +
    (emr.sig !== eomSig(w) ? " · ⚠ дараа нь deliverable өөрчлөгдсөн, дахин хянана уу" : "") +
    (emr.note ? "<br>" + esc(emr.note) : "") + "</p>";
  if (w.status !== "CLOSED") {
    html += '<div class="frow" style="margin:10px 0 0;align-items:flex-end">' +
      '<button class="btn sm2" data-act="eomCheck"' + (S.eomBusy ? " disabled" : "") +
      ' style="margin-bottom:9px">✦ AI шалгалт ажиллуулах</button>';
    if (isBoss() && S.p !== w.owner)
      html += '<label class="field" style="flex:2"><span>Захирлын хяналтын тэмдэглэл</span>' +
        '<input type="text" data-f="emnote" placeholder="ж: нэршил, Document Control, Change Log шалгасан"></label>' +
        '<button class="btn sm2 pass" data-act="eomManual" style="margin-bottom:9px">Хүнээр хянаж баталсан</button>';
    html += "</div>";
    if (!isBoss()) html += '<p class="sub" style="margin:6px 0 0;font-size:11.5px">Drive хаалттай орчинд AI шалгалт ' +
      "ажиллахгүй — тэр тохиолдолд захирал «хүнээр хянаж баталсан» гэж бүртгэж G8-ыг хангана.</p>";
  }
  html += "</div></section>";

  // ── CIO хүлээн зөвшөөрөлт (G9) ───────────────────────────────────────────
  var cs = w.cioSign;
  html += '<section class="card"><header class="card-h"><h3>CIO хүлээн зөвшөөрөлт (G9)</h3>' +
    (cs ? gbadge(cs.decision === "APPROVE" ? "PASS" : "FAIL") : "") + '</header><div class="card-b">' +
    '<p class="sub" style="margin:0 0 8px">Газрын захирлын батлалын (G4) дараа хийсэн ажил болон гаргасан баримт бичгийг ' +
    "хөрөнгө оруулалт хариуцсан <b>CIO Х.Нургүл</b> хүлээн авч зөвшөөрснөө APPROVE + sign-off-оор энд тэмдэглэнэ. " +
    "Амаар зөвшөөрөл хүчингүй — зөвхөн системд бүртгэгдсэн нь тоологдоно.</p>" +
    '<p class="sub" style="margin:0 0 8px;font-size:11.5px">Засаглалын шатлал: эзэмшигч → хянагч → газрын захирал ' +
    "(ХОБПХГ: О.Мөнх-Эрдэнэ · ХОБХУГ: Өлзийбаяр) → CIO Х.Нургүл → хүлээлгэн өгөлт, хүлээн авалт.</p>";
  if (cs) html += '<p class="note" style="' +
    (cs.decision === "APPROVE" ? "border-color:var(--pass-line);background:var(--pass-bg);color:var(--pass-ink)" : "") + '">' +
    (cs.decision === "APPROVE" ? "ХҮЛЭЭН ЗӨВШӨӨРСӨН — " : "БУЦААСАН — ") + esc(cs.byName || cs.by) + " · " + fmt(cs.ts) +
    (cs.comment ? "<br>" + esc(cs.comment) : "") + "</p>";
  else html += '<p class="sub" style="margin:0">Хүлээгдэж байна — гейт G9 үүнийг шаардана.</p>';
  if (isCio() && S.p !== w.owner && (!cs || cs.decision !== "APPROVE") && w.status !== "CLOSED")
    html += decideForm("ciosign");
  html += "</div></section>";

  // ── Захирлуудын зөвшөөрлийн бүртгэл ─────────────────────────────────────
  var bossAll = Object.values(S.users).filter(function (u) {
    return (u.role === "Захирал" || u.role.indexOf("CIO") >= 0) && u.id !== w.owner;
  }).sort(function (a2, b2) { return (a2.dept + a2.name) < (b2.dept + b2.name) ? -1 : 1; });
  var ends = w.endorsements || [];
  var okN = ends.filter(function (e) { return e.decision === "APPROVE"; }).length;
  html += '<section class="card"><header class="card-h"><h3>Захирлуудын зөвшөөрлийн бүртгэл</h3>' +
    '<span class="chip">' + okN + "/" + bossAll.length + " зөвшөөрсөн</span></header><div class='card-b'>" +
    '<p class="sub" style="margin:0 0 8px">Газрын захирал, CIO өөрийн бүртгэлээрээ нэвтэрч ажил, баримтыг ' +
    "зөвшөөрснөө энд тэмдэглэнэ. Албан ёсны хаалт нь G4 батлал, G9 CIO зөвшөөрөлт, sign-off-оор гарна — " +
    "энэ бүртгэл нь хэн, хэзээ зөвшөөрснийг нэг дор харуулах ил тод лог.</p>" +
    '<ul class="list">' + bossAll.map(function (u) {
      var e = ends.find(function (x) { return x.by === u.id; });
      var d2 = (S.config.depts || []).find(function (x) { return x.code === u.dept; });
      return '<li class="block"><div style="display:flex;justify-content:space-between;gap:8px">' +
        "<span><b>" + esc(u.name) + "</b> <span class='sm' style='color:var(--muted)'>" +
        (u.role.indexOf("CIO") >= 0 ? "CIO" : esc(d2 ? d2.code : u.dept) + " · захирал") + "</span></span>" +
        gbadge(e ? (e.decision === "APPROVE" ? "PASS" : "FAIL") : "NOT_APPLICABLE") + "</div>" +
        (e ? "<p>" + (e.decision === "APPROVE" ? "зөвшөөрсөн" : "татгалзсан") + " · " + fmt(e.ts) +
          (e.comment ? " — " + esc(e.comment) : "") + "</p>" : "<p>хүлээгдэж байна</p>") + "</li>";
    }).join("") + "</ul>";
  if (isBoss() && S.p !== w.owner && w.status !== "CLOSED") {
    var mine = ends.find(function (x) { return x.by === S.p; });
    html += '<div class="frow" style="margin-top:10px;align-items:flex-end">' +
      '<label class="field" style="flex:2"><span>Тайлбар (татгалзахад заавал)</span><input type="text" data-f="encmt"></label>' +
      '<div style="display:flex;gap:6px;padding-bottom:9px">' +
      '<button class="btn sm2 pass" data-endorse="APPROVE">' + (mine ? "Зөвшөөрөлт шинэчлэх" : "Зөвшөөрсөн гэж тэмдэглэх") + "</button>" +
      '<button class="btn sm2 warn" data-endorse="RETURN">Татгалзах</button></div></div>';
  }
  html += "</div></section>";

  // ── Баталгаажуулалтын гинж (дараалал) + хүлээлгэн өгөлт ──────────────────
  html += vChain(w);

  html += '<div class="grid2">';

  // deliverables
  var finals = (w.deliverables || []).filter(function (d) { return d.final; }).length;
  html += '<section class="card"><header class="card-h"><h3>Deliverables (' + finals + "/" + (w.requirements || []).length + ' эцсийн)</h3></header><div class="card-b"><ul class="list">' +
    (w.requirements || []).map(function (r, i) {
      var dels = (w.deliverables || []).filter(function (d) { return d.req === r; });
      var fin = dels.some(function (d) { return d.final; });
      var inner = "<li class='block'><div style='display:flex;justify-content:space-between;gap:8px'><span>" +
        (i + 1) + ". " + esc(r) + ' <em class="req" style="color:var(--fail-ink);font-style:normal">*</em></span>' +
        gbadge(fin ? "PASS" : dels.length ? "WARNING" : "FAIL") + "</div>";
      dels.forEach(function (d) {
        inner += '<p><span class="mono">' + esc(d.version) + "</span> <a href=\"" + esc(d.url) + '" target="_blank" rel="noreferrer">' + esc(d.name) + "</a>" +
          (d.final ? ' <span class="badge badge-pass">FINAL</span>'
            : (S.p === w.owner && w.status !== "CLOSED" ? ' <button class="btn sm2 sec" data-final="' + esc(d.id) + '">эцсийн болгох</button>' : "")) + "</p>";
      });
      return inner + "</li>";
    }).join("") + "</ul>";
  if (S.p === w.owner && w.status !== "CLOSED") {
    html += '<details class="adder"><summary>+ Deliverable холбох (gdoc линк)</summary><div>' +
      '<div class="frow">' +
      '<label class="field"><span>Шаардлага</span><select data-f="req">' +
      (w.requirements || []).map(function (r) { return "<option>" + esc(r) + "</option>"; }).join("") + "</select></label>" +
      '<label class="field"><span>Нэр *</span><input type="text" data-f="name"></label></div>' +
      '<div class="frow">' +
      '<label class="field" style="flex:2"><span>Google Drive / Docs линк *</span><input type="url" data-f="url" placeholder="https://docs.google.com/document/d/…"></label>' +
      '<label class="field"><span>Хувилбар</span><input type="text" data-f="version" value="v1.0"></label>' +
      '<label class="field" style="flex:none;display:flex;align-items:center;gap:6px;margin-top:18px"><input type="checkbox" data-f="final" style="width:auto"> эцсийн</label></div>' +
      '<button class="btn sm2" data-act="addDeliverable">Холбох</button></div></details>';
  }
  html += "</div></section>";

  // evidence
  html += '<section class="card"><header class="card-h"><h3>Нотолгоо (' + (w.evidence || []).length + ')</h3></header><div class="card-b">';
  if (!(w.evidence || []).length) html += '<p class="sub" style="margin:0 0 8px">Нотолгоо бүртгэгдээгүй — гейт G7 үүнийг шаардана.</p>';
  else html += '<ul class="list">' + w.evidence.map(function (ev) {
    return '<li class="block"><div style="display:flex;gap:6px;flex-wrap:wrap;align-items:center">' +
      '<span class="chip">' + esc(ev.type) + "</span> " +
      (ev.url ? '<a href="' + esc(ev.url) + '" target="_blank" rel="noreferrer"><b>' + esc(ev.title) + "</b></a>" : "<b>" + esc(ev.title) + "</b>") +
      (ev.verified ? ' <span class="badge badge-pass">✓ баталгаажсан</span>' : ' <span class="badge badge-warn">баталгаажаагүй</span>') + "</div>" +
      '<p>' + esc(ev.byName) + " · " + fmt(ev.ts) +
      (!ev.verified && ev.by !== S.p && (S.p === w.reviewer || S.p === w.approver)
        ? ' · <button class="btn sm2 sec" data-verify="' + esc(ev.id) + '">баталгаажуулах</button>' : "") +
      (!ev.verified && ev.by === S.p && w.status !== "CLOSED"
        ? ' · <button class="btn sm2 sec" data-delev="' + esc(ev.id) + '">устгах</button>' : "") + "</p></li>";
  }).join("") + "</ul>";
  if (w.status !== "CLOSED") {
    html += '<details class="adder"><summary>+ Нотолгоо холбох (gdoc линк)</summary><div>' +
      '<div class="frow"><label class="field"><span>Төрөл</span><select data-f="etype">' +
      ["DOCUMENT", "SPREADSHEET", "MEETING_DECISION", "SCREENSHOT", "REPORT", "UAT", "PRODUCTION", "METRIC", "TRAINING", "OTHER"]
        .map(function (t) { return "<option>" + t + "</option>"; }).join("") + "</select></label>" +
      '<label class="field" style="flex:2"><span>Нэр *</span><input type="text" data-f="etitle"></label></div>' +
      '<label class="field"><span>Drive линк (https)</span><input type="url" data-f="eurl" placeholder="https://drive.google.com/…"></label>' +
      '<label class="field"><span>Тайлбар</span><input type="text" data-f="edesc"></label>' +
      '<button class="btn sm2" data-act="addEvidence">Холбох</button></div></details>';
  }
  html += "</div></section></div>";

  // reviews & approvals, impl & metrics
  html += '<div class="grid2"><section class="card"><header class="card-h"><h3>Review ба батлал</h3></header><div class="card-b">';
  html += (w.reviews || []).length
    ? '<ul class="list">' + w.reviews.map(function (r) {
        return '<li><span class="sm">' + esc(r.type) + " · " + esc(r.by) +
          (r.comment ? ' — <span style="color:var(--muted)">' + esc(r.comment) + "</span>" : "") + "</span>" +
          gbadge(r.decision === "PASS" ? "PASS" : r.decision === "PENDING" ? "NOT_APPLICABLE" : "FAIL") + "</li>";
      }).join("") + "</ul>"
    : '<p class="sub" style="margin:0">Review алга</p>';
  html += '<p class="sub" style="margin:10px 0 4px">Батлал:</p>';
  html += (w.approvals || []).length
    ? '<ul class="list">' + w.approvals.map(function (a) {
        return '<li><span class="sm">' + esc(a.type) + " · " + esc(a.by) + ' · <span class="mono">' + esc(a.version || "—") + "</span>" +
          (a.comment ? ' — <span style="color:var(--muted)">' + esc(a.comment) + "</span>" : "") + "</span>" +
          gbadge(a.decision === "APPROVE" ? "PASS" : a.decision === "PENDING" ? "NOT_APPLICABLE" : "FAIL") + "</li>";
      }).join("") + "</ul>"
    : '<p class="sub" style="margin:0">Батлал алга</p>';
  html += "</div></section>";

  html += '<section class="card"><header class="card-h"><h3>Хэрэгжилт ба метрик</h3></header><div class="card-b">';
  html += '<p class="sub" style="margin:0 0 4px">Хэрэгжилт ' + (w.implReq || p.impl ? "(шаардлагатай — G5)" : "(шаардахгүй)") + ":</p>";
  html += (w.impl || []).length
    ? '<ul class="list">' + w.impl.map(function (i) {
        return "<li><span class='sm'>" + esc(i.status) + (i.env ? " · " + esc(i.env) : "") + " · " + fmt(i.ts) + "</span>" +
          gbadge(i.status === "LIVE" || i.status === "PILOT" ? "PASS" : "NOT_APPLICABLE") + "</li>";
      }).join("") + "</ul>"
    : '<p class="sub" style="margin:0">Бүртгэл алга</p>';
  if (S.p === w.owner && w.status !== "CLOSED") {
    html += '<div class="frow" style="margin-top:8px;align-items:flex-end">' +
      '<label class="field"><span>Төлөв</span><select data-f="istatus">' +
      ["IN_PROGRESS", "PILOT", "LIVE", "FAILED", "ROLLED_BACK", "NOT_REQUIRED"].map(function (s) { return "<option>" + s + "</option>"; }).join("") +
      '</select></label><label class="field"><span>Орчин</span><input type="text" data-f="ienv" placeholder="production / UAT"></label>' +
      '<button class="btn sm2 sec" data-act="recordImpl" style="margin-bottom:9px">Бүртгэх</button></div>';
  }
  html += '<p class="sub" style="margin:12px 0 4px">Метрик (G6):</p>';
  html += (w.metrics || []).length
    ? '<ul class="list">' + w.metrics.map(function (m, i) {
        var row = '<li class="block"><div style="display:flex;justify-content:space-between;gap:8px"><span><b>' + esc(m.name) +
          '</b> <span class="sm num" style="color:var(--muted)">зорилт ' + esc(m.op) + " " + esc(m.target) + esc(m.unit || "") +
          " · бодит: " + (m.actual == null ? "—" : esc(m.actual)) + "</span></span>" +
          gbadge(m.status === "PASS" ? "PASS" : m.status === "FAIL" ? "FAIL" : "NOT_APPLICABLE") + "</div>";
        if (w.status !== "CLOSED") {
          row += "<p>";
          if (S.p === w.owner) row += '<input type="number" step="any" style="width:90px" data-mact="' + i + '" value="' +
            (m.actual == null ? "" : esc(m.actual)) + '" aria-label="Бодит утга"> <button class="btn sm2 sec" data-msave="' + i + '">хадгалах</button> ';
          if ((S.p === w.reviewer || S.p === w.approver) && m.status !== "PASS")
            row += '<button class="btn sm2 pass" data-mpass="' + i + '">PASS</button> <button class="btn sm2 fail" data-mfail="' + i + '">FAIL</button>';
          row += "</p>";
        }
        return row + "</li>";
      }).join("") + "</ul>"
    : '<p class="sub" style="margin:0">Метрик алга</p>';
  html += "</div></section></div>";

  // audit
  html += '<section class="card"><header class="card-h"><h3>Түүх (audit)</h3></header><div class="card-b"><ul class="list">' +
    (w.audit || []).slice(0, 20).map(function (a) {
      return '<li><span class="sm">' + esc(a.action) + '</span><span class="sm" style="color:var(--faint)">' +
        esc(a.by) + " · " + fmt(a.ts) + "</span></li>";
    }).join("") + "</ul></div></section>";
  return html;
}

/* Макро процессын 5 үе шат — «хэн юу хийх» нь хаана байгааг харуулна */
function flowOf(w) {
  var st = chainOf(w), p = profileOf(w);
  var nRev = p.reviews.length, iRev = p.selfqc ? 1 : 0;
  var g = st.slice(iRev + nRev); // батлал…, CIO, гейт, sign-off, хүлээлгэх, хүлээн авалт
  var nApp = p.approvals.length;
  function grp(a2, b2) { return st.slice(a2, b2); }
  var phases = [
    { n: "1", t: "Боловсруулах", w: "Эзэмшигч — баримт, нотолгоо, Self QC",
      steps: p.selfqc ? grp(0, 1) : [] },
    { n: "2", t: "Хяналт", w: "Хянагч — агуулга, DoD-д нийцлийг шалгана",
      steps: grp(iRev, iRev + nRev) },
    { n: "3", t: "Батлал", w: "Газрын захирал → CIO — эрх мэдлээр батална",
      steps: st.slice(iRev + nRev, iRev + nRev + nApp + 1) },
    { n: "4", t: "Хаалт", w: "Гейт G1–G9 + захирлын sign-off",
      steps: st.slice(iRev + nRev + nApp + 1, st.length - 2) },
    { n: "5", t: "Хүлээлцэх", w: "Хүлээн авагч газрын захирал баталгаажуулна",
      steps: st.slice(st.length - 2) }
  ];
  var firstOpen = -1;
  phases.forEach(function (ph, i) {
    ph.done = ph.steps.length > 0 && ph.steps.every(function (x) { return x.done; });
    ph.bad = ph.steps.some(function (x) { return x.fail; });
    if (!ph.done && firstOpen < 0) firstOpen = i;
  });
  if (firstOpen >= 0) phases[firstOpen].now = !phases[firstOpen].bad;
  return phases;
}

function vFlowBar(w) {
  return '<div class="flow">' + flowOf(w).map(function (ph) {
    var doneN = ph.steps.filter(function (x) { return x.done; }).length;
    return '<div class="ph ' + (ph.done ? "done" : ph.bad ? "bad" : ph.now ? "now" : "") + '">' +
      '<div class="pn">ҮЕ ШАТ ' + ph.n + (ph.steps.length ? " · " + doneN + "/" + ph.steps.length : "") + "</div>" +
      '<div class="pt">' + esc(ph.t) + (ph.done ? " ✓" : ph.bad ? " ✕" : "") + "</div>" +
      '<div class="pw">' + esc(ph.w) + "</div></div>";
  }).join("") + "</div>";
}

function vDocCheck() {
  var r = S.dcResult;
  var html = "<h1>Баримт шалгах — Drive линкээр EOM v5.0 нийцэл</h1>" +
    '<p class="sub">Газрын баримт бичгийн <b>Drive линкийг</b> (файл эсвэл бүтэн хавтас) хуулж тавихад ' +
    "AI нь агуулгыг уншиж EOM Handbook v5.0-ийн " + EOM_CRITERIA.length + " шалгуурт тулгаж дүгнэнэ. " +
    "AI зөвхөн зөвлөх (EOM §2.5a) — эцсийн шийдвэр хүнийх; ажлыг хаах G8 шалгуурыг ажлын хуудаснаас нь ажиллуулна.</p>" +
    '<section class="card"><header class="card-h"><h3>Шалгах баримтууд</h3>' +
    '<span class="chip">хавтас эсвэл файл · мөр тутамд нэг линк</span></header><div class="card-b">' +
    '<label class="field"><span>Google Drive / Docs линк(үүд)</span>' +
    '<textarea data-f="dclinks" rows="4" style="width:100%;font-family:var(--mono);font-size:12px" ' +
    'placeholder="https://drive.google.com/drive/folders/…&#10;https://docs.google.com/document/d/…">' +
    esc(S.dcLinks || "") + "</textarea></label>" +
    '<p style="margin:10px 0 0;display:flex;gap:8px;flex-wrap:wrap">' +
    '<button class="btn sm2" data-act="docCheck"' + (S.dcBusy ? " disabled" : "") + ">✦ EOM шалгалт ажиллуулах</button>" +
    (r ? '<button class="btn sm2 sec" data-act="print">🖨 Тайлан хэвлэх</button>' : "") + "</p>" +
    (S.dcBusy ? '<p class="note">' + esc(S.dcProg || "Ажиллаж байна…") + "</p>" : "") +
    '<p class="sub" style="margin:10px 0 0;font-size:11.5px">Зөвхөн drive.google.com / docs.google.com линк. ' +
    "Хавтас өгвөл дотор нь байгаа баримтуудыг (хамгийн олондоо 8) уншина. Уншигдах төрөл: Google Docs/Sheets/Slides, PDF, Word. " +
    "Танай Google эрхээр уншина — таны хараагүй баримтыг харуулахгүй.</p>" +
    "</div></section>";
  if (r) {
    html += '<section class="card"><header class="card-h"><h3>Дүгнэлт — ' + esc(r.ts ? fmt(r.ts) : "") + "</h3>" +
      gbadge(r.result) + '</header><div class="card-b">' +
      (r.summary ? '<p class="sub" style="margin:0 0 10px"><b>' + esc(r.result) + "</b> — " + esc(r.summary) + "</p>" : "") +
      '<ul class="list">' + (r.docs || []).map(function (d) {
        return '<li class="block"><div style="display:flex;justify-content:space-between;gap:8px">' +
          "<span><b>" + esc(d.name) + "</b></span>" +
          gbadge(d.verdict === "PASS" ? "PASS" : d.verdict === "WARNING" ? "WARNING" : "FAIL") + "</div>" +
          ((d.issues || []).length
            ? (d.issues || []).map(function (i2) { return "<p>• [" + esc(i2.crit) + "] " + esc(i2.note) + "</p>"; }).join("")
            : "<p>Шалгуур бүрд нийцсэн — дутагдал бүртгэгдээгүй.</p>") + "</li>";
      }).join("") + "</ul>" +
      (r.unread && r.unread.length ? '<p class="sub" style="margin:8px 0 0">Уншиж чадаагүй: ' + esc(r.unread.join(", ")) + "</p>" : "") +
      '<p class="note" style="margin-top:12px">AI зөвлөх дүгнэлт — баримтын эхний 15000 тэмдэгтээр уншсан. ' +
      "Албан ёсны нийцлийн шийдвэрийг захирал (эсвэл ажлын G8 шалгуур) гаргана.</p>" +
      "</div></section>";
  }
  html += '<details class="adder"><summary>EOM v5.0 шалгуур (' + EOM_CRITERIA.length + ')</summary><div><ul class="list">' +
    EOM_CRITERIA.map(function (c2) {
      return '<li class="block"><div><b>' + esc(c2.id) + "</b> — " + esc(c2.t) + "</div><p>" + esc(c2.ref) + "</p></li>";
    }).join("") + "</ul></div></details>";
  return html;
}

function vProcess() {
  var roles = [
    { r: "Эзэмшигч (ажилтан)", who: "Ажлыг хийж, баримтжуулдаг хүн",
      d: [["Юу хийнэ", "Deliverable бүрийг Drive линкээр холбож «эцсийн» болгоно, нотолгоо бүртгэнэ, Self QC хийж хяналтад илгээнэ."],
          ["Ямар шийдвэр", "Ажлаа хаалтад ДЭВШҮҮЛНЭ (SUBMIT FOR CLOSURE) — өөрөө хаахгүй."],
          ["Хийж болохгүй", "Өөрийн ажлыг хянах, батлах, гарын үсэг зурах, өөрийн нотолгоог баталгаажуулах."]] },
    { r: "Хянагч (reviewer)", who: "Агуулгын шалгагч — жишээ нь Б.Онон",
      d: [["Юу шалгана", "АГУУЛГА: DoD-ийн бүрэлдэхүүн бүрдсэн эсэх, баримтын чанар, дотоод зөрчил, нотолгооны бодит байдал."],
          ["Ямар шийдвэр", "PASS (агуулга бэлэн) · RETURN (засаад ир) · REJECT (үндсэндээ буруу). Тайлбар заавал."],
          ["Хийж болохгүй", "Эрх мэдлээр батлах, ажил хаах. Хяналт нь «чанарын» шат, «эрхийн» шат биш."]] },
    { r: "Батлагч (газрын захирал)", who: "О.Мөнх-Эрдэнэ (ХОБПХГ) · Өлзийбаяр Сандагдорж (ХОБХУГ)",
      d: [["Юу шалгана", "ЭРХ МЭДЭЛ: хянагдсан эцсийн хувилбарыг байгууллагын нэрийн өмнөөс батлах эсэх, эрсдэл, зардал, бодлогын нийцэл."],
          ["Ямар шийдвэр", "APPROVE (хувилбарын дугаартай) · RETURN · REJECT. Батлал нь тодорхой хувилбарт (v1.0) хамаарна."],
          ["Онцлог", "Хянагчийн PASS байхгүйгээр батлал гейтэд тоологдохгүй — дараалал: хяналт → батлал."]] },
    { r: "CIO (Х.Нургүл)", who: "Хөрөнгө оруулалт хариуцсан ГЗ-ын орлогч",
      d: [["Юу шалгана", "Газраас гарсан ажил, баримт бичгийг хүлээн авч зөвшөөрөх эсэх (G9)."],
          ["Ямар шийдвэр", "APPROVE + sign-off · RETURN. Амаар зөвшөөрөл хүчингүй."],
          ["Онцлог", "Захирлын батлалын ДАРАА явна — эцсийн засаглалын хүлээн зөвшөөрөлт."]] },
    { r: "Хаалтын sign-off", who: "Захирал / CIO (эзэмшигчээс өөр хүн)",
      d: [["Нөхцөл", "Гейт G1–G9 шинээр тооцогдож FAIL биш байх ёстой — систем үүнийг дахин шалгаж түгжинэ."],
          ["Ямар шийдвэр", "SIGN OFF → ажил ХААГДСАН. RETURN → хаалт эргэж, ажил нээлттэй хэвээр."],
          ["Онцлог", "«Батлагдсан» ≠ «хаагдсан». Батлал бол баримтад, хаалт бол бүх шалгуурт."]] },
    { r: "Хүлээн авагч захирал", who: "Хүлээлгэн өгсөн газрын захирал",
      d: [["Юу шалгана", "Хүлээлгэн өгсөн багц бүрэн эсэх, өөрийн газарт хэрэгжүүлэхэд хүрэлцэх эсэх."],
          ["Ямар шийдвэр", "«Хүлээн авснаа баталгаажуулах» · «Буцаах» (тайлбартай)."],
          ["Онцлог", "Зөвхөн нэрлэгдсэн хүлээн авагч захирал өөрөө — өөр захирал, CIO ч орлохгүй."]] }
  ];
  var gates = [
    ["G1", "Deliverable", "Шаардлага тус бүрд эцсийн (FINAL) хувилбарын линк холбогдсон", "Эзэмшигч"],
    ["G2", "Self QC", "Эзэмшигч өөрөө шалгаж PASS бүртгэсэн", "Эзэмшигч"],
    ["G3", "Review", "Шаардлагатай төрөл бүрд хянагчийн PASS", "Хянагч"],
    ["G4", "Батлал", "Захирлын APPROVE — хувилбарын дугаартай", "Захирал"],
    ["G5", "Хэрэгжилт", "Шаардлагатай бол production/pilot LIVE бүртгэл", "Эзэмшигч"],
    ["G6", "Метрик", "Зорилтот үзүүлэлт хэмжигдэж PASS шийдвэр гарсан", "Эзэмшигч + хянагч"],
    ["G7", "Нотолгоо", "Хамгийн багадаа шаардагдах нотолгоо холбогдсон", "Эзэмшигч"],
    ["G8", "EOM нийцэл", "Баримт EOM v5.0-ийн стандартад нийцсэн (AI шалгалт эсвэл захирлын хяналт)", "AI зөвлөх + захирал"],
    ["G9", "CIO зөвшөөрөлт", "CIO ажил, баримтыг хүлээн авч APPROVE + sign-off", "CIO"]
  ];
  var sample = deptWorks()[0];
  return "<h1>Процесс — хэн юу хийдэг, хэрхэн үнэлдэг</h1>" +
    '<p class="sub">Ажил бүр доорх 5 үе шатыг дараалан дамждаг. Үе шат бүрд өөр хүн, өөр төрлийн шийдвэр гаргана: ' +
    "<b>хянагч агуулгыг</b>, <b>захирал эрх мэдлийг</b>, <b>CIO хүлээн зөвшөөрөлтийг</b>, <b>гейт бүрэн бүтэн байдлыг</b> хардаг.</p>" +
    (sample ? vFlowBar(sample) : "") +
    '<section class="card"><header class="card-h"><h3>Хянагч ба Батлагч — юугаараа ялгаатай вэ?</h3></header><div class="card-b">' +
    '<div class="roles">' +
    '<div class="role-c"><div class="rw">Хяналт — чанарын шат</div><h4>Хянагч «зөв хийгдсэн үү?»</h4>' +
    '<dl><dt>Асуулт</dt><dd>Агуулга DoD-д нийцэж байна уу? Баримт бүрэн, зөрчилгүй, нотолгоотой уу?</dd>' +
    "<dt>Шийдвэр</dt><dd>PASS / RETURN / REJECT — засварын заавартай.</dd>" +
    "<dt>Хамрах хүрээ</dt><dd>Ажлын агуулга, чанар, бүрэн бүтэн байдал.</dd></dl></div>" +
    '<div class="role-c"><div class="rw">Батлал — эрхийн шат</div><h4>Батлагч «байгууллагын нэрийн өмнөөс батлах уу?»</h4>' +
    '<dl><dt>Асуулт</dt><dd>Хянагдсан эцсийн хувилбарыг батлах эрсдэл, бодлогын нийцэл хангалттай уу?</dd>' +
    "<dt>Шийдвэр</dt><dd>APPROVE (хувилбарт хамаарна) / RETURN / REJECT.</dd>" +
    "<dt>Хамрах хүрээ</dt><dd>Эрх мэдэл, хариуцлага — гарын үсэг зурах шийдвэр.</dd></dl></div></div>" +
    '<p class="note" style="margin-top:12px"><b>Дараалал заавал:</b> Self QC → хянагчийн PASS → захирлын APPROVE → CIO зөвшөөрөлт → гейт → sign-off. ' +
    "Хянагчийн PASS-гүй батлал гейтэд тоологдохгүй; батлалгүй sign-off боломжгүй. Ижил хүн эзэмшигч бөгөөд хянагч/батлагч байж болохгүй (үүргийн тусгаарлалт).</p>" +
    "</div></section>" +
    '<section class="card"><header class="card-h"><h3>Үүрэг бүрийн заавар</h3></header><div class="card-b"><div class="roles">' +
    roles.map(function (r) {
      return '<div class="role-c"><div class="rw">' + esc(r.who) + '</div><h4>' + esc(r.r) + "</h4><dl>" +
        r.d.map(function (x) { return "<dt>" + esc(x[0]) + "</dt><dd>" + esc(x[1]) + "</dd>"; }).join("") + "</dl></div>";
    }).join("") + "</div></div></section>" +
    '<section class="card"><header class="card-h"><h3>Хаалтын гейт G1–G9 — юу шалгагддаг</h3></header><div class="card-b">' +
    '<div style="overflow-x:auto"><table><thead><tr><th>Гейт</th><th>Нэр</th><th>Хангах нөхцөл</th><th>Хэн хангана</th></tr></thead><tbody>' +
    gates.map(function (g2) {
      return "<tr><td><b class='mono'>" + esc(g2[0]) + "</b></td><td>" + esc(g2[1]) + "</td><td>" +
        esc(g2[2]) + "</td><td>" + esc(g2[3]) + "</td></tr>";
    }).join("") + "</tbody></table></div>" +
    '<p class="note" style="margin-top:12px"><b>Хэрхэн үнэлж дүгнэх:</b> «Check-in» хэсэг ажил бүрийг гейтээр шинээр тооцож ' +
    "<b>Бүрэн</b> (гейт + sign-off + хүлээн авалт) · <b>Хаахад бэлэн</b> (гейт FAIL биш) · <b>Дутагдалтай</b> (улаан дутагдалтай) гэж гаргана. " +
    "Улаан дутагдал бүрд «яг юу хийх» заавар хамт харагдана.</p></div></section>";
}

function isBoss() { return S.p && (U(S.p).role === "Захирал" || U(S.p).role.indexOf("CIO") >= 0); }

function chainOf(w) {
  var p = profileOf(w), steps = [];
  function step(title, done, detail, now2, fail2) {
    steps.push({ t: title, done: !!done, d: detail || "", now: !!now2, fail: !!fail2 });
  }
  if (p.selfqc) {
    var sq = (w.reviews || []).find(function (x) { return x.type === "SELF_QC" && x.decision === "PASS"; });
    step("Self QC — эзэмшигчийн өөрийн шалгалт", sq, sq ? "<b>" + esc(sq.by) + "</b> · " + fmt(sq.ts) : "хүлээгдэж байна");
  }
  p.reviews.forEach(function (t) {
    var rv = (w.reviews || []).find(function (x) { return x.type === t && x.decision === "PASS"; });
    step(t + " review — агуулгын хяналт (хянагч)", rv,
      rv ? "<b>" + esc(rv.by) + "</b> PASS · " + fmt(rv.decidedTs || rv.ts)
         : "хянагч " + esc(U(w.reviewer).name) + " агуулга, DoD-ийн нийцлийг шалгаж PASS өгнө");
  });
  p.approvals.forEach(function (t) {
    var ap = (w.approvals || []).find(function (x) { return x.type === t && x.decision === "APPROVE"; });
    step("Батлал (" + t + ") — эрх мэдлийн шийдвэр (захирал)", ap,
      ap ? "<b>" + esc(ap.by) + "</b> APPROVE" + (ap.version ? " · хувилбар " + esc(ap.version) : "") + " · " + fmt(ap.decidedTs || ap.ts)
         : "газрын захирал эцсийн хувилбарыг байгууллагын нэрийн өмнөөс батална");
  });
  var cs0 = w.cioSign, csOk = cs0 && cs0.decision === "APPROVE";
  step("CIO хүлээн зөвшөөрөлт — Х.Нургүл", csOk,
    csOk ? "<b>" + esc(cs0.byName || cs0.by) + "</b> APPROVE + sign-off · " + fmt(cs0.ts)
      : cs0 ? "буцаасан: " + esc(cs0.comment || "") + " · " + esc(cs0.byName || "")
      : "ажил, баримтыг хүлээн авч зөвшөөрөх sign-off хүлээгдэж байна",
    false, cs0 && cs0.decision !== "APPROVE");
  var g = w.gate;
  step("Хаалтын гейт (G1–G9)", g && g.result !== "FAIL",
    g ? "үр дүн <b>" + g.result + "</b> · " + fmt(g.ts) : "SUBMIT FOR CLOSURE-оор ажиллана",
    false, g && g.result === "FAIL");
  var closed = w.closure && w.closure.status === "CLOSED";
  step("Хаалтын sign-off — эрх бүхий хүн", closed,
    closed ? "<b>" + esc(w.closure.signedBy) + "</b> · " + fmt(w.closure.ts) : "захирлын гарын үсэг хүлээгдэж байна",
    w.closure && w.closure.status === "READY");
  var ho = w.handover;
  step("Хүлээлгэн өгөлт — газрын захиралд", ho,
    ho ? "<b>" + esc(ho.by) + "</b> → " + esc(ho.toName) + " · " + fmt(ho.ts) +
      (ho.note ? "<br>" + esc(ho.note) : "") + (ho.url ? '<br><a href="' + esc(ho.url) + '" target="_blank" rel="noreferrer">багц линк</a>' : "")
       : "хаагдсаны дараа эзэмшигч бүртгэнэ");
  var conf = ho && ho.status === "CONFIRMED";
  step("Хүлээн авалтын баталгаажуулалт — газрын захирал", conf,
    conf ? "<b>" + esc(ho.confirmedBy) + "</b> хүлээн авснаа баталгаажуулав · " + fmt(ho.confirmedTs)
      : ho && ho.status === "RETURNED" ? "буцаагдсан: " + esc(ho.comment || "") + " · " + esc(ho.confirmedBy || "")
      : ho ? "хүлээн авагч захирал (" + esc(ho.toName) + ") баталгаажуулна"
      : "хүлээн авагч газрын захирлын баталгаажуулалт",
    ho && ho.status === "PENDING", ho && ho.status === "RETURNED");
  return steps;
}
function vChain(w) {
  var steps = chainOf(w);
  var doneN = steps.filter(function (s) { return s.done; }).length;
  var html = '<section class="card"><header class="card-h"><h3>Баталгаажуулалтын гинж — дараалал</h3>' +
    '<span class="chip">' + doneN + "/" + steps.length + " алхам</span></header><div class='card-b'>" +
    '<ol class="chain2">' +
    steps.map(function (s, i) {
      return '<li class="' + (s.done ? "done" : s.fail ? "fail2" : s.now ? "now" : "") + '">' +
        '<span class="cm">' + (s.done ? "✓" : s.fail ? "✕" : i + 1) + "</span>" +
        '<div class="cb"><div class="ct">' + esc(s.t) + '</div><div class="cd">' + s.d + "</div></div></li>";
    }).join("") + "</ol>";

  var ho = w.handover;
  // owner registers handover after CLOSED
  if (S.p === w.owner && w.status === "CLOSED" && (!ho || ho.status === "RETURNED")) {
    var myDept = U(S.p).dept;
    var bosses = Object.values(S.users).filter(function (u) {
      return u.id !== S.p && (u.role === "Захирал" || u.role.indexOf("CIO") >= 0);
    }).sort(function (a, b) {
      function rank(u) { return u.role.indexOf("CIO") >= 0 ? 2 : u.dept === myDept ? 0 : 1; }
      return rank(a) - rank(b) || (a.name < b.name ? -1 : 1);
    });
    var opts = bosses.map(function (u) {
      var d = (S.config.depts || []).find(function (x) { return x.code === u.dept; });
      var lbl = u.role.indexOf("CIO") >= 0 ? "CIO — хөрөнгө оруулалт хариуцсан"
        : u.dept === myDept ? "миний газрын захирал"
        : esc(d ? d.name : u.dept) + "-ын захирал";
      return '<option value="' + esc(u.id) + '">' + esc(u.name) + " — " + lbl + "</option>";
    }).join("");
    html += '<div class="note" style="margin-top:16px"><b>Хүлээлгэн өгөлт бүртгэх</b> — хүлээн авагч зөвхөн <b>газрын захирал</b>: ' +
      "өөрийн газрын ажлыг өөрийн газрын захиралд, өөр газарт хүргэх ажлыг тэр газрын захиралд хүлээлгэн өгнө. " +
      "«Хүлээж авсан, дууссан» гэдгийг зөвхөн тэр захирал өөрөө баталгаажуулна.</div>" +
      '<div class="frow" style="margin-top:10px;align-items:flex-end">' +
      '<label class="field"><span>Хүлээн авагч *</span><select data-f="hoto">' + opts + "</select></label>" +
      '<label class="field" style="flex:2"><span>Тэмдэглэл</span><input type="text" data-f="honote" placeholder="ж: эцсийн багц v1.0, 5 баримт"></label></div>' +
      '<div class="frow" style="align-items:flex-end">' +
      '<label class="field" style="flex:2"><span>Багцын Drive линк</span><input type="url" data-f="hourl" placeholder="https://drive.google.com/…"></label>' +
      '<button class="btn sm2" data-act="handover" style="margin-bottom:10px">Хүлээлгэн өгөх</button></div>';
  }
  // recipient (or director, never owner) confirms
  if (ho && ho.status === "PENDING" && S.p !== w.owner && S.p === ho.to) {
    html += '<div class="note" style="margin-top:16px"><b>' + esc(ho.by) + "</b> танд хүлээлгэн өгсөн — хүлээн авснаа баталгаажуулна уу.</div>" +
      '<div class="frow" style="margin-top:10px;align-items:flex-end">' +
      '<label class="field" style="flex:2"><span>Тайлбар (буцаахад заавал)</span><input type="text" data-f="hocmt"></label>' +
      '<div style="display:flex;gap:6px;margin-bottom:10px">' +
      '<button class="btn sm2 pass" data-hoconf="1">Хүлээн авснаа баталгаажуулах</button>' +
      '<button class="btn sm2 warn" data-hoconf="0">Буцаах</button></div></div>';
  }
  return html + "</div></section>";
}

function vNew() {
  var users = Object.values(S.users).sort(function (a, b) { return a.name < b.name ? -1 : 1; });
  var uopts = function (excl) {
    return users.filter(function (u) { return u.id !== excl; })
      .map(function (u) { return '<option value="' + esc(u.id) + '">' + esc(u.name) + " (" + esc(u.dept) + " · " + esc(u.role) + ")</option>"; }).join("");
  };
  var dopts = (S.config.depts || []).map(function (d) {
    var sel = d.code === U(S.p).dept ? " selected" : "";
    return '<option value="' + esc(d.code) + '"' + sel + ">" + esc(d.code) + " — " + esc(d.name) + "</option>";
  }).join("");
  var types = ["POLICY","PROCEDURE","STANDARD","GUIDELINE","PROCESS","PROCESS_IMPROVEMENT","REPORT","ANALYSIS","CHANGE_PROPOSAL","AI_AGENT","AUTOMATION","PILOT","TRAINING","COMMITTEE","PROJECT","SPRINT","KPI","BAU","OTHER"];
  return '<button class="backlink" data-act="back">← Буцах</button>' +
    "<h1>Шинэ ажил үүсгэх</h1>" +
    '<p class="sub">Ажлын төрөл нь хаалтын шаардлагыг (G1–G9 гейт) тодорхойлно. Батлагчаар өөрийгөө сонгох боломжгүй — эрх мэдлийн тусгаарлалт.</p>' +
    '<section class="card"><div class="card-b">' +
    '<label class="field"><span>Нэр *</span><input type="text" data-f="nw_title" maxlength="300"></label>' +
    '<div class="frow">' +
    '<label class="field"><span>Газар *</span><select data-f="nw_dept">' + dopts + "</select></label>" +
    '<label class="field"><span>Төрөл *</span><select data-f="nw_type">' +
    types.map(function (t) { return "<option>" + t + "</option>"; }).join("") + "</select></label>" +
    '<label class="field"><span>Зэрэглэл</span><select data-f="nw_prio"><option>LOW</option><option selected>MEDIUM</option><option>HIGH</option><option>CRITICAL</option></select></label>' +
    '<label class="field"><span>Хугацаа</span><input type="date" data-f="nw_deadline"></label></div>' +
    '<label class="field"><span>Холбогдох KR (заавал биш)</span><input type="text" data-f="nw_kr" placeholder="ж: O1-KR2 эсвэл газрын өөрийн KR код"></label>' +
    '<label class="field"><span>Definition of Done</span><textarea data-f="nw_dod" rows="2" maxlength="1500" placeholder="Ямар нөхцөлд «хийгдсэн» гэж үзэхийг тодорхой бич"></textarea></label>' +
    '<label class="field"><span>Deliverable шаардлагууд (мөр тус бүрд нэг)</span><textarea data-f="nw_reqs" rows="3" placeholder="Журам\nЗааварчилгаа\nChecklist"></textarea></label>' +
    '<div class="frow">' +
    '<label class="field"><span>Хянагч *</span><select data-f="nw_reviewer">' + uopts(null) + "</select></label>" +
    '<label class="field"><span>Батлагч *</span><select data-f="nw_approver">' + uopts(S.p) + "</select></label>" +
    '<label class="field" style="flex:none;display:flex;align-items:center;gap:7px;margin-top:20px"><input type="checkbox" data-f="nw_impl" style="width:auto"> Хэрэгжилт шаардана (G5)</label></div>' +
    '<button class="btn" data-act="createWork">Үүсгэх</button>' +
    "</div></section>";
}

function vAdmin() {
  if (!isDirector()) return "<h1>Админ</h1><p class='sub'>Зөвхөн захирлын эрхтэй хэрэглэгчид.</p>";
  var users = Object.values(S.users).sort(function (a, b) { return (a.dept + a.name) < (b.dept + b.name) ? -1 : 1; });
  var dopts = (S.config.depts || []).map(function (d) {
    return '<option value="' + esc(d.code) + '">' + esc(d.code) + "</option>";
  }).join("");
  return "<h1>Админ — газар ба хэрэглэгчид</h1>" +
    '<p class="sub">Энд нэмсэн газар, хэрэглэгч бүх гишүүнд шууд харагдаж, нэвтрэх жагсаалтад орно (хамтын сан).</p>' +
    '<div class="grid2">' +
    '<section class="card"><header class="card-h"><h3>Газрууд (' + (S.config.depts || []).length + ')</h3></header><div class="card-b">' +
    '<ul class="list">' + (S.config.depts || []).map(function (d) {
      var n = workList().filter(function (w) { return (w.dept || "IPPDD") === d.code; }).length;
      return "<li><span><b class='mono'>" + esc(d.code) + "</b> " + esc(d.name) + "</span><span class='chip'>" + n + " ажил</span></li>";
    }).join("") + "</ul>" +
    '<div class="frow" style="margin-top:12px;align-items:flex-end">' +
    '<label class="field"><span>Код *</span><input type="text" data-f="ad_code" placeholder="RISK" maxlength="12"></label>' +
    '<label class="field" style="flex:2"><span>Нэр *</span><input type="text" data-f="ad_name" placeholder="Эрсдэлийн удирдлагын газар"></label>' +
    '<button class="btn sm2" data-act="addDept" style="margin-bottom:10px">Нэмэх</button></div>' +
    "</div></section>" +
    '<section class="card"><header class="card-h"><h3>Хэрэглэгчид (' + users.length + ')</h3></header><div class="card-b">' +
    '<ul class="list">' + users.map(function (u) {
      return "<li><span><b>" + esc(u.name) + "</b> <span class='sm' style='color:var(--faint)'>" + esc(u.email) + "</span></span>" +
        "<span class='chip'>" + esc(u.dept) + " · " + esc(u.role) + "</span></li>";
    }).join("") + "</ul>" +
    '<div class="frow" style="margin-top:12px">' +
    '<label class="field"><span>Нэр *</span><input type="text" data-f="au_name"></label>' +
    '<label class="field"><span>И-мэйл *</span><input type="text" data-f="au_email" placeholder="nэр@netgroup.mn"></label></div>' +
    '<div class="frow" style="align-items:flex-end">' +
    '<label class="field"><span>Газар</span><select data-f="au_dept">' + dopts + "</select></label>" +
    '<label class="field"><span>Эрх</span><select data-f="au_role"><option>Ажилтан</option><option>Хянагч</option><option>Захирал</option></select></label>' +
    '<button class="btn sm2" data-act="addUser" style="margin-bottom:10px">Нэмэх</button></div>' +
    '<p class="sub" style="margin:10px 0 0;font-size:11.5px">Албан ёсны системд хэрэглэгч Google Workspace и-мэйлээрээ нэвтэрч, эрх нь автоматаар холбогдоно.</p>' +
    "</div></section></div>";
}

function assessWork(w) {
  var g = evaluateGate(w, TODAY); // шинээр тооцно — юу ч бичихгүй, цэвэр үнэлгээ
  var steps = chainOf(w), done = steps.filter(function (s) { return s.done; }).length;
  var verdict, cls;
  if (w.status === "CLOSED" && w.handover && w.handover.status === "CONFIRMED") {
    verdict = "Бүрэн — хаагдаж, хүлээн авалт баталгаажсан"; cls = "ok";
  } else if (w.status === "CLOSED") {
    verdict = "Хаагдсан — хүлээлгэн өгөлт дутуу"; cls = "mid";
  } else if (g.result !== "FAIL") {
    verdict = "Хаахад бэлэн — sign-off хүлээж байна"; cls = "mid";
  } else {
    verdict = "Дутагдалтай"; cls = "bad";
  }
  var overdue = w.status !== "CLOSED" && w.deadline && w.deadline < TODAY;
  return { g: g, steps: steps, done: done, verdict: verdict, cls: cls, overdue: overdue };
}
function vCheckin() {
  var ws = deptWorks();
  var krs = krList();
  var weighted = 0;
  krs.forEach(function (k) { weighted += (k.objWeight / 100) * (k.weight / 100) * (k.achievement || 0); });
  weighted = Math.round(weighted * 100) / 100;
  var A2 = ws.map(function (w) { return { w: w, a: assessWork(w) }; });
  var full = A2.filter(function (x) { return x.a.cls === "ok"; }).length;
  var ready = A2.filter(function (x) { return x.a.cls === "mid"; }).length;
  var gap = A2.filter(function (x) { return x.a.cls === "bad"; }).length;
  var overdueN = A2.filter(function (x) { return x.a.overdue; }).length;

  var html = '<div style="display:flex;gap:10px;align-items:flex-start;flex-wrap:wrap">' +
    "<div style='flex:1;min-width:260px'><h1>Employee OKR Performance Check-in</h1>" +
    '<p class="sub">' + esc(U("LA").name) + " · " + esc(S.meta ? S.meta.code : "") + " · тайлан үүсгэсэн: " + esc(TODAY) +
    " · Ажил бүр дээр гейт G1–G9-г (EOM нийцэл, CIO хүлээн зөвшөөрөлт орсон) ШИНЭЭР тооцсон детерминист үнэлгээ. Баримтын агуулгыг уншаагүй — системд бүртгэгдсэн нэр, хувилбар, төлөв, нотолгоонд тулгуурлав.</p></div>" +
    '<div style="display:flex;gap:8px">' +
    '<button class="btn sec sm2" data-act="print">🖨 Хэвлэх / PDF</button>' +
    '<button class="btn sm2" data-act="checkinAi"' + (S.aiBusy ? " disabled" : "") + ">" +
    (S.aiBusy ? "AI дүгнэж байна…" : "✦ AI дүгнэлт бэлтгэх") + "</button></div></div>" +
    deptChips() +
    '<div class="stats">' +
    '<div class="stat"><div class="l">Жинлэсэн гүйцэтгэл</div><div class="v">' + weighted + "%</div></div>" +
    '<div class="stat"><div class="l">Бүрэн (хаагдсан+хүлээн авсан)</div><div class="v good">' + full + "/" + ws.length + "</div></div>" +
    '<div class="stat"><div class="l">Хаахад бэлэн</div><div class="v">' + ready + "</div></div>" +
    '<div class="stat"><div class="l">Дутагдалтай</div><div class="v' + (gap ? " bad" : " good") + '">' + gap + "</div></div>" +
    '<div class="stat"><div class="l">Хугацаа хэтэрсэн</div><div class="v' + (overdueN ? " bad" : " good") + '">' + overdueN + "</div></div></div>";

  if (S.checkinAi) {
    html += '<section class="card"><header class="card-h"><h3>✦ AI дүгнэлт — зөвлөмж (эцсийн үнэлгээ хүнийх)</h3></header>' +
      '<div class="card-b"><div class="ci-ai">' + esc(S.checkinAi) + "</div>" +
      '<p class="sub" style="margin:10px 0 0;font-size:11px">AI нь системийн бүртгэлд тулгуурлав; баримтын доторх агуулгыг уншаагүй. Батлах, хаах эрх AI-д байхгүй.</p></div></section>';
  }

  // KR товчоо
  html += '<section class="card"><header class="card-h"><h3>KR-ийн товчоо</h3></header><div class="scroll"><table>' +
    "<thead><tr><th>KR</th><th>Жин</th><th>Хугацаа</th><th>Төлөв</th><th>Гүйцэтгэл</th><th>Нээлттэй ажил</th></tr></thead><tbody>" +
    krs.map(function (k) {
      var open = openWorks().filter(function (w) { return w.kr === k.id; }).length;
      return "<tr><td class='mono'>" + esc(k.id) + "</td><td class='num'>" + k.weight + "%</td>" +
        "<td class='num'>" + esc(k.deadline || "—") + "</td>" +
        "<td>" + badge(k.status === "CLOSED" ? "Хаагдсан" : k.status === "IN_PROGRESS" ? "Хийгдэж байна" : "Эхлээгүй",
          k.status === "CLOSED" ? "pass" : k.status === "IN_PROGRESS" ? "info" : "muted") + "</td>" +
        "<td class='num'>" + (k.achievement || 0) + "%</td><td class='num'>" + open + "</td></tr>";
    }).join("") + "</tbody></table></div></section>";

  // ажил тус бүрийн үнэлгээ
  html += '<h3 style="margin:18px 0 10px;font-size:15px">Ажил тус бүрийн үнэлгээ (' + ws.length + ")</h3>";
  A2.forEach(function (x) {
    var w = x.w, a = x.a;
    var finals = (w.deliverables || []).filter(function (d) { return d.final; }).length;
    var evN = (w.evidence || []).length;
    var evV = (w.evidence || []).filter(function (e) { return e.verified; }).length;
    var gaps = a.g.findings.filter(function (f) { return f.res === "FAIL"; });
    html += '<div class="ci-work"><div class="ci-h">' +
      '<button class="backlink" data-open="' + esc(w.id) + '" style="margin:0;font-family:var(--font-mono);font-size:12px">' + esc(w.code) + "</button>" +
      "<b>" + esc(w.title) + '</b><span class="sp"></span>' +
      wbadge(w.status) + ' <span class="verdict ' + a.cls + '">' + esc(a.verdict) + "</span></div>" +
      (w.dod ? '<p class="ci-dod"><b>DoD:</b> ' + esc(w.dod) + "</p>" : '<p class="ci-dod" style="color:var(--warn)">DoD тодорхойлогдоогүй — check-in-ий өмнө нөхөх.</p>') +
      '<div class="ci-facts">' +
      "<span>Гейт: " + gbadge(a.g.result) + "</span>" +
      "<span>Гинж: <b>" + a.done + "/" + a.steps.length + "</b></span>" +
      "<span>Эцсийн deliverable: <b>" + finals + "/" + (w.requirements || []).length + "</b></span>" +
      "<span>Нотолгоо: <b>" + evN + "</b> (баталгаажсан " + evV + ")</span>" +
      (w.kr ? "<span>KR: <b class='mono'>" + esc(w.kr) + "</b></span>" : "") +
      (a.overdue ? '<span class="late">Хугацаа хэтэрсэн (' + esc(w.deadline) + ")</span>" : "") +
      "</div>" +
      (gaps.length ? '<ul class="ci-gaps">' + gaps.map(function (f) {
        return "<li>" + esc(f.title) + (f.act ? " — <span style='color:var(--muted)'>" + esc(f.act) + "</span>" : "") + "</li>";
      }).join("") + "</ul>" : "") +
      "</div>";
  });
  html += '<p class="note">Энэ тайлан хэвлэхэд бэлэн (🖨 товч → PDF болгон хадгалж хуралд авч орно). Дүгнэлтийн тайлбар: «Бүрэн» = гейт + sign-off + хүлээн авалт; «Хаахад бэлэн» = гейт FAIL биш; «Дутагдалтай» = гейтийн улаан дутагдалтай.</p>';
  return html;
}

function vQueue(kind) {
  var isRev = kind === "rev";
  var items = isRev ? pendingReviews() : pendingApprovals();
  var mine = items.filter(function (x) { return isRev ? S.p === x.w.reviewer : S.p === x.w.approver; });
  var html = "<h1>" + (isRev ? "Хянагчийн дараалал" : "Батлагчийн дараалал") + "</h1>" +
    '<p class="sub">' + (isRev ? "Танд оногдсон review-үүд. RETURN/REJECT-д тайлбар заавал." :
      "Танд оногдсон батлал ба хаалтын sign-off-ууд.") + "</p>";
  if (!mine.length) return html + '<div class="card"><div class="card-b"><p class="sub" style="margin:0">' +
    (items.length ? "Энэ хүлээлт өөр хүнд оногдсон (" + esc(me().name) + " биш)." : "Хүлээгдэж буй зүйл алга.") + "</p></div></div>";
  mine.forEach(function (x) {
    var w = x.w;
    html += '<section class="card"><header class="card-h"><h3><button class="backlink" data-open="' + esc(w.id) + '" style="font-size:13.5px">' +
      esc(w.code) + "</button> — " + esc(w.title) + "</h3>" + wbadge(w.status) + '</header><div class="card-b">';
    if (x.sign) {
      html += '<p class="sub">Хаалтын sign-off · гейт: ' + (w.gate ? w.gate.result : "?") + " · хүссэн: " + esc(w.closure.requestedBy) + "</p>" +
        decideForm("sign", ' data-wid="' + esc(w.id) + '"');
    } else if (isRev) {
      html += '<p class="sub">Review төрөл: <b>' + esc(x.r.type) + "</b> · Эзэмшигч: " + esc(U(w.owner).name) +
        " · Эцсийн deliverable: " + (w.deliverables || []).filter(function (d) { return d.final; }).length +
        " · Нотолгоо: " + (w.evidence || []).length + "</p>" +
        decideForm("rev", ' data-rid="' + esc(x.r.id) + '" data-wid="' + esc(w.id) + '"');
    } else {
      html += '<p class="sub">Батлалын төрөл: <b>' + esc(x.a.type) + "</b> · Хувилбар: <b class='mono'>" + esc(x.a.version || "—") +
        "</b> · Review: " + (w.reviews || []).filter(function (r) { return r.decision === "PASS"; }).length + " PASS</p>" +
        decideForm("app", ' data-aid="' + esc(x.a.id) + '" data-wid="' + esc(w.id) + '"');
    }
    html += "</div></section>";
  });
  return html;
}

function vReport() {
  var krs = krList(), c = S.meta && S.meta.closure;
  var weighted = 0;
  krs.forEach(function (k) { weighted += (k.objWeight / 100) * (k.weight / 100) * (k.achievement || 0); });
  weighted = Math.round(weighted * 100) / 100;
  var html = "<h1>Тайлан</h1>" +
    '<p class="sub">Жинлэсэн гүйцэтгэл = Σ зорилтын жин × KR жин × KR гүйцэтгэл</p>' +
    '<div class="stats">' +
    '<div class="stat"><div class="l">Жинлэсэн гүйцэтгэл</div><div class="v">' + weighted + "%</div></div>" +
    '<div class="stat"><div class="l">KR хаалт</div><div class="v">' + krs.filter(function (k) { return k.status === "CLOSED"; }).length + "/" + krs.length + "</div></div>" +
    '<div class="stat"><div class="l">Ажлын хаалт</div><div class="v">' + (workList().length - openWorks().length) + "/" + workList().length + "</div></div>" +
    '<div class="stat"><div class="l">Хүлээн авалт баталгаажсан</div><div class="v">' +
    workList().filter(function (w) { return w.handover && w.handover.status === "CONFIRMED"; }).length + "/" +
    workList().filter(function (w) { return w.status === "CLOSED"; }).length + "</div></div></div>";
  if (c) {
    html += '<div class="cert"><p class="eyebrow">Netcapital Financial Group · IPPDD WorkOS</p>' +
      "<h2>Улирлын хаалтын бүртгэл</h2>" +
      '<p class="eyebrow" style="letter-spacing:.04em;text-transform:none">Quarter Closure Record</p><dl>' +
      "<dt>Ажилтан</dt><dd>" + esc(c.employee) + "</dd><dt>Улирал</dt><dd>" + esc(S.meta.code) + "</dd>" +
      "<dt>KR үр дүн</dt><dd>" + c.krs + "/" + c.krs + " хаагдсан</dd>" +
      "<dt>Жинлэсэн гүйцэтгэл</dt><dd>" + c.weighted + "%</dd>" +
      "<dt>Эцсийн батлагч</dt><dd>" + esc(c.by) + "</dd><dt>Огноо</dt><dd>" + fmt(c.ts) + "</dd>" +
      '<dt>Хаалтын ID</dt><dd class="mono">' + esc(c.id) + "</dd></dl>" +
      '<p class="sub" style="margin:18px 0 0;font-size:11px">Прототипийн дотоод бүртгэл — хуулийн цахим гарын үсэг биш. Хэвлэх: Ctrl/Cmd+P.</p></div>';
  } else html += '<p class="note">Улирлын хаалтын бүртгэл хараахан үүсээгүй — бүх KR хаагдсаны дараа захирал «Миний OKR» хэсгээс sign-off хийнэ.</p>';
  return html;
}

function renderLogin() {
  var box = document.getElementById("acctList");
  if (!box) return;
  var byDept = {};
  Object.values(S.users).forEach(function (u) { (byDept[u.dept] = byDept[u.dept] || []).push(u); });
  var html = "";
  Object.keys(byDept).sort().forEach(function (dc) {
    var d = (S.config.depts || []).find(function (x) { return x.code === dc; });
    if (Object.keys(byDept).length > 1)
      html += '<div class="ph">' + esc(d ? d.name : dc) + "</div>";
    byDept[dc].sort(function (a, b) { return a.name < b.name ? -1 : 1; }).forEach(function (u) {
      var init = u.name.replace(/^[А-ЯA-Z]\./, "").charAt(0) || "?";
      html += '<button class="acct' + (u.role === "Захирал" ? " adm" : "") + '" data-login="' + esc(u.id) + '">' +
        '<span class="av">' + esc(init) + "</span>" +
        "<span><span class='an'>" + esc(u.name) + "</span><br><span class='ae'>" +
        (u.email ? esc(u.email) : "и-мэйл нөхөгдөөгүй") + "</span></span>" +
        '<span class="role ' + (u.role === "Захирал" ? "a" : "u") + '">' + esc(u.role) + "</span></button>";
    });
  });
  box.innerHTML = html;
}
function renderShell() {
  var login = document.getElementById("login"), app = document.getElementById("app");
  if (!login || !app) return;
  login.hidden = !!S.p; app.hidden = !S.p;
  if (!S.p) renderLogin();
  var navAdmin = document.getElementById("navAdmin");
  if (navAdmin) navAdmin.hidden = !isDirector();
  if (S.p) {
    var u = me(), init = u.name.replace(/^[А-ЯA-Z]\./, "").charAt(0) || "?";
    [["snAv", init], ["tbAv", init], ["snName", u.name], ["tbName", u.name],
     ["snRole", u.role], ["tbRole", u.role]].forEach(function (x) {
      var e = document.getElementById(x[0]); if (e) e.textContent = x[1];
    });
  }
}
function renderChat() {
  var log = document.getElementById("chatLog");
  if (!log) return;
  var html = '<div class="msg hint">Сайн байна уу! Би IPPDD туслах. Зөвхөн энэ системийн өгөгдлөөс хариулна — батлах, хаах эрх надад байхгүй. Асуулт бүр таны claude.ai эрхээр илгээгдэнэ (эхний удаад зөвшөөрөл асууна).</div>';
  html += S.ai.map(function (msg) {
    return '<div class="msg' + (msg.q ? " q" : "") + '">' + esc(msg.text) + "</div>";
  }).join("");
  log.innerHTML = html;
  log.scrollTop = log.scrollHeight;
  var drawer = document.getElementById("chatDrawer");
  if (drawer) drawer.hidden = !S.chatOpen;
}
function render() {
  var el = document.getElementById("app-main");
  if (!el || !S.p) { renderChat(); return; }
  var w = S.workId && S.works[S.workId];
  var html = S.tab === "home" ? vHome()
    : S.tab === "okr" ? vOkr()
    : S.tab === "work" ? (w ? vWorkDetail(w) : vHome())
    : S.tab === "rev" ? vQueue("rev")
    : S.tab === "app" ? vQueue("app")
    : S.tab === "report" ? vReport()
    : S.tab === "doccheck" ? vDocCheck() :
    S.tab === "process" ? vProcess() :
    S.tab === "checkin" ? vCheckin()
    : S.tab === "new" ? vNew()
    : S.tab === "admin" ? vAdmin() : vHome();
  el.innerHTML = html;
  document.querySelectorAll("nav [role=tab]").forEach(function (t) {
    t.setAttribute("aria-selected", String(t.dataset.tab === (S.tab === "work" ? "home" : S.tab)));
  });
  var revBtn = document.querySelector('[data-tab=rev] .cnt'), appBtn = document.querySelector('[data-tab=app] .cnt');
  var nr = S.p === "OO" ? pendingReviews().length : 0;
  var na = S.p === "ME" ? pendingApprovals().length : 0;
  if (revBtn) { revBtn.textContent = nr || ""; revBtn.hidden = !nr; }
  if (appBtn) { appBtn.textContent = na || ""; appBtn.hidden = !na; }
  renderChat();
}
