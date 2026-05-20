(function () {
  if (window.__minddoCS) return;
  window.__minddoCS = true;

  // =====================================================================
  // MindDo · Customer Service widget (v2 — AI-powered)
  //
  // Drops a floating ✨ button on every parent-side page. Click opens a
  // panel with two tabs:
  //   💬 AI 聊天 — Q&A backed by flow.aiSuggest("parent-chatbot"). The
  //               handler is page-aware (knows current URL hint + current
  //               student) so answers can be personalized.
  //   📞 联系我们 — Contact card (WeChat / phone / email / hours).
  //
  // Chat history persists to `minddo_chat_history` (capped at 50 entries)
  // so reloading doesn't lose the conversation. When AI confidence is
  // low (<0.5), the bot reply includes a "查看联系方式 →" link that
  // switches to the Contact tab.
  // =====================================================================

  var CHAT_KEY = "minddo_chat_history";
  var MAX_HISTORY = 50;

  var I18N = {
    "zh-CN": {
      btnLabel: "客服",
      panelTitle: "MindDo 客服",
      panelSub: "AI 秒回 + 微信 / 电话支援",
      statusChip: "工作时间内一般 5 分钟内回复",
      tabAi: "💬 AI 聊天",
      tabContact: "📞 联系我们",
      welcome: "您好！我是 MindDo AI 助手，可以回答课程、试课、续费等常见问题。试试问我：「试课怎么预约？」「营业时间？」「怎么续费？」",
      placeholder: "请输入您的问题…",
      send: "发送",
      typing: "正在思考…",
      clearHistory: "清空对话",
      historyCleared: "对话已清空",
      quickReplies: ["试课怎么预约？", "营业时间", "怎么续费？", "师资介绍", "套餐价格"],
      switchToContact: "→ 查看联系方式",
      escalation: "💡 这个问题比较具体，建议直接联系老师，回答会更准确。",
      followups: "也许还想问：",
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
      close: "关闭客服面板",
      open: "打开客服面板",
      backTitle: "返回上一步",
      contextLabel: "当前页面：",
      contextNone: "—",
      contextStudent: "学员：",
      poweredBy: "由 AI 提供初步回答 · 复杂问题请转人工"
    },
    en: {
      btnLabel: "Support",
      panelTitle: "MindDo Support",
      panelSub: "AI replies instantly · WeChat / phone backup",
      statusChip: "Replies within ~5 min during business hours",
      tabAi: "💬 AI Chat",
      tabContact: "📞 Contact",
      welcome: "Hi! I'm the MindDo AI assistant. I can answer common questions about classes, trials, renewals, etc. Try asking: \"How do I book a trial?\", \"Hours?\", \"How to renew?\"",
      placeholder: "Type your question…",
      send: "Send",
      typing: "Thinking…",
      clearHistory: "Clear chat",
      historyCleared: "Chat cleared",
      quickReplies: ["How to book a trial?", "Hours?", "How to renew?", "Teachers", "Pricing"],
      switchToContact: "→ See contact info",
      escalation: "💡 This is quite specific. Talking to a real person will get you a more accurate answer.",
      followups: "You might also ask:",
      wechatLabel: "WeChat",
      wechatHandle: "MindDo-Service",
      wechatHint: "Scan the QR or add the handle — we'll reply ASAP",
      phoneLabel: "Hotline",
      phoneValue: "+1 (415) 555-0100",
      emailLabel: "Email",
      emailValue: "support@minddo.com",
      hoursLabel: "Hours",
      hoursValue: "Mon–Fri 3:00pm – 7:00pm\nSat–Sun 9:00am – 7:00pm",
      peakNote: "Peak hours may be slower — thanks for your patience.",
      close: "Close support panel",
      open: "Open support panel",
      backTitle: "Back",
      contextLabel: "Page:",
      contextNone: "—",
      contextStudent: "Student:",
      poweredBy: "AI handles common questions · escalate for anything complex"
    }
  };

  function currentLang() {
    var l = document.documentElement.getAttribute("lang") || localStorage.getItem("minddo_lang") || "zh-CN";
    return I18N[l] ? l : "zh-CN";
  }
  function t() { return I18N[currentLang()]; }

  // Detect page hint from URL — feeds into the AI handler for context
  function pageHint() {
    var p = (location.pathname || "").toLowerCase();
    if (/student-account|account/.test(p)) return "profile";
    if (/schedule/.test(p)) return "schedule";
    if (/payment|invoice|checkout|signup/.test(p)) return "payment";
    if (/trial/.test(p)) return "trial";
    if (/assessment/.test(p)) return "assessment";
    if (/feedback/.test(p)) return "feedback";
    return "";
  }
  function currentStudent() {
    try {
      var raw = localStorage.getItem("minddo_current_student");
      return raw ? JSON.parse(raw) : null;
    } catch (_) { return null; }
  }
  function readHistory() {
    try {
      var raw = localStorage.getItem(CHAT_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch (_) { return []; }
  }
  function writeHistory(arr) {
    try {
      if (arr.length > MAX_HISTORY) arr = arr.slice(arr.length - MAX_HISTORY);
      localStorage.setItem(CHAT_KEY, JSON.stringify(arr));
    } catch (_) {}
  }
  function pushHistory(entry) {
    var arr = readHistory();
    arr.push(entry);
    writeHistory(arr);
  }
  function clearHistory() {
    try { localStorage.removeItem(CHAT_KEY); } catch (_) {}
  }

  function injectStyles() {
    var css = ""
      // FAB — purple AI gradient, sparkle inside
      + ".cs-fab { position: fixed; right: 22px; bottom: 22px; z-index: 1500;"
      + "  width: 58px; height: 58px; border-radius: 50%;"
      + "  background: linear-gradient(135deg,#a78bfa 0%,#7c3aed 100%); color: #fff;"
      + "  border: 1px solid rgba(124,58,237,0.5);"
      + "  box-shadow: 0 12px 28px rgba(124,58,237,0.35);"
      + "  display: flex; align-items: center; justify-content: center; cursor: pointer;"
      + "  font-family: inherit; font-size: 24px; transition: transform 0.18s, box-shadow 0.18s; }"
      + ".cs-fab:hover { transform: translateY(-2px); box-shadow: 0 18px 36px rgba(124,58,237,0.45); }"
      + ".cs-fab:focus-visible { outline: 3px solid #fde68a; outline-offset: 3px; }"
      + ".cs-fab .cs-fab-label { position: absolute; right: 68px; padding: 6px 12px; border-radius: 999px;"
      + "  background: rgba(11,26,46,0.92); color: #f0f9ff; font-size: 12px; font-weight: 700;"
      + "  white-space: nowrap; opacity: 0; transform: translateX(6px); transition: 0.18s; pointer-events: none; }"
      + ".cs-fab:hover .cs-fab-label { opacity: 1; transform: translateX(0); }"
      + "@media (max-width: 640px) { .cs-fab .cs-fab-label { display: none; } .cs-fab { right: 16px; bottom: 16px; width: 52px; height: 52px; } }"

      // Panel
      + ".cs-panel { position: fixed; right: 22px; bottom: 92px; z-index: 1499;"
      + "  width: min(380px, calc(100vw - 28px)); height: min(580px, calc(100vh - 120px));"
      + "  background: #fff; border: 1px solid rgba(30,58,95,0.14); border-radius: 18px;"
      + "  box-shadow: 0 30px 60px rgba(15,23,42,0.22);"
      + "  display: flex; flex-direction: column; overflow: hidden;"
      + "  font-family: \"Avenir Next\",\"Helvetica Neue\",\"PingFang SC\",\"Microsoft YaHei\",sans-serif;"
      + "  color: #0f172a; opacity: 0; transform: translateY(8px) scale(0.98);"
      + "  pointer-events: none; transition: opacity 0.18s, transform 0.18s; }"
      + ".cs-panel.open { opacity: 1; transform: translateY(0) scale(1); pointer-events: auto; }"
      + "@media (max-width: 640px) { .cs-panel { right: 12px; left: 12px; width: auto; bottom: 80px; height: calc(100vh - 110px); } }"

      // Header — purple gradient
      + ".cs-head { padding: 14px 18px; background: linear-gradient(135deg,#7c3aed 0%,#5b21b6 100%); color: #fff; flex: none; position: relative; }"
      + ".cs-head h2 { margin: 0 0 2px; font-size: 15px; font-weight: 800; letter-spacing: -0.01em; }"
      + ".cs-head p { margin: 0; font-size: 11.5px; line-height: 1.5; color: rgba(237,233,254,0.85); }"
      + ".cs-head .cs-close { position: absolute; top: 10px; right: 10px; width: 28px; height: 28px;"
      + "  border-radius: 50%; border: 1px solid rgba(255,255,255,0.28); background: rgba(255,255,255,0.08);"
      + "  color: #fff; cursor: pointer; font-size: 14px; line-height: 1; font-family: inherit;"
      + "  display: inline-flex; align-items: center; justify-content: center; transition: 0.15s; }"
      + ".cs-head .cs-close:hover { background: rgba(255,255,255,0.18); }"

      // Tabs
      + ".cs-tabs { display: flex; flex: none; background: #f5f3ff; border-bottom: 1px solid #e9d5ff; }"
      + ".cs-tabs button { all: unset; cursor: pointer; flex: 1; padding: 10px 12px; text-align: center;"
      + "  font-size: 12.5px; font-weight: 700; color: #6b7280;"
      + "  border-bottom: 2px solid transparent; transition: 0.15s; }"
      + ".cs-tabs button:hover { color: #7c3aed; }"
      + ".cs-tabs button.active { color: #7c3aed; border-bottom-color: #7c3aed; background: #fff; }"

      // Tab panels
      + ".cs-tabpanel { display: none; flex: 1 1 auto; min-height: 0; }"
      + ".cs-tabpanel.active { display: flex; flex-direction: column; }"

      // Chat tab
      + ".cs-context { padding: 6px 14px; font-size: 11px; color: #6b7280;"
      + "  background: rgba(124,58,237,0.04); border-bottom: 1px dashed #e9d5ff;"
      + "  display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 6px; }"
      + ".cs-context .cs-ctx-pill { padding: 1px 8px; border-radius: 999px;"
      + "  background: rgba(124,58,237,0.1); color: #6d28d9; font-weight: 700; }"
      + ".cs-chat-body { flex: 1 1 auto; min-height: 0; overflow-y: auto;"
      + "  padding: 14px 16px; background: #fafafa; display: flex; flex-direction: column; gap: 8px; }"
      + ".cs-msg { padding: 9px 12px; border-radius: 14px; max-width: 88%;"
      + "  font-size: 13px; line-height: 1.55; white-space: pre-wrap; word-break: break-word; }"
      + ".cs-msg.user { align-self: flex-end; background: #7c3aed; color: #fff; border-bottom-right-radius: 4px; }"
      + ".cs-msg.bot  { align-self: flex-start; background: #fff; border: 1px solid #e4e4e7; color: #1f2937; border-bottom-left-radius: 4px; }"
      + ".cs-msg.bot.welcome { background: rgba(124,58,237,0.06); border-color: rgba(124,58,237,0.2); }"
      + ".cs-msg.bot.low-conf { border-left: 3px solid #f59e0b; }"
      + ".cs-msg .cs-msg-time { display: block; font-size: 10px; color: #9ca3af; margin-top: 4px; font-variant-numeric: tabular-nums; }"
      + ".cs-msg.user .cs-msg-time { color: rgba(255,255,255,0.7); }"
      + ".cs-msg .cs-msg-action { display: inline-block; margin-top: 6px; font-size: 11.5px; font-weight: 700;"
      + "  color: #7c3aed; cursor: pointer; padding: 3px 8px; border-radius: 6px;"
      + "  background: rgba(124,58,237,0.08); border: 1px solid rgba(124,58,237,0.24); }"
      + ".cs-msg .cs-msg-action:hover { background: rgba(124,58,237,0.16); }"
      + ".cs-typing { align-self: flex-start; padding: 8px 12px; border-radius: 14px;"
      + "  background: #fff; border: 1px solid #e4e4e7; color: #6b7280;"
      + "  font-size: 12px; font-style: italic; }"
      + ".cs-followups { display: flex; flex-wrap: wrap; gap: 4px; margin-top: 6px; }"
      + ".cs-followups button { all: unset; cursor: pointer; padding: 3px 10px;"
      + "  border-radius: 999px; font-size: 11px; color: #7c3aed;"
      + "  background: rgba(124,58,237,0.08); border: 1px solid rgba(124,58,237,0.24); }"
      + ".cs-followups button:hover { background: rgba(124,58,237,0.16); }"
      + ".cs-followups .cs-followups-label { padding: 3px 0; font-size: 10.5px; color: #6b7280; }"

      + ".cs-quick { display: flex; flex-wrap: wrap; gap: 5px; padding: 8px 14px;"
      + "  border-top: 1px dashed #e9d5ff; background: #fff; flex: none; }"
      + ".cs-quick button { all: unset; cursor: pointer; padding: 4px 10px;"
      + "  border-radius: 999px; font-size: 11.5px; font-weight: 600; color: #6d28d9;"
      + "  background: rgba(124,58,237,0.08); border: 1px solid rgba(124,58,237,0.22); }"
      + ".cs-quick button:hover { background: rgba(124,58,237,0.16); }"

      + ".cs-input-row { display: flex; gap: 6px; padding: 10px 12px;"
      + "  border-top: 1px solid #e4e4e7; background: #fff; flex: none; align-items: center; }"
      + ".cs-input-row input { flex: 1; padding: 8px 12px; border: 1px solid #d4d4d8;"
      + "  border-radius: 999px; font: inherit; font-size: 13px; outline: none; }"
      + ".cs-input-row input:focus { border-color: #7c3aed; box-shadow: 0 0 0 2px rgba(124,58,237,0.18); }"
      + ".cs-input-row button.send { all: unset; cursor: pointer; padding: 8px 16px;"
      + "  border-radius: 999px; background: #7c3aed; color: #fff; font-size: 13px; font-weight: 700; }"
      + ".cs-input-row button.send:disabled { opacity: 0.6; cursor: not-allowed; }"
      + ".cs-input-row button.clear { all: unset; cursor: pointer; padding: 6px 10px;"
      + "  font-size: 11px; color: #9ca3af; border-radius: 6px; }"
      + ".cs-input-row button.clear:hover { color: #6b7280; background: #f4f4f5; }"
      + ".cs-footer { padding: 6px 14px 8px; font-size: 10px; color: #9ca3af; text-align: center; background: #fff; border-top: 1px dashed #e4e4e7; }"

      // Contact tab — closer to the v1 style but simplified
      + ".cs-contact-body { padding: 16px 18px; overflow-y: auto; display: grid; gap: 14px; }"
      + ".cs-status { display: inline-flex; align-items: center; gap: 6px;"
      + "  padding: 4px 10px; border-radius: 999px; background: rgba(110,231,183,0.18);"
      + "  border: 1px solid rgba(110,231,183,0.32); color: #047857;"
      + "  font-size: 11px; font-weight: 700; }"
      + ".cs-status::before { content: \"\"; width: 6px; height: 6px; border-radius: 999px;"
      + "  background: #34d399; box-shadow: 0 0 0 3px rgba(52,211,153,0.25); }"
      + ".cs-block { display: grid; gap: 4px; }"
      + ".cs-block .cs-k { font-size: 10.5px; font-weight: 800; letter-spacing: 0.1em;"
      + "  text-transform: uppercase; color: #5a6b81; }"
      + ".cs-block .cs-v { font-size: 13.5px; font-weight: 700; color: #1e3a5f; word-break: break-all; }"
      + ".cs-block a.cs-v { text-decoration: none; transition: color 0.15s; }"
      + ".cs-block a.cs-v:hover { color: #7c3aed; }"
      + ".cs-hint { font-size: 11.5px; color: #5a6b81; line-height: 1.55; }"
      + ".cs-wechat { display: grid; grid-template-columns: 86px 1fr; gap: 12px; align-items: start;"
      + "  padding: 12px; background: #f6f8fb; border: 1px solid rgba(30,58,95,0.1); border-radius: 12px; }"
      + ".cs-qr { width: 86px; height: 86px; border-radius: 8px; background: #fff;"
      + "  border: 1px solid rgba(30,58,95,0.1); position: relative; overflow: hidden; }"
      + ".cs-qr-pattern { position: absolute; inset: 8px; background-image:"
      + "  radial-gradient(circle, rgba(30,58,95,0.85) 1.4px, transparent 1.6px),"
      + "  radial-gradient(circle, rgba(30,58,95,0.65) 1px, transparent 1.2px);"
      + "  background-size: 8px 8px, 6px 6px; background-position: 0 0, 4px 4px; }"
      + ".cs-peak { padding: 10px 12px; border-radius: 10px;"
      + "  background: rgba(216,156,54,0.1); border: 1px solid rgba(216,156,54,0.28);"
      + "  color: #8a5d11; font-size: 12px; line-height: 1.55; }";

    var style = document.createElement("style");
    style.setAttribute("data-cs-styles", "1");
    style.textContent = css;
    document.head.appendChild(style);
  }

  function buildButton() {
    var b = document.createElement("button");
    b.type = "button";
    b.className = "cs-fab";
    b.setAttribute("aria-haspopup", "dialog");
    b.setAttribute("aria-expanded", "false");
    b.innerHTML = "✨<span class=\"cs-fab-label\" data-cs-i18n=\"btnLabel\"></span>"
      + "<span class=\"cs-fab-sr\" data-cs-i18n=\"open\" style=\"position:absolute;left:-9999px;\"></span>";
    return b;
  }

  function buildPanel() {
    var p = document.createElement("aside");
    p.className = "cs-panel";
    p.setAttribute("role", "dialog");
    p.setAttribute("aria-modal", "false");
    p.setAttribute("aria-labelledby", "csPanelTitle");
    p.innerHTML = ""
      + "<div class=\"cs-head\">"
      + "  <button type=\"button\" class=\"cs-close\" data-cs-close aria-label=\"\">×</button>"
      + "  <h2 id=\"csPanelTitle\" data-cs-i18n=\"panelTitle\"></h2>"
      + "  <p data-cs-i18n=\"panelSub\"></p>"
      + "</div>"
      + "<div class=\"cs-tabs\" role=\"tablist\">"
      + "  <button type=\"button\" class=\"active\" data-cs-tab=\"ai\" data-cs-i18n=\"tabAi\" role=\"tab\"></button>"
      + "  <button type=\"button\" data-cs-tab=\"contact\" data-cs-i18n=\"tabContact\" role=\"tab\"></button>"
      + "</div>"
      // AI chat tab
      + "<div class=\"cs-tabpanel active\" data-cs-panel=\"ai\" role=\"tabpanel\">"
      + "  <div class=\"cs-context\">"
      + "    <span><span data-cs-i18n=\"contextLabel\"></span> <span class=\"cs-ctx-pill\" data-cs-ctx-page>—</span></span>"
      + "    <span data-cs-ctx-stu hidden><span data-cs-i18n=\"contextStudent\"></span> <span class=\"cs-ctx-pill\" data-cs-ctx-stu-name></span></span>"
      + "  </div>"
      + "  <div class=\"cs-chat-body\" data-cs-chat-body></div>"
      + "  <div class=\"cs-quick\" data-cs-quick></div>"
      + "  <div class=\"cs-input-row\">"
      + "    <button type=\"button\" class=\"clear\" data-cs-clear data-cs-i18n=\"clearHistory\"></button>"
      + "    <input type=\"text\" data-cs-input autocomplete=\"off\" />"
      + "    <button type=\"button\" class=\"send\" data-cs-send data-cs-i18n=\"send\"></button>"
      + "  </div>"
      + "  <div class=\"cs-footer\" data-cs-i18n=\"poweredBy\"></div>"
      + "</div>"
      // Contact tab
      + "<div class=\"cs-tabpanel\" data-cs-panel=\"contact\" role=\"tabpanel\">"
      + "  <div class=\"cs-contact-body\">"
      + "    <span class=\"cs-status\" data-cs-i18n=\"statusChip\"></span>"
      + "    <div class=\"cs-wechat\">"
      + "      <div class=\"cs-qr\" aria-hidden=\"true\"><span class=\"cs-qr-pattern\"></span></div>"
      + "      <div class=\"cs-block\">"
      + "        <span class=\"cs-k\" data-cs-i18n=\"wechatLabel\"></span>"
      + "        <span class=\"cs-v\" data-cs-i18n=\"wechatHandle\"></span>"
      + "        <span class=\"cs-hint\" data-cs-i18n=\"wechatHint\"></span>"
      + "      </div>"
      + "    </div>"
      + "    <div class=\"cs-block\">"
      + "      <span class=\"cs-k\" data-cs-i18n=\"phoneLabel\"></span>"
      + "      <a class=\"cs-v\" data-cs-i18n=\"phoneValue\" data-cs-href=\"phone\"></a>"
      + "    </div>"
      + "    <div class=\"cs-block\">"
      + "      <span class=\"cs-k\" data-cs-i18n=\"emailLabel\"></span>"
      + "      <a class=\"cs-v\" data-cs-i18n=\"emailValue\" data-cs-href=\"email\"></a>"
      + "    </div>"
      + "    <div class=\"cs-block\">"
      + "      <span class=\"cs-k\" data-cs-i18n=\"hoursLabel\"></span>"
      + "      <span class=\"cs-v\" style=\"font-weight:600;font-size:12.5px;line-height:1.6;color:#1e3a5f;white-space:pre-line;\" data-cs-i18n=\"hoursValue\"></span>"
      + "    </div>"
      + "    <div class=\"cs-peak\" data-cs-i18n=\"peakNote\"></div>"
      + "  </div>"
      + "</div>";
    return p;
  }

  function applyI18n(root) {
    var dict = t();
    root.querySelectorAll("[data-cs-i18n]").forEach(function (el) {
      var key = el.getAttribute("data-cs-i18n");
      var val = dict[key];
      if (val == null) return;
      el.textContent = val;
      var hrefKind = el.getAttribute("data-cs-href");
      if (hrefKind === "phone") el.setAttribute("href", "tel:" + val.replace(/[^+0-9]/g, ""));
      if (hrefKind === "email") el.setAttribute("href", "mailto:" + val);
    });
    var closeBtn = root.querySelector("[data-cs-close]");
    if (closeBtn) closeBtn.setAttribute("aria-label", dict.close);
    var inp = root.querySelector("[data-cs-input]");
    if (inp) inp.placeholder = dict.placeholder;
  }

  function fmtTime(iso) {
    if (!iso) return "";
    try {
      var d = new Date(iso);
      var p = function (n) { return n < 10 ? "0" + n : "" + n; };
      return p(d.getHours()) + ":" + p(d.getMinutes());
    } catch (_) { return ""; }
  }

  function init() {
    injectStyles();
    var btn = buildButton();
    var panel = buildPanel();
    document.body.appendChild(btn);
    document.body.appendChild(panel);

    var chatBody = panel.querySelector("[data-cs-chat-body]");
    var input = panel.querySelector("[data-cs-input]");
    var sendBtn = panel.querySelector("[data-cs-send]");
    var clearBtn = panel.querySelector("[data-cs-clear]");
    var quickWrap = panel.querySelector("[data-cs-quick]");
    var ctxPageEl = panel.querySelector("[data-cs-ctx-page]");
    var ctxStuWrap = panel.querySelector("[data-cs-ctx-stu]");
    var ctxStuNameEl = panel.querySelector("[data-cs-ctx-stu-name]");

    function renderContext() {
      var hint = pageHint();
      var dict = t();
      var pageLabel = ({
        "schedule": "Schedule", "profile": "Profile", "payment": "Payment",
        "trial": "Trial", "assessment": "Assessment", "feedback": "Feedback"
      })[hint] || dict.contextNone;
      if (ctxPageEl) ctxPageEl.textContent = pageLabel;
      var stu = currentStudent();
      var name = stu && (stu.studentName || stu.name);
      if (ctxStuWrap) ctxStuWrap.hidden = !name;
      if (ctxStuNameEl) ctxStuNameEl.textContent = name || "";
    }

    function renderQuickReplies() {
      if (!quickWrap) return;
      var dict = t();
      quickWrap.innerHTML = (dict.quickReplies || []).map(function (q) {
        return "<button type=\"button\" data-cs-quick-q=\"" + q.replace(/"/g, "&quot;") + "\">" + q + "</button>";
      }).join("");
    }

    function renderHistory() {
      if (!chatBody) return;
      var rows = readHistory();
      chatBody.innerHTML = "";
      var dict = t();
      // Always start with welcome message
      var welcome = document.createElement("div");
      welcome.className = "cs-msg bot welcome";
      welcome.textContent = dict.welcome;
      chatBody.appendChild(welcome);
      rows.forEach(function (r) { appendMsg(r.text, r.who, r.at, r.lowConf, r.followups); });
      scrollToBottom();
    }

    function scrollToBottom() {
      if (chatBody) chatBody.scrollTop = chatBody.scrollHeight;
    }

    function appendMsg(text, who, atIso, lowConf, followups) {
      var div = document.createElement("div");
      div.className = "cs-msg " + (who === "user" ? "user" : "bot");
      if (lowConf && who === "bot") div.classList.add("low-conf");
      div.textContent = text;
      // Time + action chip
      var time = document.createElement("span");
      time.className = "cs-msg-time";
      time.textContent = fmtTime(atIso || new Date().toISOString());
      div.appendChild(time);
      if (lowConf && who === "bot") {
        var actionWrap = document.createElement("div");
        var action = document.createElement("span");
        action.className = "cs-msg-action";
        action.textContent = t().switchToContact;
        action.setAttribute("data-cs-goto", "contact");
        actionWrap.style.marginTop = "6px";
        actionWrap.appendChild(action);
        div.appendChild(actionWrap);
      }
      if (followups && followups.length) {
        var fu = document.createElement("div");
        fu.className = "cs-followups";
        fu.innerHTML = "<span class=\"cs-followups-label\">" + t().followups + "</span>"
          + followups.map(function (q) {
              return "<button type=\"button\" data-cs-followup=\"" + q.replace(/"/g, "&quot;") + "\">" + q + "</button>";
            }).join("");
        div.appendChild(fu);
      }
      chatBody.appendChild(div);
    }

    function send(q) {
      q = (q || "").trim();
      if (!q) return;
      var nowIso = new Date().toISOString();
      appendMsg(q, "user", nowIso);
      pushHistory({ who: "user", text: q, at: nowIso });
      input.value = "";
      sendBtn.disabled = true;
      scrollToBottom();
      // Typing indicator
      var typing = document.createElement("div");
      typing.className = "cs-typing";
      typing.textContent = t().typing;
      chatBody.appendChild(typing);
      scrollToBottom();
      var flow = window.MindDoFlow;
      if (!flow || !flow.aiSuggest) {
        typing.remove();
        appendMsg(t().escalation, "bot", new Date().toISOString(), true, null);
        sendBtn.disabled = false;
        return;
      }
      flow.aiSuggest({
        kind: "parent-chatbot",
        context: {
          query: q,
          pageHint: pageHint(),
          currentStudent: currentStudent()
        }
      }).then(function (r) {
        typing.remove();
        var lowConf = (r.confidence || 0) < 0.5;
        var followups = (r.suggestions && r.suggestions.followups) || [];
        var botIso = new Date().toISOString();
        appendMsg(r.text, "bot", botIso, lowConf, followups);
        pushHistory({ who: "bot", text: r.text, at: botIso, lowConf: lowConf, followups: followups });
        sendBtn.disabled = false;
        scrollToBottom();
      });
    }

    function switchTab(key) {
      panel.querySelectorAll("[data-cs-tab]").forEach(function (b) {
        b.classList.toggle("active", b.getAttribute("data-cs-tab") === key);
      });
      panel.querySelectorAll("[data-cs-panel]").forEach(function (p) {
        p.classList.toggle("active", p.getAttribute("data-cs-panel") === key);
      });
    }

    function refreshLang() {
      applyI18n(btn);
      applyI18n(panel);
      renderQuickReplies();
      renderContext();
      renderHistory();
    }

    function open() {
      panel.classList.add("open");
      btn.setAttribute("aria-expanded", "true");
      renderContext(); // current page might have changed
      setTimeout(function () { if (input) input.focus(); }, 80);
    }
    function close() {
      panel.classList.remove("open");
      btn.setAttribute("aria-expanded", "false");
    }
    function toggle() {
      panel.classList.contains("open") ? close() : open();
    }

    btn.addEventListener("click", toggle);
    panel.addEventListener("click", function (e) {
      if (e.target.closest("[data-cs-close]")) { close(); return; }
      var tabBtn = e.target.closest("[data-cs-tab]");
      if (tabBtn) { switchTab(tabBtn.getAttribute("data-cs-tab")); return; }
      var qb = e.target.closest("[data-cs-quick-q]");
      if (qb) { send(qb.getAttribute("data-cs-quick-q")); return; }
      var fu = e.target.closest("[data-cs-followup]");
      if (fu) { send(fu.getAttribute("data-cs-followup")); return; }
      var goto = e.target.closest("[data-cs-goto]");
      if (goto) { switchTab(goto.getAttribute("data-cs-goto")); return; }
    });
    if (sendBtn) sendBtn.addEventListener("click", function () {
      send(input ? input.value : "");
    });
    if (input) input.addEventListener("keydown", function (e) {
      if (e.key === "Enter") { e.preventDefault(); send(input.value); }
    });
    if (clearBtn) clearBtn.addEventListener("click", function () {
      clearHistory();
      renderHistory();
    });

    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && panel.classList.contains("open")) close();
    });
    // Lang change watcher
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
