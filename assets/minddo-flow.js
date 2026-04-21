(function () {
  var KEYS = {
    currentStudent: "minddo_current_student",
    signups: "minddo_signup_users",
    assessments: "minddo_assessments",
    leads: "minddo_trial_leads",
    payments: "minddo_payments",
    feedback: "minddo_feedback",
    memberships: "minddo_membership_orders",
    requests: "minddo_schedule_requests",
    offerings: "minddo_class_offerings",
    studentLevels: "minddo_student_levels",
    invites: "minddo_account_invites",
    evaluations: "minddo_trial_evaluations",
    completions: "minddo_trial_completions"
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

  function latestByDate(list, matcher, dateKey) {
    var key = dateKey || "createdAt";
    return list
      .filter(function (item) { return typeof matcher === "function" ? matcher(item) : true; })
      .sort(function (a, b) {
        return new Date(b[key] || b.createdAt || 0) - new Date(a[key] || a.createdAt || 0);
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

  // Reconcile a studentId by scanning prior records (leads, signups, assessments,
  // completions, evaluations, invites) for the same email. Returns the first
  // matching studentId found, or "" if none. This prevents a fresh-browser
  // signup-via-invite from creating a new studentId that orphans the ops
  // records keyed to the lead's original studentId.
  function findStudentIdByEmail(email) {
    var target = norm(email);
    if (!target) return "";
    var sources = [
      readJson(KEYS.leads, []),
      readJson(KEYS.signups, []),
      readJson(KEYS.assessments, []),
      readJson(KEYS.completions, []),
      readJson(KEYS.evaluations, []),
      readJson(KEYS.invites, [])
    ];
    for (var i = 0; i < sources.length; i++) {
      var list = sources[i];
      for (var j = 0; j < list.length; j++) {
        var rec = list[j];
        if (rec && norm(rec.email) === target && rec.studentId) return rec.studentId;
      }
    }
    return "";
  }

  function setCurrentStudent(student) {
    if (!student) return null;
    var current = getCurrentStudent() || {};
    var merged = Object.assign({}, current, student);
    if (!merged.email && merged.phone) merged.email = demoEmailFromPhone(merged.phone);
    if (!merged.studentId) {
      merged.studentId = current.studentId
        || findStudentIdByEmail(merged.email)
        || createStudentId();
    }
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
      // Preserve the existing record's studentId if the incoming payload
      // arrives without one (or with a freshly-minted one that would
      // overwrite the original linkage).
      var existing = list[index];
      var keepStudentId = existing && existing.studentId ? existing.studentId : payload.studentId;
      list[index] = Object.assign({}, existing, payload, { studentId: keepStudentId });
      payload = list[index];
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
    var id = String(current.studentId || "");
    // Matcher: email/name-based for records without a studentId; email or
    // studentId for records written post-trial (completions/evaluations/invites).
    var match = function (item) {
      if (!item) return false;
      var itemEmail = norm(item.email);
      var itemName = norm(item.studentName || item.name);
      return (email && itemEmail === email) || (name && itemName === name);
    };
    var matchOps = function (item) {
      if (!item) return false;
      var itemEmail = norm(item.email);
      var itemId = String(item.studentId || "");
      return (email && itemEmail === email) || (id && itemId === id);
    };

    return {
      currentStudent: current,
      lead: latestByDate(readJson(KEYS.leads, []), match),
      assessment: latestByDate(readJson(KEYS.assessments, []), match),
      signup: latestByDate(readJson(KEYS.signups, []), match),
      payment: latestByDate(readJson(KEYS.payments, []), match),
      membership: latestByDate(readJson(KEYS.memberships, []), match),
      feedback: latestByDate(readJson(KEYS.feedback, []), match),
      completion: latestByDate(readJson(KEYS.completions, []), matchOps, "completedAt"),
      evaluation: latestByDate(readJson(KEYS.evaluations, []), matchOps, "evaluatedAt"),
      invite: latestByDate(readJson(KEYS.invites, []), matchOps, "sentAt")
    };
  }

  function getStage(snapshot) {
    var s = snapshot || getSnapshot();
    if (s.feedback) return "feedback";
    if (s.membership) return "membership";
    if (s.payment) return "payment";
    // Flow order: trial → trial_complete → trial_evaluated → signup → assessment → course-selection.
    // Assessment is later than signup in the path, so it takes priority when detected.
    if (s.assessment) return "assessment";
    if (s.signup) return "signup";
    if (s.evaluation) return "trial_evaluated";
    if (s.completion) return "trial_complete";
    if (s.lead) return "trial";
    return "start";
  }

  function getNextPage(stage) {
    var map = {
      start: "trial.html",
      trial: "signup.html",
      trial_complete: "signup.html",
      trial_evaluated: "signup.html",
      signup: "assessment.html",
      assessment: "course-selection.html",
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

  // Seeded class catalog — simulates the admin-configured offerings that students
  // pick from. In a real deployment this would come from the backend.
  var CLASS_OFFERINGS = [
    { id: "ai-fund-mon-16",  courseName: { zh: "AI 启蒙入门",   en: "AI Fundamentals" },  level: { zh: "入门", en: "Beginner" },     teacher: "Dr. Sarah Chen",  classMode: "small", dayKey: "mon", weekday: { zh: "周一", en: "Mon" }, slotKey: "t16", timeSlot: "16:00 – 17:00", seatsTotal: 6, seatsTaken: 3 },
    { id: "ai-fund-wed-16",  courseName: { zh: "AI 启蒙入门",   en: "AI Fundamentals" },  level: { zh: "入门", en: "Beginner" },     teacher: "Dr. Sarah Chen",  classMode: "small", dayKey: "wed", weekday: { zh: "周三", en: "Wed" }, slotKey: "t16", timeSlot: "16:00 – 17:00", seatsTotal: 6, seatsTaken: 5 },
    { id: "ai-create-tue-17",courseName: { zh: "AI 创意工坊",   en: "AI Creative Studio" },level: { zh: "中级", en: "Intermediate" }, teacher: "Jenny Lin",       classMode: "small", dayKey: "tue", weekday: { zh: "周二", en: "Tue" }, slotKey: "t17", timeSlot: "17:00 – 18:00", seatsTotal: 6, seatsTaken: 4 },
    { id: "ai-create-thu-17",courseName: { zh: "AI 创意工坊",   en: "AI Creative Studio" },level: { zh: "中级", en: "Intermediate" }, teacher: "Jenny Lin",       classMode: "small", dayKey: "thu", weekday: { zh: "周四", en: "Thu" }, slotKey: "t17", timeSlot: "17:00 – 18:00", seatsTotal: 6, seatsTaken: 2 },
    { id: "ai-prog-mon-18",  courseName: { zh: "AI 编程进阶",   en: "AI Programming" },   level: { zh: "进阶", en: "Advanced" },    teacher: "Marcus Johnson",  classMode: "small", dayKey: "mon", weekday: { zh: "周一", en: "Mon" }, slotKey: "t18", timeSlot: "18:00 – 19:00", seatsTotal: 6, seatsTaken: 6 },
    { id: "ai-prog-fri-17",  courseName: { zh: "AI 编程进阶",   en: "AI Programming" },   level: { zh: "进阶", en: "Advanced" },    teacher: "Marcus Johnson",  classMode: "small", dayKey: "fri", weekday: { zh: "周五", en: "Fri" }, slotKey: "t17", timeSlot: "17:00 – 18:00", seatsTotal: 6, seatsTaken: 3 },
    { id: "ai-comp-wed-18",  courseName: { zh: "AI 竞赛冲刺",   en: "AI Competition" },   level: { zh: "竞赛", en: "Competition" },teacher: "David Park",      classMode: "1v1",   dayKey: "wed", weekday: { zh: "周三", en: "Wed" }, slotKey: "t18", timeSlot: "18:00 – 19:00", seatsTotal: 1, seatsTaken: 0 },
    { id: "ai-fund-sat-10",  courseName: { zh: "AI 启蒙入门",   en: "AI Fundamentals" },  level: { zh: "入门", en: "Beginner" },     teacher: "Dr. Sarah Chen",  classMode: "small", dayKey: "sat", weekday: { zh: "周六", en: "Sat" }, slotKey: "t10", timeSlot: "10:00 – 11:00", seatsTotal: 6, seatsTaken: 4 },
    { id: "ai-create-sat-13",courseName: { zh: "AI 创意工坊",   en: "AI Creative Studio" },level: { zh: "中级", en: "Intermediate" }, teacher: "Jenny Lin",       classMode: "small", dayKey: "sat", weekday: { zh: "周六", en: "Sat" }, slotKey: "t13", timeSlot: "13:00 – 14:00", seatsTotal: 6, seatsTaken: 1 },
    { id: "ai-project-sat-15",courseName:{ zh: "AI 项目营",     en: "AI Project Camp" },  level: { zh: "项目营", en: "Project Camp" },teacher: "David Park",    classMode: "small", dayKey: "sat", weekday: { zh: "周六", en: "Sat" }, slotKey: "t15", timeSlot: "15:00 – 16:00", seatsTotal: 8, seatsTaken: 5 },
    { id: "ai-prog-sun-10",  courseName: { zh: "AI 编程进阶",   en: "AI Programming" },   level: { zh: "进阶", en: "Advanced" },    teacher: "Marcus Johnson",  classMode: "small", dayKey: "sun", weekday: { zh: "周日", en: "Sun" }, slotKey: "t10", timeSlot: "10:00 – 11:00", seatsTotal: 6, seatsTaken: 2 },
    { id: "ai-create-sun-14",courseName: { zh: "AI 创意工坊",   en: "AI Creative Studio" },level: { zh: "中级", en: "Intermediate" }, teacher: "Jenny Lin",       classMode: "small", dayKey: "sun", weekday: { zh: "周日", en: "Sun" }, slotKey: "t14", timeSlot: "14:00 – 15:00", seatsTotal: 6, seatsTaken: 3 }
  ];

  function getClassOfferings() {
    var override = readJson(KEYS.offerings, null);
    if (Array.isArray(override) && override.length) return override.slice();
    return CLASS_OFFERINGS.slice();
  }
  function saveClassOfferings(list) {
    if (!Array.isArray(list)) return null;
    writeJson(KEYS.offerings, list);
    return list;
  }
  function resetClassOfferings() {
    localStorage.removeItem(KEYS.offerings);
    return CLASS_OFFERINGS.slice();
  }
  function getDefaultClassOfferings() {
    return CLASS_OFFERINGS.slice();
  }
  function getOfferingById(id) {
    var all = getClassOfferings();
    for (var i = 0; i < all.length; i++) {
      if (all[i].id === id) return all[i];
    }
    return null;
  }

  // Level override map: { studentId: "Beginner" | "Intermediate" | ... }.
  // Falls back to the latest assessment.level if no override is set.
  var LEVEL_CANON = ["Beginner", "Intermediate", "Advanced", "Competition", "Project Camp"];
  var LEVEL_ZH = { Beginner: "入门", Intermediate: "中级", Advanced: "进阶", Competition: "竞赛", "Project Camp": "项目营" };
  function getLevelCanon() { return LEVEL_CANON.slice(); }
  function canonicalLevel(value) {
    if (!value) return "";
    var s = String(value).trim();
    for (var i = 0; i < LEVEL_CANON.length; i++) {
      if (s.toLowerCase() === LEVEL_CANON[i].toLowerCase()) return LEVEL_CANON[i];
    }
    // Map from Chinese label back to canonical EN
    for (var k in LEVEL_ZH) {
      if (LEVEL_ZH[k] === s) return k;
    }
    return s;
  }
  function getStudentLevelMap() {
    var map = readJson(KEYS.studentLevels, {});
    return (map && typeof map === "object") ? map : {};
  }
  function getStudentLevel(studentId) {
    if (!studentId) return "";
    var map = getStudentLevelMap();
    if (map[studentId]) return canonicalLevel(map[studentId]);
    // Fallback: latest assessment for this studentId
    var assessments = readJson(KEYS.assessments, []);
    var match = latestByDate(assessments, function (a) {
      return a && String(a.studentId || "") === String(studentId);
    });
    return match && match.level ? canonicalLevel(match.level) : "";
  }
  function setStudentLevel(studentId, level) {
    if (!studentId) return null;
    var map = getStudentLevelMap();
    if (level) map[studentId] = canonicalLevel(level);
    else delete map[studentId];
    writeJson(KEYS.studentLevels, map);
    return map[studentId] || "";
  }

  // Account-invite bookkeeping: records one invite per email. Returns the
  // stored record so UIs can show "Sent at ..." state.
  function getAccountInvites() {
    return readJson(KEYS.invites, []);
  }
  function getAccountInviteFor(email) {
    var target = norm(email);
    if (!target) return null;
    var list = getAccountInvites();
    return list.filter(function (r) { return norm(r.email) === target; })
      .sort(function (a, b) { return new Date(b.sentAt || 0) - new Date(a.sentAt || 0); })[0] || null;
  }
  function sendAccountInvite(lead) {
    if (!lead || !lead.email) return null;
    var origin = "";
    try { origin = window.location.origin + window.location.pathname.replace(/[^\/]+$/, ""); } catch (_) {}
    var signupUrl = (origin || "") + "signup.html?email=" + encodeURIComponent(lead.email) +
      (lead.studentName ? "&name=" + encodeURIComponent(lead.studentName) : "");
    // If an evaluation already exists for this lead, weave the assigned level
    // and ops notes into the email body so the parent sees the path forward.
    var evalRec = getTrialEvaluationFor(lead);
    var levelZhMap = { Beginner: "入门", Intermediate: "中级", Advanced: "进阶", Competition: "竞赛", "Project Camp": "项目营" };
    var evalBlockZh = evalRec
      ? "\n\n校区评估结果：" + (levelZhMap[evalRec.level] || evalRec.level) + " 等级" +
        (evalRec.notes ? "\n老师备注：" + evalRec.notes : "")
      : "";
    var evalBlockEn = evalRec
      ? "\n\nAssigned level: " + evalRec.level +
        (evalRec.notes ? "\nTeacher notes: " + evalRec.notes : "")
      : "";
    var subjectZh = "MindDo · 为 " + (lead.studentName || "学员") + " 创建学员账户";
    var subjectEn = "MindDo · Create your MindDo account";
    var bodyZh = "您好 " + (lead.parentName || lead.studentName || "家长") + "，\n\n" +
      "感谢您完成 MindDo 的试课体验。请通过下方链接为 " + (lead.studentName || "学员") + " 创建正式学员账户：\n\n" +
      signupUrl + evalBlockZh +
      "\n\n开始正式的 AI 学习之旅。\nMindDo 团队";
    var bodyEn = "Hi " + (lead.parentName || lead.studentName || "there") + ",\n\n" +
      "Thanks for joining the trial. Please use the link below to create your MindDo student account:\n\n" +
      signupUrl + evalBlockEn +
      "\n\nSee you in class.\n— MindDo Team";
    var mail = sendMockEmail({
      to: lead.email,
      toName: lead.parentName || lead.studentName || "",
      studentName: lead.studentName || "",
      studentId: lead.studentId || "",
      subject: subjectZh + " / " + subjectEn,
      bodyZh: bodyZh,
      bodyEn: bodyEn,
      template: "account_invite",
      signupUrl: signupUrl
    });
    var record = {
      email: lead.email,
      studentName: lead.studentName || "",
      studentId: lead.studentId || "",
      mailId: mail.id,
      signupUrl: signupUrl,
      sentAt: mail.sentAt
    };
    var list = getAccountInvites();
    list.push(record);
    writeJson(KEYS.invites, list);
    return record;
  }

  // Trial evaluations: ops records that the trial was assessed and assigns a
  // post-trial level. One evaluation per email/studentId; re-submitting
  // overwrites the prior record.
  function getTrialEvaluations() {
    return readJson(KEYS.evaluations, []);
  }
  function getTrialEvaluationFor(lead) {
    if (!lead) return null;
    var list = getTrialEvaluations();
    var email = norm(lead.email);
    var id = String(lead.studentId || "");
    // OR-match is intentional: records may be written keyed to the lead's
    // original studentId, while the caller may pass the current student's ID
    // (different if the parent signed up in a fresh session). Email-match
    // covers that gap; studentId-match covers the happy path.
    return list.filter(function (r) {
      return (email && norm(r.email) === email) || (id && String(r.studentId || "") === id);
    }).sort(function (a, b) {
      return new Date(b.evaluatedAt || 0) - new Date(a.evaluatedAt || 0);
    })[0] || null;
  }
  function saveTrialEvaluation(lead, payload) {
    if (!lead || !payload) return null;
    var level = canonicalLevel(payload.level);
    if (!level) return null;
    var record = {
      email: lead.email || "",
      studentName: lead.studentName || "",
      studentId: lead.studentId || "",
      level: level,
      notes: payload.notes || "",
      evaluator: payload.evaluator || "",
      evaluatedAt: new Date().toISOString()
    };
    var list = getTrialEvaluations();
    var email = norm(record.email);
    var id = String(record.studentId || "");
    var idx = list.findIndex(function (r) {
      return (email && norm(r.email) === email) || (id && String(r.studentId || "") === id);
    });
    if (idx >= 0) list[idx] = record;
    else list.push(record);
    writeJson(KEYS.evaluations, list);
    if (record.studentId) setStudentLevel(record.studentId, record.level);
    return record;
  }

  // Trial completion: ops-side "mark trial done" marker, independent from
  // parent-submitted feedback. One record per email/studentId.
  function getTrialCompletions() {
    return readJson(KEYS.completions, []);
  }
  function getTrialCompletionFor(lead) {
    if (!lead) return null;
    var list = getTrialCompletions();
    var email = norm(lead.email);
    var id = String(lead.studentId || "");
    return list.filter(function (r) {
      return (email && norm(r.email) === email) || (id && String(r.studentId || "") === id);
    }).sort(function (a, b) {
      return new Date(b.completedAt || 0) - new Date(a.completedAt || 0);
    })[0] || null;
  }
  function markTrialComplete(lead, payload) {
    if (!lead) return null;
    payload = payload || {};
    var record = {
      email: lead.email || "",
      studentName: lead.studentName || "",
      studentId: lead.studentId || "",
      operator: payload.operator || "",
      notes: payload.notes || "",
      completedAt: new Date().toISOString()
    };
    var list = getTrialCompletions();
    var email = norm(record.email);
    var id = String(record.studentId || "");
    var idx = list.findIndex(function (r) {
      return (email && norm(r.email) === email) || (id && String(r.studentId || "") === id);
    });
    if (idx >= 0) list[idx] = record;
    else list.push(record);
    writeJson(KEYS.completions, list);
    return record;
  }
  function unmarkTrialComplete(lead) {
    if (!lead) return false;
    var list = getTrialCompletions();
    var email = norm(lead.email);
    var id = String(lead.studentId || "");
    var next = list.filter(function (r) {
      return !((email && norm(r.email) === email) || (id && String(r.studentId || "") === id));
    });
    writeJson(KEYS.completions, next);
    return next.length !== list.length;
  }

  // Simulated email outbox. In a real deployment this would be an API call to a
  // transactional mailer (SendGrid / Postmark / etc). Here we just persist so the
  // flow is transparent: the parent sees what would be mailed.
  function sendMockEmail(message) {
    var record = Object.assign({}, message, {
      id: "MAIL-" + Date.now().toString(36).toUpperCase(),
      sentAt: new Date().toISOString(),
      status: "queued"
    });
    var list = readJson("minddo_email_outbox", []);
    list.push(record);
    writeJson("minddo_email_outbox", list);
    return record;
  }
  function getEmailOutbox() {
    return readJson("minddo_email_outbox", []);
  }

  // Auth gate: redirect to login.html when no current student. Call from page scripts.
  function requireLogin(nextPage, reason) {
    var cur = getCurrentStudent();
    if (cur && cur.email) return true;
    var query = [];
    if (nextPage) query.push("next=" + encodeURIComponent(nextPage));
    if (reason) query.push("reason=" + encodeURIComponent(reason));
    var qs = query.length ? "?" + query.join("&") : "";
    window.location.replace("login.html" + qs);
    return false;
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
      campus: "irvine",
      campusLabel: "加州 · 尔湾校区",
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
      sessions: [
        { offeringId: "ai-fund-mon-16", courseName: "AI 启蒙入门", courseNameZh: "AI 启蒙入门", courseNameEn: "AI Fundamentals", level: "入门", teacher: "Dr. Sarah Chen", classMode: "small", dayKey: "mon", weekday: "周一", weekdayZh: "周一", weekdayEn: "Mon", slotKey: "t16", slotLabel: "16:00 – 17:00", timeSlot: "16:00 – 17:00" },
        { offeringId: "ai-fund-wed-16", courseName: "AI 启蒙入门", courseNameZh: "AI 启蒙入门", courseNameEn: "AI Fundamentals", level: "入门", teacher: "Dr. Sarah Chen", classMode: "small", dayKey: "wed", weekday: "周三", weekdayZh: "周三", weekdayEn: "Wed", slotKey: "t16", slotLabel: "16:00 – 17:00", timeSlot: "16:00 – 17:00" }
      ],
      weekday: "周一",
      timeSlot: "16:00 – 17:00",
      totalMonthly: "$369.00",
      createdAt: daysAgo(2)
    }]);

    writeJson(KEYS.feedback, [{
      studentName: student.studentName,
      email: student.email,
      studentId: student.studentId,
      trialDate: now.toISOString().slice(0, 10),
      trialTime: "18:30",
      campus: "加州 · 尔湾校区",
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


  document.addEventListener("DOMContentLoaded", function () {
    populateCourseMeta();
  });

  window.MindDoFlow = {
    keys: KEYS,
    readJson: readJson,
    writeJson: writeJson,
    getCurrentStudent: getCurrentStudent,
    setCurrentStudent: setCurrentStudent,
    findStudentIdByEmail: findStudentIdByEmail,
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
    mockPaymentForCurrentStudent: mockPaymentForCurrentStudent,
    getClassOfferings: getClassOfferings,
    saveClassOfferings: saveClassOfferings,
    resetClassOfferings: resetClassOfferings,
    getDefaultClassOfferings: getDefaultClassOfferings,
    getOfferingById: getOfferingById,
    getLevelCanon: getLevelCanon,
    getStudentLevel: getStudentLevel,
    setStudentLevel: setStudentLevel,
    canonicalLevel: canonicalLevel,
    requireLogin: requireLogin,
    sendMockEmail: sendMockEmail,
    getEmailOutbox: getEmailOutbox,
    sendAccountInvite: sendAccountInvite,
    getAccountInviteFor: getAccountInviteFor,
    getAccountInvites: getAccountInvites,
    saveTrialEvaluation: saveTrialEvaluation,
    getTrialEvaluationFor: getTrialEvaluationFor,
    getTrialEvaluations: getTrialEvaluations,
    markTrialComplete: markTrialComplete,
    unmarkTrialComplete: unmarkTrialComplete,
    getTrialCompletionFor: getTrialCompletionFor,
    getTrialCompletions: getTrialCompletions
  };
})();
