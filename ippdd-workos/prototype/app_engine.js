/* ── Деterministic Gate Engine (порт: ippdd-workos/lib/gate-engine) ─────────
   Цэвэр функцууд — node дээр тестлэгдэнэ, AI хамааралгүй. */
"use strict";

/* Ажилтанд тусад нь томилогдсон «хянагч» гэж байхгүй — агуулгын хяналт ба батлал нь
   газрын захирлын НЭГ шийдвэр (G4 «хянаж батлах»). Зөвхөн техникийн ажилд (AI_AGENT)
   өөр нэгжийн (IT) хараат хяналт үлдэнэ. */
var PROFILES = {
  PROCESS:  { deliv:true,  selfqc:true,  reviews:[],     approvals:["DIRECTOR"], impl:false, metric:false, minEv:1, simplified:false },
  STANDARD: { deliv:true,  selfqc:true,  reviews:[],     approvals:["DIRECTOR"], impl:false, metric:false, minEv:1, simplified:false },
  AI_AGENT: { deliv:true,  selfqc:true,  reviews:["IT"], approvals:["DIRECTOR"], impl:true,  metric:true,  minEv:2, simplified:false },
  TRAINING: { deliv:true,  selfqc:false, reviews:[],     approvals:["DIRECTOR"], impl:false, metric:true,  minEv:1, simplified:false },
  KPI:      { deliv:false, selfqc:false, reviews:[],     approvals:["DIRECTOR"], impl:false, metric:true,  minEv:1, simplified:true  },
  DEFAULT:  { deliv:true,  selfqc:true,  reviews:[],     approvals:["DIRECTOR"], impl:false, metric:false, minEv:1, simplified:false }
};
function profileOf(w) { return PROFILES[w.type] || PROFILES.DEFAULT; }

/* EOM v5.0 баримтын нийцлийн шалгуур (Enterprise Operating Model Handbook v5.0,
   DGS — Document Governance & Register Steward загвар; AI зөвлөх — §2.5a) */
var EOM_CRITERIA = [
  { id: "NAME",    t: "Нэршлийн стандарт: [Газар]_[Нэр]_[ОООО-СС-ӨӨ]_vX.Y; Document ID (POL/STD/PRO/GDL-…) ба хувилбар ил", ref: "EOM §2.4 Document Register" },
  { id: "CTRL",    t: "Document Control блок: Version, Status, Owner (Accountable), Approver, Review Cycle, Effective/Supersedes", ref: "EOM §2.4 legibility · DGS" },
  { id: "OWNER",   t: "Нэртэй хариуцагч (DRI / Accountable owner) ба RACI тодорхой", ref: "EOM §2.7a" },
  { id: "APPR",    t: "Батлалын нотолгоо: Approver ба Status (Draft/Pending/Approved) ил; шийдвэр DEC-YYYY-XXX холбоостой байвал сайн", ref: "EOM §2.4 Committee Governance" },
  { id: "AIGATE",  t: "AI-Output Review Gate: AI ашигласан бол хүний хянагчийн тэмдэглэл (reviewed-by); regulated баримтад хүний authorship/sign-off", ref: "EOM §2.5a · §3.3" },
  { id: "TRACE",   t: "Стратегийн уялдаа: Strategic Theme / Wave / Value Stream / KR-т traceable; Related documents хэсэгтэй", ref: "EOM §1.6 Identity Consistency" },
  { id: "STRUCT",  t: "Төрөлдөө тохирсон бүтэц: Purpose/Scope; процессын баримтад шат/gate/RACI; стандартад Minimum Requirements + Evidence/Threshold", ref: "EOM §3 Process Architecture" },
  { id: "CADENCE", t: "Хяналтын мөчлөг: Review Cycle / дараагийн хяналтын огноо заасан", ref: "EOM §2.4 DGS cadence" },
  { id: "RISK",    t: "Эрсдэл/нийцэл: Classification (Internal/Confidential), эскалацийн зам, PII/PDP хамрах бол хязгаар", ref: "EOM §2.9 · Three Lines of Defense" },
  { id: "LOG",     t: "Change Log: хувилбар бүрийн огноо, өөрчлөлт, үндэслэл, зохиогч", ref: "EOM §2.4 audit-readiness" }
];
/* Аудитын гинжний хэш — тэмдэглэл бүр өмнөхтэйгээ холбогдоно.
   Бичих эрхтэй хүн бүх гинжийг дахин бичиж чадах ч НЭГ бичлэг чимхэхэд гинж тасарч
   илэрнэ (tamper-evident). Нөөц хуулбартай тулгавал бүрэн баталгаа болно. */
function chainHash(prev, entry) {
  var str = String(prev || "0") + "|" + entry.ts + "|" + entry.by + "|" + entry.action;
  var h1 = 0x811c9dc5, h2 = 0x01000193;
  for (var i = 0; i < str.length; i++) {
    var c = str.charCodeAt(i);
    h1 = ((h1 ^ c) * 16777619) >>> 0;
    h2 = ((h2 + c * 31) ^ (h2 << 5)) >>> 0;
  }
  return ("0000000" + h1.toString(16)).slice(-8) + ("0000000" + h2.toString(16)).slice(-8);
}
/* Гинжийг эхнээс нь дахин тооцож шалгана. Буцаах: {ok, broken: index|null, n} */
function verifyAuditChain(list) {
  var arr = (list || []).slice().reverse(); // хуучнаас шинэ рүү
  var prev = null;
  for (var i = 0; i < arr.length; i++) {
    var e = arr[i];
    if (!e.h) { prev = null; continue; } // хуучин бичлэг хэшгүй — алгасна
    var expect = chainHash(prev, e);
    if (e.h !== expect) return { ok: false, broken: arr.length - i, n: arr.length };
    prev = e.h;
  }
  return { ok: true, broken: null, n: arr.length };
}

/* Хүрээний (framework) баримтын нэрээс төрөл, хувилбар, огноог тодорхойлно.
   Жишээ: IPPDD_Investement_Product_Governance_policy_2026-08-05_v5.0 */
var FW_KINDS = [
  { k: "POL", re: /policy|бодлого|governance/i, t: "Бодлого / Policy" },
  { k: "STD", re: /standard|стандарт/i, t: "Стандарт / Standard" },
  { k: "REG", re: /register|inventory|masterdata|бүртгэл/i, t: "Бүртгэл / Register" },
  { k: "RPT", re: /report|тайлан/i, t: "Тайлан / Report" },
  { k: "PCK", re: /package|_pack|_set|багц/i, t: "Багц / Package" },
  { k: "PLB", re: /playbook|guide|handbook|гарын авлага/i, t: "Гарын авлага / Playbook" },
  { k: "PRO", re: /procedure|process|журам|процесс/i, t: "Журам / Procedure" }
];
function fwMeta(title) {
  var t = String(title || "");
  var ver = (/[_ \-]v(\d+\.\d+)/i.exec(t) || [])[1] || null;
  var date = (/(\d{4}-\d{2}-\d{2})/.exec(t) || [])[1] || null;
  var kind = "DOC", kindT = "Бусад";
  for (var i = 0; i < FW_KINDS.length; i++) {
    if (FW_KINDS[i].re.test(t)) { kind = FW_KINDS[i].k; kindT = FW_KINDS[i].t; break; }
  }
  return { kind: kind, kindTitle: kindT, version: ver, date: date };
}

/* Drive линкийг файл/хавтас болгож задлана. Зөвхөн drive/docs.google.com. */
function driveRef(url) {
  var u = String(url || "").trim();
  if (!/^https:\/\/(drive|docs)\.google\.com\//.test(u)) return null;
  var m = /\/folders\/([A-Za-z0-9_-]{10,})/.exec(u);
  if (m) return { kind: "folder", id: m[1] };
  m = /\/d\/([A-Za-z0-9_-]{10,})/.exec(u) || /[?&]id=([A-Za-z0-9_-]{10,})/.exec(u);
  if (m) return { kind: "file", id: m[1] };
  return null;
}

/* Эцсийн deliverable-уудын гарын үсэг — G8 шалгалт хуучирсныг илрүүлнэ */
function eomSig(w) {
  return (w.deliverables || []).filter(function (d) { return d.final; })
    .map(function (d) { return d.name + "@" + (d.version || ""); }).sort().join("|");
}

var TRANSITIONS = {
  NOT_STARTED: ["IN_PROGRESS"],
  IN_PROGRESS: ["SUBMITTED", "BLOCKED"],
  SUBMITTED: ["UNDER_REVIEW", "RETURNED"],
  UNDER_REVIEW: ["REVIEW_PASSED", "RETURNED", "REJECTED"],
  REVIEW_PASSED: ["WAITING_APPROVAL"],
  WAITING_APPROVAL: ["APPROVED", "RETURNED", "REJECTED"],
  APPROVED: ["IMPLEMENTATION", "VALIDATION"],
  IMPLEMENTATION: ["VALIDATION", "BLOCKED"],
  VALIDATION: ["BLOCKED"],
  RETURNED: ["IN_PROGRESS"],
  BLOCKED: ["IN_PROGRESS"],
  REJECTED: ["IN_PROGRESS"],
  CLOSED: [], CANCELLED: []
};
function canGo(from, to) { return (TRANSITIONS[from] || []).indexOf(to) >= 0; }
var CLOSABLE = ["APPROVED", "IMPLEMENTATION", "VALIDATION"];
function closableFrom(w) {
  var p = profileOf(w);
  return CLOSABLE.indexOf(w.status) >= 0 || (p.simplified && w.status === "IN_PROGRESS");
}

function metricOk(op, target, actual) {
  if (actual == null || target == null) return false;
  var a = Number(actual), t = Number(target);
  if (op === "GTE") return a >= t; if (op === "LTE") return a <= t;
  if (op === "GT") return a > t;   if (op === "LT") return a < t;
  return a === t;
}

/* w: work doc; today: 'YYYY-MM-DD'. Буцаах: {result, checks:[], findings:[]} */
function evaluateGate(w, today) {
  var p = profileOf(w), checks = [], findings = [];
  function add(key, gate, required, result, finding) {
    checks.push({ key: key, gate: gate, required: required, result: result });
    if (finding) findings.push(finding);
  }
  var dels = w.deliverables || [], evs = w.evidence || [];
  var revs = w.reviews || [], apps = w.approvals || [];

  // G1 deliverables
  if (p.deliv) {
    var reqs = w.requirements || [];
    var missing = reqs.filter(function (r) {
      return !dels.some(function (d) { return d.req === r && d.final; });
    });
    if (!reqs.length) add("G1", "G1 · Deliverable", true, "WARNING",
      { sev: "MEDIUM", res: "WARNING", title: "Deliverable шаардлага тодорхойлогдоогүй" });
    else if (missing.length) add("G1", "G1 · Deliverable", true, "FAIL",
      { sev: "CRITICAL", res: "FAIL", title: "Deliverable дутуу: " + missing.join(", "),
        act: "Дутуу баримт бүрд эцсийн (final) хувилбарын Drive линк холбо." });
    else add("G1", "G1 · Deliverable", true, "PASS");
  } else add("G1", "G1 · Deliverable", false, "NOT_APPLICABLE");

  // G2 self QC
  if (p.selfqc) {
    var sq = revs.some(function (r) { return r.type === "SELF_QC" && r.decision === "PASS"; });
    add("G2", "G2 · Self QC", true, sq ? "PASS" : "FAIL", sq ? null :
      { sev: "HIGH", res: "FAIL", title: "Self QC хийгдээгүй", act: "Эзэмшигч Self QC PASS бүртгэнэ." });
  } else add("G2", "G2 · Self QC", false, "NOT_APPLICABLE");

  // G3 reviews
  var need = p.reviews.filter(function (t) {
    return !revs.some(function (r) { return r.type === t && r.decision === "PASS"; });
  });
  var rejected = revs.some(function (r) { return r.decision === "REJECT"; });
  if (p.reviews.length) {
    if (need.length || rejected) add("G3", "G3 · Review", true, "FAIL",
      { sev: "CRITICAL", res: "FAIL",
        title: rejected ? "Review REJECT шийдвэртэй" : "Review дутуу: " + need.join(", "),
        act: "Хянагчаас шаардлагатай төрөл бүрд PASS авах." });
    else add("G3", "G3 · Review", true, "PASS");
  } else add("G3", "G3 · Review", false, "NOT_APPLICABLE");

  // G4 approvals
  if (p.approvals.length) {
    var needA = p.approvals.filter(function (t) {
      return !apps.some(function (a) { return a.type === t && a.decision === "APPROVE"; });
    });
    if (needA.length) add("G4", "G4 · Захирлын хянаж батлах", true, "FAIL",
      { sev: "HIGH", res: "FAIL", title: "Батлал дутуу: " + needA.join(", "),
        act: "Эцсийн хувилбарыг батлагчид илгээ." });
    else {
      var unversioned = apps.some(function (a) { return a.decision === "APPROVE" && !a.version; });
      add("G4", "G4 · Захирлын хянаж батлах", true, unversioned ? "WARNING" : "PASS", unversioned ?
        { sev: "MEDIUM", res: "WARNING", title: "Батлал хувилбарын дугааргүй" } : null);
    }
  } else add("G4", "G4 · Захирлын хянаж батлах", false, "NOT_APPLICABLE");

  // G5 implementation
  var implReq = p.impl || w.implReq;
  if (implReq) {
    var ok5 = (w.impl || []).some(function (i) {
      return i.status === "LIVE" || i.status === "PILOT" || i.status === "NOT_REQUIRED";
    });
    add("G5", "G5 · Хэрэгжилт", true, ok5 ? "PASS" : "FAIL", ok5 ? null :
      { sev: "CRITICAL", res: "FAIL", title: "Хэрэгжилт LIVE/PILOT биш",
        act: "Батлагдсан ≠ хэрэгжсэн: production/pilot бүртгэлийг нотолгоотой хий." });
  } else add("G5", "G5 · Хэрэгжилт", false, "NOT_APPLICABLE");

  // G6 metric
  var metricReq = p.metric || w.validReq;
  if (metricReq) {
    var ms = w.metrics || [];
    if (!ms.length) add("G6", "G6 · Метрик", true, "FAIL",
      { sev: "HIGH", res: "FAIL", title: "Хэмжих үзүүлэлт тодорхойлогдоогүй" });
    else {
      var failing = ms.filter(function (m) { return m.status === "FAIL"; });
      var pending = ms.filter(function (m) { return m.status !== "PASS" && m.status !== "FAIL"; });
      if (failing.length) add("G6", "G6 · Метрик", true, "FAIL",
        { sev: "CRITICAL", res: "FAIL",
          title: "Метрик зорилтдоо хүрээгүй: " + failing.map(function (m) { return m.name; }).join(", ") });
      else if (pending.length) add("G6", "G6 · Метрик", true, "FAIL",
        { sev: "HIGH", res: "FAIL",
          title: "Метрик баталгаажаагүй: " + pending.map(function (m) { return m.name; }).join(", "),
          act: "Бодит утгыг оруулж, хянагч/захирал PASS/FAIL шийднэ." });
      else add("G6", "G6 · Метрик", true, "PASS");
    }
  } else add("G6", "G6 · Метрик", false, "NOT_APPLICABLE");

  // G7 evidence
  var enough = evs.length >= p.minEv;
  add("G7", "G7 · Нотолгоо", true, enough ? "PASS" : "FAIL", enough ? null :
    { sev: "HIGH", res: "FAIL", title: "Нотолгоо дутуу (" + evs.length + "/" + p.minEv + ")",
      act: "Drive нотолгоог холбож бүртгэ." });

  // G8 EOM v5.0 нийцэл — AI зөвлөх шалгалт (DGS загвар; эцсийн шийдвэр хүнийх)
  if (p.deliv) {
    var ec = w.eomCheck, sig8 = eomSig(w), em = w.eomManual;
    if (em && em.sig === sig8) add("G8", "G8 · EOM нийцэл", true, "PASS");
    else if (!ec) add("G8", "G8 · EOM нийцэл", true, "FAIL",
      { sev: "HIGH", res: "FAIL", title: "EOM v5.0 нийцэл шалгагдаагүй",
        act: "«EOM v5.0 нийцэл» хэсгээс AI шалгалт ажиллуул, эсвэл захирал «хүнээр хянаж баталсан» гэж бүртгэ." });
    else if (ec.sig !== sig8) add("G8", "G8 · EOM нийцэл", true, "FAIL",
      { sev: "HIGH", res: "FAIL", title: "Эцсийн deliverable өөрчлөгдсөн — EOM шалгалт хуучирсан",
        act: "EOM v5.0 нийцлийн AI шалгалтыг дахин ажиллуул." });
    else if (ec.result === "PASS") add("G8", "G8 · EOM нийцэл", true, "PASS");
    else if (ec.result === "WARNING") add("G8", "G8 · EOM нийцэл", true, "WARNING",
      { sev: "MEDIUM", res: "WARNING", title: "EOM нийцэл анхааруулгатай: " + (ec.summary || "") });
    else add("G8", "G8 · EOM нийцэл", true, "FAIL",
      { sev: "CRITICAL", res: "FAIL", title: "EOM v5.0 нийцэл: FAIL" + (ec.summary ? " — " + ec.summary : ""),
        act: "Дутагдлыг баримтдаа засаад AI шалгалтыг дахин ажиллуул." });
  } else add("G8", "G8 · EOM нийцэл", false, "NOT_APPLICABLE");

  // G9 CIO хүлээн зөвшөөрөлт — ажил + баримтыг хүлээн авч зөвшөөрсөн sign-off
  var cs9 = w.cioSign;
  if (cs9 && cs9.decision === "APPROVE") add("G9", "G9 · CIO хүлээн зөвшөөрөлт", true, "PASS");
  else if (cs9) add("G9", "G9 · CIO хүлээн зөвшөөрөлт", true, "FAIL",
    { sev: "CRITICAL", res: "FAIL", title: "CIO буцаасан: " + (cs9.comment || "тайлбаргүй"),
      act: "Дутагдлыг засаад CIO-д дахин хүлээлгэн өг." });
  else add("G9", "G9 · CIO хүлээн зөвшөөрөлт", true, "FAIL",
    { sev: "HIGH", res: "FAIL", title: "CIO хүлээн зөвшөөрөлт бүртгэгдээгүй",
      act: "Х.Нургүл (CIO) ажил, баримтыг хүлээн авч APPROVE + sign-off хийнэ. Амаар зөвшөөрөл хүчингүй." });

  // deadline warning
  if (w.deadline && w.deadline < today && w.status !== "CLOSED")
    add("W1", "Хугацаа", false, "WARNING",
      { sev: "MEDIUM", res: "WARNING", title: "Хугацаа хэтэрсэн (" + w.deadline + ")" });
  else add("W1", "Хугацаа", false, "PASS");

  var applicable = checks.filter(function (c) { return c.result !== "NOT_APPLICABLE"; });
  var reqFail = applicable.some(function (c) { return c.required && c.result === "FAIL"; });
  var warn = applicable.some(function (c) { return c.result === "WARNING"; });
  return { result: reqFail ? "FAIL" : warn ? "WARNING" : "PASS", checks: checks, findings: findings };
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = { PROFILES: PROFILES, profileOf: profileOf, TRANSITIONS: TRANSITIONS,
    canGo: canGo, closableFrom: closableFrom, evaluateGate: evaluateGate, metricOk: metricOk,
    eomSig: eomSig, EOM_CRITERIA: EOM_CRITERIA, driveRef: driveRef,
    fwMeta: fwMeta, FW_KINDS: FW_KINDS, chainHash: chainHash, verifyAuditChain: verifyAuditChain };
}
