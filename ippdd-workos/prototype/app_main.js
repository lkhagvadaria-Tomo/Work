/* ── Нэткапитал WorkOS — ажилладаг прототип (хамтын db сантай) ─────────────────── */
"use strict";

/* Хэрэглэгч/газрын бүртгэл — db-ээс динамикаар (SEED = анхны утга) */
function U(id) { return S.users[id] || { id: id, name: id, role: "", dept: "" }; }
function isDirector() { return S.p && (U(S.p).role === "Захирал" || isCio()); }
function isCio() { return S.p && U(S.p).role.indexOf("CIO") >= 0; }
function isBoss() { return S.p && isBossRole(U(S.p).role); }
/* Хүлээн авагч зөвхөн газрын захирал (эсвэл CIO) байх дүрэм */
function isBossRole(r) { return r === "Захирал" || (r || "").indexOf("CIO") >= 0; }
var TODAY = new Date().toISOString().slice(0, 10);

var SESSION_MS = 20 * 60 * 1000; // идэвхгүй 20 мин → автомат гарна (порталтай ижил)

var S = {
  p: null, db: null, live: false, seeded: true,
  works: {}, krs: {}, meta: null, users: {}, config: { depts: [] },
  deptFilter: "ALL",
  tab: "home", workId: null, ai: [], aiBusy: false, chatOpen: false, checkinAi: null,
  eomBusy: false, eomWid: null, eomProg: null,
  dcLinks: "", dcBusy: false, dcProg: null, dcResult: null,
  fw: null, fwBusy: false, fwProg: null, auditBusy: false, auditWid: null, auditProg: null,
  okrLink: "", okrBusy: false, okrProg: null, okrPreview: null, okrOwner: null
};

function loadSession() {
  try {
    var raw = localStorage.getItem("workos.sess");
    if (!raw) return;
    var s = JSON.parse(raw);
    if (s && S.users[s.p] && Date.now() - s.ts < SESSION_MS) S.p = s.p;
    else localStorage.removeItem("workos.sess");
  } catch (e) { /* private mode */ }
}
function touchSession() {
  if (!S.p) return;
  try { localStorage.setItem("workos.sess", JSON.stringify({ p: S.p, ts: Date.now() })); } catch (e) {}
}
function doLogin(p) {
  if (!S.users[p]) return;
  S.p = p; touchSession(); S.tab = "home"; S.workId = null;
  renderShell(); render();
}
function doLogout(auto) {
  S.p = null; S.chatOpen = false;
  try { localStorage.removeItem("workos.sess"); } catch (e) {}
  renderShell();
  if (auto) toast("Идэвхгүй 20 минут — аюулгүй байдлын үүднээс гаргалаа");
}
function initTheme() {
  try {
    var t = localStorage.getItem("workos.theme");
    if (t === "dark" || t === "light") document.documentElement.dataset.theme = t;
  } catch (e) {}
}
function toggleTheme() {
  var el = document.documentElement;
  var dark = el.dataset.theme === "dark" ||
    (!el.dataset.theme && window.matchMedia("(prefers-color-scheme: dark)").matches);
  el.dataset.theme = dark ? "light" : "dark";
  try { localStorage.setItem("workos.theme", el.dataset.theme); } catch (e) {}
}

function esc(s) {
  return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
    return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
  });
}
function me() { return U(S.p); }
function now() { return new Date().toISOString(); }
function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }
function toast(msg, err) {
  var t = document.createElement("div");
  t.className = "toast" + (err ? " err" : ""); t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(function () { t.remove(); }, err ? 5200 : 3200);
}
/* Зөвхөн Drive/Docs https линкийг href-д зөвшөөрнө; бусдыг null (текстээр харуулна).
   Хамтын сан нь итгэмжлэгдээгүй тул render үед ДАХИН шүүнэ (javascript:, data: г.м.). */
function safeUrl(u) { return isDriveUrl(u) ? u : null; }

function isDriveUrl(u) {
  try { var x = new URL(u); return x.protocol === "https:" &&
    (x.hostname === "drive.google.com" || x.hostname === "docs.google.com"); }
  catch (e) { return false; }
}
function badge(txt, tone) { return '<span class="badge badge-' + tone + '">' + esc(txt) + "</span>"; }
function gbadge(r) {
  var g = { PASS: "✓", WARNING: "△", FAIL: "✕", NOT_APPLICABLE: "–" }[r] || "–";
  var t = { PASS: "pass", WARNING: "warn", FAIL: "fail" }[r] || "muted";
  return '<span class="badge badge-' + t + '"><span aria-hidden="true">' + g + "</span>" +
    (r === "NOT_APPLICABLE" ? "N/A" : r) + "</span>";
}
var WST = {
  NOT_STARTED: ["Эхлээгүй", "muted"], IN_PROGRESS: ["Хийгдэж байна", "info"],
  SUBMITTED: ["Илгээсэн", "info"], UNDER_REVIEW: ["Хянагдаж байна", "info"],
  REVIEW_PASSED: ["Review давсан", "pass"], WAITING_APPROVAL: ["Батлал хүлээж байна", "warn"],
  APPROVED: ["Батлагдсан", "pass"], IMPLEMENTATION: ["Хэрэгжилт", "info"],
  VALIDATION: ["Баталгаажуулалт", "info"], CLOSED: ["Хаагдсан", "pass"],
  RETURNED: ["Буцаагдсан", "warn"], BLOCKED: ["Блоклогдсон", "fail"],
  REJECTED: ["Татгалзсан", "fail"], CANCELLED: ["Цуцлагдсан", "muted"]
};
function wbadge(st) { var x = WST[st] || [st, "muted"]; return badge(x[0], x[1]); }

/* ── Өгөгдлийн давхарга ────────────────────────────────────────────────────── */
function loadLocalSeed() {
  var d = JSON.parse(JSON.stringify(SEED));
  d.work.forEach(function (w) { S.works[w.id] = w; });
  d.krs.forEach(function (k) { S.krs[k.id] = k; });
  d.users.forEach(function (u) { S.users[u.id] = u; });
  S.config = d.config;
  S.meta = d.meta;
}
function audit(w, action) {
  w.audit = w.audit || [];
  w.audit.unshift({ ts: now(), by: me().name, action: action });
  if (w.audit.length > 40) w.audit.length = 40;
}
var WORK_ARRAYS = ["deliverables", "evidence", "reviews", "approvals", "impl", "endorsements"];
/* Өөр хэрэглэгчийн зэрэг нэмсэн бичлэгийг үл дарах — id-гаар нэгтгэнэ.
   Транзакц биш (хамтын сан last-writer-wins) тул зөрчлийг БАГАСГАХ арга. */
function mergeWork(remote, mine) {
  if (!remote) return mine;
  WORK_ARRAYS.forEach(function (k) {
    var a = remote[k] || [], b = mine[k] || [];
    var ids = {}, out = [];
    b.forEach(function (x) { var key = x.id || x.by || JSON.stringify(x); ids[key] = 1; out.push(x); });
    a.forEach(function (x) { var key = x.id || x.by || JSON.stringify(x); if (!ids[key]) out.push(x); });
    mine[k] = out;
  });
  var ra = remote.audit || [], ma = mine.audit || [], seen = {};
  mine.audit = ma.concat(ra).filter(function (x) {
    var key = x.ts + "|" + x.by + "|" + x.action;
    if (seen[key]) return false; seen[key] = 1; return true;
  }).sort(function (x, y) { return x.ts < y.ts ? 1 : -1; }).slice(0, 200);
  return mine;
}

function writeFail(e) {
  var code = (e && (e.code || e.message)) || "";
  if (/permission|denied|not_writer|not_granted|forbidden/i.test(String(code)))
    toast("Танд бичих эрх байхгүй — линк зөвхөн харах эрхээр хуваалцагдсан байна", true);
  else toast("Хадгалахад алдаа: " + (e && e.message ? e.message : code), true);
}

function saveWork(w, action) {
  if (action) audit(w, action);
  w.updatedAt = now();
  S.works[w.id] = w;
  render();
  if (!S.live) return;
  var ref = S.db.doc("work/" + w.id);
  ref.get().then(function (d) {
    var merged = mergeWork(d && d.exists ? d.data() : null, w);
    S.works[merged.id] = merged;
    return ref.set(merged);
  }).catch(function () {
    return ref.set(w); // унших боломжгүй бол хуучин байдлаараа бичнэ
  }).catch(writeFail);
}
function saveKr(k) {
  S.krs[k.id] = k; render();
  if (S.live) S.db.doc("krs/" + k.id.replace("-", "_")).set(k).catch(function (e) {
    toast("Хадгалахад алдаа: " + e.message, true);
  });
}
function saveMeta() {
  render();
  if (S.live) S.db.doc("meta/quarter").set(S.meta).catch(function (e) {
    toast("Хадгалахад алдаа: " + e.message, true);
  });
}
function saveUser(u) {
  S.users[u.id] = u; renderShell(); render();
  if (S.live) S.db.doc("users/" + u.id).set(u).catch(function (e) { toast("Хадгалахад алдаа: " + e.message, true); });
}
function saveFramework() {
  render();
  if (S.live) S.db.doc("meta/framework").set(S.fw).catch(writeFail);
}
function fwIndexText() {
  if (!S.fw || !(S.fw.files || []).length) return "(хүрээний бүртгэл ачаалагдаагүй)";
  return S.fw.files.map(function (f) {
    return "- " + f.title + " [" + f.kind + (f.version ? " v" + f.version : "") + (f.date ? " · " + f.date : "") + "]";
  }).join("\n");
}

function saveConfig() {
  render();
  if (S.live) S.db.doc("meta/config").set(S.config).catch(writeFail);
}
function useCap(name) {
  try { return (typeof claude !== "undefined" && claude && claude.use) ? claude.use(name) : Promise.resolve(null); }
  catch (e) { return Promise.resolve(null); }
}
function connectDb() {
  useCap("db").then(function (db) {
    if (!db) { setConn(false); return; }
    S.db = db;
    db.collection("work").onSnapshot(function (snap) {
      if (snap.empty && !S.live) { S.live = true; S.seeded = false; setConn(true); render(); return; }
      S.live = true; S.seeded = true;
      var next = {};
      snap.docs.forEach(function (d) { if (d.exists) next[d.id] = d.data(); });
      if (snap.size > 0) S.works = next;
      setConn(true); render();
    }, function () { setConn(false); });
    db.collection("krs").onSnapshot(function (snap) {
      if (snap.size > 0) {
        var next = {};
        snap.docs.forEach(function (d) { if (d.exists) next[d.data().id] = d.data(); });
        S.krs = next; render();
      }
    });
    db.doc("meta/quarter").onSnapshot(function (d) {
      if (d.exists) { S.meta = d.data(); render(); }
    });
    db.collection("users").onSnapshot(function (snap) {
      if (snap.size > 0) {
        var next = {};
        snap.docs.forEach(function (d) { if (d.exists) next[d.data().id] = d.data(); });
        S.users = next; renderShell(); render();
      }
    });
    db.doc("meta/config").onSnapshot(function (d) {
      if (d.exists) { S.config = d.data(); render(); }
    });
    db.doc("meta/framework").onSnapshot(function (d) {
      if (d.exists) { S.fw = d.data(); render(); }
    });
  }).catch(function () { setConn(false); });
}
function seedSharedDb() {
  if (!S.live || !S.db) return;
  var lock = S.db.doc("meta/seedlock");
  lock.acquire({ holder: S.p + "-" + uid(), ttlMs: 20000 }).then(function (r) {
    if (!r.acquired) { toast("Өөр хэрэглэгч суулгаж байна — түр хүлээнэ үү"); return; }
    var d = JSON.parse(JSON.stringify(SEED));
    var jobs = d.work.map(function (w) { return S.db.doc("work/" + w.id).set(w); });
    d.krs.forEach(function (k) { jobs.push(S.db.doc("krs/" + k.id.replace("-", "_")).set(k)); });
    jobs.push(S.db.doc("meta/quarter").set(d.meta));
    jobs.push(S.db.doc("meta/config").set(d.config));
    d.users.forEach(function (u) { jobs.push(S.db.doc("users/" + u.id).set(u)); });
    Promise.all(jobs).then(function () { S.seeded = true; toast("Анхны өгөгдөл суулаа"); render(); })
      .catch(function (e) { toast("Суулгалт алдаа: " + e.message, true); });
  });
}
function setConn(on) {
  S.live = on;
  var el = document.getElementById("conn");
  if (el) el.innerHTML = on
    ? 'Хамтын сан: <b class="on">холбогдсон</b>'
    : 'Хамтын сан: <b class="off">холбогдоогүй</b> — өөрчлөлт зөвхөн энэ цонхонд';
}

/* ── Үйлдлүүд (persona + төлөвийн машинаар хамгаалагдсан) ─────────────────── */
function W(id) { return S.works[id]; }
function must(cond, msg) { if (!cond) { toast(msg, true); throw new Error(msg); } }
function go(w, to, action) {
  must(canGo(w.status, to), "Төлөвийн шилжилт боломжгүй: " + w.status + " → " + to);
  w.status = to; saveWork(w, action + " → " + to);
}

var A = {
  start: function (id) { var w = W(id); must(S.p === w.owner, "Зөвхөн эзэмшигч"); go(w, "IN_PROGRESS", "Эхлүүлэв"); },
  resubmit: function (id) { var w = W(id); must(S.p === w.owner, "Зөвхөн эзэмшигч"); go(w, "IN_PROGRESS", "Дахин илгээхээр нээв"); },

  addDeliverable: function (id, f) {
    var w = W(id); must(S.p === w.owner, "Зөвхөн эзэмшигч");
    must(w.status !== "CLOSED", "Хаагдсан ажилд нэмэхгүй");
    must(f.name.trim().length > 1, "Нэр дутуу");
    must(isDriveUrl(f.url), "Зөвхөн drive.google.com / docs.google.com линк");
    must(/^v\d+\.\d+$/.test(f.version), "Хувилбар vX.Y хэлбэртэй (ж: v1.0)");
    w.deliverables.push({ id: uid(), req: f.req || null, name: f.name.trim(), url: f.url,
      version: f.version, final: !!f.final, by: me().name, ts: now() });
    saveWork(w, "Deliverable холбов: " + f.name + " " + f.version);
  },
  markFinal: function (id, did) {
    var w = W(id); must(S.p === w.owner, "Зөвхөн эзэмшигч");
    var d = w.deliverables.find(function (x) { return x.id === did; });
    if (d) { d.final = true; saveWork(w, "Эцсийн хувилбар: " + d.name); }
  },
  addEvidence: function (id, f) {
    var w = W(id); must(w.status !== "CLOSED", "Хаагдсан ажилд нэмэхгүй");
    must(f.title.trim().length > 1, "Нэр дутуу");
    if (f.url) must(isDriveUrl(f.url) || /^https:\/\//.test(f.url), "Линк https байх ёстой");
    must(f.url || f.desc, "Линк эсвэл тайлбарын аль нэг заавал");
    w.evidence.push({ id: uid(), type: f.type, title: f.title.trim(), url: f.url || null,
      desc: f.desc || null, verified: false, by: S.p, byName: me().name, ts: now() });
    saveWork(w, "Нотолгоо холбов: " + f.title);
  },
  removeEvidence: function (id, eid) {
    var w = W(id);
    var ev = w.evidence.find(function (x) { return x.id === eid; });
    must(ev && ev.by === S.p && !ev.verified, "Зөвхөн өөрийн баталгаажаагүй нотолгоог устгана");
    w.evidence = w.evidence.filter(function (x) { return x.id !== eid; });
    saveWork(w, "Нотолгоо устгав: " + ev.title);
  },
  verifyEvidence: function (id, eid) {
    var w = W(id); must(S.p !== "LA" || w.owner !== "LA", "");
    var ev = w.evidence.find(function (x) { return x.id === eid; });
    must(ev && ev.by !== S.p, "Өөрийн нотолгоог өөрөө баталгаажуулахгүй");
    must(S.p === w.reviewer || S.p === w.approver, "Хянагч/батлагч баталгаажуулна");
    ev.verified = true; ev.verifiedBy = me().name;
    saveWork(w, "Нотолгоо баталгаажив: " + ev.title);
  },
  selfQc: function (id) {
    var w = W(id); must(S.p === w.owner, "Self QC-г зөвхөн эзэмшигч");
    must(!w.reviews.some(function (r) { return r.type === "SELF_QC" && r.decision === "PASS"; }), "Аль хэдийн хийгдсэн");
    w.reviews.push({ id: uid(), type: "SELF_QC", by: me().name, decision: "PASS", ts: now() });
    saveWork(w, "Self QC PASS");
  },
  submitReview: function (id) {
    var w = W(id); must(S.p === w.owner, "Зөвхөн эзэмшигч");
    var p = profileOf(w);
    if (!p.reviews.length) { A.requestApproval(id); return; } // ажилтанд хянагч байхгүй → шууд захиралд
    p.reviews.forEach(function (t) {
      var done = w.reviews.some(function (r) { return r.type === t && (r.decision === "PASS" || r.decision === "PENDING"); });
      if (!done) w.reviews.push({ id: uid(), type: t, by: U(w.reviewer).name, decision: "PENDING", ts: now() });
    });
    go(w, "SUBMITTED", "Хараат хяналтад илгээв");
  },
  decideReview: function (id, rid, decision, comment) {
    var w = W(id);
    must(S.p === w.reviewer || (isBossRole(U(S.p).role) && S.p !== w.owner),
      "Хяналтыг томилогдсон хянагч, эсвэл захирал хийнэ");
    must(S.p !== w.owner, "Эзэмшигч өөрийн ажлыг хянахгүй");
    var r = w.reviews.find(function (x) { return x.id === rid && x.decision === "PENDING"; });
    must(r, "Хүлээгдэж буй review олдсонгүй");
    must(decision === "PASS" || (comment && comment.trim()), "RETURN/REJECT-д тайлбар заавал");
    if (w.status === "SUBMITTED") { w.status = "UNDER_REVIEW"; audit(w, "Хяналт эхлэв"); }
    r.decision = decision; r.comment = (comment || "").trim() || null; r.decidedTs = now();
    if (decision === "PASS") {
      var open = w.reviews.some(function (x) { return x.type !== "SELF_QC" && x.decision === "PENDING"; });
      if (!open) { w.status = "REVIEW_PASSED"; audit(w, "Бүх review PASS"); }
      saveWork(w, "Review PASS (" + r.type + ")");
    } else {
      w.status = decision === "RETURN" ? "RETURNED" : "REJECTED";
      w.reviews = w.reviews.map(function (x) {
        if (x.decision === "PENDING") x.decision = "CANCELLED";
        return x;
      });
      saveWork(w, "Review " + decision + " (" + r.type + "): " + r.comment);
    }
  },
  requestApproval: function (id) {
    var w = W(id); must(S.p === w.owner, "Зөвхөн эзэмшигч");
    must(!w.approvals.some(function (a) { return a.decision === "PENDING"; }), "Батлал аль хэдийн хүлээгдэж байна");
    var fin = w.deliverables.filter(function (d) { return d.final; }).slice(-1)[0];
    w.approvals.push({ id: uid(), type: "DIRECTOR", by: U(w.approver).name,
      decision: "PENDING", version: fin ? fin.version : null, ts: now() });
    if (w.status === "REVIEW_PASSED" || w.status === "SUBMITTED" || w.status === "IN_PROGRESS")
      { w.status = "WAITING_APPROVAL"; saveWork(w, "Захирлын хянаж батлахаар илгээв → WAITING_APPROVAL"); }
    else go(w, "WAITING_APPROVAL", "Захирлын хянаж батлахаар илгээв");
  },
  decideApproval: function (id, aid, decision, comment) {
    var w = W(id);
    must(S.p === w.approver || isBossRole(U(S.p).role), "Батлалыг захирал (эсвэл CIO) хийнэ");
    must(S.p !== w.owner, "Эзэмшигч өөрийн ажлыг батлахгүй");
    var a = w.approvals.find(function (x) { return x.id === aid && x.decision === "PENDING"; });
    must(a, "Хүлээгдэж буй батлал олдсонгүй");
    must(decision === "APPROVE" || (comment && comment.trim()), "RETURN/REJECT-д тайлбар заавал");
    a.decision = decision; a.comment = (comment || "").trim() || null; a.decidedTs = now();
    a.by = me().name + " (" + U(S.p).role + ")";
    if (decision === "APPROVE") {
      w.status = "APPROVED"; audit(w, "Батлагдав (" + (a.version || "хувилбаргүй") + ")");
      if (w.implReq) { w.status = "IMPLEMENTATION"; audit(w, "→ Хэрэгжилт"); }
      else if (w.validReq) { w.status = "VALIDATION"; audit(w, "→ Баталгаажуулалт"); }
      saveWork(w, "Батлал APPROVE");
    } else {
      w.status = decision === "RETURN" ? "RETURNED" : "REJECTED";
      saveWork(w, "Батлал " + decision + ": " + a.comment);
    }
  },
  recordImpl: function (id, status, env) {
    var w = W(id); must(S.p === w.owner, "Зөвхөн эзэмшигч");
    w.impl.push({ status: status, env: (env || "").trim() || null, by: me().name, ts: now() });
    if ((status === "LIVE" || status === "PILOT") && w.status === "IMPLEMENTATION") {
      w.status = "VALIDATION"; audit(w, "→ Баталгаажуулалт");
    }
    saveWork(w, "Хэрэгжилт: " + status + (env ? " (" + env + ")" : ""));
  },
  setMetric: function (id, i, actual) {
    var w = W(id); must(S.p === w.owner, "Зөвхөн эзэмшигч");
    var v = Number(actual); must(isFinite(v), "Тоо оруулна");
    w.metrics[i].actual = v; saveWork(w, "Метрик бодит утга: " + w.metrics[i].name + " = " + v);
  },
  decideMetric: function (id, i, pass) {
    var w = W(id); must(S.p === w.reviewer || S.p === w.approver, "Хянагч/захирал баталгаажуулна");
    var m = w.metrics[i];
    m.status = pass ? "PASS" : "FAIL"; m.validatedBy = me().name;
    saveWork(w, "Метрик " + m.status + ": " + m.name);
  },
  submitClosure: function (id) {
    var w = W(id); must(S.p === w.owner, "Зөвхөн эзэмшигч");
    must(closableFrom(w), "Энэ төлөвөөс хаалт хүсэх боломжгүй (" + w.status + ")");
    var g = evaluateGate(w, TODAY);
    w.gate = { result: g.result, checks: g.checks, findings: g.findings, ts: now(), by: me().name };
    w.closure = g.result === "FAIL"
      ? { status: "GATE_FAILED", requestedBy: me().name, ts: now() }
      : { status: "READY", requestedBy: me().name, ts: now() };
    saveWork(w, "Хаалтын хүсэлт — гейт: " + g.result);
    toast(g.result === "FAIL" ? "Гейт FAIL — дутагдлуудыг арилгана уу" : "Гейт " + g.result + " — захирлын sign-off хүлээнэ");
  },
  signClosure: function (id, decision, comment) {
    var w = W(id);
    must(S.p === w.approver || isBossRole(U(S.p).role), "Хаалтын sign-off-ыг захирал (эсвэл CIO) хийнэ");
    must(S.p !== w.owner, "Эзэмшигч өөрийн хаалтад гарын үсэг зурахгүй");
    must(w.closure && w.closure.status === "READY", "Sign-off хүлээж буй хүсэлт алга");
    must(decision === "APPROVE" || (comment && comment.trim()), "RETURN/REJECT-д тайлбар заавал");
    if (decision === "APPROVE") {
      var g = evaluateGate(w, TODAY); // хуучирсан гейтээс хамгаална — дахин тооцно
      w.gate = { result: g.result, checks: g.checks, findings: g.findings, ts: now(), by: me().name };
      must(g.result !== "FAIL", "Гейт FAIL — хаалт хориглогдлоо");
      w.status = "CLOSED"; w.closedAt = now();
      w.closure = { status: "CLOSED", requestedBy: w.closure.requestedBy,
        signedBy: me().name + " (" + U(S.p).role + ")", ts: now(),
        comment: (comment || "").trim() || null };
      saveWork(w, "ХААГДАВ — гейт " + g.result + " + захирлын sign-off");
    } else {
      w.closure = { status: decision === "RETURN" ? "PENDING" : "REJECTED",
        signedBy: me().name, ts: now(), comment: comment.trim() };
      saveWork(w, "Хаалт " + decision + ": " + comment.trim());
    }
  },
  createWork: function (f) {
    must(f.title && f.title.trim().length > 2, "Нэр дутуу");
    must(f.reviewer && S.users[f.reviewer], "Хянагч сонгоно");
    must(f.approver && S.users[f.approver], "Батлагч сонгоно");
    must(f.approver !== S.p, "Эрх тусгаарлалт: өөрийгөө батлагчаар сонгохгүй");
    if (f.deadline) must(/^\d{4}-\d{2}-\d{2}$/.test(f.deadline), "Огноо буруу");
    var id = "W" + Date.now().toString(36).toUpperCase();
    var reqs = (f.reqs || "").split("\n").map(function (x) { return x.trim(); }).filter(Boolean).slice(0, 12);
    var w = {
      id: id, code: (f.dept || "IPPDD") + "-" + (S.meta ? S.meta.code : "2026-Q3") + "-" + id,
      dept: f.dept || "IPPDD", kr: (f.kr || "").trim() || null,
      title: f.title.trim(), type: f.type || "OTHER", priority: f.priority || "MEDIUM",
      deadline: f.deadline || null, dod: (f.dod || "").trim() || null,
      status: "NOT_STARTED", owner: S.p, reviewer: f.reviewer, approver: f.approver,
      implReq: !!f.implReq, validReq: false,
      requirements: reqs, deliverables: [], evidence: [], reviews: [], approvals: [],
      impl: [], metrics: [], gate: null, closure: null, handover: null,
      audit: []
    };
    saveWork(w, "Ажил үүсгэв (" + w.type + ", " + w.dept + ")");
    S.tab = "work"; S.workId = id; render();
    toast(w.code + " үүслээ");
  },
  requestHandover: function (id, f) {
    var w = W(id); must(S.p === w.owner, "Хүлээлгэн өгөлтийг эзэмшигч бүртгэнэ");
    must(w.status === "CLOSED", "Эхлээд ажил ХААГДСАН байх ёстой (гейт + sign-off)");
    must(!w.handover || w.handover.status === "RETURNED", "Хүлээлгэн өгөлт аль хэдийн бүртгэгдсэн");
    must(f.to && S.users[f.to], "Хүлээн авагч сонгоно");
    must(f.to !== S.p, "Өөртөө хүлээлгэн өгөхгүй");
    must(isBossRole(U(f.to).role),
      "Хүлээлгэн өгөлт зөвхөн газрын захиралд — өөрийн газрын захирал, эсвэл хүлээн авах газрын захирал");
    if (f.url) must(isDriveUrl(f.url) || /^https:\/\//.test(f.url), "Линк https байх ёстой");
    w.handover = { status: "PENDING", to: f.to, toName: U(f.to).name,
      toDept: U(f.to).dept, toRole: U(f.to).role,
      note: (f.note || "").trim() || null, url: f.url || null,
      by: me().name, ts: now() };
    saveWork(w, "Хүлээлгэн өгөв → " + U(f.to).name);
  },
  confirmHandover: function (id, ok, comment) {
    var w = W(id);
    must(w.handover && w.handover.status === "PENDING", "Хүлээгдэж буй хүлээлгэн өгөлт алга");
    must(S.p === w.handover.to,
      "Зөвхөн хүлээн авагч газрын захирал (" + w.handover.toName + ") баталгаажуулна");
    must(S.p !== w.owner, "Эзэмшигч өөрөө баталгаажуулахгүй");
    if (ok) {
      w.handover.status = "CONFIRMED";
      w.handover.confirmedBy = me().name; w.handover.confirmedTs = now();
      saveWork(w, "Хүлээн авснаа баталгаажуулав — " + me().name);
    } else {
      must(comment && comment.trim(), "Буцаахад тайлбар заавал");
      w.handover.status = "RETURNED";
      w.handover.confirmedBy = me().name; w.handover.confirmedTs = now();
      w.handover.comment = comment.trim();
      saveWork(w, "Хүлээлгэн өгөлт буцаагдав: " + comment.trim());
    }
  },
  addDept: function (code, name) {
    must(isDirector(), "Зөвхөн захирал газар нэмнэ");
    code = (code || "").trim().toUpperCase(); name = (name || "").trim();
    must(/^[A-Z0-9_]{2,12}$/.test(code), "Код: 2–12 том үсэг/тоо");
    must(name.length > 2, "Нэр дутуу");
    must(!S.config.depts.some(function (d) { return d.code === code; }), "Код давхардсан");
    S.config.depts.push({ code: code, name: name });
    saveConfig(); toast(code + " газар нэмэгдлээ");
  },
  addUser: function (f) {
    must(isDirector(), "Зөвхөн захирал хэрэглэгч нэмнэ");
    must(f.name && f.name.trim().length > 1, "Нэр дутуу");
    must(/^[\w.+-]+@[\w.-]+$/.test(f.email || ""), "И-мэйл буруу");
    must(["Ажилтан", "Хянагч", "Захирал"].indexOf(f.role) >= 0, "Эрх буруу");
    must(S.config.depts.some(function (d) { return d.code === f.dept; }), "Газар сонгоно");
    var id = "U" + Date.now().toString(36).toUpperCase().slice(-5);
    saveUser({ id: id, name: f.name.trim(), email: f.email.trim(), role: f.role, dept: f.dept });
    toast(f.name.trim() + " нэмэгдлээ — нэвтрэх жагсаалтад орсон");
  },
  backup: function () {
    must(isBoss(), "Нөөшлөлтийг захирал, CIO хийнэ");
    var dump = JSON.stringify({ v: 1, ts: now(), by: me().name, meta: S.meta, config: S.config,
      users: S.users, krs: S.krs, works: S.works, framework: S.fw }, null, 1);
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(dump).then(function () {
        toast("Нөөц хуулбар clipboard-д хууллаа (" + Math.round(dump.length / 1024) + " KB)");
      }).catch(function () { toast("Clipboard-д хуулж чадсангүй", true); });
    } else toast("Энэ хөтөч clipboard дэмжихгүй байна", true);
  },
  restore: function (json) {
    must(isBoss(), "Сэргээлтийг захирал, CIO хийнэ");
    var d;
    try { d = JSON.parse(json); } catch (e) { must(false, "JSON буруу"); }
    must(d && d.works && d.krs, "Нөөц файлын бүтэц буруу");
    var n = 0;
    Object.values(d.works).forEach(function (w) { S.works[w.id] = w; saveWork(w, "Нөөцөөс сэргээв"); n++; });
    Object.values(d.krs).forEach(function (k) { S.krs[k.id] = k; saveKr(k); n++; });
    if (d.users) Object.values(d.users).forEach(function (u) { saveUser(u); n++; });
    if (d.config) { S.config = d.config; saveConfig(); }
    toast(n + " бичлэг сэргээгдлээ");
  },
  setKrParent: function (kid, parentId) {
    var k = S.krs[kid]; must(k, "KR олдсонгүй");
    must(isBoss(), "KR-ийн шатлалыг зөвхөн захирал, CIO тогтооно");
    must(!parentId || (S.krs[parentId] && parentId !== kid), "Эх KR буруу");
    if (parentId && S.krs[parentId].owner === k.owner) must(false, "Эх KR нь өөр хүнийх байх ёстой");
    k.parent = parentId || null;
    saveKr(k);
    toast(parentId ? kid + " → " + parentId + " шатлал холбогдлоо" : kid + " шатлалаас салгав");
  },
  importOkr: function (rows, ownerId, parentId, source) {
    must(isBoss() || S.p === ownerId, "Зөвхөн эзэн өөрөө эсвэл захирал импортолно");
    must(S.users[ownerId], "Эзэмшигч сонгоно");
    must(rows && rows.length, "Импортлох KR алга");
    var added = 0;
    rows.forEach(function (r) {
      var id = (r.obj || "O?") + "-" + (r.code || "KR?") + "·" + ownerId;
      S.krs[id] = { id: id, obj: r.obj || "O1", objTitle: r.objTitle || "", objWeight: Number(r.objWeight) || 0,
        code: r.code || "KR1", title: r.title || "", weight: Number(r.weight) || 0,
        deadline: r.deadline || null, status: r.status || "NOT_STARTED",
        achievement: Number(r.achievement) || 0,
        owner: ownerId, dept: U(ownerId).dept, parent: parentId || null, source: source || null };
      saveKr(S.krs[id]); added++;
    });
    toast(U(ownerId).name + "-ийн " + added + " KR импортлогдлоо");
  },
  setKrAchievement: function (kid, v) {
    var k = S.krs[kid]; must(k, "KR олдсонгүй");
    must(S.p === (k.owner || "LA") || isBoss(), "Зөвхөн KR-ийн эзэн, эсвэл захирал");
    v = Number(v); must(isFinite(v) && v >= 0 && v <= 100, "0–100 хооронд");
    must(k.status !== "CLOSED", "Хаагдсан KR");
    k.achievement = v; saveKr(k);
  },
  closeKr: function (kid, achievement) {
    var k = S.krs[kid]; must(k, "KR олдсонгүй"); must(isBoss(), "KR хаалтыг захирал, CIO хийнэ");
    must(S.p !== (k.owner || "LA"), "Өөрийн KR-ээ өөрөө хаахгүй — дээд шатны захирал хаана");
    var open = Object.values(S.works).filter(function (w) {
      return w.kr === kid && w.status !== "CLOSED" && w.status !== "CANCELLED";
    });
    must(open.length === 0, "Хаагдаагүй ажил: " + open.map(function (w) { return w.code; }).join(", "));
    var v = Number(achievement); must(isFinite(v) && v >= 0 && v <= 100, "Гүйцэтгэл 0–100");
    k.status = "CLOSED"; k.achievement = v; k.closedBy = me().name; k.closedTs = now();
    saveKr(k); toast(kid + " хаагдлаа (" + v + "%)");
  },
  endorse: function (id, decision, comment) {
    var w = W(id);
    must(isBossRole(U(S.p).role), "Зөвхөн газрын захирал, CIO зөвшөөрлөө тэмдэглэнэ");
    must(S.p !== w.owner, "Эзэмшигч өөрийн ажлыг өөрөө зөвшөөрөхгүй");
    must(decision === "APPROVE" || (comment && comment.trim()), "Татгалзахад тайлбар заавал");
    w.endorsements = (w.endorsements || []).filter(function (e) { return e.by !== S.p; });
    w.endorsements.push({ by: S.p, byName: me().name, role: U(S.p).role, dept: U(S.p).dept,
      decision: decision === "APPROVE" ? "APPROVE" : "RETURN",
      comment: (comment || "").trim() || null, ts: now() });
    saveWork(w, (decision === "APPROVE" ? "Зөвшөөрсөн: " : "Татгалзсан: ") +
      me().name + " (" + U(S.p).role + (U(S.p).dept ? " · " + U(S.p).dept : "") + ")" +
      (comment && comment.trim() ? " — " + comment.trim() : ""));
  },
  recordEomManual: function (id, note) {
    var w = W(id);
    must(isBossRole(U(S.p).role), "EOM нийцлийн хүний хяналтыг захирал, CIO бүртгэнэ");
    must(S.p !== w.owner, "Эзэмшигч өөрөө хянахгүй");
    must((w.deliverables || []).some(function (d) { return d.final; }), "Эцсийн (FINAL) deliverable алга");
    w.eomManual = { by: S.p, byName: me().name, role: U(S.p).role,
      note: (note || "").trim() || null, ts: now(), sig: eomSig(w) };
    saveWork(w, "EOM v5.0 нийцлийг хүнээр хянаж баталсан — " + me().name + " (" + U(S.p).role + ")");
  },
  setFramework: function (fw) {
    must(isBoss() || S.p, "Нэвтэрсэн байх шаардлагатай");
    S.fw = fw; saveFramework();
    toast("Хүрээний бүртгэл шинэчлэгдлээ — " + (fw.files || []).length + " баримт");
  },
  recordDocAudit: function (id, audit) {
    var w = W(id);
    w.docAudit = audit;
    saveWork(w, "Ажил ↔ баримтын агуулгын тулгалт: " + audit.result +
      " (" + (audit.reqs || []).length + " шаардлага, " + (audit.docs || []).length + " баримт)");
  },
  recordEomCheck: function (id, check) {
    var w = W(id);
    must(w.status !== "CLOSED", "Хаагдсан ажил дээр шалгалт бүртгэхгүй");
    w.eomCheck = check;
    saveWork(w, "EOM v5.0 нийцлийн AI шалгалт: " + check.result + " (" + (check.docs || []).length + " баримт)");
  },
  cioSign: function (id, decision, comment) {
    var w = W(id);
    must(isCio(), "Зөвхөн CIO (Х.Нургүл) хүлээн зөвшөөрөлт хийнэ");
    must(S.p !== w.owner, "Өөрийн ажлыг өөрөө хүлээн зөвшөөрөхгүй");
    must(!(w.cioSign && w.cioSign.decision === "APPROVE"), "Аль хэдийн хүлээн зөвшөөрсөн");
    must(decision === "APPROVE" || (comment && comment.trim()), "Буцаахад тайлбар заавал");
    w.cioSign = { decision: decision === "APPROVE" ? "APPROVE" : "RETURN",
      by: S.p, byName: me().name + " (CIO)", comment: (comment || "").trim(), ts: now() };
    saveWork(w, decision === "APPROVE"
      ? "CIO хүлээн зөвшөөрөлт: ажил, баримтыг хүлээн авч APPROVE + sign-off хийв"
      : "CIO буцаав: " + (comment || "").trim());
  },
  closeQuarter: function () {
    must(isDirector(), "Улирлын хаалтыг захирал хийнэ");
    var krs = Object.values(S.krs);
    var open = krs.filter(function (k) { return k.status !== "CLOSED"; });
    must(open.length === 0, "Хаагдаагүй KR: " + open.map(function (k) { return k.id; }).join(", "));
    var weighted = 0;
    krs.forEach(function (k) { weighted += (k.objWeight / 100) * (k.weight / 100) * (k.achievement || 0); });
    S.meta.closure = { employee: U("LA").name, by: me().name, ts: now(),
      weighted: Math.round(weighted * 100) / 100, krs: krs.length, id: uid() };
    saveMeta(); S.tab = "report"; render();
    toast("Улирал хаагдлаа — гэрчилгээ Тайлан хэсэгт");
  }
};
