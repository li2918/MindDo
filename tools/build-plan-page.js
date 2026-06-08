// Generates docs/dev-plan.html — a self-contained bilingual (中文/EN) portal
// that bundles the dev task plan + each engineer's task board in one page,
// with a language toggle and click-to-check tasks (persisted in localStorage).
//
// Single source of truth = the markdown files. Re-run after editing them:
//   node tools/build-plan-page.js
//
// Reads:  docs/DEV_TASK_PLAN.md (+ .en.md), docs/tasks/{david,paul,austin}.md (+ .en.md)
// Writes: docs/dev-plan.html

const fs = require("fs");
const path = require("path");

const docsDir = path.join(__dirname, "..", "docs");
const read = (p) => fs.readFileSync(path.join(docsDir, p), "utf8");

const DOCS = [
  { id: "plan", label_zh: "总览 · 开发计划", label_en: "Overview · Plan",
    zh: read("DEV_TASK_PLAN.md"), en: read("DEV_TASK_PLAN.en.md") },
  { id: "david", label_zh: "David · 基建", label_en: "David · Infra",
    zh: read("tasks/david.md"), en: read("tasks/david.en.md") },
  { id: "paul", label_zh: "Paul · 看板", label_en: "Paul · Dashboard",
    zh: read("tasks/paul.md"), en: read("tasks/paul.en.md") },
  { id: "austin", label_zh: "Austin · 漏斗/支付", label_en: "Austin · Funnel/Pay",
    zh: read("tasks/austin.md"), en: read("tasks/austin.en.md") },
];

// JSON, with < escaped so a literal </script> in content can never break out.
const DATA = JSON.stringify(DOCS).replace(/</g, "\\u003c");

const HTML = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>MindDo · 开发计划与任务 | Dev Plan & Tasks</title>
<link rel="icon" type="image/svg+xml" href="../assets/favicon.svg" />
<style>
  :root{
    --bg:#FFF5D6; --card:#fffdf7; --line:rgba(255,91,36,0.16); --text:#1a1a1a;
    --muted:#6b7280; --gold:#FFC824; --gold-deep:#E5B11D; --brand:#FF5B24;
    --ok:#6f8f57; --warn:#DC2626; --shadow:0 18px 44px rgba(0,0,0,0.10);
  }
  *,*::before,*::after{box-sizing:border-box;margin:0;padding:0;}
  html{scroll-behavior:smooth;-webkit-text-size-adjust:100%;}
  html,body{max-width:100%;overflow-x:hidden;}
  body{font-family:"Avenir Next","Helvetica Neue","PingFang SC","Microsoft YaHei",sans-serif;
    background:var(--bg);color:var(--text);line-height:1.65;
    overflow-wrap:anywhere;word-break:break-word;}
  a{color:var(--brand);overflow-wrap:anywhere;}
  /* HEADER */
  .top{position:sticky;top:0;z-index:50;background:linear-gradient(145deg,#2a1408,#1a1a1a);
    color:#fffbeb;padding:16px 24px;box-shadow:var(--shadow);}
  .top-row{max-width:1080px;margin:0 auto;display:flex;align-items:center;gap:16px;flex-wrap:wrap;}
  .top h1{font-size:18px;font-weight:900;letter-spacing:-0.01em;flex:1;min-width:140px;}
  .top h1 small{display:block;font-size:11px;font-weight:600;color:rgba(254,243,199,0.7);letter-spacing:0.04em;}
  .lang-toggle{display:flex;border:1px solid rgba(254,243,199,0.3);border-radius:999px;overflow:hidden;}
  .lang-toggle button{background:transparent;color:rgba(254,243,199,0.8);border:none;padding:7px 16px;
    font:inherit;font-size:13px;font-weight:800;cursor:pointer;transition:.15s;}
  .lang-toggle button.on{background:var(--gold);color:#1a1a1a;}
  /* TABS */
  .tabs{max-width:1080px;margin:14px auto 0;display:flex;gap:8px;flex-wrap:wrap;}
  .tab{background:rgba(255,255,255,0.08);color:rgba(254,243,199,0.85);border:1px solid rgba(254,243,199,0.2);
    border-radius:999px;padding:8px 16px;font:inherit;font-size:13px;font-weight:700;cursor:pointer;transition:.15s;}
  .tab:hover{background:rgba(255,255,255,0.16);}
  .tab.on{background:var(--gold);border-color:var(--gold-deep);color:#1a1a1a;}
  .tab .pct{font-size:11px;opacity:.75;margin-left:6px;}
  /* CONTENT */
  .wrap{max-width:1080px;margin:0 auto;padding:28px 24px 80px;}
  .doc{background:var(--card);border:1px solid var(--line);border-radius:20px;box-shadow:var(--shadow);
    padding:36px 40px;}
  .doc h1{font-size:26px;font-weight:900;margin:0 0 14px;letter-spacing:-0.02em;}
  .doc h2{font-size:19px;font-weight:800;margin:30px 0 12px;padding-top:14px;border-top:1px solid var(--line);}
  .doc h2:first-of-type{border-top:none;padding-top:0;}
  .doc h3{font-size:15px;font-weight:800;margin:20px 0 8px;color:var(--gold-deep);}
  .doc p{margin:10px 0;}
  .doc ul{margin:8px 0 8px 4px;padding-left:22px;}
  .doc li{margin:5px 0;}
  .doc blockquote{border-left:3px solid var(--gold);background:rgba(255,200,36,0.10);
    padding:12px 16px;border-radius:0 12px 12px 0;margin:14px 0;color:#5a4a16;font-size:14px;}
  .doc blockquote p{margin:4px 0;}
  .doc code{background:rgba(255,91,36,0.10);color:#b4400f;padding:1.5px 6px;border-radius:6px;
    font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:.88em;}
  .doc pre{background:#1a1a1a;color:#f5f5f5;padding:16px;border-radius:12px;overflow:auto;margin:14px 0;}
  .doc pre code{background:none;color:inherit;padding:0;}
  .doc table{border-collapse:collapse;width:100%;margin:14px 0;font-size:13.5px;display:block;overflow-x:auto;}
  .doc th,.doc td{border:1px solid var(--line);padding:8px 12px;text-align:left;vertical-align:top;}
  .doc th{background:rgba(255,200,36,0.18);font-weight:800;}
  .doc tr:nth-child(even) td{background:rgba(255,200,36,0.05);}
  .doc hr{border:none;border-top:1px dashed var(--line);margin:24px 0;}
  /* task list checkboxes */
  .doc ul.contains-task-list,.doc ul:has(> li > input){list-style:none;padding-left:4px;}
  .doc li.task-list-item{list-style:none;display:flex;align-items:flex-start;gap:10px;
    padding:7px 12px;border:1px solid var(--line);border-radius:10px;margin:6px 0;background:#fff;}
  .doc li.task-list-item input{margin-top:4px;width:17px;height:17px;accent-color:var(--ok);cursor:pointer;flex-shrink:0;}
  .doc li.task-list-item.done{background:rgba(111,143,87,0.10);border-color:rgba(111,143,87,0.35);}
  .doc li.task-list-item.done span.txt{text-decoration:line-through;color:var(--muted);}
  .updated{text-align:center;color:var(--muted);font-size:12px;margin-top:22px;}
  .hint{max-width:1080px;margin:10px auto 0;font-size:12px;color:rgba(254,243,199,0.65);}
  @media(max-width:760px){
    .top{padding:12px 14px;}
    .top h1{font-size:16px;}
    .top h1 small{font-size:10px;}
    /* tabs scroll horizontally instead of stacking */
    .tabs{flex-wrap:nowrap;overflow-x:auto;-webkit-overflow-scrolling:touch;
      padding-bottom:6px;margin-top:12px;scrollbar-width:none;}
    .tabs::-webkit-scrollbar{display:none;}
    .tab{flex:0 0 auto;padding:7px 13px;font-size:12.5px;}
    .wrap{padding:16px 12px 60px;}
    .doc{padding:20px 16px;border-radius:14px;}
    .doc h1{font-size:21px;}
    .doc h2{font-size:17px;}
    .doc h3{font-size:14px;}
    .doc table{font-size:12.5px;}
    .doc th,.doc td{padding:6px 9px;}
    .doc pre{font-size:12.5px;padding:12px;}
    .doc li.task-list-item{padding:7px 10px;}
  }
</style>
</head>
<body>
  <header class="top">
    <div class="top-row">
      <h1 id="pageTitle">开发计划与任务<small id="pageSub">Dev Plan &amp; Task Boards · MindDo</small></h1>
      <div class="lang-toggle" role="group" aria-label="language">
        <button id="btnZh" class="on" type="button">中文</button>
        <button id="btnEn" type="button">EN</button>
      </div>
    </div>
    <nav class="tabs" id="tabs"></nav>
    <div class="hint" id="hint">提示：勾选任务会保存在本机浏览器；仓库 markdown 仍是真理来源。</div>
  </header>
  <main class="wrap"><div id="doc" class="doc"></div>
    <div class="updated">由 <code>tools/build-plan-page.js</code> 生成 · 数据源：docs/*.md</div>
  </main>

  <script src="https://cdn.jsdelivr.net/npm/marked/marked.min.js"></script>
  <script>
  const DOCS = __DATA__;
  const LS_LANG = "minddo_plan_lang";
  const LS_CHK = "minddo_plan_checks";
  let lang = localStorage.getItem(LS_LANG) === "en" ? "en" : "zh";
  let active = DOCS[0].id;
  let checks = {};
  try { checks = JSON.parse(localStorage.getItem(LS_CHK) || "{}"); } catch(_) {}

  const tabsEl = document.getElementById("tabs");
  const docEl = document.getElementById("doc");
  const elDoc = (id) => DOCS.find(d => d.id === id);

  function mdToHtml(md){
    if (window.marked) return marked.parse(md, { gfm:true, breaks:false });
    return "<pre>"+md.replace(/[&<>]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;"}[c]))+"</pre>";
  }

  function renderTabs(){
    tabsEl.innerHTML = "";
    DOCS.forEach(d => {
      const b = document.createElement("button");
      b.className = "tab" + (d.id===active ? " on" : "");
      const label = lang==="en" ? d.label_en : d.label_zh;
      const pct = pctFor(d.id);
      b.innerHTML = label + (pct!=null ? ' <span class="pct">'+pct+'</span>' : '');
      b.onclick = () => { active = d.id; render(); };
      tabsEl.appendChild(b);
    });
  }

  // count tasks done/total for a doc (language-agnostic; index-aligned)
  function taskCount(id){
    const md = elDoc(id)[lang];
    const items = (md.match(/^\\s*- \\[[ x]\\]/gmi) || []).length;
    let done = 0;
    for (let i=0;i<items;i++) if (checks[id+":"+i]) done++;
    return { done, total: items };
  }
  function pctFor(id){
    const {done,total} = taskCount(id);
    if (!total) return null;
    return done+"/"+total;
  }

  function render(){
    document.documentElement.lang = lang==="en" ? "en" : "zh-CN";
    document.getElementById("btnZh").classList.toggle("on", lang==="zh");
    document.getElementById("btnEn").classList.toggle("on", lang==="en");
    document.getElementById("pageTitle").childNodes[0].nodeValue =
      lang==="en" ? "Dev Plan & Tasks" : "开发计划与任务";
    document.getElementById("hint").textContent =
      lang==="en" ? "Tip: checkboxes persist in your browser; the repo markdown is the source of truth."
                  : "提示：勾选任务会保存在本机浏览器；仓库 markdown 仍是真理来源。";
    renderTabs();
    docEl.innerHTML = mdToHtml(elDoc(active)[lang]);
    wireCheckboxes();
  }

  // make rendered task-list checkboxes interactive + persisted
  function wireCheckboxes(){
    const boxes = docEl.querySelectorAll('li input[type="checkbox"]');
    boxes.forEach((box, i) => {
      const key = active + ":" + i;
      const li = box.closest("li");
      // wrap the text after the checkbox so we can strike it through
      if (li && !li.querySelector("span.txt")){
        const span = document.createElement("span");
        span.className = "txt";
        while (box.nextSibling) span.appendChild(box.nextSibling);
        box.after(span);
      }
      box.disabled = false;
      box.checked = !!checks[key];
      if (li) li.classList.toggle("done", box.checked);
      box.addEventListener("change", () => {
        checks[key] = box.checked;
        localStorage.setItem(LS_CHK, JSON.stringify(checks));
        if (li) li.classList.toggle("done", box.checked);
        renderTabs(); // refresh the x/y counters
      });
    });
  }

  document.getElementById("btnZh").onclick = () => { lang="zh"; localStorage.setItem(LS_LANG,"zh"); render(); };
  document.getElementById("btnEn").onclick = () => { lang="en"; localStorage.setItem(LS_LANG,"en"); render(); };

  render();
  </script>
</body>
</html>`;

fs.writeFileSync(path.join(docsDir, "dev-plan.html"), HTML.replace("__DATA__", DATA));
console.log("Wrote docs/dev-plan.html (" + DOCS.length + " docs, bilingual)");
