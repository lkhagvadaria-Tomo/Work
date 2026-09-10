/* Gate Engine-ийн цэвэр функцүүдийн тест — node prototype/tests/engine.test.js */
"use strict";
var a = require("assert");
var E = require("../app_engine.js");
var T = "2026-09-10";
var n = 0;
function t(name, fn) { fn(); n++; console.log("  ✓ " + name); }

var base = {
  type: "STANDARD", status: "APPROVED", deadline: "2026-12-31", requirements: ["Журам"],
  deliverables: [{ req: "Журам", name: "Журам", version: "v1.0", final: true }],
  reviews: [{ type: "SELF_QC", decision: "PASS" }],
  approvals: [{ type: "DIRECTOR", decision: "APPROVE", version: "v1.0" }],
  evidence: [{ id: "e1" }], metrics: [], impl: [], cioSign: { decision: "APPROVE" }
};
var sig = E.eomSig(base);

console.log("PROFILES — ажилтанд оногдсон хяналт байхгүй");
t("STANDARD review шаардахгүй", function () { a.deepEqual(E.PROFILES.STANDARD.reviews, []); });
t("PROCESS review шаардахгүй", function () { a.deepEqual(E.PROFILES.PROCESS.reviews, []); });
t("AI_AGENT-д IT хараат хяналт үлдэнэ", function () { a.deepEqual(E.PROFILES.AI_AGENT.reviews, ["IT"]); });

console.log("Гейт G1–G9");
t("бүх шалгуур хангавал PASS", function () {
  a.equal(E.evaluateGate(Object.assign({}, base, { eomManual: { sig: sig } }), T).result, "PASS");
});
t("EOM шалгалтгүй бол FAIL", function () { a.equal(E.evaluateGate(Object.assign({}, base), T).result, "FAIL"); });
t("EOM шалгалт хуучирвал FAIL", function () {
  a.equal(E.evaluateGate(Object.assign({}, base, { eomCheck: { result: "PASS", sig: "өөр" } }), T).result, "FAIL");
});
t("EOM WARNING → гейт WARNING", function () {
  a.equal(E.evaluateGate(Object.assign({}, base, { eomCheck: { result: "WARNING", sig: sig } }), T).result, "WARNING");
});
t("CIO зөвшөөрөлгүй бол FAIL", function () {
  var w = Object.assign({}, base, { eomManual: { sig: sig } }); delete w.cioSign;
  a.equal(E.evaluateGate(w, T).result, "FAIL");
});
t("CIO буцаавал FAIL", function () {
  a.equal(E.evaluateGate(Object.assign({}, base, { eomManual: { sig: sig }, cioSign: { decision: "RETURN" } }), T).result, "FAIL");
});
t("deliverable дутуу бол FAIL", function () {
  a.equal(E.evaluateGate(Object.assign({}, base, { eomManual: { sig: sig }, deliverables: [] }), T).result, "FAIL");
});
t("нотолгоо дутуу бол FAIL", function () {
  a.equal(E.evaluateGate(Object.assign({}, base, { eomManual: { sig: sig }, evidence: [] }), T).result, "FAIL");
});
t("хугацаа хэтэрвэл WARNING", function () {
  a.equal(E.evaluateGate(Object.assign({}, base, { eomManual: { sig: sig }, deadline: "2026-01-01" }), T).result, "WARNING");
});

console.log("Төлөвийн шилжилт");
t("NOT_STARTED → IN_PROGRESS", function () { a.equal(E.canGo("NOT_STARTED", "IN_PROGRESS"), true); });
t("IN_PROGRESS → CLOSED хориотой", function () { a.equal(E.canGo("IN_PROGRESS", "CLOSED"), false); });
t("CLOSED-оос хаашаа ч үгүй", function () { a.deepEqual(E.TRANSITIONS.CLOSED, []); });

console.log("Drive линкийн шүүлт");
t("Docs файл", function () { a.equal(E.driveRef("https://docs.google.com/document/d/1abcdefghij/edit").kind, "file"); });
t("Drive хавтас", function () { a.equal(E.driveRef("https://drive.google.com/drive/folders/1abcdefghij").kind, "folder"); });
t("гадны хаяг хориотой", function () { a.equal(E.driveRef("https://evil.example.com/d/1abcdefghij"), null); });
t("http хориотой", function () { a.equal(E.driveRef("http://drive.google.com/drive/folders/1abcdefghij"), null); });

console.log("Хүрээний баримтын нэр задлалт");
[["IPPDD_Investement_Product_Governance_policy_2026-08-05_v5.0", "POL", "5.0"],
 ["IPPDD_Risk_Compliance_Review_Standard_2026-08-05_v1.5", "STD", "1.5"],
 ["IPPDD_Develop_New_Product_Procedure_2026-08-05_v1.5", "PRO", "1.5"],
 ["IPPDD_Product_Process_SOP_Register_2026-08-05_v0.1", "REG", "0.1"],
 ["IPPDD_DocCompliance_Report_2026-09-07_v1.0", "RPT", "1.0"]].forEach(function (c) {
  t(c[0].slice(0, 40) + " → " + c[1], function () {
    var m = E.fwMeta(c[0]); a.equal(m.kind, c[1]); a.equal(m.version, c[2]);
  });
});

console.log("Аудитын хэш гинж (tamper-evident)");
t("гинж бүрэн бүтэн", function () {
  var list = [], prev = null;
  ["эхлэв", "батлав", "хаав"].forEach(function (x, i) {
    var e = { ts: "2026-09-10T0" + i + ":00:00Z", by: "Тест", action: x };
    e.h = E.chainHash(prev, e); prev = e.h; list.unshift(e);
  });
  a.equal(E.verifyAuditChain(list).ok, true);
  list[1].action = "ЗАСВАРЛАВ";
  a.equal(E.verifyAuditChain(list).ok, false);
});
t("хэшгүй хуучин бичлэг гинжийг унагаахгүй", function () {
  a.equal(E.verifyAuditChain([{ ts: "x", by: "y", action: "z" }]).ok, true);
});

console.log("\n" + n + "/" + n + " шалгалт ногоон");
