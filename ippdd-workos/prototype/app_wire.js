/* ── Event wiring + AI туслах ─────────────────────────────────────────────── */
"use strict";

function fval(el, name) {
  var scope = el.closest(".card-b") || el.closest("main") || document;
  var f = scope.querySelector('[data-f="' + name + '"]');
  return f ? (f.type === "checkbox" ? f.checked : f.value) : "";
}

function askCheckinAi() {
  if (S.aiBusy) return;
  useCap("sample").then(function (sample) {
    if (!sample) { toast("AI энэ орчинд боломжгүй байна", true); return; }
    S.aiBusy = true; S.checkinAi = "Бодож байна…"; render();
    var data = deptWorks().map(function (w) {
      var g = evaluateGate(w, TODAY);
      return { code: w.code, kr: w.kr, title: w.title, type: w.type, status: w.status,
        deadline: w.deadline, dod: w.dod,
        requirements: w.requirements,
        deliverables: (w.deliverables || []).map(function (d) { return d.name + " " + d.version + (d.final ? " (FINAL)" : ""); }),
        evidence: (w.evidence || []).map(function (e2) { return e2.type + ": " + e2.title + (e2.verified ? " ✓" : ""); }),
        metrics: (w.metrics || []).map(function (mm) { return mm.name + " зорилт " + mm.op + mm.target + (mm.unit || "") + ", бодит " + (mm.actual == null ? "—" : mm.actual) + ", " + mm.status; }),
        gate: g.result,
        gaps: g.findings.filter(function (f) { return f.res === "FAIL"; }).map(function (f) { return f.title; }),
        handover: w.handover ? w.handover.status + " → " + (w.handover.toName || "") : null };
    });
    var krsum = krList().map(function (k) {
      return { kr: k.id, weight: k.weight, objWeight: k.objWeight, deadline: k.deadline,
        status: k.status, achievement: k.achievement || 0 };
    });
    var sys = "Чи IPPDD WorkOS-ийн засаглалын туслах. Захирал болон үүсгэн байгуулагчийн " +
      "Employee OKR Performance Check-in хуралд зориулсан дүгнэлт бэлтгэ. ХАТУУ ДҮРЭМ: зөвхөн доорх " +
      "SYSTEM DATA-д тулгуурла; байхгүй баримт, огноо, үр дүн бүү зохио; чи баримтын ДОТОРХ агуулгыг " +
      "уншаагүй — бүртгэлийн нэр/хувилбар/төлөвөөр л дүгнэж байгаагаа тайланд нэг мөрөөр тэмдэглэ. " +
      "Бүтэц: (1) Ерөнхий дүгнэлт 2-3 өгүүлбэр; (2) Ажил тус бүрд: DoD-д нийцэж буй байдал, дутагдал, " +
      "check-in дээр хэлэх гол санаа (товч); (3) Хурлаас гарах шийдвэрийн санал 3 хүртэл; " +
      "(4) Үүсгэн байгуулагчаас гарч болох 3 асуулт + хариулах чиглэл. Монголоор, товч, ажил хэрэгч. " +
      "Чи зөвлөх эрхтэй — үнэлгээний эцсийн шийдвэр хүнийх.\n\n=== SYSTEM DATA ===\n" +
      JSON.stringify({ today: TODAY, quarter: S.meta && S.meta.code, employee: U("LA").name, krs: krsum, work: data });
    sample(sys, {
      cache: false, modelTier: "default",
      onText: function (u2) { S.checkinAi = u2.text || "…"; render(); }
    }).then(function (res) {
      S.checkinAi = res.text || "(хоосон хариу)";
    }).catch(function (e2) {
      S.checkinAi = "AI алдаа: " + (e2 && e2.message ? e2.message : "боломжгүй");
    }).finally(function () { S.aiBusy = false; render(); });
  });
}

function askAi(q) {
  if (S.aiBusy) return;
  useCap("sample").then(function (sample) {
    if (!sample) { toast("AI энэ орчинд боломжгүй байна", true); return; }
    S.aiBusy = true;
    S.ai.push({ q: true, text: q });
    S.ai.push({ q: false, text: "Бодож байна…" });
    renderChat();
    var ctx = {
      today: TODAY, quarter: S.meta,
      krs: krList().map(function (k) {
        return { kr: k.id, title: k.title, weight: k.weight, objWeight: k.objWeight,
          deadline: k.deadline, status: k.status, achievement: k.achievement || 0 };
      }),
      work: workList().map(function (w) {
        return { code: w.code, kr: w.kr, title: w.title, type: w.type, status: w.status,
          deadline: w.deadline,
          finalDeliverables: (w.deliverables || []).filter(function (d) { return d.final; }).length,
          requirements: (w.requirements || []).length,
          evidence: (w.evidence || []).length,
          reviews: (w.reviews || []).map(function (r) { return r.type + ":" + r.decision; }),
          approvals: (w.approvals || []).map(function (a) { return a.type + ":" + a.decision + (a.version ? "@" + a.version : ""); }),
          gate: w.gate ? { result: w.gate.result,
            findings: w.gate.findings.map(function (f) { return f.title; }) } : null,
          closure: w.closure ? w.closure.status : null };
      })
    };
    var system = "Чи IPPDD Closure & Governance Agent. Хатуу дүрэм: зөвхөн доорх SYSTEM DATA-гийн " +
      "бүтэцтэй өгөгдлөөс хариул; байхгүй нотолгоо, батлал, огноо, линк, метрик ХЭЗЭЭ Ч бүү зохио; " +
      "дутуу бол «системд бүртгэлгүй» гэж хэл. Чи батлах, гарын үсэг зурах, ажил хаах эрхгүй — " +
      "зөвхөн шалгаж, тайлбарлаж, зөвлөнө. Монголоор товч, ажил хэрэгч хариул.\n\n=== SYSTEM DATA ===\n" +
      JSON.stringify(ctx);
    sample(system + "\n\nАсуулт: " + q, {
      cache: false, modelTier: "default",
      onText: function (u) { S.ai[S.ai.length - 1].text = u.text || "…"; renderChat(); }
    }).then(function (r) {
      S.ai[S.ai.length - 1].text = r.text || "(хоосон хариу)";
    }).catch(function (e) {
      S.ai[S.ai.length - 1].text = "AI алдаа: " + (e && e.message ? e.message : "боломжгүй") +
        (e && e.text ? "\n" + e.text : "");
    }).finally(function () { S.aiBusy = false; renderChat(); });
  });
}

document.addEventListener("submit", function (ev) {
  var f = ev.target.closest("form[data-chat]");
  if (!f) return;
  ev.preventDefault();
  var inp = f.querySelector('[data-f="aiq"]');
  var q = inp ? inp.value.trim() : "";
  if (q.length > 1 && !S.aiBusy) { askAi(q); if (inp) inp.value = ""; }
});

document.addEventListener("change", function (ev) {
  var t = ev.target;
  if (t.dataset && t.dataset.krach) {
    try { A.setKrAchievement(t.dataset.krach, t.value); } catch (e) { render(); }
  }
});

document.addEventListener("click", function (ev) {
  var t = ev.target.closest("button, tr[data-open]");
  touchSession();
  if (!t) return;
  var d = t.dataset || {};
  try {
    if (d.login) { doLogin(d.login); return; }
    if (d.sug) {
      var si = document.querySelector('#chatDrawer [data-f="aiq"]');
      if (si) si.value = d.sug;
      if (!S.aiBusy) askAi(d.sug);
      return;
    }
    if (t.getAttribute && t.getAttribute("role") === "tab") {
      S.tab = d.tab; S.workId = null; render(); window.scrollTo(0, 0); return;
    }
    if (d.open) { S.tab = "work"; S.workId = d.open; render(); window.scrollTo(0, 0); return; }
    var wid = d.wid || S.workId;
    if (d.rev) { A.decideReview(wid, d.rid, d.rev, fval(t, "comment")); return; }
    if (d.app) { A.decideApproval(wid, d.aid, d.app, fval(t, "comment")); return; }
    if (d.sign) { A.signClosure(wid, d.sign, fval(t, "comment")); return; }
    if (d.final) { A.markFinal(S.workId, d.final); return; }
    if (d.verify) { A.verifyEvidence(S.workId, d.verify); return; }
    if (d.delev) { A.removeEvidence(S.workId, d.delev); return; }
    if (d.msave != null) {
      var inp = document.querySelector('[data-mact="' + d.msave + '"]');
      A.setMetric(S.workId, Number(d.msave), inp ? inp.value : NaN); return;
    }
    if (d.mpass != null) { A.decideMetric(S.workId, Number(d.mpass), true); return; }
    if (d.mfail != null) { A.decideMetric(S.workId, Number(d.mfail), false); return; }
    if (d.closekr) {
      var kin = document.querySelector('[data-krach="' + d.closekr + '"]');
      var v = kin ? kin.value : (S.krs[d.closekr].achievement || 100);
      A.closeKr(d.closekr, v === "" || v == null ? 100 : v); return;
    }
    if (d.dept) { S.deptFilter = d.dept; render(); return; }
    if (d.hoconf != null) {
      A.confirmHandover(S.workId, d.hoconf === "1", fval(t, "hocmt")); return;
    }
    switch (d.act) {
      case "print": window.print(); break;
      case "checkinAi": askCheckinAi(); break;
      case "newWork": S.tab = "new"; render(); window.scrollTo(0, 0); break;
      case "createWork":
        A.createWork({ title: fval(t, "nw_title"), dept: fval(t, "nw_dept"), type: fval(t, "nw_type"),
          priority: fval(t, "nw_prio"), deadline: fval(t, "nw_deadline"), kr: fval(t, "nw_kr"),
          dod: fval(t, "nw_dod"), reqs: fval(t, "nw_reqs"),
          reviewer: fval(t, "nw_reviewer"), approver: fval(t, "nw_approver"),
          implReq: fval(t, "nw_impl") });
        break;
      case "handover":
        A.requestHandover(S.workId, { to: fval(t, "hoto"), note: fval(t, "honote"), url: fval(t, "hourl") });
        break;
      case "addDept": A.addDept(fval(t, "ad_code"), fval(t, "ad_name")); break;
      case "addUser":
        A.addUser({ name: fval(t, "au_name"), email: fval(t, "au_email"),
          dept: fval(t, "au_dept"), role: fval(t, "au_role") });
        break;
      case "logout": doLogout(false); break;
      case "theme": toggleTheme(); break;
      case "chat": S.chatOpen = !S.chatOpen; renderChat(); break;
      case "back": S.tab = "home"; S.workId = null; render(); break;
      case "seed": seedSharedDb(); break;
      case "closeq": A.closeQuarter(); break;
      case "start": A.start(S.workId); break;
      case "resubmit": A.resubmit(S.workId); break;
      case "submitReview": A.submitReview(S.workId); break;
      case "requestApproval": A.requestApproval(S.workId); break;
      case "submitClosure": A.submitClosure(S.workId); break;
      case "selfQc": A.selfQc(S.workId); break;
      case "recordImpl": A.recordImpl(S.workId, fval(t, "istatus"), fval(t, "ienv")); break;
      case "addDeliverable":
        A.addDeliverable(S.workId, { req: fval(t, "req"), name: fval(t, "name"),
          url: fval(t, "url"), version: fval(t, "version"), final: fval(t, "final") });
        break;
      case "addEvidence":
        A.addEvidence(S.workId, { type: fval(t, "etype"), title: fval(t, "etitle"),
          url: fval(t, "eurl"), desc: fval(t, "edesc") });
        break;
    }
  } catch (e) { /* must() аль хэдийн toast хийсэн */ }
});

/* эхлэл: локал seed-ээр шууд харагдана; db холбогдвол хамтын өгөгдлөөр солино */
initTheme();
loadLocalSeed();
loadSession();
renderShell();
render();
setConn(false);
connectDb();
setInterval(function () {
  if (!S.p) return;
  try {
    var raw = localStorage.getItem("workos.sess");
    var s = raw ? JSON.parse(raw) : null;
    if (!s || Date.now() - s.ts >= SESSION_MS) doLogout(true);
  } catch (e) {}
}, 60000);
