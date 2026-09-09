/* ── Деterministic Gate Engine (порт: ippdd-workos/lib/gate-engine) ─────────
   Цэвэр функцууд — node дээр тестлэгдэнэ, AI хамааралгүй. */
"use strict";

var PROFILES = {
  PROCESS:  { deliv:true,  selfqc:true,  reviews:["FUNCTIONAL","PROCESS_OWNER"], approvals:["DIRECTOR"], impl:false, metric:false, minEv:1, simplified:false },
  STANDARD: { deliv:true,  selfqc:true,  reviews:["FUNCTIONAL"], approvals:["DIRECTOR"], impl:false, metric:false, minEv:1, simplified:false },
  AI_AGENT: { deliv:true,  selfqc:true,  reviews:["FUNCTIONAL","IT"], approvals:["DIRECTOR"], impl:true,  metric:true,  minEv:2, simplified:false },
  TRAINING: { deliv:true,  selfqc:false, reviews:["FUNCTIONAL"], approvals:["DIRECTOR"], impl:false, metric:true,  minEv:1, simplified:false },
  KPI:      { deliv:false, selfqc:false, reviews:["FUNCTIONAL"], approvals:[],           impl:false, metric:true,  minEv:1, simplified:true  },
  DEFAULT:  { deliv:true,  selfqc:true,  reviews:["FUNCTIONAL"], approvals:["DIRECTOR"], impl:false, metric:false, minEv:1, simplified:false }
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
    if (needA.length) add("G4", "G4 · Батлал", true, "FAIL",
      { sev: "HIGH", res: "FAIL", title: "Батлал дутуу: " + needA.join(", "),
        act: "Эцсийн хувилбарыг батлагчид илгээ." });
    else {
      var unversioned = apps.some(function (a) { return a.decision === "APPROVE" && !a.version; });
      add("G4", "G4 · Батлал", true, unversioned ? "WARNING" : "PASS", unversioned ?
        { sev: "MEDIUM", res: "WARNING", title: "Батлал хувилбарын дугааргүй" } : null);
    }
  } else add("G4", "G4 · Батлал", false, "NOT_APPLICABLE");

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
    var ec = w.eomCheck, sig8 = eomSig(w);
    if (!ec) add("G8", "G8 · EOM нийцэл", true, "FAIL",
      { sev: "HIGH", res: "FAIL", title: "EOM v5.0 нийцлийн AI шалгалт хийгдээгүй",
        act: "Ажлын хуудасны «EOM v5.0 нийцэл» хэсгээс AI шалгалт ажиллуулж PASS ав." });
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
    eomSig: eomSig, EOM_CRITERIA: EOM_CRITERIA };
}
