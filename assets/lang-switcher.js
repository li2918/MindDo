(function () {
  var STORAGE_KEY = "minddo_lang";
  var LABELS = { "zh-CN": "中文", "en": "English" };

  var CSS = [
    ".lang-switcher{position:relative;display:inline-block;}",
    ".lang-switcher .lang-trigger{",
    "  display:inline-flex;align-items:center;gap:6px;",
    "  background:none;border:1px solid var(--line,#cfd8e3);border-radius:999px;",
    "  padding:7px 12px;cursor:pointer;font-size:13px;font-weight:600;",
    "  color:var(--clay,#1e3a5f);font-family:inherit;transition:.15s;line-height:1;",
    "}",
    ".lang-switcher .lang-trigger:hover,",
    ".lang-switcher.open .lang-trigger{background:var(--sand,#e8eef5);border-color:var(--gold,#0284c7);}",
    ".lang-switcher .lang-trigger-icon{font-size:14px;line-height:1;}",
    ".lang-switcher .lang-caret{font-size:10px;opacity:.7;transition:transform .15s;}",
    ".lang-switcher.open .lang-caret{transform:rotate(180deg);}",
    ".lang-switcher .lang-menu{",
    "  position:absolute;top:calc(100% + 6px);right:0;min-width:148px;padding:6px;",
    "  background:#fff;border:1px solid var(--line,#cfd8e3);border-radius:12px;",
    "  box-shadow:0 10px 28px rgba(15,23,42,.12);",
    "  display:none;flex-direction:column;gap:2px;z-index:1000;",
    "}",
    ".lang-switcher.open .lang-menu{display:flex;}",
    ".lang-switcher .lang-menu .lang-btn{",
    "  display:flex;align-items:center;justify-content:space-between;",
    "  padding:8px 12px;border:none;border-radius:8px;background:none;",
    "  font-size:13px;font-weight:600;color:var(--clay,#1e3a5f);",
    "  font-family:inherit;cursor:pointer;text-align:left;width:100%;transition:.15s;",
    "}",
    ".lang-switcher .lang-menu .lang-btn:hover{background:var(--sand,#e8eef5);}",
    ".lang-switcher .lang-menu .lang-btn.active{background:var(--sand,#e8eef5);}",
    ".lang-switcher .lang-menu .lang-btn.active::after{",
    "  content:\"✓\";margin-left:10px;color:var(--gold,#0284c7);font-weight:700;",
    "}"
  ].join("\n");

  function injectCSS() {
    if (document.getElementById("lang-switcher-css")) return;
    var style = document.createElement("style");
    style.id = "lang-switcher-css";
    style.textContent = CSS;
    document.head.appendChild(style);
  }

  function currentLang() {
    var saved = null;
    try { saved = localStorage.getItem(STORAGE_KEY); } catch (e) {}
    if (saved === "en" || saved === "zh-CN") return saved;
    var htmlLang = document.documentElement.getAttribute("lang");
    return htmlLang === "en" ? "en" : "zh-CN";
  }

  function updateTriggerLabel(root) {
    var label = root.querySelector(".lang-trigger-label");
    if (!label) return;
    label.textContent = LABELS[currentLang()] || LABELS["zh-CN"];
  }

  function wire(root) {
    var trigger = root.querySelector(".lang-trigger");
    var menu = root.querySelector(".lang-menu");
    if (!trigger || !menu) return;

    function open() {
      root.classList.add("open");
      trigger.setAttribute("aria-expanded", "true");
    }
    function close() {
      root.classList.remove("open");
      trigger.setAttribute("aria-expanded", "false");
    }

    trigger.addEventListener("click", function (e) {
      e.stopPropagation();
      if (root.classList.contains("open")) close();
      else open();
    });

    menu.addEventListener("click", function (e) {
      if (e.target.closest("[data-set-lang]")) close();
    });

    document.addEventListener("click", function (e) {
      if (!root.contains(e.target)) close();
    });

    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape") close();
    });

    updateTriggerLabel(root);
  }

  function init() {
    injectCSS();
    var roots = document.querySelectorAll("[data-lang-switcher]");
    if (!roots.length) return;
    roots.forEach(wire);

    var obs = new MutationObserver(function () {
      roots.forEach(updateTriggerLabel);
    });
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ["lang"] });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
