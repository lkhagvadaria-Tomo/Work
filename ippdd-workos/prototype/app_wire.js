/* ── Event wiring + AI туслах ─────────────────────────────────────────────── */
"use strict";

function fval(el, name) {
  var scope = el.closest(".card-b") || el.closest("main") || document;
  var f = scope.querySelector('[data-f="' + name + '"]');
  return f ? (f.type === "checkbox" ? f.checked : f.value) : "";
}

function fileIdOf(url) {
  var m = /\/d\/([A-Za-z0-9_-]{10,})/.exec(url || "") || /[?&]id=([A-Za-z0-9_-]{10,})/.exec(url || "");
  return m ? m[1] : null;
}

/* EOM шалгуурын AI prompt — ажлын G8 болон бие даасан «Баримт шалгах» хоёулаа хэрэглэнэ */
function eomPrompt(readable) {
  return "Чи Netcapital EOM v5.0-ийн Document Governance & Register Steward (DGS) дүрийн ЗӨВЛӨХ шалгагч. " +
    "Доорх баримт тус бүрийн агуулгыг EOM v5.0-ийн баримтын шаардлагад тулгаж үнэл.\n\nШАЛГУУР:\n" +
    EOM_CRITERIA.map(function (c2) { return c2.id + " — " + c2.t + " (" + c2.ref + ")"; }).join("\n") +
    "\n\nХАТУУ ДҮРЭМ: зөвхөн өгсөн текстээс дүгнэ — байхгүй зүйл бүү зохио; текст эхний 15000 тэмдэгтээр " +
    "тасарсан байж болно, тасархайн цаадахыг таамаглахгүй (эргэлзвэл WARNING); чи зөвлөх (§2.5a A/S) — " +
    "эцсийн шийдвэр хүнийх. Verdict дүрэм: заавал шаардлага (NAME, CTRL, OWNER, APPR; AI ашигласан бол AIGATE) " +
    "дутуу → FAIL; зөвхөн сайжруулах зүйл → WARNING; бүрэн → PASS. overall = хамгийн муу verdict. " +
    "issues-д шалгуурын ID-г crit талбарт тавьж, note-г монголоор товч, ажил хэрэгч бич (юуг хэрхэн засахыг).\n\n" +
    "Хариу ЗӨВХӨН JSON: {\"overall\":\"PASS|WARNING|FAIL\",\"summary\":\"1-2 өгүүлбэр монголоор\"," +
    "\"docs\":[{\"name\":\"...\",\"verdict\":\"PASS|WARNING|FAIL\",\"issues\":[{\"crit\":\"ID\",\"note\":\"...\"}]}]}\n\n" +
    "=== БАРИМТУУД ===\n" +
    readable.map(function (x) { return "--- " + x.name + " ---\n" + x.text; }).join("\n\n");
}

/* Ажил ↔ баримтын агуулгын тулгалт: DoD, шаардлага, хүрээний баримтуудтай */
function auditPrompt(w, readable) {
  var reqs = (w.requirements || []);
  return "Чи Netcapital-ийн баримт бичгийн засаглалын ЗӨВЛӨХ аудитор. Ажлын шаардлага, DoD-ийг " +
    "хавсаргасан баримтуудын БОДИТ АГУУЛГАТАЙ тулгаж, мөн газрын баримт бичгийн хүрээтэй (доорх бүртгэл) " +
    "зөрчилгүй эсэхийг шалга.\n\n" +
    "=== АЖИЛ ===\nКод: " + w.code + "\nНэр: " + w.title + "\nТөрөл: " + w.type +
    "\nХугацаа: " + (w.deadline || "—") + "\nDoD: " + (w.dod || "(тодорхойлоогүй)") + "\n" +
    "Шаардлага (deliverable) бүр:\n" + (reqs.length ? reqs.map(function (r, i) { return (i + 1) + ". " + r; }).join("\n") : "(жагсаагаагүй)") + "\n" +
    "Хавсаргасан эцсийн баримтууд: " + (w.deliverables || []).filter(function (d) { return d.final; })
      .map(function (d) { return d.name + " " + (d.version || ""); }).join("; ") + "\n\n" +
    "=== ГАЗРЫН БАРИМТ БИЧГИЙН ХҮРЭЭ (Drive бүртгэл) ===\n" + fwIndexText() + "\n\n" +
    "=== EOM v5.0 БАРИМТЫН ШААРДЛАГА (хэлбэрийн шалгуур) ===\n" +
    EOM_CRITERIA.map(function (c2) { return c2.id + " — " + c2.t; }).join("\n") + "\n\n" +
    "ХАТУУ ДҮРЭМ: зөвхөн доорх текстээс дүгнэ — байхгүй зүйл бүү зохио; текст 15000 тэмдэгтээр тасарсан " +
    "байж болно (эргэлзвэл PARTIAL/WARNING); хүрээний баримтуудын зөвхөн НЭР, код, хувилбарыг мэдэж байгаа " +
    "(агуулгыг уншаагүй) тул тэдгээртэй тулгахдаа зөвхөн нэр/хувилбар/дурдагдсан эсэхээр дүгн; чи зөвлөх " +
    "(EOM §2.5a) — эцсийн шийдвэр хүнийх.\n\n" +
    "Хариу ЗӨВХӨН JSON: {\"overall\":\"PASS|WARNING|FAIL\",\"summary\":\"2-3 өгүүлбэр монголоор\"," +
    "\"reqs\":[{\"req\":\"шаардлагын нэр\",\"status\":\"MET|PARTIAL|MISSING\",\"where\":\"аль баримтын аль хэсэгт\",\"note\":\"тайлбар\"}]," +
    "\"docs\":[{\"name\":\"...\",\"verdict\":\"PASS|WARNING|FAIL\",\"issues\":[{\"crit\":\"DoD|FRAMEWORK|NAME|CTRL|OWNER|APPR|TRACE|STRUCT|LOG|RISK\",\"note\":\"...\"}]}]," +
    "\"framework\":[{\"doc\":\"хүрээний баримтын нэр\",\"issue\":\"зөрчил, давхардал, хувилбарын зөрүү, дурдагдаагүй холбоос\"}]," +
    "\"dodVerdict\":\"MET|PARTIAL|NOT_MET\",\"actions\":[\"хийх ажил 1\",\"хийх ажил 2\"]}\n\n" +
    "=== ХАВСАРГАСАН БАРИМТУУДЫН АГУУЛГА ===\n" +
    readable.map(function (x) { return "--- " + x.name + " ---\n" + x.text; }).join("\n\n");
}

function normAudit(out) {
  out = out || {};
  function v3(x, a2, b2, c2) { return x === a2 ? a2 : x === b2 ? b2 : c2; }
  return {
    result: out.overall === "PASS" ? "PASS" : out.overall === "WARNING" ? "WARNING" : "FAIL",
    summary: String(out.summary || "").slice(0, 900),
    dodVerdict: v3(out.dodVerdict, "MET", "PARTIAL", "NOT_MET"),
    reqs: (Array.isArray(out.reqs) ? out.reqs : []).slice(0, 20).map(function (r) {
      return { req: String(r.req || "").slice(0, 200), status: v3(r.status, "MET", "PARTIAL", "MISSING"),
        where: String(r.where || "").slice(0, 200), note: String(r.note || "").slice(0, 300) };
    }),
    docs: (Array.isArray(out.docs) ? out.docs : []).slice(0, 12).map(function (d) {
      return { name: String(d.name || "").slice(0, 200),
        verdict: d.verdict === "PASS" ? "PASS" : d.verdict === "WARNING" ? "WARNING" : "FAIL",
        issues: (Array.isArray(d.issues) ? d.issues : []).slice(0, 12).map(function (i2) {
          return { crit: String(i2.crit || "?").slice(0, 12), note: String(i2.note || "").slice(0, 300) };
        }) };
    }),
    framework: (Array.isArray(out.framework) ? out.framework : []).slice(0, 15).map(function (f) {
      return { doc: String(f.doc || "").slice(0, 200), issue: String(f.issue || "").slice(0, 300) };
    }),
    actions: (Array.isArray(out.actions) ? out.actions : []).slice(0, 8).map(function (a2) {
      return String(a2 || "").slice(0, 300);
    })
  };
}

/* Ажил дээрх гүнзгий тулгалтыг ажиллуулна */
function runDocAudit(wid) {
  if (S.auditBusy) return;
  var w = S.works[wid]; if (!w) return;
  var finals = (w.deliverables || []).filter(function (d) { return d.final; });
  if (!finals.length) { toast("Эцсийн (FINAL) deliverable алга — эхлээд баримтаа холбож эцсийн болго", true); return; }
  Promise.all([useCap("mcp"), useCap("sample")]).then(function (caps) {
    var mcp = caps[0], sample = caps[1];
    if (!sample) { toast("AI энэ орчинд боломжгүй байна", true); return; }
    if (!mcp) { toast("Google Drive холболт алга — claude.ai дотроос нээж ажиллуулна уу", true); return; }
    S.auditBusy = true; S.auditWid = wid; S.auditProg = "Баримт уншиж байна…"; render();
    var files = finals.map(function (d) {
      var ref = driveRef(d.url);
      return { id: ref ? ref.id : null, name: d.name + " " + (d.version || "") };
    }).filter(function (f) { return f.id; });
    if (!files.length) {
      S.auditBusy = false; S.auditWid = null; S.auditProg = null; render();
      toast("Deliverable-ийн линкээс Drive ID олдсонгүй", true); return;
    }
    readDriveDocs(mcp, files.slice(0, 6), function (m) { S.auditProg = m; render(); }).then(function (docs) {
      var readable = docs.filter(function (x) { return x.text; });
      if (!readable.length)
        throw new Error("Нэг ч баримт уншигдсангүй: " + docs.map(function (x) { return x.name + " (" + x.err + ")"; }).join("; "));
      S.auditProg = "DoD, шаардлага, хүрээтэй тулгаж байна…"; render();
      return sample.json(auditPrompt(w, readable), { modelTier: "default", cache: false }).then(function (out) {
        var audit = normAudit(out);
        audit.unread = docs.filter(function (x) { return !x.text; }).map(function (x) { return x.name + " (" + x.err + ")"; });
        audit.ts = new Date().toISOString(); audit.by = S.p; audit.byName = U(S.p).name;
        audit.sig = eomSig(w); audit.fwCount = (S.fw && (S.fw.files || []).length) || 0;
        A.recordDocAudit(wid, audit);
        toast("Тулгалт: " + audit.result + " · DoD " + audit.dodVerdict, audit.result !== "PASS");
      });
    }).catch(function (e) {
      toast("Тулгалт амжилтгүй: " + ((e && (e.message || e.code)) || "алдаа"), true);
    }).finally(function () { S.auditBusy = false; S.auditWid = null; S.auditProg = null; render(); });
  });
}

function normEom(out) {
  out = out || {};
  return {
    result: out.overall === "PASS" ? "PASS" : out.overall === "WARNING" ? "WARNING" : "FAIL",
    summary: String(out.summary || "").slice(0, 600),
    docs: (Array.isArray(out.docs) ? out.docs : []).map(function (dd) {
      return { name: String(dd.name || "").slice(0, 200),
        verdict: dd.verdict === "PASS" ? "PASS" : dd.verdict === "WARNING" ? "WARNING" : "FAIL",
        issues: (Array.isArray(dd.issues) ? dd.issues : []).slice(0, 12).map(function (i2) {
          return { crit: String(i2.crit || "?").slice(0, 12), note: String(i2.note || "").slice(0, 300) };
        }) };
    })
  };
}

/* Drive-аас баримтуудын агуулгыг дараалан уншина (эрхийн алдааг үнэнчээр буцаана) */
function readDriveDocs(mcp, files, onProg) {
  var docs = [], chain = Promise.resolve();
  files.forEach(function (f, i) {
    chain = chain.then(function () {
      if (onProg) onProg("Уншиж байна (" + (i + 1) + "/" + files.length + "): " + f.name);
      return mcp.callTool("Google Drive", "read_file_content", { fileId: f.id }).then(function (res) {
        var pl = res && res.payload;
        var txt = pl && typeof pl === "object" && typeof pl.fileContent === "string" ? pl.fileContent
          : typeof pl === "string" ? pl : JSON.stringify(pl || "");
        docs.push({ name: f.name, text: String(txt).slice(0, 15000), err: null });
      }).catch(function (e2) {
        docs.push({ name: f.name, text: null, err: (e2 && (e2.code || e2.message)) || "уншиж чадсангүй" });
      });
    });
  });
  return chain.then(function () { return docs; });
}

/* Хавтасны баримтуудыг тодруулна */
function listDriveFolder(mcp, folderId, limit) {
  return mcp.callTool("Google Drive", "search_files",
    { query: "parentId = '" + folderId + "'", pageSize: 50, excludeContentSnippets: true }
  ).then(function (res) {
    var pl = res && res.payload;
    if (typeof pl === "string") { try { pl = JSON.parse(pl); } catch (e) { pl = null; } }
    var out = [];
    ((pl && pl.files) || []).forEach(function (f) {
      if (DC_READABLE.test(f.mimeType || ""))
        out.push({ id: f.id, name: f.title || f.name || f.id, mime: f.mimeType,
          modified: (f.modifiedTime || "").slice(0, 10) });
    });
    return limit ? out.slice(0, limit) : out;
  });
}

/* Хүрээний (framework) бүртгэлийг Drive хавтаснаас ачаална */
function loadFramework() {
  if (S.fwBusy) return;
  var el = document.querySelector('[data-f="fwfolder"]');
  var link = el ? el.value : ((S.fw && S.fw.folder) || (S.config && S.config.frameworkFolder) || "");
  var ref = driveRef(link);
  if (!ref || ref.kind !== "folder") { toast("Хавтасны линк тавина уу (drive.google.com/drive/folders/…)", true); return; }
  Promise.all([useCap("mcp")]).then(function (caps) {
    var mcp = caps[0];
    if (!mcp) { toast("Google Drive холболт алга — claude.ai дотроос нээж ажиллуулна уу", true); return; }
    S.fwBusy = true; S.fwProg = "Хавтасны баримтуудыг уншиж байна…"; render();
    listDriveFolder(mcp, ref.id, 0).then(function (files) {
      if (!files.length) throw new Error("Хавтсанд уншиж болох баримт олдсонгүй");
      var enriched = files.map(function (f) {
        var m = fwMeta(f.name);
        return { id: f.id, title: f.name, mime: f.mime, modified: f.modified,
          kind: m.kind, kindTitle: m.kindTitle, version: m.version, date: m.date };
      }).sort(function (a2, b2) { return (a2.kind + a2.title) < (b2.kind + b2.title) ? -1 : 1; });
      A.setFramework({ folder: link, files: enriched, ts: new Date().toISOString(), byName: U(S.p).name });
    }).catch(function (e) {
      toast("Хүрээ ачаалахад алдаа: " + ((e && (e.message || e.code)) || "алдаа"), true);
    }).finally(function () { S.fwBusy = false; S.fwProg = null; render(); });
  });
}

var DC_READABLE = /document|spreadsheet|presentation|pdf|wordprocessingml|msword|text\//;

/* Бие даасан шалгагч: Drive линк (файл эсвэл хавтас) → агуулга унших → EOM дүгнэлт */
function runDocCheck() {
  if (S.dcBusy) return;
  var ta = document.querySelector('[data-f="dclinks"]');
  S.dcLinks = ta ? ta.value : (S.dcLinks || "");
  var refs = [], bad = [];
  S.dcLinks.split(/[\s,]+/).filter(function (x) { return x.trim(); }).forEach(function (u) {
    var ref = driveRef(u);
    if (ref) refs.push(ref); else bad.push(u.slice(0, 60));
  });
  if (bad.length) { toast("Зөвшөөрөгдөөгүй линк: " + bad[0], true); return; }
  if (!refs.length) { toast("Drive эсвэл Docs линк тавина уу", true); return; }
  Promise.all([useCap("mcp"), useCap("sample")]).then(function (caps) {
    var mcp = caps[0], sample = caps[1];
    if (!sample) { toast("AI энэ орчинд боломжгүй байна", true); return; }
    if (!mcp) { toast("Google Drive холболт алга — claude.ai дотроос нээж ажиллуулна уу", true); return; }
    S.dcBusy = true; S.dcProg = "Хавтас, файлуудыг тодруулж байна…"; S.dcResult = null; render();
    var files = [], chain = Promise.resolve();
    refs.forEach(function (ref) {
      chain = chain.then(function () {
        if (ref.kind === "file") { files.push({ id: ref.id, name: "Баримт " + (files.length + 1) }); return; }
        return mcp.callTool("Google Drive", "search_files",
          { query: "parentId = '" + ref.id + "'", pageSize: 25, excludeContentSnippets: true }
        ).then(function (res) {
          var pl = res && res.payload;
          if (typeof pl === "string") { try { pl = JSON.parse(pl); } catch (e) { pl = null; } }
          ((pl && pl.files) || []).forEach(function (f) {
            if (DC_READABLE.test(f.mimeType || "")) files.push({ id: f.id, name: f.title || f.name || f.id });
          });
        });
      });
    });
    chain.then(function () {
      if (!files.length) throw new Error("Уншиж болох баримт олдсонгүй (хавтас хоосон эсвэл эрх дутуу)");
      files = files.slice(0, 8);
      var docs = [], c2 = Promise.resolve();
      files.forEach(function (f, i) {
        c2 = c2.then(function () {
          S.dcProg = "Уншиж байна (" + (i + 1) + "/" + files.length + "): " + f.name; render();
          return mcp.callTool("Google Drive", "read_file_content", { fileId: f.id }).then(function (res) {
            var pl = res && res.payload;
            var txt = pl && typeof pl === "object" && typeof pl.fileContent === "string" ? pl.fileContent
              : typeof pl === "string" ? pl : JSON.stringify(pl || "");
            docs.push({ name: f.name, text: String(txt).slice(0, 15000), err: null });
          }).catch(function (e2) {
            docs.push({ name: f.name, text: null, err: (e2 && (e2.code || e2.message)) || "уншиж чадсангүй" });
          });
        });
      });
      return c2.then(function () { return docs; });
    }).then(function (docs) {
      var readable = docs.filter(function (x) { return x.text; });
      if (!readable.length)
        throw new Error("Нэг ч баримт уншигдсангүй: " + docs.map(function (x) { return x.name + " (" + x.err + ")"; }).join("; "));
      S.dcProg = "EOM v5.0 шалгуурт тулгаж байна…"; render();
      return sample.json(eomPrompt(readable) +
        "\n\n=== ГАЗРЫН БАРИМТ БИЧГИЙН ХҮРЭЭ (Drive бүртгэл — зөвхөн нэр, код, хувилбар) ===\n" +
        fwIndexText() +
        "\n\nНЭМЭЛТ ДААЛГАВАР: EOM-ийн хэлбэрийн шалгуураас гадна дээрх хүрээтэй тулга — " +
        "дурдсан холбоос баримтууд бүртгэлд байгаа эсэх, хувилбарын зөрүү, давхардал, зөрчил. " +
        "Эдгээрийг issues дотор crit=\"FRAMEWORK\" гэж тэмдэглэ.",
        { modelTier: "default", cache: false }).then(function (out) {
        var norm = normEom(out);
        norm.ts = new Date().toISOString();
        norm.unread = docs.filter(function (x) { return !x.text; }).map(function (x) { return x.name + " (" + x.err + ")"; });
        S.dcResult = norm;
        toast("EOM шалгалт: " + norm.result + " · " + readable.length + " баримт", norm.result !== "PASS");
      });
    }).catch(function (e) {
      toast("Шалгалт амжилтгүй: " + ((e && (e.message || e.code)) || "алдаа"), true);
    }).finally(function () { S.dcBusy = false; S.dcProg = null; render(); });
  });
}

/* G8 — эцсийн deliverable бүрийг Drive-аас уншиж EOM v5.0 шалгуурт AI-аар тулгана.
   AI зөвлөх (§2.5a) — үр дүн нь гейтийн орц болохоос биш хүний sign-off-ыг орлохгүй. */
function runEomCheck(wid) {
  if (S.eomBusy) return;
  var w = S.works[wid]; if (!w) return;
  var finals = (w.deliverables || []).filter(function (d) { return d.final; });
  if (!finals.length) { toast("Эцсийн (FINAL) deliverable алга — эхлээд баримтаа холбож эцсийн болго", true); return; }
  Promise.all([useCap("mcp"), useCap("sample")]).then(function (caps) {
    var mcp = caps[0], sample = caps[1];
    if (!sample) { toast("AI энэ орчинд боломжгүй байна", true); return; }
    if (!mcp) { toast("Google Drive холболт энэ орчинд алга — claude.ai дотроос нээж ажиллуулна уу", true); return; }
    S.eomBusy = true; S.eomWid = wid; S.eomProg = "Баримт уншиж байна…"; render();
    var docs = [], chain = Promise.resolve();
    finals.forEach(function (d) {
      chain = chain.then(function () {
        var fid = fileIdOf(d.url);
        if (!fid) { docs.push({ name: d.name, text: null, err: "линкээс Drive fileId олдсонгүй" }); return; }
        S.eomProg = "Уншиж байна: " + d.name + "…"; render();
        return mcp.callTool("Google Drive", "read_file_content", { fileId: fid }).then(function (res) {
          var pl = res && res.payload;
          var txt = pl && typeof pl === "object" && typeof pl.fileContent === "string" ? pl.fileContent
            : typeof pl === "string" ? pl : JSON.stringify(pl || "");
          docs.push({ name: d.name, text: String(txt).slice(0, 15000), err: null });
        }).catch(function (e2) {
          docs.push({ name: d.name, text: null, err: (e2 && (e2.code || e2.message)) || "уншиж чадсангүй" });
        });
      });
    });
    chain.then(function () {
      var readable = docs.filter(function (x) { return x.text; });
      if (!readable.length)
        throw new Error("Нэг ч баримт уншигдсангүй: " + docs.map(function (x) { return x.name + " (" + x.err + ")"; }).join("; "));
      S.eomProg = "EOM v5.0 шалгуурт тулгаж байна…"; render();
      return sample.json(eomPrompt(readable), { modelTier: "default", cache: false });
    }).then(function (out) {
      var check = normEom(out);
      check.unread = docs.filter(function (x) { return !x.text; }).map(function (x) { return x.name + " (" + x.err + ")"; });
      check.ts = new Date().toISOString(); check.by = S.p; check.byName = U(S.p).name; check.sig = eomSig(w);
      A.recordEomCheck(wid, check);
      toast("EOM v5.0 нийцлийн шалгалт: " + check.result + (check.result === "PASS" ? " — G8 ногоон" : ""),
        check.result !== "PASS");
    }).catch(function (e) {
      toast("EOM шалгалт амжилтгүй: " + ((e && (e.message || e.code)) || "алдаа"), true);
    }).finally(function () { S.eomBusy = false; S.eomWid = null; S.eomProg = null; render(); });
  });
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
    if (d.ciosign) { A.cioSign(wid, d.ciosign, fval(t, "comment")); return; }
    if (d.endorse) { A.endorse(wid, d.endorse, fval(t, "encmt")); return; }
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
      case "eomCheck": runEomCheck(S.workId); break;
      case "docCheck": runDocCheck(); break;
      case "loadFw": loadFramework(); break;
      case "docAudit": runDocAudit(S.workId); break;
      case "eomManual": A.recordEomManual(S.workId, fval(t, "emnote")); break;
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
