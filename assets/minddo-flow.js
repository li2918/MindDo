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
      signup: "dashboard.html",
      payment: "course-selection.html",
      membership: "feedback.html",
      feedback: "dashboard.html"
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
      subject: "ai-course",
      subjectLabel: "AI课程",
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
      subject: "AI课程",
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

  function injectPanel() {
    if (!document.body || document.getElementById("minddoFlowPanel")) return;

    var style = document.createElement("style");
    style.textContent =
      ".minddo-flow-panel{position:fixed;right:18px;bottom:18px;z-index:99;width:min(320px,calc(100vw - 24px));padding:14px;border:1px solid rgba(151,84,21,.16);border-radius:18px;background:rgba(255,251,245,.95);box-shadow:0 18px 40px rgba(123,72,24,.16);backdrop-filter:blur(12px);font-family:'Avenir Next','Helvetica Neue','PingFang SC','Microsoft YaHei',sans-serif;color:#4f2410}" +
      ".minddo-flow-panel h3{margin:0 0 6px;font-size:15px;color:#8c3d14}" +
      ".minddo-flow-panel p{margin:0;font-size:12px;line-height:1.6;color:#8b6e58}" +
      ".minddo-flow-row{display:flex;flex-wrap:wrap;gap:8px;margin-top:10px}" +
      ".minddo-flow-btn,.minddo-flow-link{display:inline-flex;align-items:center;justify-content:center;padding:8px 12px;border-radius:999px;border:1px solid rgba(151,84,21,.14);background:rgba(255,247,236,.96);color:#8c3d14;text-decoration:none;font-size:12px;cursor:pointer}" +
      ".minddo-flow-btn.primary,.minddo-flow-link.primary{background:linear-gradient(135deg,#fff6de,#ffd977)}" +
      ".minddo-flow-kv{display:grid;grid-template-columns:88px 1fr;gap:6px;margin-top:10px;font-size:12px}" +
      ".minddo-flow-kv strong{color:#8c3d14}" +
      "@media (max-width:760px){.minddo-flow-panel{left:12px;right:12px;bottom:12px;width:auto}}";
    document.head.appendChild(style);

    var panel = document.createElement("aside");
    panel.id = "minddoFlowPanel";
    panel.className = "minddo-flow-panel";

    var snapshot = getSnapshot();
    var current = snapshot.currentStudent || {};
    var stage = getStage(snapshot);
    var lang = currentLang();
    var copy = {
      "zh-CN": {
        title: "流程测试面板",
        desc: "使用 dummy data 测试完整流程，无需后端或数据库配置。",
        student: "学生",
        noStudent: "当前没有激活学生",
        stage: "阶段",
        next: "下一步",
        seed: "填充示例数据",
        payment: "模拟支付",
        reset: "重置数据",
        goNext: "前往下一步",
        studentPage: "学生页",
        dashboard: "看板",
        stages: {
          start: "开始",
          trial: "试课",
          assessment: "评估",
          signup: "注册",
          payment: "支付",
          membership: "排课",
          feedback: "反馈"
        }
      },
      en: {
        title: "Flow Test Panel",
        desc: "Use dummy data to test the full flow without backend or database setup.",
        student: "Student",
        noStudent: "No active student",
        stage: "Stage",
        next: "Next",
        seed: "Seed Demo",
        payment: "Mock Payment",
        reset: "Reset",
        goNext: "Go Next",
        studentPage: "Student",
        dashboard: "Dashboard",
        stages: {
          start: "Start",
          trial: "Trial",
          assessment: "Assessment",
          signup: "Signup",
          payment: "Payment",
          membership: "Scheduling",
          feedback: "Feedback"
        }
      }
    };
    var t = copy[lang] || copy["zh-CN"];

    panel.innerHTML =
      "<h3>" + t.title + "</h3>" +
      "<p>" + t.desc + "</p>" +
      "<div class='minddo-flow-kv'>" +
      "<strong>" + t.student + "</strong><span>" + (current.studentName || current.name || t.noStudent) + "</span>" +
      "<strong>" + t.stage + "</strong><span>" + ((t.stages && t.stages[stage]) || stage) + "</span>" +
      "<strong>" + t.next + "</strong><span>" + getNextPage(stage) + "</span>" +
      "</div>" +
      "<div class='minddo-flow-row'>" +
      "<button type='button' class='minddo-flow-btn primary' data-flow-action='seed'>" + t.seed + "</button>" +
      "<button type='button' class='minddo-flow-btn' data-flow-action='payment'>" + t.payment + "</button>" +
      "<button type='button' class='minddo-flow-btn' data-flow-action='reset'>" + t.reset + "</button>" +
      "</div>" +
      "<div class='minddo-flow-row'>" +
      "<a class='minddo-flow-link primary' href='" + getNextPage(stage) + "'>" + t.goNext + "</a>" +
      "<a class='minddo-flow-link' href='student-account.html'>" + t.studentPage + "</a>" +
      "<a class='minddo-flow-link' href='dashboard.html'>" + t.dashboard + "</a>" +
      "</div>";

    panel.addEventListener("click", function (e) {
      var action = e.target && e.target.getAttribute("data-flow-action");
      if (!action) return;
      if (action === "seed") seedDemoData();
      if (action === "reset") clearFlowData();
      if (action === "payment") mockPaymentForCurrentStudent();
      window.location.reload();
    });

    document.body.appendChild(panel);
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
