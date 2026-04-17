(function () {
  var KEYS = {
    currentStudent: "minddo_current_student",
    signups: "minddo_signup_users",
    assessments: "minddo_assessments",
    leads: "minddo_trial_leads",
    payments: "minddo_payments",
    feedback: "minddo_feedback",
    memberships: "minddo_membership_orders",
    requests: "minddo_schedule_requests"
  };

  function readJson(key, fallback) {
    try {
      return JSON.parse(localStorage.getItem(key) || JSON.stringify(fallback));
    } catch (_) {
      return fallback;
    }
  }

  function writeJson(key, value) {
    localStorage.setItem(key, JSON.stringify(value));
  }

  function norm(v) {
    return String(v || "").trim().toLowerCase();
  }

  function latestByDate(list, matcher) {
    return list
      .filter(function (item) { return typeof matcher === "function" ? matcher(item) : true; })
      .sort(function (a, b) {
        return new Date(b.createdAt || 0) - new Date(a.createdAt || 0);
      })[0] || null;
  }

  function createStudentId() {
    var d = new Date();
    var pad = function (n) { return String(n).padStart(2, "0"); };
    return "MD" + d.getFullYear() + "-" + pad(d.getMonth() + 1) + pad(d.getDate()) + "-" + pad(d.getHours()) + pad(d.getMinutes());
  }

  function demoEmailFromPhone(phone) {
    var digits = String(phone || "").replace(/\D/g, "").slice(-8) || "student";
    return "demo+" + digits + "@minddo.local";
  }

  function getCurrentStudent() {
    return readJson(KEYS.currentStudent, null);
  }

  function setCurrentStudent(student) {
    if (!student) return null;
    var current = getCurrentStudent() || {};
    var merged = Object.assign({}, current, student);
    if (!merged.studentId) merged.studentId = current.studentId || createStudentId();
    if (!merged.email && merged.phone) merged.email = demoEmailFromPhone(merged.phone);
    writeJson(KEYS.currentStudent, merged);
    return merged;
  }

  function appendRecord(key, payload) {
    var list = readJson(key, []);
    list.push(payload);
    writeJson(key, list);
    return payload;
  }

  function upsertByEmail(key, payload) {
    var list = readJson(key, []);
    var email = norm(payload && payload.email);
    var index = list.findIndex(function (item) {
      return norm(item && item.email) === email && email;
    });

    if (index >= 0) {
      list[index] = Object.assign({}, list[index], payload);
    } else {
      list.push(payload);
    }

    writeJson(key, list);
    return payload;
  }

  function getSnapshot() {
    var current = getCurrentStudent() || {};
    var email = norm(current.email);
    var name = norm(current.studentName || current.name);
    var match = function (item) {
      if (!item) return false;
      var itemEmail = norm(item.email);
      var itemName = norm(item.studentName || item.name);
      return (email && itemEmail === email) || (name && itemName === name);
    };

    return {
      currentStudent: current,
      lead: latestByDate(readJson(KEYS.leads, []), match),
      assessment: latestByDate(readJson(KEYS.assessments, []), match),
      signup: latestByDate(readJson(KEYS.signups, []), match),
      payment: latestByDate(readJson(KEYS.payments, []), match),
      membership: latestByDate(readJson(KEYS.memberships, []), match),
      feedback: latestByDate(readJson(KEYS.feedback, []), match)
    };
  }

  function getStage(snapshot) {
    var s = snapshot || getSnapshot();
    if (s.feedback) return "feedback";
    if (s.membership) return "membership";
    if (s.payment) return "payment";
    if (s.signup) return "signup";
    if (s.assessment) return "assessment";
    if (s.lead) return "trial";
    return "start";
  }

  function getNextPage(stage) {
    var map = {
      start: "trial.html",
      trial: "assessment.html",
      assessment: "signup.html",
      signup: "course-selection.html",
      payment: "course-selection.html",
      membership: "student-account.html",
      feedback: "student-account.html"
    };
    return map[stage] || "index.html";
  }

  function saveLead(data) {
    var current = setCurrentStudent({
      studentName: data.studentName,
      name: data.studentName,
      grade: data.grade,
      birthday: data.birthday,
      parentName: data.parentName,
      phone: data.phone,
      city: data.city,
      email: data.email || demoEmailFromPhone(data.phone)
    });

    return appendRecord(KEYS.leads, Object.assign({}, data, {
      email: current.email,
      studentId: current.studentId
    }));
  }

  function saveAssessment(data) {
    var current = setCurrentStudent({
      studentName: data.name || data.studentName,
      name: data.name || data.studentName,
      email: data.email
    });

    return appendRecord(KEYS.assessments, Object.assign({}, data, {
      email: data.email || current.email,
      studentName: data.name || data.studentName || current.studentName,
      studentId: current.studentId
    }));
  }

  function saveSignupUser(user) {
    var current = setCurrentStudent({
      studentName: user.studentName || user.name,
      name: user.studentName || user.name,
      email: user.email,
      provider: user.provider
    });

    return upsertByEmail(KEYS.signups, Object.assign({}, user, {
      studentId: current.studentId
    }));
  }

  function savePayment(payment) {
    var current = setCurrentStudent({
      email: payment.email
    });

    return appendRecord(KEYS.payments, Object.assign({}, payment, {
      email: payment.email || current.email,
      studentId: current.studentId
    }));
  }

  function saveMembershipOrder(order) {
    var current = setCurrentStudent({});
    return appendRecord(KEYS.memberships, Object.assign({}, order, {
      email: current && current.email,
      studentName: current && current.studentName,
      studentId: current && current.studentId
    }));
  }

  function saveFeedback(feedback) {
    var current = setCurrentStudent({
      studentName: feedback.studentName,
      name: feedback.studentName
    });

    return appendRecord(KEYS.feedback, Object.assign({}, feedback, {
      email: feedback.email || current.email,
      studentId: current.studentId
    }));
  }

  function getScheduleRequests() {
    return readJson(KEYS.requests, []);
  }

  function saveScheduleRequest(request) {
    var current = setCurrentStudent({
      studentName: request.studentName || request.name,
      name: request.studentName || request.name,
      email: request.email
    });

    return appendRecord(KEYS.requests, Object.assign({
      status: "pending"
    }, request, {
      email: request.email || current.email,
      studentName: request.studentName || request.name || current.studentName,
      studentId: request.studentId || current.studentId
    }));
  }

  function updateScheduleRequestStatus(index, status, extra) {
    var list = getScheduleRequests();
    if (index < 0 || index >= list.length) return null;
    list[index] = Object.assign({}, list[index], extra || {}, {
      status: status,
      updatedAt: new Date().toISOString()
    });
    writeJson(KEYS.requests, list);
    return list[index];
  }

  function prefillTrialForm(form) {
    var current = getCurrentStudent();
    if (!form || !current) return;
    if (form.studentName && !form.studentName.value) form.studentName.value = current.studentName || current.name || "";
    if (form.grade && !form.grade.value) form.grade.value = current.grade || "";
    if (form.birthday && !form.birthday.value) form.birthday.value = current.birthday || "";
    if (form.email && !form.email.value) form.email.value = current.email || "";
    if (form.parentName && !form.parentName.value) form.parentName.value = current.parentName || "";
    if (form.phone && !form.phone.value) form.phone.value = current.phone || "";
    if (form.city && !form.city.value) form.city.value = current.city || "";
  }

  function prefillSignupForm(form) {
    var snapshot = getSnapshot();
    var current = snapshot.currentStudent || {};
    if (!form) return;
    if (form.studentName && !form.studentName.value) form.studentName.value = current.studentName || current.name || "";
    if (form.email && !form.email.value) form.email.value = current.email || "";
  }

  function populateCourseMeta() {
    var current = getCurrentStudent();
    if (!current) return;
    var snapshot = getSnapshot();
    var setText = function (id, value) {
      var el = document.getElementById(id);
      if (el && value) el.textContent = value;
    };
    setText("metaName", current.studentName || current.name);
    setText("metaId", current.studentId);
    setText("metaGrade", current.grade || "Grade 6");
    setText("metaGoal", (snapshot.assessment && snapshot.assessment.goal) || current.goal || "AI Learning Growth");
  }

  function mockPaymentForCurrentStudent() {
    var current = setCurrentStudent({});
    if (!current || !current.email) return false;
    savePayment({
      email: current.email,
      amount: 369,
      source: current.provider || "email",
      createdAt: new Date().toISOString()
    });
    return true;
  }

  function clearFlowData() {
    Object.keys(KEYS).forEach(function (key) {
      localStorage.removeItem(KEYS[key]);
    });
  }

  function seedDemoData() {
    clearFlowData();

    var now = new Date();
    function daysAgo(days) {
      var d = new Date(now);
      d.setDate(d.getDate() - days);
      return d.toISOString();
    }

    var student = setCurrentStudent({
      studentName: "李若安",
      name: "李若安",
      email: "leo.li@example.com",
      phone: "317-555-0188",
      city: "Indianapolis",
      grade: "六年级",
      birthday: "2014-05-18",
      parentName: "李女士",
      provider: "email",
      goal: "AI创造力提升",
      studentId: "MD2026-0417"
    });

    writeJson(KEYS.leads, [{
      studentName: student.studentName,
      studentId: student.studentId,
      grade: student.grade,
      birthday: student.birthday,
      parentName: student.parentName,
      phone: student.phone,
      city: student.city,
      email: student.email,
      subject: "ai-coding",
      subjectLabel: "AI 编程进阶",
      trialDate: now.toISOString().slice(0, 10),
      trialTime: "18:30",
      channel: "wechat",
      channelLabel: "微信/社群",
      goal: student.goal,
      timeNote: "Prefer weekday evening slots.",
      consent: true,
      createdAt: daysAgo(5)
    }]);

    writeJson(KEYS.assessments, [{
      name: student.studentName,
      studentName: student.studentName,
      studentId: student.studentId,
      email: student.email,
      level: "Intermediate",
      goal: "Interest Learning",
      notes: "Strong curiosity and project readiness.",
      createdAt: daysAgo(4)
    }]);

    writeJson(KEYS.signups, [{
      provider: "email",
      studentName: student.studentName,
      email: student.email,
      studentId: student.studentId,
      createdAt: daysAgo(3)
    }]);

    writeJson(KEYS.payments, [{
      email: student.email,
      amount: 369,
      source: "email",
      studentId: student.studentId,
      createdAt: daysAgo(2)
    }]);

    writeJson(KEYS.memberships, [{
      email: student.email,
      studentName: student.studentName,
      studentId: student.studentId,
      plan: "weekly2",
      addons: ["mentor"],
      classMode: "1v1",
      billingCycle: "monthly",
      weekday: "周三",
      timeSlot: "晚间 19:00-21:00",
      totalMonthly: "$408.00",
      createdAt: daysAgo(2)
    }]);

    writeJson(KEYS.feedback, [{
      studentName: student.studentName,
      email: student.email,
      studentId: student.studentId,
      trialDate: now.toISOString().slice(0, 10),
      trialTime: "18:30",
      subject: "AI 编程进阶",
      rating: "5 - Very Satisfied",
      nextStep: "Continue to formal course",
      highlights: "Student responded well to guided project prompts.",
      suggestion: "Move into the formal weekly track.",
      createdAt: daysAgo(1)
    }]);

    writeJson(KEYS.requests, [{
      type: "reschedule",
      targetLabel: "每周两节课 · 周三 · 晚间 19:00-21:00",
      reason: "本周学校活动冲突，希望顺延到周四同一时间。",
      email: student.email,
      studentName: student.studentName,
      studentId: student.studentId,
      status: "pending",
      createdAt: daysAgo(0)
    }]);
  }

  function currentLang() {
    var docLang = document.documentElement && document.documentElement.getAttribute("lang");
    if (docLang === "en") return "en";
    var saved = localStorage.getItem("minddo_lang");
    return saved === "en" ? "en" : "zh-CN";
  }

  var COPY = {
    "zh-CN": {
      title: "流程测试面板",
      desc: "填充示例数据测试完整学员流程。",
      student: "学员",
      noStudent: "暂无激活学员",
      stage: "当前阶段",
      next: "下一步",
      seed: "填充示例数据",
      payment: "模拟支付",
      reset: "重置数据",
      goNext: "前往下一步",
      studentJourney: "学员旅程",
      ops: "运营后台",
      info: "信息页面",
      collapse: "收起",
      expand: "流程测试",
      stages: {
        start: "尚未开始",
        trial: "已预约试课",
        assessment: "已完成评估",
        signup: "已注册账户",
        payment: "已支付",
        membership: "已选课排课",
        feedback: "已收到反馈"
      },
      pages: {
        "index.html": "首页",
        "campuses.html": "校区分布",
        "trial.html": "预约试课 · 选时间",
        "trial-register.html": "预约试课 · 填信息",
        "assessment.html": "能力评估",
        "signup.html": "注册登录",
        "course-selection.html": "选课 · 方案",
        "course-schedule.html": "选课 · 时段",
        "course-payment.html": "选课 · 支付",
        "course-confirm.html": "选课 · 完成",
        "student-account.html": "学员中心",
        "feedback.html": "课堂反馈",
        "semester-report.html": "学期报告",
        "course-system.html": "课程体系",
        "dashboard.html": "运营看板",
        "student-management.html": "学员管理",
        "request-center.html": "申请处理",
        "new-trials.html": "新试课",
        "new-students.html": "新学员"
      }
    },
    en: {
      title: "Flow Test Panel",
      desc: "Seed demo data to test the full student flow.",
      student: "Student",
      noStudent: "No active student",
      stage: "Stage",
      next: "Next",
      seed: "Seed Demo",
      payment: "Mock Payment",
      reset: "Reset",
      goNext: "Go Next",
      studentJourney: "Student Journey",
      ops: "Operations",
      info: "Info Pages",
      collapse: "Collapse",
      expand: "Flow Test",
      stages: {
        start: "Not Started",
        trial: "Trial Booked",
        assessment: "Assessment Done",
        signup: "Account Created",
        payment: "Payment Made",
        membership: "Enrolled",
        feedback: "Feedback Received"
      },
      pages: {
        "index.html": "Home",
        "campuses.html": "Campuses",
        "trial.html": "Trial · Time",
        "trial-register.html": "Trial · Info",
        "assessment.html": "Assessment",
        "signup.html": "Sign Up",
        "course-selection.html": "Enroll · Plan",
        "course-schedule.html": "Enroll · Schedule",
        "course-payment.html": "Enroll · Pay",
        "course-confirm.html": "Enroll · Done",
        "student-account.html": "Student Hub",
        "feedback.html": "Class Feedback",
        "semester-report.html": "Semester Report",
        "course-system.html": "Curriculum",
        "dashboard.html": "Dashboard",
        "student-management.html": "Students",
        "request-center.html": "Requests",
        "new-trials.html": "New Trials",
        "new-students.html": "New Students"
      }
    }
  };

  var PAGE_GROUPS = {
    journey: ["trial.html", "trial-register.html", "assessment.html", "signup.html", "course-selection.html", "course-schedule.html", "course-payment.html", "course-confirm.html", "student-account.html", "feedback.html", "semester-report.html"],
    ops: ["dashboard.html", "student-management.html", "request-center.html", "new-trials.html", "new-students.html"],
    info: ["index.html", "campuses.html", "course-system.html"]
  };

  var STAGE_ORDER = ["start", "trial", "assessment", "signup", "payment", "membership", "feedback"];

  function currentPageName() {
    var path = (window.location.pathname || "").split("/").pop();
    return path || "index.html";
  }

  function injectPanelStyles() {
    if (document.getElementById("minddoFlowPanelStyle")) return;
    var style = document.createElement("style");
    style.id = "minddoFlowPanelStyle";
    style.textContent =
      ".minddo-flow-toggle{position:fixed;right:18px;bottom:18px;z-index:9998;width:52px;height:52px;border-radius:999px;border:none;cursor:pointer;background:linear-gradient(135deg,#ffe5a7,#ecab2f);color:#4b250f;box-shadow:0 8px 24px rgba(143,60,22,.28);font-family:'Avenir Next','Helvetica Neue','PingFang SC','Microsoft YaHei',sans-serif;font-size:20px;display:flex;align-items:center;justify-content:center;transition:.2s}" +
      ".minddo-flow-toggle:hover{transform:translateY(-2px);box-shadow:0 14px 32px rgba(143,60,22,.38)}" +
      ".minddo-flow-toggle .dot{position:absolute;top:-2px;right:-2px;width:14px;height:14px;border-radius:999px;background:#c46a4d;border:2px solid #fff;display:none}" +
      ".minddo-flow-toggle.has-data .dot{display:block}" +
      ".minddo-flow-panel{position:fixed;right:18px;bottom:18px;z-index:9999;width:min(340px,calc(100vw - 24px));max-height:calc(100vh - 36px);overflow-y:auto;padding:18px;border:1px solid rgba(126,77,29,.14);border-radius:20px;background:rgba(255,252,246,.98);box-shadow:0 24px 60px rgba(100,58,22,.22);font-family:'Avenir Next','Helvetica Neue','PingFang SC','Microsoft YaHei',sans-serif;color:#45200d}" +
      ".minddo-flow-head{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:6px}" +
      ".minddo-flow-head h3{margin:0;font-size:15px;font-weight:800;color:#8f3c16}" +
      ".minddo-flow-close{background:none;border:none;color:#826956;cursor:pointer;font-size:18px;line-height:1;padding:2px 6px;border-radius:6px;font-family:inherit}" +
      ".minddo-flow-close:hover{background:rgba(143,60,22,.08);color:#8f3c16}" +
      ".minddo-flow-panel p.desc{margin:0 0 12px;font-size:12px;line-height:1.55;color:#826956}" +
      ".minddo-flow-progress{display:flex;gap:3px;margin-bottom:12px}" +
      ".minddo-flow-progress .seg{flex:1;height:5px;border-radius:999px;background:rgba(126,77,29,.12)}" +
      ".minddo-flow-progress .seg.done{background:linear-gradient(90deg,#ecab2f,#d79016)}" +
      ".minddo-flow-kv{display:grid;grid-template-columns:70px 1fr;gap:4px 10px;margin-bottom:12px;font-size:12px;line-height:1.5}" +
      ".minddo-flow-kv strong{color:#8f3c16;font-weight:700}" +
      ".minddo-flow-kv span{color:#45200d;word-break:break-all}" +
      ".minddo-flow-group{margin-top:12px}" +
      ".minddo-flow-label{font-size:10px;font-weight:800;letter-spacing:.1em;text-transform:uppercase;color:#826956;margin-bottom:6px}" +
      ".minddo-flow-row{display:flex;flex-wrap:wrap;gap:6px}" +
      ".minddo-flow-btn,.minddo-flow-link{display:inline-flex;align-items:center;justify-content:center;padding:7px 11px;border-radius:999px;border:1px solid rgba(126,77,29,.14);background:rgba(255,248,239,.98);color:#8f3c16;text-decoration:none;font-size:12px;font-weight:600;font-family:inherit;cursor:pointer;transition:.15s}" +
      ".minddo-flow-btn:hover,.minddo-flow-link:hover{background:#f2e4c9;border-color:rgba(236,171,47,.5)}" +
      ".minddo-flow-btn.primary,.minddo-flow-link.primary{background:linear-gradient(135deg,#ffe5a7,#ecab2f);color:#4b250f;border-color:transparent;box-shadow:0 3px 10px rgba(215,144,22,.2)}" +
      ".minddo-flow-btn.primary:hover,.minddo-flow-link.primary:hover{background:linear-gradient(135deg,#ffdd8e,#d79016);transform:translateY(-1px)}" +
      ".minddo-flow-btn.danger{color:#c46a4d;border-color:rgba(196,106,77,.3)}" +
      ".minddo-flow-btn.danger:hover{background:rgba(196,106,77,.1);border-color:#c46a4d}" +
      ".minddo-flow-link.current{background:#f2e4c9;border-color:#ecab2f;color:#5f2c12;pointer-events:none;cursor:default}" +
      "@media (max-width:760px){.minddo-flow-panel{left:12px;right:12px;bottom:12px;width:auto}.minddo-flow-toggle{right:12px;bottom:12px}}";
    document.head.appendChild(style);
  }

  function renderPanelHTML(t, current, stage, currentPage) {
    var pages = t.pages || {};
    var stageIdx = STAGE_ORDER.indexOf(stage);
    var segs = STAGE_ORDER.slice(1).map(function (_, i) {
      return "<div class='seg" + (i < stageIdx ? " done" : "") + "'></div>";
    }).join("");

    var linkRow = function (list) {
      return list.map(function (href) {
        var label = pages[href] || href;
        var cls = href === currentPage ? " current" : "";
        return "<a class='minddo-flow-link" + cls + "' href='" + href + "'>" + label + "</a>";
      }).join("");
    };

    var nextPage = getNextPage(stage);
    var nextLabel = pages[nextPage] || nextPage;

    return (
      "<div class='minddo-flow-head'>" +
      "<h3>" + t.title + "</h3>" +
      "<button type='button' class='minddo-flow-close' data-flow-action='collapse' aria-label='Collapse'>×</button>" +
      "</div>" +
      "<p class='desc'>" + t.desc + "</p>" +
      "<div class='minddo-flow-progress'>" + segs + "</div>" +
      "<div class='minddo-flow-kv'>" +
      "<strong>" + t.student + "</strong><span>" + (current.studentName || current.name || t.noStudent) + "</span>" +
      "<strong>" + t.stage + "</strong><span>" + ((t.stages && t.stages[stage]) || stage) + "</span>" +
      "<strong>" + t.next + "</strong><span>" + nextLabel + "</span>" +
      "</div>" +
      "<div class='minddo-flow-row'>" +
      "<a class='minddo-flow-link primary' href='" + nextPage + "' data-flow-next='1'>→ " + t.goNext + "</a>" +
      "<button type='button' class='minddo-flow-btn primary' data-flow-action='seed'>" + t.seed + "</button>" +
      "<button type='button' class='minddo-flow-btn' data-flow-action='payment'>" + t.payment + "</button>" +
      "<button type='button' class='minddo-flow-btn danger' data-flow-action='reset'>" + t.reset + "</button>" +
      "</div>" +
      "<div class='minddo-flow-group'>" +
      "<div class='minddo-flow-label'>" + t.studentJourney + "</div>" +
      "<div class='minddo-flow-row'>" + linkRow(PAGE_GROUPS.journey) + "</div>" +
      "</div>" +
      "<div class='minddo-flow-group'>" +
      "<div class='minddo-flow-label'>" + t.ops + "</div>" +
      "<div class='minddo-flow-row'>" + linkRow(PAGE_GROUPS.ops) + "</div>" +
      "</div>" +
      "<div class='minddo-flow-group'>" +
      "<div class='minddo-flow-label'>" + t.info + "</div>" +
      "<div class='minddo-flow-row'>" + linkRow(PAGE_GROUPS.info) + "</div>" +
      "</div>"
    );
  }

  function renderPanel() {
    var panel = document.getElementById("minddoFlowPanel");
    if (!panel) return;
    var lang = currentLang();
    var t = COPY[lang] || COPY["zh-CN"];
    var snapshot = getSnapshot();
    var current = snapshot.currentStudent || {};
    var stage = getStage(snapshot);
    panel.innerHTML = renderPanelHTML(t, current, stage, currentPageName());
  }

  function setCollapsed(collapsed) {
    try { localStorage.setItem("minddo_flow_collapsed", collapsed ? "1" : "0"); } catch (_) {}
    var panel = document.getElementById("minddoFlowPanel");
    var toggle = document.getElementById("minddoFlowToggle");
    if (panel) panel.style.display = collapsed ? "none" : "block";
    if (toggle) toggle.style.display = collapsed ? "flex" : "none";
  }

  function injectPanel() {
    if (!document.body || document.getElementById("minddoFlowPanel")) return;
    injectPanelStyles();

    var toggle = document.createElement("button");
    toggle.type = "button";
    toggle.id = "minddoFlowToggle";
    toggle.className = "minddo-flow-toggle";
    toggle.setAttribute("aria-label", "Flow Test");
    toggle.innerHTML = "⚡<span class='dot'></span>";
    toggle.addEventListener("click", function () { setCollapsed(false); });
    document.body.appendChild(toggle);

    var panel = document.createElement("aside");
    panel.id = "minddoFlowPanel";
    panel.className = "minddo-flow-panel";
    document.body.appendChild(panel);

    renderPanel();

    panel.addEventListener("click", function (e) {
      var actionEl = e.target && e.target.closest && e.target.closest("[data-flow-action]");
      if (!actionEl) return;
      var action = actionEl.getAttribute("data-flow-action");
      if (action === "collapse") {
        e.preventDefault();
        setCollapsed(true);
        return;
      }
      if (action === "seed") seedDemoData();
      else if (action === "reset") clearFlowData();
      else if (action === "payment") mockPaymentForCurrentStudent();
      else return;
      renderPanel();
      var tgl = document.getElementById("minddoFlowToggle");
      if (tgl) tgl.classList.toggle("has-data", !!getCurrentStudent());
    });

    var hasData = !!getCurrentStudent();
    toggle.classList.toggle("has-data", hasData);

    var savedCollapsed = null;
    try { savedCollapsed = localStorage.getItem("minddo_flow_collapsed"); } catch (_) {}
    setCollapsed(savedCollapsed === "1");

    document.querySelectorAll("[data-set-lang]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        setTimeout(renderPanel, 0);
      });
    });
  }

  document.addEventListener("DOMContentLoaded", function () {
    populateCourseMeta();
    injectPanel();
  });

  window.MindDoFlow = {
    keys: KEYS,
    readJson: readJson,
    writeJson: writeJson,
    getCurrentStudent: getCurrentStudent,
    setCurrentStudent: setCurrentStudent,
    getSnapshot: getSnapshot,
    getStage: getStage,
    saveLead: saveLead,
    saveAssessment: saveAssessment,
    saveSignupUser: saveSignupUser,
    savePayment: savePayment,
    saveMembershipOrder: saveMembershipOrder,
    saveFeedback: saveFeedback,
    getScheduleRequests: getScheduleRequests,
    saveScheduleRequest: saveScheduleRequest,
    updateScheduleRequestStatus: updateScheduleRequestStatus,
    prefillTrialForm: prefillTrialForm,
    prefillSignupForm: prefillSignupForm,
    populateCourseMeta: populateCourseMeta,
    clearFlowData: clearFlowData,
    seedDemoData: seedDemoData,
    mockPaymentForCurrentStudent: mockPaymentForCurrentStudent
  };
})();
