/*
 * MindDo cookie consent + analytics hook (GDPR-lite, demo implementation).
 * Shows a bottom banner on first visit. User choice is stored in localStorage
 * under minddo_consent. Analytics events queue into window.MindDoAnalytics
 * and are only dispatched (dev console log) once consent is granted.
 */
(function () {
  var STORAGE_KEY = "minddo_consent";
  var BANNER_ID = "minddoConsentBanner";

  var COPY = {
    "zh-CN": {
      msg: "我们使用必要的 Cookie 保证网站正常运行，并使用分析 Cookie 改进学员体验。",
      learn: "隐私政策",
      accept: "全部接受",
      decline: "仅必需",
      manage: "Cookie 设置"
    },
    en: {
      msg: "We use essential cookies to run this site and analytics cookies to improve the learning experience.",
      learn: "Privacy Policy",
      accept: "Accept All",
      decline: "Essential Only",
      manage: "Cookie Settings"
    }
  };

  function currentLang() {
    var docLang = document.documentElement && document.documentElement.getAttribute("lang");
    if (docLang === "en") return "en";
    try {
      var saved = localStorage.getItem("minddo_lang");
      if (saved === "en") return "en";
    } catch (_) {}
    return "zh-CN";
  }

  function getConsent() {
    try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || "null"); } catch (_) { return null; }
  }

  function saveConsent(level) {
    var payload = { level: level, at: new Date().toISOString() };
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(payload)); } catch (_) {}
    try { document.documentElement.setAttribute("data-consent", level); } catch (_) {}
    flushQueue(level);
  }

  function flushQueue(level) {
    if (!window.MindDoAnalytics || !window.MindDoAnalytics._queue) return;
    var q = window.MindDoAnalytics._queue;
    if (level === "all") {
      q.forEach(function (ev) {
        try { console.debug("[MindDo Analytics]", ev.type, ev.data || {}); } catch (_) {}
      });
    }
    window.MindDoAnalytics._queue = [];
  }

  function ensureStyles() {
    if (document.getElementById("minddoConsentStyle")) return;
    var s = document.createElement("style");
    s.id = "minddoConsentStyle";
    s.textContent =
      "#minddoConsentBanner{position:fixed;left:16px;right:16px;bottom:16px;z-index:9997;max-width:760px;margin:0 auto;" +
      "background:rgba(240,249,255,0.97);border:1px solid rgba(30,58,95,0.18);border-radius:18px;padding:16px 18px;" +
      "box-shadow:0 24px 60px rgba(15,23,42,0.22);display:grid;grid-template-columns:1fr auto;gap:14px;align-items:center;" +
      "backdrop-filter:blur(12px);font-family:'Avenir Next','Helvetica Neue','PingFang SC','Microsoft YaHei',sans-serif;color:#0f172a;font-size:13px;line-height:1.6;}" +
      "#minddoConsentBanner p{margin:0;color:#0f172a;}" +
      "#minddoConsentBanner a{color:#1e3a5f;font-weight:700;text-decoration:underline;}" +
      "#minddoConsentBanner .actions{display:flex;gap:8px;flex-wrap:wrap;justify-content:flex-end;}" +
      "#minddoConsentBanner button{border:1px solid rgba(30,58,95,0.18);border-radius:999px;padding:8px 16px;cursor:pointer;" +
      "font-family:inherit;font-size:13px;font-weight:700;color:#1e3a5f;background:rgba(240,249,255,0.98);transition:.15s;}" +
      "#minddoConsentBanner button.primary{background:linear-gradient(135deg,#bae6fd,#0ea5e9);color:#0b2540;border-color:transparent;box-shadow:0 4px 12px rgba(14,165,233,0.3);}" +
      "#minddoConsentBanner button:hover{transform:translateY(-1px);}" +
      "@media (max-width:640px){#minddoConsentBanner{grid-template-columns:1fr;}#minddoConsentBanner .actions{justify-content:stretch;}#minddoConsentBanner button{flex:1;}}";
    document.head.appendChild(s);
  }

  function renderBanner() {
    if (document.getElementById(BANNER_ID)) return;
    ensureStyles();
    var lang = currentLang();
    var t = COPY[lang] || COPY["zh-CN"];
    var wrap = document.createElement("aside");
    wrap.id = BANNER_ID;
    wrap.setAttribute("role", "dialog");
    wrap.setAttribute("aria-label", "Cookie consent");
    wrap.innerHTML =
      "<p>" + t.msg + " <a href=\"privacy.html\">" + t.learn + "</a></p>" +
      "<div class=\"actions\">" +
      "<button type=\"button\" data-consent=\"essential\">" + t.decline + "</button>" +
      "<button type=\"button\" class=\"primary\" data-consent=\"all\">" + t.accept + "</button>" +
      "</div>";
    wrap.addEventListener("click", function (e) {
      var btn = e.target.closest("[data-consent]");
      if (!btn) return;
      var level = btn.getAttribute("data-consent");
      saveConsent(level);
      wrap.remove();
    });
    document.body.appendChild(wrap);
  }

  // Minimal analytics wrapper. Events are queued until consent is decided;
  // on "all" they're flushed to console.debug. Swap console.debug for a real
  // vendor (GA4, Plausible, etc.) when wiring up a backend.
  window.MindDoAnalytics = window.MindDoAnalytics || {
    _queue: [],
    track: function (type, data) {
      var consent = getConsent();
      if (consent && consent.level === "all") {
        try { console.debug("[MindDo Analytics]", type, data || {}); } catch (_) {}
      } else {
        this._queue.push({ type: type, data: data, at: Date.now() });
      }
    }
  };

  function init() {
    var consent = getConsent();
    if (consent && consent.level) {
      try { document.documentElement.setAttribute("data-consent", consent.level); } catch (_) {}
      flushQueue(consent.level);
      return;
    }
    if (document.body) renderBanner();
    else document.addEventListener("DOMContentLoaded", renderBanner);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }

  // Track page view after a small delay so consent is checked.
  setTimeout(function () {
    window.MindDoAnalytics.track("page_view", {
      path: location.pathname,
      title: document.title
    });
  }, 100);
})();
