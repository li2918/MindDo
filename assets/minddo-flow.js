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
    completions: "minddo_trial_completions",
    families: "minddo_families",
    students: "minddo_students",
    guardians: "minddo_guardians",
    accounts: "minddo_accounts",
    inviteTokens: "minddo_invite_tokens",
    trialSlots: "minddo_trial_slots",
    portfolio: "minddo_portfolio"
  };

  // Role constants for the new multi-account model. A single family has one
  // primary guardian (the one that registered), optionally a second guardian,
  // and 1..N students each with their own learning-system login.
  var ROLES = {
    guardianPrimary: "guardian_primary",
    guardianSecondary: "guardian_secondary",
    student: "student"
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
    // Strip undefined values from the patch before merging — otherwise
    // Object.assign will overwrite existing fields with undefined. This
    // matters for callers like savePayment that pass `{ email: payment.email }`
    // where payment.email may be unset; without this filter that wipes
    // currentStudent.email and breaks downstream account/snapshot lookups.
    var patch = {};
    Object.keys(student).forEach(function (k) {
      if (student[k] !== undefined) patch[k] = student[k];
    });
    var merged = Object.assign({}, current, patch);
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

    // Per-student matcher: when both the active student and the record have
    // a studentId, that match is authoritative — different children in the
    // same family share an email but their studentId differs. Falling back
    // to email/name only when the record has no studentId (legacy rows).
    var matchByStudent = function (item) {
      if (!item) return false;
      var itemId = String(item.studentId || "");
      if (id && itemId) return itemId === id;
      var itemEmail = norm(item.email);
      var itemName = norm(item.studentName || item.name);
      return (email && itemEmail === email) || (name && itemName === name);
    };
    // Per-parent matcher: signup records are one-per-parent, so match the
    // family by email (or name as legacy fallback).
    var matchByParent = function (item) {
      if (!item) return false;
      var itemEmail = norm(item.email);
      var itemName = norm(item.studentName || item.name);
      return (email && itemEmail === email) || (name && itemName === name);
    };

    return {
      currentStudent: current,
      lead: latestByDate(readJson(KEYS.leads, []), matchByStudent),
      assessment: latestByDate(readJson(KEYS.assessments, []), matchByStudent),
      signup: latestByDate(readJson(KEYS.signups, []), matchByParent),
      payment: latestByDate(readJson(KEYS.payments, []), matchByStudent),
      membership: latestByDate(readJson(KEYS.memberships, []), matchByStudent),
      feedback: latestByDate(readJson(KEYS.feedback, []), matchByStudent),
      completion: latestByDate(readJson(KEYS.completions, []), matchByStudent, "completedAt"),
      evaluation: latestByDate(readJson(KEYS.evaluations, []), matchByStudent, "evaluatedAt"),
      invite: latestByDate(readJson(KEYS.invites, []), matchByStudent, "sentAt")
    };
  }

  // Snapshot scoped to a specific studentId — used by the family overview
  // on student-account so each child card can show its own stage without
  // switching the active-student pointer. Matches records on studentId and
  // (if provided) a fallback email for legacy rows that predate studentId.
  function getSnapshotForStudent(studentId, fallbackEmail) {
    var id = String(studentId || "");
    var email = norm(fallbackEmail);
    // Per-student records: studentId match is authoritative when both sides
    // carry one. Email is only used as a fallback for legacy rows that
    // don't have a studentId. (Without this rule, sibling children sharing
    // a parent email all match each other's records.)
    var matchByStudent = function (item) {
      if (!item) return false;
      var itemId = String(item.studentId || "");
      if (id && itemId) return itemId === id;
      var itemEmail = norm(item.email);
      return email && itemEmail === email;
    };
    // Signup is parent-keyed — one signup per family — so match by email.
    var matchByParent = function (item) {
      if (!item) return false;
      var itemEmail = norm(item.email);
      return email && itemEmail === email;
    };
    var student = findStudentById(id) || {};
    return {
      currentStudent: {
        studentId: id,
        studentName: student.name || "",
        name: student.name || "",
        grade: student.grade || "",
        email: fallbackEmail || ""
      },
      lead: latestByDate(readJson(KEYS.leads, []), matchByStudent),
      assessment: latestByDate(readJson(KEYS.assessments, []), matchByStudent),
      signup: latestByDate(readJson(KEYS.signups, []), matchByParent),
      payment: latestByDate(readJson(KEYS.payments, []), matchByStudent),
      membership: latestByDate(readJson(KEYS.memberships, []), matchByStudent),
      feedback: latestByDate(readJson(KEYS.feedback, []), matchByStudent),
      completion: latestByDate(readJson(KEYS.completions, []), matchByStudent, "completedAt"),
      evaluation: latestByDate(readJson(KEYS.evaluations, []), matchByStudent, "evaluatedAt"),
      invite: latestByDate(readJson(KEYS.invites, []), matchByStudent, "sentAt")
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
    // If the caller passes an explicit studentId (e.g. primary guardian
    // booking a trial for a specific child via ?sid=), honor it — don't
    // inherit the current-student's sid, otherwise sibling leads collide.
    var explicitSid = data && data.studentId;
    var seed = {
      studentName: data.studentName,
      name: data.studentName,
      grade: data.grade,
      birthday: data.birthday,
      parentName: data.parentName,
      phone: data.phone,
      city: data.city,
      email: data.email || demoEmailFromPhone(data.phone)
    };
    if (explicitSid) seed.studentId = explicitSid;
    var current = setCurrentStudent(seed);

    return appendRecord(KEYS.leads, Object.assign({}, data, {
      email: current.email,
      studentId: current.studentId
    }));
  }

  // Ops-side lead profile editing. Locates a lead by its createdAt (stable
  // identifier since leads are append-only). Applies the patch, keeps
  // studentId immutable, and propagates email/name changes to every
  // downstream record that's keyed on the old email so lookups keep working.
  function updateLead(leadCreatedAt, patch) {
    if (!leadCreatedAt || !patch || typeof patch !== "object") return null;
    var list = readJson(KEYS.leads, []);
    var idx = list.findIndex(function (l) { return l && l.createdAt === leadCreatedAt; });
    if (idx < 0) return null;
    var before = list[idx];
    var after = Object.assign({}, before, patch);
    after.studentId = before.studentId; // immutable
    after.createdAt = before.createdAt;  // immutable identifier
    list[idx] = after;
    writeJson(KEYS.leads, list);

    if (patch.email && norm(patch.email) !== norm(before.email)) {
      migrateEmailAcrossRecords(before.email, after.email, before.studentId);
    }

    // Refresh current student if this lead is the active one.
    var cur = getCurrentStudent();
    if (cur && (
      (before.studentId && String(cur.studentId || "") === String(before.studentId)) ||
      (before.email && norm(cur.email) === norm(before.email))
    )) {
      setCurrentStudent({
        studentName: after.studentName,
        name: after.studentName,
        email: after.email,
        phone: after.phone,
        parentName: after.parentName,
        grade: after.grade,
        birthday: after.birthday,
        city: after.city
      });
    }

    return after;
  }

  function migrateEmailAcrossRecords(oldEmail, newEmail, studentId) {
    var oldNorm = norm(oldEmail);
    var newNorm = norm(newEmail);
    if (!oldNorm || oldNorm === newNorm) return;
    var targets = [
      KEYS.signups, KEYS.assessments, KEYS.payments, KEYS.memberships,
      KEYS.feedback, KEYS.requests, KEYS.completions, KEYS.evaluations,
      KEYS.invites
    ];
    targets.forEach(function (key) {
      var list = readJson(key, []);
      if (!Array.isArray(list)) return;
      var changed = false;
      list.forEach(function (r) {
        if (!r) return;
        var matchStudent = studentId && String(r.studentId || "") === String(studentId);
        var matchEmail = norm(r.email) === oldNorm;
        if (matchStudent || matchEmail) {
          r.email = newEmail;
          changed = true;
        }
      });
      if (changed) writeJson(key, list);
    });
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

    var record = upsertByEmail(KEYS.signups, Object.assign({}, user, {
      studentId: current.studentId
    }));

    // Provision the new family + guardian_primary account in one shot. The
    // helper is idempotent so re-signups (e.g. completing profile setup) are
    // safe. We keep writing to signups for legacy ops surfaces.
    var account = provisionGuardianPrimary(Object.assign({}, record, {
      password: user.password,
      studentName: record.studentName || record.name
    }));
    if (account) {
      // Stash the accountId back onto the signup record for ops visibility.
      upsertByEmail(KEYS.signups, { email: record.email, accountId: account.accountId });
    }
    return record;
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

  // Student project portfolio. In a real deployment this comes from the
  // curriculum / classroom platform; here we just persist demo entries
  // keyed by studentId so the parent hub has something to render.
  function getPortfolioForStudent(studentId) {
    if (!studentId) return [];
    return readJson(KEYS.portfolio, []).filter(function (p) {
      return p && String(p.studentId || "") === String(studentId);
    }).sort(function (a, b) {
      return new Date(b.completedAt || b.createdAt || 0) - new Date(a.completedAt || a.createdAt || 0);
    });
  }
  function savePortfolioItem(item) {
    if (!item || !item.studentId) return null;
    var record = Object.assign({
      createdAt: new Date().toISOString()
    }, item);
    return appendRecord(KEYS.portfolio, record);
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
    if (form.parentName && !form.parentName.value) form.parentName.value = current.parentName || "";
    if (form.phone && !form.phone.value) form.phone.value = current.phone || "";
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
    // Beginner — 4 weekly slots
    { id: "ai-fund-mon-16",  courseName: { zh: "AI 启蒙入门",   en: "AI Fundamentals" },  level: { zh: "入门", en: "Beginner" },     teacher: "Dr. Sarah Chen",  classMode: "small", dayKey: "mon", weekday: { zh: "周一", en: "Mon" }, slotKey: "t16", timeSlot: "16:00 – 17:00", seatsTotal: 6, seatsTaken: 3 },
    { id: "ai-fund-wed-16",  courseName: { zh: "AI 启蒙入门",   en: "AI Fundamentals" },  level: { zh: "入门", en: "Beginner" },     teacher: "Dr. Sarah Chen",  classMode: "small", dayKey: "wed", weekday: { zh: "周三", en: "Wed" }, slotKey: "t16", timeSlot: "16:00 – 17:00", seatsTotal: 6, seatsTaken: 5 },
    { id: "ai-fund-fri-15",  courseName: { zh: "AI 启蒙入门",   en: "AI Fundamentals" },  level: { zh: "入门", en: "Beginner" },     teacher: "Dr. Sarah Chen",  classMode: "small", dayKey: "fri", weekday: { zh: "周五", en: "Fri" }, slotKey: "t15", timeSlot: "15:00 – 16:00", seatsTotal: 6, seatsTaken: 2 },
    { id: "ai-fund-sat-10",  courseName: { zh: "AI 启蒙入门",   en: "AI Fundamentals" },  level: { zh: "入门", en: "Beginner" },     teacher: "Dr. Sarah Chen",  classMode: "small", dayKey: "sat", weekday: { zh: "周六", en: "Sat" }, slotKey: "t10", timeSlot: "10:00 – 11:00", seatsTotal: 6, seatsTaken: 4 },

    // Intermediate — 4 weekly slots
    { id: "ai-create-tue-17",courseName: { zh: "AI 创意工坊",   en: "AI Creative Studio" },level: { zh: "中级", en: "Intermediate" }, teacher: "Jenny Lin",       classMode: "small", dayKey: "tue", weekday: { zh: "周二", en: "Tue" }, slotKey: "t17", timeSlot: "17:00 – 18:00", seatsTotal: 6, seatsTaken: 4 },
    { id: "ai-create-thu-17",courseName: { zh: "AI 创意工坊",   en: "AI Creative Studio" },level: { zh: "中级", en: "Intermediate" }, teacher: "Jenny Lin",       classMode: "small", dayKey: "thu", weekday: { zh: "周四", en: "Thu" }, slotKey: "t17", timeSlot: "17:00 – 18:00", seatsTotal: 6, seatsTaken: 2 },
    { id: "ai-create-sat-13",courseName: { zh: "AI 创意工坊",   en: "AI Creative Studio" },level: { zh: "中级", en: "Intermediate" }, teacher: "Jenny Lin",       classMode: "small", dayKey: "sat", weekday: { zh: "周六", en: "Sat" }, slotKey: "t13", timeSlot: "13:00 – 14:00", seatsTotal: 6, seatsTaken: 1 },
    { id: "ai-create-sun-14",courseName: { zh: "AI 创意工坊",   en: "AI Creative Studio" },level: { zh: "中级", en: "Intermediate" }, teacher: "Jenny Lin",       classMode: "small", dayKey: "sun", weekday: { zh: "周日", en: "Sun" }, slotKey: "t14", timeSlot: "14:00 – 15:00", seatsTotal: 6, seatsTaken: 3 },

    // Advanced — 4 weekly slots
    { id: "ai-prog-mon-18",  courseName: { zh: "AI 编程进阶",   en: "AI Programming" },   level: { zh: "进阶", en: "Advanced" },    teacher: "Marcus Johnson",  classMode: "small", dayKey: "mon", weekday: { zh: "周一", en: "Mon" }, slotKey: "t18", timeSlot: "18:00 – 19:00", seatsTotal: 6, seatsTaken: 6 },
    { id: "ai-prog-thu-18",  courseName: { zh: "AI 编程进阶",   en: "AI Programming" },   level: { zh: "进阶", en: "Advanced" },    teacher: "Marcus Johnson",  classMode: "small", dayKey: "thu", weekday: { zh: "周四", en: "Thu" }, slotKey: "t18", timeSlot: "18:00 – 19:00", seatsTotal: 6, seatsTaken: 1 },
    { id: "ai-prog-fri-17",  courseName: { zh: "AI 编程进阶",   en: "AI Programming" },   level: { zh: "进阶", en: "Advanced" },    teacher: "Marcus Johnson",  classMode: "small", dayKey: "fri", weekday: { zh: "周五", en: "Fri" }, slotKey: "t17", timeSlot: "17:00 – 18:00", seatsTotal: 6, seatsTaken: 3 },
    { id: "ai-prog-sun-10",  courseName: { zh: "AI 编程进阶",   en: "AI Programming" },   level: { zh: "进阶", en: "Advanced" },    teacher: "Marcus Johnson",  classMode: "small", dayKey: "sun", weekday: { zh: "周日", en: "Sun" }, slotKey: "t10", timeSlot: "10:00 – 11:00", seatsTotal: 6, seatsTaken: 2 },

    // Competition — 4 weekly slots (1-on-1 sessions)
    { id: "ai-comp-mon-19",  courseName: { zh: "AI 竞赛冲刺",   en: "AI Competition" },   level: { zh: "竞赛", en: "Competition" },teacher: "David Park",      classMode: "1v1",   dayKey: "mon", weekday: { zh: "周一", en: "Mon" }, slotKey: "t19", timeSlot: "19:00 – 20:00", seatsTotal: 1, seatsTaken: 0 },
    { id: "ai-comp-wed-18",  courseName: { zh: "AI 竞赛冲刺",   en: "AI Competition" },   level: { zh: "竞赛", en: "Competition" },teacher: "David Park",      classMode: "1v1",   dayKey: "wed", weekday: { zh: "周三", en: "Wed" }, slotKey: "t18", timeSlot: "18:00 – 19:00", seatsTotal: 1, seatsTaken: 0 },
    { id: "ai-comp-thu-19",  courseName: { zh: "AI 竞赛冲刺",   en: "AI Competition" },   level: { zh: "竞赛", en: "Competition" },teacher: "David Park",      classMode: "1v1",   dayKey: "thu", weekday: { zh: "周四", en: "Thu" }, slotKey: "t19", timeSlot: "19:00 – 20:00", seatsTotal: 1, seatsTaken: 1 },
    { id: "ai-comp-sat-16",  courseName: { zh: "AI 竞赛冲刺",   en: "AI Competition" },   level: { zh: "竞赛", en: "Competition" },teacher: "David Park",      classMode: "1v1",   dayKey: "sat", weekday: { zh: "周六", en: "Sat" }, slotKey: "t16", timeSlot: "16:00 – 17:00", seatsTotal: 1, seatsTaken: 0 },

    // Project Camp — 4 weekly slots
    { id: "ai-project-wed-19",courseName:{ zh: "AI 项目营",     en: "AI Project Camp" },  level: { zh: "项目营", en: "Project Camp" },teacher: "David Park",    classMode: "small", dayKey: "wed", weekday: { zh: "周三", en: "Wed" }, slotKey: "t19", timeSlot: "19:00 – 20:00", seatsTotal: 8, seatsTaken: 3 },
    { id: "ai-project-fri-18",courseName:{ zh: "AI 项目营",     en: "AI Project Camp" },  level: { zh: "项目营", en: "Project Camp" },teacher: "David Park",    classMode: "small", dayKey: "fri", weekday: { zh: "周五", en: "Fri" }, slotKey: "t18", timeSlot: "18:00 – 19:00", seatsTotal: 8, seatsTaken: 6 },
    { id: "ai-project-sat-15",courseName:{ zh: "AI 项目营",     en: "AI Project Camp" },  level: { zh: "项目营", en: "Project Camp" },teacher: "David Park",    classMode: "small", dayKey: "sat", weekday: { zh: "周六", en: "Sat" }, slotKey: "t15", timeSlot: "15:00 – 16:00", seatsTotal: 8, seatsTaken: 5 },
    { id: "ai-project-sun-13",courseName:{ zh: "AI 项目营",     en: "AI Project Camp" },  level: { zh: "项目营", en: "Project Camp" },teacher: "David Park",    classMode: "small", dayKey: "sun", weekday: { zh: "周日", en: "Sun" }, slotKey: "t13", timeSlot: "13:00 – 14:00", seatsTotal: 8, seatsTaken: 2 }
  ];

  function getClassOfferings() {
    var override = readJson(KEYS.offerings, null);
    if (Array.isArray(override) && override.length) return override.slice();
    return CLASS_OFFERINGS.slice();
  }

  // Competition catalog — surfaces upcoming AI / coding contests on the
  // parent hub so families know what to register for. Each entry carries
  // bilingual copy, eligible levels (canonical EN tags), the registration
  // deadline (used to compute "X days left" badges), and the actual
  // competition date. In a real deployment this would be a remote feed.
  var COMPETITION_CATALOG = [
    {
      id: "comp-summer-ai-cup-2026",
      name: { zh: "MindDo 夏季 AI 创作大赛", en: "MindDo Summer AI Creation Cup" },
      category: { zh: "创作 · 团队", en: "Creative · Team" },
      levels: ["Intermediate", "Advanced", "Project Camp"],
      summary: {
        zh: "用 AI 工具围绕「我和我的城市」主题完成一个互动作品，可以是网页、动画或小游戏。",
        en: "Build an interactive piece — webpage, animation, or game — on the theme \"My City and Me\" using AI tools."
      },
      competitionDate: "2026-06-15",
      registrationDeadline: "2026-05-30",
      prizes: {
        zh: "一等奖 $500 学习基金 + 项目展示机会；二三等奖 MindDo 学分礼包。",
        en: "1st: $500 learning grant + showcase slot; 2nd/3rd: MindDo credit bundles."
      },
      organizer: "MindDo + Code Future Foundation",
      cta: "https://example.com/comp-summer"
    },
    {
      id: "comp-noi-junior-2026",
      name: { zh: "全国青少年编程挑战 (初赛)", en: "National Youth Coding Challenge (Regional)" },
      category: { zh: "竞赛 · 个人", en: "Competition · Individual" },
      levels: ["Advanced", "Competition"],
      summary: {
        zh: "面向 8-15 岁的算法竞赛初赛，覆盖搜索、动态规划基础题型，线上 90 分钟。",
        en: "Algorithmic regional round for ages 8-15. Search + intro DP. 90 minutes online."
      },
      competitionDate: "2026-05-18",
      registrationDeadline: "2026-05-10",
      prizes: {
        zh: "前 30% 晋级全国决赛，全员获学习证书。",
        en: "Top 30% advance to nationals; all participants receive a certificate."
      },
      organizer: "Code Future Foundation",
      cta: "https://example.com/comp-noi"
    },
    {
      id: "comp-creative-spring-2026",
      name: { zh: "AI 启蒙小作家", en: "AI Junior Storyteller" },
      category: { zh: "启蒙 · 个人", en: "Beginner · Individual" },
      levels: ["Beginner", "Intermediate"],
      summary: {
        zh: "适合一二年级新手家庭：用 AI 工具配图配音，做一本三页绘本故事。",
        en: "First-time entry friendly: build a 3-page picture story with AI illustration + voiceover."
      },
      competitionDate: "2026-05-25",
      registrationDeadline: "2026-05-20",
      prizes: {
        zh: "全员可获作品电子合集；优秀作品收录到 MindDo 课程示例库。",
        en: "Everyone gets a digital anthology; standout works are added to MindDo's curriculum library."
      },
      organizer: "MindDo",
      cta: ""
    }
  ];

  function getCompetitions() {
    return COMPETITION_CATALOG.slice().sort(function (a, b) {
      return new Date(a.competitionDate || 0) - new Date(b.competitionDate || 0);
    });
  }
  function getCompetitionsForStudent(studentId) {
    var lvl = studentId ? getStudentLevel(studentId) : "";
    var canon = lvl ? canonicalLevel(lvl) : "";
    var all = getCompetitions();
    if (!canon) return all;
    return all.map(function (c) {
      var match = (c.levels || []).indexOf(canon) !== -1;
      return Object.assign({}, c, { recommended: match });
    });
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

  // ---------- Trial time slots (campus-aware) ----------
  // Each campus can define its own list of weekday + weekend trial start
  // times. Trial.html falls back to these defaults if a campus has no
  // override. A "_default" key applies to any campus without its own row.
  var DEFAULT_TRIAL_SLOTS = {
    weekday: ["15:00", "16:00", "17:00", "18:00"],
    weekend: ["09:00", "10:00", "11:00", "12:00", "13:00", "14:00", "15:00", "16:00", "17:00", "18:00"]
  };
  function defaultTrialSlots() {
    return {
      weekday: DEFAULT_TRIAL_SLOTS.weekday.slice(),
      weekend: DEFAULT_TRIAL_SLOTS.weekend.slice()
    };
  }
  function getAllTrialSlots() {
    var stored = readJson(KEYS.trialSlots, null);
    return (stored && typeof stored === "object") ? stored : {};
  }
  // Returns the resolved slots for a campus: campus-specific override, then
  // "_default" override, then the hard-coded baseline.
  function getTrialSlots(campusKey) {
    var stored = getAllTrialSlots();
    var key = campusKey || "";
    if (key && stored[key]) return cloneSlots(stored[key]);
    if (stored._default) return cloneSlots(stored._default);
    return defaultTrialSlots();
  }
  function cloneSlots(slots) {
    return {
      weekday: Array.isArray(slots && slots.weekday) ? slots.weekday.slice() : [],
      weekend: Array.isArray(slots && slots.weekend) ? slots.weekend.slice() : []
    };
  }
  function saveTrialSlots(campusKey, slots) {
    if (!campusKey) return null;
    var stored = getAllTrialSlots();
    var clean = cloneSlots(slots);
    // Drop empty/invalid times silently
    clean.weekday = clean.weekday.map(function (s) { return String(s || "").trim(); }).filter(isHHMM);
    clean.weekend = clean.weekend.map(function (s) { return String(s || "").trim(); }).filter(isHHMM);
    stored[campusKey] = clean;
    writeJson(KEYS.trialSlots, stored);
    return clean;
  }
  function resetTrialSlots(campusKey) {
    var stored = getAllTrialSlots();
    if (campusKey && stored[campusKey]) {
      delete stored[campusKey];
      writeJson(KEYS.trialSlots, stored);
    }
    return getTrialSlots(campusKey);
  }
  function isHHMM(v) { return /^([0-1]\d|2[0-3]):[0-5]\d$/.test(String(v || "")); }
  // Build the { value, label } pairs trial.html expects, with a label that
  // shows a 1-hour window — "16:00 – 17:00".
  function buildTrialSlotOptions(slotValues) {
    return (slotValues || []).filter(isHHMM).map(function (v) {
      return { value: v, label: v + " – " + addOneHour(v) };
    });
  }
  function addOneHour(hhmm) {
    var parts = String(hhmm || "").split(":");
    var h = (Number(parts[0]) + 1) % 24;
    var m = parts[1] || "00";
    return (h < 10 ? "0" + h : String(h)) + ":" + m;
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

  // Account-invite bookkeeping. Accepts either a string email or a lead-like
  // object with { email, studentId }. When a studentId is supplied and matches
  // a record, that match is authoritative — siblings sharing a parent email
  // each get their own invite. Email-only callers (legacy, no sid) still
  // resolve to the latest invite for that email.
  function getAccountInvites() {
    return readJson(KEYS.invites, []);
  }
  function getAccountInviteFor(leadOrEmail) {
    var email = "";
    var id = "";
    if (leadOrEmail && typeof leadOrEmail === "object") {
      email = norm(leadOrEmail.email);
      id = String(leadOrEmail.studentId || "");
    } else {
      email = norm(leadOrEmail);
    }
    if (!email && !id) return null;
    var list = getAccountInvites();
    var matches = list.filter(function (r) {
      // If both sides carry a studentId, the sid match is authoritative —
      // this is how we keep two siblings on the same parent email from
      // mirroring each other's invite state. Email is the fallback for
      // records (or callers) without a sid.
      if (id && r.studentId) return String(r.studentId) === id;
      return email && norm(r.email) === email;
    });
    return matches.sort(function (a, b) {
      return new Date(b.sentAt || 0) - new Date(a.sentAt || 0);
    })[0] || null;
  }
  // Look up the latest trial lead for a given studentId — used by the
  // invite briefing page (trial-invite.html) to render evaluation and
  // course info without requiring a logged-in session.
  function findLeadByStudentId(studentId) {
    if (!studentId) return null;
    var leads = readJson(KEYS.leads, []);
    return leads.filter(function (l) {
      return l && String(l.studentId || "") === String(studentId);
    }).sort(function (a, b) {
      return new Date(b.createdAt || 0) - new Date(a.createdAt || 0);
    })[0] || null;
  }

  // Used by trial-register to block a duplicate trial booking before it's
  // written. Matches on either email or phone (phone digits-only so
  // "+1 (415) 555-0100" and "4155550100" compare equal). A specific
  // lead can be excluded via its createdAt to support re-submissions that
  // the user has chosen to bypass.
  function digitsOnly(v) { return String(v || "").replace(/\D/g, ""); }
  function findLeadByEmailOrPhone(email, phone, opts) {
    var emailNorm = norm(email);
    var phoneDigits = digitsOnly(phone);
    if (!emailNorm && !phoneDigits) return null;
    var leads = readJson(KEYS.leads, []);
    var excludeCreatedAt = opts && opts.excludeCreatedAt;
    return leads.filter(function (l) {
      if (!l) return false;
      if (excludeCreatedAt && l.createdAt === excludeCreatedAt) return false;
      var matchEmail = emailNorm && norm(l.email) === emailNorm;
      var matchPhone = phoneDigits && phoneDigits.length >= 6 && digitsOnly(l.phone) === phoneDigits;
      return matchEmail || matchPhone;
    }).sort(function (a, b) {
      return new Date(b.createdAt || 0) - new Date(a.createdAt || 0);
    })[0] || null;
  }

  // Same idea, scoped to signup records — ops surfaces may want a unified
  // "is this person already registered" lookup.
  function findSignupByEmail(email) {
    var target = norm(email);
    if (!target) return null;
    var list = readJson(KEYS.signups, []);
    return list.filter(function (r) { return norm(r && r.email) === target; })
      .sort(function (a, b) { return new Date(b.createdAt || 0) - new Date(a.createdAt || 0); })[0] || null;
  }

  function sendAccountInvite(lead) {
    if (!lead || !lead.email) return null;
    var origin = "";
    try { origin = window.location.origin + window.location.pathname.replace(/[^\/]+$/, ""); } catch (_) {}
    var sid = lead.studentId || "";
    var inviteUrl = (origin || "") + "trial-invite.html?sid=" + encodeURIComponent(sid);
    var signupUrl = (origin || "") + "signup.html?sid=" + encodeURIComponent(sid) +
      "&email=" + encodeURIComponent(lead.email) +
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
    var subjectZh = "MindDo · " + (lead.studentName || "学员") + " 的试课评估与开户邀请";
    var subjectEn = "MindDo · Trial report & account invite for " + (lead.studentName || "your student");
    var bodyZh = "您好 " + (lead.parentName || lead.studentName || "家长") + "，\n\n" +
      "感谢您完成 MindDo 的试课体验！我们已为 " + (lead.studentName || "学员") +
      "（学员号：" + (sid || "—") + "）准备了一份试课评估与课程推荐报告，请查看：\n\n" +
      inviteUrl + "\n\n" +
      "在报告页内点击「创建学员账户」即可完成注册，报名信息会自动与本次试课记录打通。\n" +
      "如需直接进入注册页，也可以使用下方链接：\n" + signupUrl + evalBlockZh +
      "\n\n开始正式的 AI 学习之旅。\nMindDo 团队";
    var bodyEn = "Hi " + (lead.parentName || lead.studentName || "there") + ",\n\n" +
      "Thanks for joining the trial! We've prepared a trial report and class recommendation for " +
      (lead.studentName || "your student") + " (ID: " + (sid || "—") + "). Please review it here:\n\n" +
      inviteUrl + "\n\n" +
      "Click \"Create Account\" inside the report to register — your new account will be linked to this trial automatically.\n" +
      "If you prefer to go straight to signup, use:\n" + signupUrl + evalBlockEn +
      "\n\nSee you in class.\n— MindDo Team";
    var mail = sendMockEmail({
      to: lead.email,
      toName: lead.parentName || lead.studentName || "",
      studentName: lead.studentName || "",
      studentId: sid,
      subject: subjectZh + " / " + subjectEn,
      bodyZh: bodyZh,
      bodyEn: bodyEn,
      template: "account_invite",
      inviteUrl: inviteUrl,
      signupUrl: signupUrl
    });
    var record = {
      email: lead.email,
      studentName: lead.studentName || "",
      studentId: sid,
      mailId: mail.id,
      inviteUrl: inviteUrl,
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
    // When both sides carry a studentId the sid match is authoritative —
    // siblings sharing a parent email must not mirror each other's eval.
    // Email-only match is the fallback for legacy rows (or callers) that
    // arrive without a studentId.
    return list.filter(function (r) {
      if (id && r.studentId) return String(r.studentId) === id;
      return email && norm(r.email) === email;
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
    // Mirror the read-side rule: sid match is authoritative when both have
    // one, so two siblings on the same parent email get separate eval rows
    // instead of overwriting each other.
    var idx = list.findIndex(function (r) {
      if (id && r.studentId) return String(r.studentId) === id;
      if (id || r.studentId) return false;
      return email && norm(r.email) === email;
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
    // sid match wins when both sides have one, so siblings sharing a parent
    // email don't read each other's completion state. Email is the fallback
    // for rows / callers without a studentId.
    return list.filter(function (r) {
      if (id && r.studentId) return String(r.studentId) === id;
      return email && norm(r.email) === email;
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
    // Same sid-authoritative upsert rule: don't collapse two siblings'
    // completion records onto one row just because they share a parent email.
    var idx = list.findIndex(function (r) {
      if (id && r.studentId) return String(r.studentId) === id;
      if (id || r.studentId) return false;
      return email && norm(r.email) === email;
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
    // Match the same record that markTrialComplete would have created — sid
    // when both sides have one, otherwise email — so undoing one sibling's
    // completion doesn't wipe the other's.
    var next = list.filter(function (r) {
      if (id && r.studentId) return String(r.studentId) !== id;
      if (id || r.studentId) return true;
      return !(email && norm(r.email) === email);
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
    // Carry forward the sid param if the caller is mid-flow for a specific
    // student (e.g. guardian clicked "assess this child"). login.html
    // will switch the active student after a successful login so context
    // survives the auth bounce.
    try {
      var sid = new URLSearchParams(window.location.search).get("sid");
      if (sid) query.push("sid=" + encodeURIComponent(sid));
    } catch (_) {}
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

    writeJson(KEYS.portfolio, [
      {
        studentId: student.studentId,
        title: { zh: "AI 像素画生成器", en: "AI Pixel Art Generator" },
        category: { zh: "AI 创作", en: "AI Creation" },
        summary: {
          zh: "用 prompt 输入主题，自动生成 8-bit 风格的像素画。集成色板与导出功能。",
          en: "Generates 8-bit pixel art from prompts. Includes a palette picker and export."
        },
        techTags: ["Python", "Pillow", "Prompt design"],
        teacher: "Dr. Sarah Chen",
        completedAt: daysAgo(45),
        createdAt: daysAgo(45)
      },
      {
        studentId: student.studentId,
        title: { zh: "智能作业助手 Bot", en: "Homework Helper Bot" },
        category: { zh: "AI 工具", en: "AI Tools" },
        summary: {
          zh: "结合 RAG 思路，针对小学数学作业自动给出讲解和检查思路，避免直接给答案。",
          en: "RAG-style helper that explains primary-school math problems and double-checks reasoning instead of just giving answers."
        },
        techTags: ["LangChain", "Prompt engineering", "Math reasoning"],
        teacher: "Jenny Lin",
        completedAt: daysAgo(20),
        createdAt: daysAgo(20)
      },
      {
        studentId: student.studentId,
        title: { zh: "校园物品共享小程序", en: "Campus Share Mini-App" },
        category: { zh: "项目营成果", en: "Project Camp" },
        summary: {
          zh: "和同学合作完成的物品借用平台原型：发布、申领、归还，配套提醒。项目营答辩 90 分。",
          en: "Group project — a borrow / return platform prototype with reminders. Earned 90/100 at the project camp showcase."
        },
        techTags: ["Figma", "JavaScript", "Team collab"],
        teacher: "David Park",
        completedAt: daysAgo(7),
        createdAt: daysAgo(7),
        highlight: true
      }
    ]);
  }

  // =================================================================
  // Family + Multi-Account Model
  // -----------------------------------------------------------------
  // Designed to support three account types sharing one family:
  //   - guardian_primary: the registered parent (billing + admin)
  //   - guardian_secondary: invited co-parent (read + limited writes)
  //   - student: the learner's own login for the learning system
  //
  // For this frontend-only prototype all secrets are stored plainly in
  // localStorage. A real deployment swaps `hashPassword` for a salted
  // KDF and moves persistence behind an API.
  // =================================================================

  function genId(prefix) {
    var r = Math.random().toString(36).slice(2, 8).toUpperCase();
    var t = Date.now().toString(36).toUpperCase();
    return (prefix || "ID") + "-" + t + "-" + r;
  }
  function genToken() {
    var a = Math.random().toString(36).slice(2, 10);
    var b = Math.random().toString(36).slice(2, 10);
    var c = Date.now().toString(36);
    return (a + b + c).toUpperCase();
  }
  // Demo-grade password storage. Real apps: replace with server-side bcrypt/argon2.
  function hashPassword(plain) { return "plain:" + String(plain || ""); }
  function checkPassword(plain, stored) { return hashPassword(plain) === stored; }

  function getFamilies() { return readJson(KEYS.families, []); }
  function getGuardians() { return readJson(KEYS.guardians, []); }
  function getStudents() { return readJson(KEYS.students, []); }
  function getAccounts() { return readJson(KEYS.accounts, []); }
  function getInviteTokens() { return readJson(KEYS.inviteTokens, []); }

  function findFamilyById(familyId) {
    if (!familyId) return null;
    return getFamilies().filter(function (f) { return f.familyId === familyId; })[0] || null;
  }
  function findFamilyByStudentId(studentId) {
    if (!studentId) return null;
    return getFamilies().filter(function (f) {
      return (f.studentIds || []).indexOf(studentId) !== -1;
    })[0] || null;
  }
  function findAccountByEmail(email) {
    var target = norm(email);
    if (!target) return null;
    return getAccounts().filter(function (a) { return norm(a.email) === target; })[0] || null;
  }
  function findAccountById(accountId) {
    if (!accountId) return null;
    return getAccounts().filter(function (a) { return a.accountId === accountId; })[0] || null;
  }
  function findStudentById(studentId) {
    if (!studentId) return null;
    return getStudents().filter(function (s) { return s.studentId === studentId; })[0] || null;
  }
  function findGuardianById(guardianId) {
    if (!guardianId) return null;
    return getGuardians().filter(function (g) { return g.guardianId === guardianId; })[0] || null;
  }
  function listFamilyGuardians(familyId) {
    return getGuardians().filter(function (g) { return g.familyId === familyId; });
  }
  function listFamilyStudents(familyId) {
    return getStudents().filter(function (s) { return s.familyId === familyId; });
  }
  function listFamilyAccounts(familyId) {
    return getAccounts().filter(function (a) { return a.familyId === familyId; });
  }

  function upsertFamily(family) {
    var list = getFamilies();
    var idx = list.findIndex(function (f) { return f.familyId === family.familyId; });
    if (idx >= 0) list[idx] = Object.assign({}, list[idx], family);
    else list.push(family);
    writeJson(KEYS.families, list);
    return list[idx >= 0 ? idx : list.length - 1];
  }
  function upsertGuardian(guardian) {
    var list = getGuardians();
    var idx = list.findIndex(function (g) { return g.guardianId === guardian.guardianId; });
    if (idx >= 0) list[idx] = Object.assign({}, list[idx], guardian);
    else list.push(guardian);
    writeJson(KEYS.guardians, list);
    return list[idx >= 0 ? idx : list.length - 1];
  }
  function upsertStudent(student) {
    var list = getStudents();
    var idx = list.findIndex(function (s) { return s.studentId === student.studentId; });
    if (idx >= 0) list[idx] = Object.assign({}, list[idx], student);
    else list.push(student);
    writeJson(KEYS.students, list);
    return list[idx >= 0 ? idx : list.length - 1];
  }
  function upsertAccount(account) {
    var list = getAccounts();
    var idx = list.findIndex(function (a) { return a.accountId === account.accountId; });
    if (idx >= 0) list[idx] = Object.assign({}, list[idx], account);
    else list.push(account);
    writeJson(KEYS.accounts, list);
    return list[idx >= 0 ? idx : list.length - 1];
  }

  // Create a family rooted on a student. Idempotent per studentId so repeated
  // calls (migration, re-signup) reuse the same family.
  function ensureFamilyForStudent(studentId) {
    if (!studentId) return null;
    var existing = findFamilyByStudentId(studentId);
    if (existing) return existing;
    var family = {
      familyId: genId("FAM"),
      primaryGuardianId: "",
      studentIds: [studentId],
      guardianIds: [],
      createdAt: new Date().toISOString()
    };
    return upsertFamily(family);
  }
  function addStudentToFamily(familyId, studentId) {
    var family = findFamilyById(familyId);
    if (!family || !studentId) return null;
    if ((family.studentIds || []).indexOf(studentId) === -1) {
      family.studentIds = (family.studentIds || []).concat([studentId]);
      upsertFamily(family);
    }
    return family;
  }

  // Remove a student from a family. Deletes the student profile, any
  // student login accounts, pending activation tokens, and the family's
  // studentIds entry. Historical records (leads, assessments, feedback)
  // are kept so operations still has an audit trail — they'll be dormant
  // without an active student to link against. Only the primary guardian
  // should call this; the UI enforces that gate.
  function removeStudentFromFamily(familyId, studentId, meta) {
    if (!familyId || !studentId) return null;
    var family = findFamilyById(familyId);
    if (!family) return null;

    var students = readJson(KEYS.students, []);
    var removed = students.filter(function (s) {
      return s.studentId === studentId && s.familyId === familyId;
    })[0];
    if (!removed) return null;

    // 1) Students store
    writeJson(KEYS.students, students.filter(function (s) {
      return !(s.studentId === studentId && s.familyId === familyId);
    }));

    // 2) Student accounts linked to this student
    var accounts = readJson(KEYS.accounts, []);
    var studentAccountIds = accounts
      .filter(function (a) { return a.role === ROLES.student && a.familyId === familyId && a.linkedEntityId === studentId; })
      .map(function (a) { return a.accountId; });
    if (studentAccountIds.length) {
      writeJson(KEYS.accounts, accounts.filter(function (a) {
        return studentAccountIds.indexOf(a.accountId) === -1;
      }));
    }

    // 3) Pending invite tokens pointing at a removed account
    if (studentAccountIds.length) {
      var tokens = readJson(KEYS.inviteTokens, []);
      writeJson(KEYS.inviteTokens, tokens.filter(function (tok) {
        return studentAccountIds.indexOf(tok.pendingAccountId) === -1;
      }));
    }

    // 4) Outgoing-invite log entries tied to this student
    var invites = readJson(KEYS.invites, []);
    var cleanedInvites = invites.filter(function (inv) {
      return !(inv && inv.familyId === familyId && inv.studentId === studentId);
    });
    if (cleanedInvites.length !== invites.length) writeJson(KEYS.invites, cleanedInvites);

    // 5) family.studentIds
    if (Array.isArray(family.studentIds)) {
      family.studentIds = family.studentIds.filter(function (id) { return id !== studentId; });
      family.updatedAt = new Date().toISOString();
      upsertFamily(family);
    }

    // 6) studentLevels map (scoped to studentId)
    var levels = readJson(KEYS.studentLevels, {});
    if (levels && typeof levels === "object" && Object.prototype.hasOwnProperty.call(levels, studentId)) {
      delete levels[studentId];
      writeJson(KEYS.studentLevels, levels);
    }

    // 7) If the active student pointer is the one being deleted, slide it
    //    to another family student or clear the pointer.
    var current = getCurrentStudent();
    if (current && current.studentId === studentId) {
      var remaining = listFamilyStudents(familyId);
      if (remaining.length) {
        switchActiveStudent(remaining[0].studentId);
      } else {
        writeJson(KEYS.currentStudent, Object.assign({}, current, {
          studentId: "", studentName: "", name: "", grade: "", birthday: "", gender: ""
        }));
      }
    }

    return {
      removed: removed,
      at: new Date().toISOString(),
      by: meta && meta.issuedBy ? meta.issuedBy : ""
    };
  }

  // Create a brand-new student under an existing family — used when the
  // primary guardian adds a sibling through account-settings.html. Returns
  // the freshly minted student record.
  // Student accounts are auto-provisioned the moment a child is added to a
  // family — no invite email or token claim required. A readable random
  // password is generated; the plain text is persisted on the student record
  // (demo-only) so the guardian can view and share it from account-settings.
  function generateStudentPassword() {
    var chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    var out = "";
    for (var i = 0; i < 8; i += 1) out += chars[Math.floor(Math.random() * chars.length)];
    return out;
  }
  function autoProvisionStudentAccount(familyId, studentId, opts) {
    opts = opts || {};
    var student = findStudentById(studentId);
    if (!student || !familyId) return null;
    var existing = getAccounts().filter(function (a) {
      return a.role === ROLES.student && a.linkedEntityId === studentId;
    })[0];
    // If active and the caller didn't request a reset, return as-is
    if (existing && existing.status === "active" && !opts.resetPassword) {
      return {
        account: existing,
        email: existing.email,
        password: student.loginPassword || "",
        existed: true
      };
    }
    var loginEmail = opts.email || student.loginEmail || ("stu-" + String(studentId).toLowerCase() + "@minddo.local");
    var password = opts.password || generateStudentPassword();

    var account;
    if (existing) {
      account = upsertAccount({
        accountId: existing.accountId,
        email: loginEmail,
        passwordHash: hashPassword(password),
        status: "active",
        activatedAt: new Date().toISOString()
      });
    } else {
      account = upsertAccount({
        accountId: genId("ACC"),
        email: loginEmail,
        passwordHash: hashPassword(password),
        familyId: familyId,
        role: ROLES.student,
        linkedEntityId: studentId,
        status: "active",
        createdAt: new Date().toISOString()
      });
    }
    upsertStudent({
      studentId: studentId,
      accountId: account.accountId,
      loginEmail: loginEmail,
      loginPassword: password
    });
    return { account: account, email: loginEmail, password: password, existed: false };
  }

  function addChildToFamily(familyId, profile) {
    var family = findFamilyById(familyId);
    if (!family) return null;
    profile = profile || {};
    var studentId = profile.studentId || createStudentId();
    var student = upsertStudent({
      studentId: studentId,
      familyId: familyId,
      name: profile.name || profile.studentName || "",
      grade: profile.grade || "",
      birthday: profile.birthday || "",
      gender: profile.gender || "",
      city: profile.city || "",
      createdAt: new Date().toISOString()
    });
    addStudentToFamily(familyId, studentId);
    // Auto-provision the student's learning-system login right away.
    autoProvisionStudentAccount(familyId, studentId);
    return student;
  }

  // Swap the "active" student carried on window-local current-student state.
  // Used by the student switcher on the family home and by per-child trial
  // booking so the rest of the flow (trial-register prefill, schedule filter,
  // reminders) pivots to the chosen child.
  function switchActiveStudent(studentId) {
    var student = findStudentById(studentId);
    if (!student) return null;
    var current = getCurrentStudent() || {};
    // Preserve the caller's email/account context; only replace the
    // student-identifying fields.
    var merged = Object.assign({}, current, {
      studentId: student.studentId,
      studentName: student.name || "",
      name: student.name || "",
      grade: student.grade || "",
      birthday: student.birthday || "",
      gender: student.gender || "",
      city: student.city || "",
      goal: student.goal || current.goal || ""
    });
    writeJson(KEYS.currentStudent, merged);
    return merged;
  }
  function attachAccountToFamily(familyId, accountId, role, linkedEntityId) {
    var family = findFamilyById(familyId);
    if (!family) return null;
    family.guardianIds = family.guardianIds || [];
    if (role === ROLES.guardianPrimary || role === ROLES.guardianSecondary) {
      if (family.guardianIds.indexOf(linkedEntityId) === -1) family.guardianIds.push(linkedEntityId);
      if (role === ROLES.guardianPrimary && !family.primaryGuardianId) {
        family.primaryGuardianId = linkedEntityId;
      }
      upsertFamily(family);
    }
    return family;
  }

  // Promote an existing signup into the new model: create family + student +
  // guardian + account. Idempotent — if an account already matches by email,
  // reuse it; if the family already exists for the studentId, reuse that too.
  function provisionGuardianPrimary(payload) {
    if (!payload || !payload.email) return null;
    var email = payload.email;
    var existing = findAccountByEmail(email);
    if (existing) return existing; // Already provisioned

    var studentId = payload.studentId || (getCurrentStudent() || {}).studentId;
    if (!studentId) studentId = createStudentId();

    // Ensure student entity (even if placeholder — profile-setup fills the rest)
    var student = findStudentById(studentId);
    if (!student) {
      student = upsertStudent({
        studentId: studentId,
        familyId: "",
        name: payload.studentName || payload.name || "",
        grade: payload.grade || "",
        birthday: payload.birthday || "",
        createdAt: new Date().toISOString()
      });
    }

    var family = ensureFamilyForStudent(studentId);
    if (student.familyId !== family.familyId) upsertStudent({ studentId: studentId, familyId: family.familyId });

    var guardian = upsertGuardian({
      guardianId: genId("GDN"),
      familyId: family.familyId,
      name: payload.parentName || payload.studentName || payload.name || "",
      phone: payload.phone || "",
      email: payload.email,
      relation: payload.parentRelation || "",
      isPrimary: true,
      accountId: "",
      createdAt: new Date().toISOString()
    });

    var account = upsertAccount({
      accountId: genId("ACC"),
      email: payload.email,
      passwordHash: payload.password ? hashPassword(payload.password) : "",
      familyId: family.familyId,
      role: ROLES.guardianPrimary,
      linkedEntityId: guardian.guardianId,
      provider: payload.provider || "email",
      status: "active",
      createdAt: new Date().toISOString(),
      lastLoginAt: new Date().toISOString()
    });
    upsertGuardian({ guardianId: guardian.guardianId, accountId: account.accountId });
    attachAccountToFamily(family.familyId, account.accountId, account.role, guardian.guardianId);
    return account;
  }

  // Create a pending student account and return a single-use claim token the
  // primary guardian can share. The student activates it by setting a
  // password at claim-account.html.
  function createStudentLogin(familyId, studentId, opts) {
    var family = findFamilyById(familyId);
    var student = findStudentById(studentId);
    if (!family || !student) return null;
    opts = opts || {};
    var loginEmail = opts.email || student.loginEmail || ("stu-" + studentId.toLowerCase() + "@minddo.local");

    // Reuse an existing student account for this studentId if one exists.
    var existing = getAccounts().filter(function (a) {
      return a.role === ROLES.student && a.linkedEntityId === studentId;
    })[0];
    var account;
    if (existing) {
      account = existing;
    } else {
      account = upsertAccount({
        accountId: genId("ACC"),
        email: loginEmail,
        passwordHash: "",
        familyId: familyId,
        role: ROLES.student,
        linkedEntityId: studentId,
        status: "pending",
        createdAt: new Date().toISOString()
      });
      upsertStudent({ studentId: studentId, loginEmail: loginEmail, accountId: account.accountId });
    }

    var token = issueInviteToken({
      type: "claim_student",
      familyId: familyId,
      linkedEntityId: studentId,
      pendingAccountId: account.accountId,
      issuedBy: opts.issuedBy || ""
    });
    return { account: account, token: token, claimUrl: buildClaimUrl(token.token) };
  }

  // Start a co-parent (guardian_secondary) invite. Creates a pending guardian
  // record + pending account, issues a token, and queues an invite email via
  // the existing email outbox.
  function inviteCoParent(familyId, invite) {
    var family = findFamilyById(familyId);
    if (!family || !invite || !invite.email) return null;

    var existing = findAccountByEmail(invite.email);
    if (existing) return { account: existing, existed: true };

    var guardian = upsertGuardian({
      guardianId: genId("GDN"),
      familyId: familyId,
      name: invite.name || "",
      phone: invite.phone || "",
      email: invite.email,
      relation: invite.relation || "",
      isPrimary: false,
      accountId: "",
      createdAt: new Date().toISOString()
    });
    var account = upsertAccount({
      accountId: genId("ACC"),
      email: invite.email,
      passwordHash: "",
      familyId: familyId,
      role: ROLES.guardianSecondary,
      linkedEntityId: guardian.guardianId,
      status: "pending",
      createdAt: new Date().toISOString()
    });
    upsertGuardian({ guardianId: guardian.guardianId, accountId: account.accountId });
    attachAccountToFamily(familyId, account.accountId, account.role, guardian.guardianId);

    var token = issueInviteToken({
      type: "claim_coparent",
      familyId: familyId,
      linkedEntityId: guardian.guardianId,
      pendingAccountId: account.accountId,
      issuedBy: invite.issuedBy || ""
    });

    // Mock email for the outbox
    var claimUrl = buildClaimUrl(token.token);
    var primaryGuardianName = (function () {
      var pg = findGuardianById(family.primaryGuardianId);
      return pg ? pg.name : "";
    })();
    sendMockEmail({
      to: invite.email,
      toName: invite.name || "",
      studentName: "",
      studentId: "",
      subject: "MindDo · " + (primaryGuardianName ? primaryGuardianName + " 邀请你加入家长账户" : "邀请你加入 MindDo 家长账户"),
      bodyZh: (primaryGuardianName ? primaryGuardianName + " 邀请你作为副家长加入" : "您被邀请作为副家长加入") +
        " MindDo 学员家庭账户。\n\n请点击下方链接设置密码并激活账号：\n\n" + claimUrl + "\n\n激活后可以查看课表、反馈等信息。",
      bodyEn: (primaryGuardianName ? primaryGuardianName + " has invited you" : "You have been invited") +
        " to join a MindDo family account as a co-parent.\n\nClick the link below to set a password and activate:\n\n" + claimUrl + "\n\nAfter activation you can view schedules, feedback and more.",
      template: "coparent_invite",
      signupUrl: claimUrl,
      claimToken: token.token
    });
    return { account: account, token: token, claimUrl: claimUrl, existed: false };
  }

  function issueInviteToken(record) {
    var tokens = getInviteTokens();
    var token = Object.assign({
      token: genToken(),
      createdAt: new Date().toISOString(),
      consumedAt: null,
      // 14-day TTL by default
      expiresAt: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString()
    }, record);
    tokens.push(token);
    writeJson(KEYS.inviteTokens, tokens);
    return token;
  }
  function findInviteToken(token) {
    if (!token) return null;
    return getInviteTokens().filter(function (t) { return t.token === token; })[0] || null;
  }
  function consumeInviteToken(token, password) {
    var tokens = getInviteTokens();
    var idx = tokens.findIndex(function (t) { return t.token === token; });
    if (idx < 0) return null;
    var rec = tokens[idx];
    if (rec.consumedAt) return { ok: false, reason: "consumed", token: rec };
    if (rec.expiresAt && new Date(rec.expiresAt).getTime() < Date.now()) return { ok: false, reason: "expired", token: rec };

    var account = findAccountById(rec.pendingAccountId);
    if (!account) return { ok: false, reason: "missing_account", token: rec };
    upsertAccount({
      accountId: account.accountId,
      passwordHash: hashPassword(password),
      status: "active",
      activatedAt: new Date().toISOString()
    });
    rec.consumedAt = new Date().toISOString();
    tokens[idx] = rec;
    writeJson(KEYS.inviteTokens, tokens);
    return { ok: true, account: findAccountById(rec.pendingAccountId), token: rec };
  }

  function buildClaimUrl(token) {
    var origin = "";
    try { origin = window.location.origin + window.location.pathname.replace(/[^\/]+$/, ""); } catch (_) {}
    return (origin || "") + "claim-account.html?token=" + encodeURIComponent(token);
  }

  // Authenticate an email + password combo against the accounts table. Falls
  // back to the legacy signup_users list so anyone registered before this
  // model was introduced can still log in.
  // Update an account's password. Verifies the old password (or accepts
  // anything when the account has no stored hash — same demo affordance
  // verifyAccountLogin uses) before writing the new hash. Returns
  // { ok: bool, reason?: "bad_password" | "not_found" | "weak" }.
  function changeAccountPassword(accountId, oldPassword, newPassword) {
    if (!accountId) return { ok: false, reason: "not_found" };
    if (!newPassword || String(newPassword).length < 8) return { ok: false, reason: "weak" };
    var list = getAccounts();
    var account = list.filter(function (a) { return a.accountId === accountId; })[0];
    if (!account) return { ok: false, reason: "not_found" };
    var hasStoredHash = !!account.passwordHash;
    if (hasStoredHash && !checkPassword(oldPassword, account.passwordHash)) {
      return { ok: false, reason: "bad_password" };
    }
    upsertAccount({ accountId: accountId, passwordHash: hashPassword(newPassword) });
    return { ok: true };
  }

  function verifyAccountLogin(email, password) {
    var account = findAccountByEmail(email);
    if (account) {
      if (account.status !== "active") return { ok: false, reason: "inactive", account: account };
      // Accounts without a stored hash (OAuth provisioned, demo-seeded from
      // legacy signups) accept any non-empty password — this is a demo
      // affordance only; a real deployment must enforce a proper hash.
      var hasStoredHash = !!account.passwordHash;
      var passwordOk = hasStoredHash ? checkPassword(password, account.passwordHash) : true;
      if (!passwordOk) return { ok: false, reason: "bad_password", account: account };
      upsertAccount({ accountId: account.accountId, lastLoginAt: new Date().toISOString() });
      return { ok: true, account: account };
    }
    // Legacy fallback
    var legacy = readJson(KEYS.signups, []).filter(function (u) { return norm(u.email) === norm(email); })[0];
    if (legacy && (!legacy.password || legacy.password === password)) {
      // Provision a guardian_primary lazily so subsequent logins use the new path.
      var provisioned = provisionGuardianPrimary(Object.assign({}, legacy, { password: password }));
      return { ok: true, account: provisioned, provisioned: true };
    }
    return { ok: false, reason: "not_found" };
  }

  // One-time migration helper: walk legacy signup_users and provision family
  // records for anything not already represented. Safe to call on every load.
  function migrateLegacySignups() {
    var users = readJson(KEYS.signups, []);
    users.forEach(function (u) {
      if (u && u.email && !findAccountByEmail(u.email)) provisionGuardianPrimary(u);
    });
  }

  // Resolve the currently active account from the current-student snapshot.
  // Returns null if no current student, or no account matches the student's
  // email (e.g. anonymous visitor).
  function getCurrentAccount() {
    var current = getCurrentStudent();
    if (!current || !current.email) return null;
    return findAccountByEmail(current.email);
  }

  document.addEventListener("DOMContentLoaded", function () {
    populateCourseMeta();
    migrateLegacySignups();
  });

  window.MindDoFlow = {
    keys: KEYS,
    readJson: readJson,
    writeJson: writeJson,
    getCurrentStudent: getCurrentStudent,
    setCurrentStudent: setCurrentStudent,
    findStudentIdByEmail: findStudentIdByEmail,
    getSnapshot: getSnapshot,
    getSnapshotForStudent: getSnapshotForStudent,
    getStage: getStage,
    saveLead: saveLead,
    updateLead: updateLead,
    findLeadByStudentId: findLeadByStudentId,
    findLeadByEmailOrPhone: findLeadByEmailOrPhone,
    findSignupByEmail: findSignupByEmail,
    saveAssessment: saveAssessment,
    saveSignupUser: saveSignupUser,
    savePayment: savePayment,
    getPortfolioForStudent: getPortfolioForStudent,
    savePortfolioItem: savePortfolioItem,
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
    getCompetitions: getCompetitions,
    getCompetitionsForStudent: getCompetitionsForStudent,
    saveClassOfferings: saveClassOfferings,
    resetClassOfferings: resetClassOfferings,
    getDefaultClassOfferings: getDefaultClassOfferings,
    getOfferingById: getOfferingById,
    getTrialSlots: getTrialSlots,
    getAllTrialSlots: getAllTrialSlots,
    saveTrialSlots: saveTrialSlots,
    resetTrialSlots: resetTrialSlots,
    buildTrialSlotOptions: buildTrialSlotOptions,
    defaultTrialSlots: defaultTrialSlots,
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
    getTrialCompletions: getTrialCompletions,
    // Family + multi-account model
    ROLES: ROLES,
    provisionGuardianPrimary: provisionGuardianPrimary,
    createStudentLogin: createStudentLogin,
    inviteCoParent: inviteCoParent,
    consumeInviteToken: consumeInviteToken,
    findInviteToken: findInviteToken,
    verifyAccountLogin: verifyAccountLogin,
    changeAccountPassword: changeAccountPassword,
    findAccountByEmail: findAccountByEmail,
    findAccountById: findAccountById,
    getAccounts: getAccounts,
    findStudentById: findStudentById,
    findGuardianById: findGuardianById,
    findFamilyById: findFamilyById,
    findFamilyByStudentId: findFamilyByStudentId,
    listFamilyGuardians: listFamilyGuardians,
    listFamilyStudents: listFamilyStudents,
    listFamilyAccounts: listFamilyAccounts,
    addStudentToFamily: addStudentToFamily,
    addChildToFamily: addChildToFamily,
    removeStudentFromFamily: removeStudentFromFamily,
    autoProvisionStudentAccount: autoProvisionStudentAccount,
    switchActiveStudent: switchActiveStudent,
    upsertStudent: upsertStudent,
    upsertGuardian: upsertGuardian,
    getCurrentAccount: getCurrentAccount,
    buildClaimUrl: buildClaimUrl
  };
})();
