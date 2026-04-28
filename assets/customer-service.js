(function () {
  if (window.__minddoCS) return;
  window.__minddoCS = true;

  var I18N = {
    "zh-CN": {
      btnLabel: "客服",
      panelTitle: "在线客服",
      panelSub: "我们就在屏幕另一端 — 课程、账户、报名问题都可以问。",
      statusChip: "工作时间内一般 5 分钟内回复",
      wechatLabel: "微信咨询",
      wechatHandle: "MindDo-Service",
      wechatHint: "扫码添加客服微信，发送消息后我们会尽快回复",
      phoneLabel: "客服热线",
      phoneValue: "+1 (415) 555-0100",
      emailLabel: "邮箱",
      emailValue: "support@minddo.com",
      hoursLabel: "工作时间",
      hoursValue: "周一至周五 3:00pm – 7:00pm\n周六周日 9:00am – 7:00pm",
      peakNote: "高峰时段可能延迟回复，请耐心等待。",
      faqLabel: "常见问题",
      faq1: "如何修改孩子的课程时段？",
      faq2: "请假 / 改期审核需要多久？",
      faq3: "如何添加另一位孩子？",
      close: "关闭客服面板",
      open: "打开客服面板"
    },
    en: {
      btnLabel: "Support",
      panelTitle: "Live Support",
      panelSub: "We're a tap away — class, account, and enrollment questions all welcome.",
      statusChip: "Usually reply within 5 minutes during business hours",
      wechatLabel: "WeChat",
      wechatHandle: "MindDo-Service",
      wechatHint: "Scan to add our WeChat — we reply ASAP after your first message.",
      phoneLabel: "Phone",
      phoneValue: "+1 (415) 555-0100",
      emailLabel: "Email",
      emailValue: "support@minddo.com",
      hoursLabel: "Hours",
      hoursValue: "Mon – Fri 3:00pm – 7:00pm\nSat – Sun 9:00am – 7:00pm",
      peakNote: "Replies may be delayed during peak hours — thanks for your patience.",
      faqLabel: "Common Questions",
      faq1: "How do I change my child's class slot?",
      faq2: "How long do leave / reschedule reviews take?",
      faq3: "How do I add another child?",
      close: "Close support panel",
      open: "Open support panel"
    }
  };

  function currentLang() {
    try {
      return localStorage.getItem("minddo_lang") === "en" ? "en" : "zh-CN";
    } catch (_) { return "zh-CN"; }
  }
  function t() { return I18N[currentLang()]; }

  function injectStyles() {
    var css = ""
      + ".cs-fab { position: fixed; right: 22px; bottom: 22px; z-index: 1500;"
      + "  width: 58px; height: 58px; border-radius: 50%;"
      + "  background: linear-gradient(135deg,#0ea5e9 0%,#0284c7 100%); color: #f0f9ff;"
      + "  border: 1px solid rgba(2,132,199,0.6);"
      + "  box-shadow: 0 12px 28px rgba(2,132,199,0.32);"
      + "  display: flex; align-items: center; justify-content: center; cursor: pointer;"
      + "  font-family: inherit; transition: transform 0.18s ease, box-shadow 0.18s ease; }"
      + ".cs-fab:hover { transform: translateY(-2px); box-shadow: 0 18px 36px rgba(2,132,199,0.4); }"
      + ".cs-fab:focus-visible { outline: 3px solid #fde68a; outline-offset: 3px; }"
      + ".cs-fab svg { width: 26px; height: 26px; stroke: currentColor; fill: none; stroke-width: 1.7; stroke-linecap: round; stroke-linejoin: round; }"
      + ".cs-fab .cs-fab-label { position: absolute; right: 68px; padding: 6px 12px; border-radius: 999px;"
      + "  background: rgba(11,26,46,0.92); color: #f0f9ff; font-size: 12px; font-weight: 700;"
      + "  white-space: nowrap; opacity: 0; transform: translateX(6px); transition: 0.18s; pointer-events: none; }"
      + ".cs-fab:hover .cs-fab-label { opacity: 1; transform: translateX(0); }"
      + "@media (max-width: 640px) { .cs-fab .cs-fab-label { display: none; } .cs-fab { right: 16px; bottom: 16px; width: 52px; height: 52px; } }"

      + ".cs-panel { position: fixed; right: 22px; bottom: 92px; z-index: 1499;"
      + "  width: min(360px, calc(100vw - 28px)); max-height: calc(100vh - 120px);"
      + "  background: #fff; border: 1px solid rgba(30,58,95,0.14); border-radius: 20px;"
      + "  box-shadow: 0 30px 60px rgba(15,23,42,0.22);"
      + "  display: flex; flex-direction: column; overflow: hidden;"
      + "  font-family: \"Avenir Next\",\"Helvetica Neue\",\"PingFang SC\",\"Microsoft YaHei\",sans-serif;"
      + "  color: #0f172a;"
      + "  opacity: 0; transform: translateY(8px) scale(0.98); pointer-events: none;"
      + "  transition: opacity 0.18s ease, transform 0.18s ease; }"
      + ".cs-panel.open { opacity: 1; transform: translateY(0) scale(1); pointer-events: auto; }"
      + "@media (max-width: 640px) { .cs-panel { right: 12px; left: 12px; width: auto; bottom: 80px; } }"

      + ".cs-head { padding: 18px 20px 14px; background: linear-gradient(135deg,#0b1a2e 0%,#1e3a5f 100%); color: #f0f9ff; }"
      + ".cs-head h2 { margin: 0 0 4px; font-size: 16px; font-weight: 800; letter-spacing: -0.01em; }"
      + ".cs-head p { margin: 0; font-size: 12.5px; line-height: 1.55; color: rgba(224,242,254,0.78); }"
      + ".cs-head .cs-close { position: absolute; top: 10px; right: 10px; width: 30px; height: 30px;"
      + "  border-radius: 50%; border: 1px solid rgba(224,242,254,0.28); background: rgba(240,249,255,0.08);"
      + "  color: #f0f9ff; cursor: pointer; font-size: 14px; line-height: 1; font-family: inherit;"
      + "  display: inline-flex; align-items: center; justify-content: center; transition: 0.15s; }"
      + ".cs-head .cs-close:hover { background: rgba(240,249,255,0.18); }"

      + ".cs-status { display: inline-flex; align-items: center; gap: 6px; margin-top: 10px;"
      + "  padding: 4px 10px; border-radius: 999px; background: rgba(110,231,183,0.18);"
      + "  border: 1px solid rgba(110,231,183,0.32); color: #d1fae5;"
      + "  font-size: 11px; font-weight: 700; letter-spacing: 0.02em; }"
      + ".cs-status::before { content: \"\"; width: 6px; height: 6px; border-radius: 999px;"
      + "  background: #34d399; box-shadow: 0 0 0 3px rgba(52,211,153,0.25); }"

      + ".cs-body { padding: 16px 20px 18px; overflow-y: auto; display: grid; gap: 14px; }"

      + ".cs-block { display: grid; gap: 6px; }"
      + ".cs-block .cs-k { font-size: 10.5px; font-weight: 800; letter-spacing: 0.1em;"
      + "  text-transform: uppercase; color: #5a6b81; }"
      + ".cs-block .cs-v { font-size: 14px; font-weight: 700; color: #1e3a5f; word-break: break-all; }"
      + ".cs-block a.cs-v { text-decoration: none; transition: color 0.15s; }"
      + ".cs-block a.cs-v:hover { color: #0284c7; }"
      + ".cs-hint { font-size: 11.5px; color: #5a6b81; line-height: 1.55; }"

      + ".cs-wechat { display: grid; grid-template-columns: 92px 1fr; gap: 12px; align-items: start;"
      + "  padding: 12px; background: #f6f8fb; border: 1px solid rgba(30,58,95,0.1); border-radius: 14px; }"
      + ".cs-qr { width: 92px; height: 92px; border-radius: 10px; background: #fff; border: 1px solid rgba(30,58,95,0.1);"
      + "  display: flex; align-items: center; justify-content: center; position: relative; overflow: hidden; }"
      + ".cs-qr-pattern { position: absolute; inset: 8px; background-image:"
      + "  radial-gradient(circle, rgba(30,58,95,0.85) 1.4px, transparent 1.6px),"
      + "  radial-gradient(circle, rgba(30,58,95,0.65) 1px, transparent 1.2px);"
      + "  background-size: 8px 8px, 6px 6px; background-position: 0 0, 4px 4px; }"
      + ".cs-qr-tag { position: absolute; bottom: 6px; left: 50%; transform: translateX(-50%);"
      + "  font-size: 8px; font-weight: 800; letter-spacing: 0.04em; color: #5a6b81;"
      + "  background: #fff; padding: 1px 4px; border-radius: 4px; }"

      + ".cs-peak { padding: 10px 12px; border-radius: 12px;"
      + "  background: rgba(216,156,54,0.1); border: 1px solid rgba(216,156,54,0.28);"
      + "  color: #8a5d11; font-size: 12px; line-height: 1.55; }"

      + ".cs-faq { display: grid; gap: 6px; }"
      + ".cs-faq .cs-k { font-size: 10.5px; font-weight: 800; letter-spacing: 0.1em;"
      + "  text-transform: uppercase; color: #5a6b81; }"
      + ".cs-faq button { all: unset; cursor: pointer; padding: 8px 12px; border-radius: 10px;"
      + "  background: rgba(186,230,253,0.18); border: 1px solid rgba(14,165,233,0.22);"
      + "  font-size: 12.5px; font-weight: 600; color: #0b4d70; line-height: 1.45;"
      + "  font-family: inherit; transition: 0.15s; }"
      + ".cs-faq button:hover { background: rgba(186,230,253,0.4); border-color: rgba(14,165,233,0.4); }"
      + ".cs-faq button:focus-visible { outline: 2px solid #0ea5e9; outline-offset: 2px; }"
      + ".cs-faq-answer { padding: 10px 12px; border-radius: 10px; background: #f6f8fb;"
      + "  border: 1px solid rgba(30,58,95,0.1); color: #1e3a5f;"
      + "  font-size: 12.5px; line-height: 1.6; }";

    var style = document.createElement("style");
    style.setAttribute("data-cs-styles", "1");
    style.textContent = css;
    document.head.appendChild(style);
  }

  // Pre-canned answers for the FAQ buttons. Kept short — this is a touchpoint
  // to set expectations, not a full help center. Real product would deep-link
  // into a knowledge base.
  var FAQ_ANSWERS = {
    "zh-CN": {
      faq1: "在「家长账户 → 课表」中找到当前课程，点「申请改期」即可。运营 1 个工作日内确认。",
      faq2: "工作日提交一般 2 小时内审核；周末提交我们会顺延到下一个工作日。",
      faq3: "「家长账户 → 概览 → 家庭成员 → +」即可添加。新加的孩子需要先安排一次试课。"
    },
    en: {
      faq1: "Open Parent Account → Schedule, find the slot, then tap \"Reschedule\". Ops will confirm within 1 business day.",
      faq2: "Weekday submissions are usually reviewed within 2 hours. Weekend ones roll over to the next business day.",
      faq3: "Parent Account → Overview → Family → \"+\" card. New children need to go through a trial first."
    }
  };

  function buildPanel() {
    var p = document.createElement("aside");
    p.className = "cs-panel";
    p.setAttribute("role", "dialog");
    p.setAttribute("aria-modal", "false");
    p.setAttribute("aria-labelledby", "csPanelTitle");
    p.style.position = "fixed";
    p.innerHTML = ""
      + "<div class=\"cs-head\" style=\"position:relative;\">"
      + "  <button type=\"button\" class=\"cs-close\" data-cs-close aria-label=\"\">×</button>"
      + "  <h2 id=\"csPanelTitle\" data-cs-i18n=\"panelTitle\"></h2>"
      + "  <p data-cs-i18n=\"panelSub\"></p>"
      + "  <span class=\"cs-status\" data-cs-i18n=\"statusChip\"></span>"
      + "</div>"
      + "<div class=\"cs-body\">"
      + "  <div class=\"cs-wechat\">"
      + "    <div class=\"cs-qr\" aria-hidden=\"true\"><span class=\"cs-qr-pattern\"></span><span class=\"cs-qr-tag\" data-cs-i18n=\"wechatHandle\"></span></div>"
      + "    <div class=\"cs-block\">"
      + "      <span class=\"cs-k\" data-cs-i18n=\"wechatLabel\"></span>"
      + "      <span class=\"cs-v\" data-cs-i18n=\"wechatHandle\"></span>"
      + "      <span class=\"cs-hint\" data-cs-i18n=\"wechatHint\"></span>"
      + "    </div>"
      + "  </div>"
      + "  <div class=\"cs-block\">"
      + "    <span class=\"cs-k\" data-cs-i18n=\"phoneLabel\"></span>"
      + "    <a class=\"cs-v\" data-cs-i18n=\"phoneValue\" data-cs-href=\"phone\"></a>"
      + "  </div>"
      + "  <div class=\"cs-block\">"
      + "    <span class=\"cs-k\" data-cs-i18n=\"emailLabel\"></span>"
      + "    <a class=\"cs-v\" data-cs-i18n=\"emailValue\" data-cs-href=\"email\"></a>"
      + "  </div>"
      + "  <div class=\"cs-block\">"
      + "    <span class=\"cs-k\" data-cs-i18n=\"hoursLabel\"></span>"
      + "    <span class=\"cs-v\" style=\"font-weight:600;font-size:12.5px;line-height:1.6;color:#1e3a5f;white-space:pre-line;\" data-cs-i18n=\"hoursValue\"></span>"
      + "  </div>"
      + "  <div class=\"cs-peak\" data-cs-i18n=\"peakNote\"></div>"
      + "  <div class=\"cs-faq\">"
      + "    <span class=\"cs-k\" data-cs-i18n=\"faqLabel\"></span>"
      + "    <button type=\"button\" data-cs-faq=\"faq1\"></button>"
      + "    <button type=\"button\" data-cs-faq=\"faq2\"></button>"
      + "    <button type=\"button\" data-cs-faq=\"faq3\"></button>"
      + "    <div class=\"cs-faq-answer\" data-cs-faq-answer hidden></div>"
      + "  </div>"
      + "</div>";
    return p;
  }

  function buildButton() {
    var b = document.createElement("button");
    b.type = "button";
    b.className = "cs-fab";
    b.setAttribute("aria-haspopup", "dialog");
    b.setAttribute("aria-expanded", "false");
    b.innerHTML = ""
      + "<svg viewBox=\"0 0 24 24\" aria-hidden=\"true\">"
      + "  <path d=\"M21 12a8.5 8.5 0 0 1-12.4 7.55L4 21l1.5-4.5A8.5 8.5 0 1 1 21 12Z\" />"
      + "  <path d=\"M9 11h.01M12 11h.01M15 11h.01\" />"
      + "</svg>"
      + "<span class=\"cs-fab-label\" data-cs-i18n=\"btnLabel\"></span>"
      + "<span class=\"cs-fab-sr\" data-cs-i18n=\"open\" style=\"position:absolute;left:-9999px;\"></span>";
    return b;
  }

  function applyI18n(root) {
    var dict = t();
    root.querySelectorAll("[data-cs-i18n]").forEach(function (el) {
      var key = el.getAttribute("data-cs-i18n");
      var val = dict[key];
      if (val == null) return;
      el.textContent = val;
      // Wire phone / email links from the same i18n value
      var hrefKind = el.getAttribute("data-cs-href");
      if (hrefKind === "phone") el.setAttribute("href", "tel:" + val.replace(/[^+0-9]/g, ""));
      if (hrefKind === "email") el.setAttribute("href", "mailto:" + val);
    });
    var closeBtn = root.querySelector("[data-cs-close]");
    if (closeBtn) closeBtn.setAttribute("aria-label", dict.close);
  }

  function init() {
    injectStyles();
    var btn = buildButton();
    var panel = buildPanel();
    document.body.appendChild(btn);
    document.body.appendChild(panel);

    function refreshLang() {
      applyI18n(btn);
      applyI18n(panel);
      // FAQ button labels are i18n'd above; the answer pane is hidden until
      // a question is tapped, then we re-render the answer in current lang.
      var openFaq = panel.getAttribute("data-cs-active-faq");
      if (openFaq) renderFaqAnswer(openFaq);
    }

    function open() {
      panel.classList.add("open");
      btn.setAttribute("aria-expanded", "true");
    }
    function close() {
      panel.classList.remove("open");
      btn.setAttribute("aria-expanded", "false");
      var ans = panel.querySelector("[data-cs-faq-answer]");
      if (ans) { ans.hidden = true; ans.textContent = ""; }
      panel.removeAttribute("data-cs-active-faq");
    }
    function toggle() {
      panel.classList.contains("open") ? close() : open();
    }

    function renderFaqAnswer(key) {
      var ans = panel.querySelector("[data-cs-faq-answer]");
      if (!ans) return;
      var text = (FAQ_ANSWERS[currentLang()] || FAQ_ANSWERS["zh-CN"])[key];
      if (!text) return;
      ans.textContent = text;
      ans.hidden = false;
      panel.setAttribute("data-cs-active-faq", key);
    }

    btn.addEventListener("click", toggle);
    panel.addEventListener("click", function (e) {
      if (e.target.closest("[data-cs-close]")) { close(); return; }
      var faqBtn = e.target.closest("[data-cs-faq]");
      if (faqBtn) renderFaqAnswer(faqBtn.getAttribute("data-cs-faq"));
    });
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && panel.classList.contains("open")) close();
    });
    // Pick up language switches initiated elsewhere on the page (the
    // existing lang-switcher writes minddo_lang). Re-render strings whenever
    // the html[lang] attribute mutates.
    var observer = new MutationObserver(refreshLang);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["lang"] });

    refreshLang();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
