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
    portfolio: "minddo_portfolio",
    referrals: "minddo_referrals",
    growth: "minddo_growth_records",
    assignments: "minddo_assignments",
    billingProfile: "minddo_billing_profile",
    payroll: "minddo_payroll",
    contracts: "minddo_contracts",
    approvals: "minddo_approvals",
    staff: "minddo_staff",
    roles: "minddo_roles",
    attendance: "minddo_attendance",
    auditLog: "minddo_audit_log"
  };

  // Billing profile — per-family record carrying the payment method on
  // file plus subscription-control state (auto-renew, paused-until,
  // cancellation flag). Shared across all the family's children since
  // a single guardian's card backs every kid's membership. The
  // profile is keyed on familyId; helpers below shallow-merge so a
  // partial update (e.g. just the card) doesn't clobber the rest.
  function getBillingProfile(familyId) {
    if (!familyId) return null;
    var all = readJson(KEYS.billingProfile) || [];
    return all.filter(function (p) { return p && p.familyId === familyId; })[0] || null;
  }
  function upsertBillingProfile(record) {
    if (!record || !record.familyId) return null;
    var all = readJson(KEYS.billingProfile) || [];
    var idx = all.findIndex(function (p) { return p && p.familyId === record.familyId; });
    if (idx >= 0) all[idx] = Object.assign({}, all[idx], record, { updatedAt: new Date().toISOString() });
    else all.push(Object.assign({}, record, { createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }));
    writeJson(KEYS.billingProfile, all);
    return all[idx >= 0 ? idx : all.length - 1];
  }

  // Homework / assignments — each entry is a single piece of work
  // attached to a student, optionally tied to a course offering. The
  // parent sees them on the new Homework tab; the kid (or parent on
  // their behalf) can transition them through the lifecycle below.
  // Statuses: assigned → in_progress → submitted → graded
  function getStudentAssignments(studentId) {
    if (!studentId) return [];
    var all = readJson(KEYS.assignments) || [];
    return all
      .filter(function (a) { return String(a && a.studentId || "") === String(studentId); })
      .sort(function (a, b) {
        // Active items first by due date asc; graded / archived sink to bottom.
        var rank = function (s) { return s === "graded" ? 2 : (s === "submitted" ? 1 : 0); };
        var ra = rank(a.status), rb = rank(b.status);
        if (ra !== rb) return ra - rb;
        return new Date(a.dueAt || 0) - new Date(b.dueAt || 0);
      });
  }
  function findAssignmentById(id) {
    if (!id) return null;
    var all = readJson(KEYS.assignments) || [];
    return all.filter(function (a) { return a && a.id === id; })[0] || null;
  }
  function upsertAssignment(record) {
    if (!record || !record.id) return null;
    var all = readJson(KEYS.assignments) || [];
    var idx = all.findIndex(function (a) { return a && a.id === record.id; });
    if (idx >= 0) all[idx] = Object.assign({}, all[idx], record);
    else all.push(record);
    writeJson(KEYS.assignments, all);
    return all[idx >= 0 ? idx : all.length - 1];
  }
  // Convenience for the parent-side "标记为完成" / submission flow.
  // Persists submissionText/submissionUrl when provided and stamps
  // submittedAt; otherwise just sets the status.
  function updateAssignmentStatus(id, status, payload) {
    var existing = findAssignmentById(id);
    if (!existing) return null;
    var patch = { id: id, status: status };
    if (status === "submitted") {
      patch.submittedAt = new Date().toISOString();
      if (payload && payload.submissionText !== undefined) patch.submissionText = payload.submissionText;
      if (payload && payload.submissionUrl  !== undefined) patch.submissionUrl  = payload.submissionUrl;
    }
    return upsertAssignment(patch);
  }

  // -----------------------------------------------------------------
  // Growth tracking — five skill axes scored 0–100, captured monthly
  // by the lead instructor. Surfaced on the parent-side Dashboard as
  // a line chart (composite over time) + per-skill bars (latest
  // snapshot with month-over-month delta).
  // -----------------------------------------------------------------
  var GROWTH_SKILLS = [
    { id: "ai",      labelZh: "AI 概念",     labelEn: "AI Concepts" },
    { id: "code",    labelZh: "编程能力",   labelEn: "Coding" },
    { id: "logic",   labelZh: "逻辑思维",   labelEn: "Logic" },
    { id: "create",  labelZh: "创造力",     labelEn: "Creativity" },
    { id: "project", labelZh: "项目完成度", labelEn: "Project Delivery" }
  ];

  // Reward economy. Real deployment would key these off a backend
  // promo config; demo just uses fixed amounts.
  var REFERRAL_REWARD_USD = 50;
  var REFERRAL_BONUS_TIERS = [
    { count: 3, bonus: 100, key: "tier3" },
    { count: 5, bonus: 200, key: "tier5" }
  ];

  // -----------------------------------------------------------------
  // Membership pricing — single source of truth so course-selection
  // (the new-signup funnel) and student-account's Membership tab
  // (the upgrade surface) read the same numbers. Designed around:
  //   • Asymmetric dominance — Pro priced so Family Favorite (mid)
  //     looks like obvious value; mid is flagged "recommended".
  //   • Steeper per-class discount on Pro (-21% vs Starter) so the
  //     decoy actually pulls upgraders.
  //   • Monthly + annual options; annual = 10 months' price (≈17% off,
  //     "2 months free") expressed as save-loss-aversion copy.
  // -----------------------------------------------------------------
  var MEMBERSHIP_PLANS = [
    {
      id: "weekly1",
      sessionsPerWeek: 1,
      monthly: 199,
      annual: 1990,
      labelZh: "每周一节课",
      labelEn: "1 Class / Week",
      taglineZh: "每周一节，节奏轻盈",
      taglineEn: "1 class a week, easy pace",
      recommended: false
    },
    {
      id: "weekly2",
      sessionsPerWeek: 2,
      monthly: 349,
      annual: 3490,
      labelZh: "每周两节课",
      labelEn: "2 Classes / Week",
      taglineZh: "性价比之选",
      taglineEn: "Best value",
      recommended: true
    },
    {
      id: "weekly3",
      sessionsPerWeek: 3,
      monthly: 469,
      annual: 4690,
      labelZh: "每周三节课",
      labelEn: "3 Classes / Week",
      taglineZh: "高强度成长",
      taglineEn: "High-intensity growth",
      recommended: false
    }
  ];
  // 4 weeks/month is the sessions-per-month convention (12-month flat).
  // Per-session math is exposed for UI helpers to render consistently.
  function planPerSession(plan, cycle) {
    if (!plan) return 0;
    var totalSessions = plan.sessionsPerWeek * 4;
    if (cycle === "annual") {
      return plan.annual / (totalSessions * 12);
    }
    return plan.monthly / totalSessions;
  }
  function planMonthlyEquivalent(plan, cycle) {
    if (!plan) return 0;
    return cycle === "annual" ? plan.annual / 12 : plan.monthly;
  }
  function planAnnualSaving(plan) {
    if (!plan) return 0;
    return Math.max(0, plan.monthly * 12 - plan.annual);
  }
  function getMembershipPlans() { return MEMBERSHIP_PLANS.slice(); }
  function findMembershipPlan(id) {
    return MEMBERSHIP_PLANS.filter(function (p) { return p.id === id; })[0] || null;
  }

  // A-la-carte add-ons — sit beside the main tiers, anchor at higher
  // price points so the inclusive plans look like the better deal.
  var MEMBERSHIP_ADDONS = [
    {
      id: "addon-1on1",
      titleZh: "1 对 1 学习教练",
      titleEn: "1-on-1 Learning Coach",
      summaryZh: "60 分钟一对一深度辅导，按需预约。",
      summaryEn: "60-min one-on-one tutoring, book on demand.",
      price: 99,
      unit: "session"
    },
    {
      id: "addon-camp",
      titleZh: "项目营周末班",
      titleEn: "Project Camp Weekend",
      summaryZh: "4 小时强化营 + 项目展示，适合假期补充。",
      summaryEn: "4-hour weekend intensive with showcase, perfect for breaks.",
      price: 199,
      unit: "session"
    },
    {
      id: "addon-comp-prep",
      titleZh: "竞赛冲刺包",
      titleEn: "Competition Prep Pack",
      summaryZh: "4 周针对性集训 + 模拟考评，覆盖热门赛事。",
      summaryEn: "4-week targeted prep + mock evaluation for popular contests.",
      price: 399,
      unit: "pack"
    },
    {
      id: "addon-makeup",
      titleZh: "加课券",
      titleEn: "Make-up Class Ticket",
      summaryZh: "已用完每月课时？单节加购 $59。",
      summaryEn: "Out of weekly slots? Drop in for $59 per session.",
      price: 59,
      unit: "session"
    }
  ];
  function getMembershipAddOns() { return MEMBERSHIP_ADDONS.slice(); }

  // Policy constants — referenced from copy on the membership / payment
  // surfaces so changing them once flows everywhere.
  var MEMBERSHIP_POLICY = {
    refundDays: 7,         // 7-day no-questions-asked refund window
    siblingDiscountPct: 10, // -10% recurring on the second child
    annualSavingMonths: 2  // marketing claim: "2 months free on annual"
  };
  function getMembershipPolicy() { return Object.assign({}, MEMBERSHIP_POLICY); }

  function getGrowthSkills() { return GROWTH_SKILLS.slice(); }

  // Pull this student's growth snapshots, sorted oldest → newest. Each
  // entry is `{ studentId, periodKey, createdAt, scores, ... }`.
  function getStudentGrowth(studentId) {
    if (!studentId) return [];
    var all = readJson(KEYS.growth) || [];
    return all
      .filter(function (r) { return String(r && r.studentId || "") === String(studentId); })
      .sort(function (a, b) { return new Date(a.createdAt || 0) - new Date(b.createdAt || 0); });
  }

  // Compose a "composite score" for the line chart — equal-weight mean of
  // the five skill axes, so 0–100 stays the natural y-scale.
  function compositeGrowthScore(record) {
    if (!record || !record.scores) return 0;
    var sum = 0, n = 0;
    GROWTH_SKILLS.forEach(function (s) {
      var v = Number(record.scores[s.id]);
      if (isFinite(v)) { sum += v; n += 1; }
    });
    return n ? Math.round(sum / n) : 0;
  }

  // Aggregate metrics surfaced on the dashboard's tile strip. Reads from
  // existing tables (memberships, feedback, portfolio, requests) so the
  // tile values reflect actual demo state — no extra seeding needed.
  function getStudentMetrics(studentId) {
    if (!studentId) {
      return { classesCompleted: 0, hoursStudied: 0, projectsCompleted: 0, avgRating: 0, feedbackCount: 0 };
    }
    var sid = String(studentId);
    var feedback = (readJson(KEYS.feedback) || []).filter(function (f) {
      return String(f && f.studentId || "") === sid;
    });
    var portfolio = (readJson(KEYS.portfolio) || []).filter(function (p) {
      return String(p && p.studentId || "") === sid;
    });
    // "Classes completed" = sum of weekly sessions × weeks since the
    // earliest membership createdAt for this student. One session = 1
    // hour by demo convention. Bounded ≥ 0.
    var memberships = (readJson(KEYS.memberships) || []).filter(function (m) {
      return String(m && m.studentId || "") === sid;
    });
    var classesCompleted = 0;
    if (memberships.length) {
      memberships.forEach(function (m) {
        var sessionsPerWeek = (m.sessions && m.sessions.length) || 0;
        if (!sessionsPerWeek) return;
        var startedAt = new Date(m.createdAt || 0).getTime();
        var weeks = Math.max(0, Math.floor((Date.now() - startedAt) / (7 * 24 * 3600 * 1000)));
        classesCompleted += sessionsPerWeek * weeks;
      });
    }
    var ratings = feedback.map(function (f) {
      // Ratings come in as either a number or "5 - Very Satisfied" — pull
      // the leading integer either way.
      var raw = f && f.rating;
      if (typeof raw === "number") return raw;
      var m = String(raw || "").match(/(\d+)/);
      return m ? Number(m[1]) : NaN;
    }).filter(function (n) { return isFinite(n); });
    var avgRating = ratings.length
      ? Math.round((ratings.reduce(function (a, b) { return a + b; }, 0) / ratings.length) * 10) / 10
      : 0;
    return {
      classesCompleted: classesCompleted,
      hoursStudied: classesCompleted, // 1 hr / class
      projectsCompleted: portfolio.length,
      avgRating: avgRating,
      feedbackCount: feedback.length
    };
  }

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

  // ---- Class attendance helpers ----------------------------------
  // Records live in KEYS.attendance as an array of:
  //   { id, offeringId, classDate, studentId, status, recordedBy, recordedAt, note }
  // status ∈ "present" | "absent" | "late" | "excused"
  // Roll-up reads compute per-student presence% across selected windows.
  var ATTENDANCE_STATUSES = ["present", "absent", "late", "excused"];

  function getAttendance(filter) {
    var rows = readJson(KEYS.attendance, []) || [];
    if (!filter) return rows.slice();
    return rows.filter(function (r) {
      if (filter.offeringId && r.offeringId !== filter.offeringId) return false;
      if (filter.classDate && r.classDate !== filter.classDate) return false;
      if (filter.studentId && r.studentId !== filter.studentId) return false;
      return true;
    });
  }
  // Replace every record for a given (offeringId, classDate) with the
  // supplied list. Callers pass the full set for that session, so this
  // is upsert-with-replace semantics — simpler than per-row diffing.
  function recordAttendance(offeringId, classDate, records, opts) {
    if (!offeringId || !classDate || !Array.isArray(records)) return null;
    var existing = readJson(KEYS.attendance, []) || [];
    // Drop any prior rows for this offering+date.
    var kept = existing.filter(function (r) {
      return !(r.offeringId === offeringId && r.classDate === classDate);
    });
    var nowIso = new Date().toISOString();
    var recordedBy = (opts && opts.recordedBy) || "ops";
    var stamped = records
      .filter(function (r) { return r && r.studentId; })
      .map(function (r) {
        var status = ATTENDANCE_STATUSES.indexOf(r.status) >= 0 ? r.status : "present";
        return {
          id: r.id || ("AT-" + offeringId + "-" + classDate + "-" + r.studentId),
          offeringId: offeringId,
          classDate: classDate,
          studentId: r.studentId,
          status: status,
          note: r.note || "",
          recordedBy: recordedBy,
          recordedAt: nowIso
        };
      });
    var next = kept.concat(stamped);
    writeJson(KEYS.attendance, next);
    return stamped;
  }
  // Per-student summary: total sessions tracked + count by status.
  // Optional `sinceDays` to restrict (e.g. last 30 days for parent view).
  function getStudentAttendanceSummary(studentId, sinceDays) {
    if (!studentId) return null;
    var sinceMs = null;
    if (sinceDays) sinceMs = Date.now() - sinceDays * 24 * 3600 * 1000;
    var rows = (readJson(KEYS.attendance, []) || []).filter(function (r) {
      if (r.studentId !== studentId) return false;
      if (sinceMs) {
        var t = new Date(r.classDate || r.recordedAt || 0).getTime();
        if (t < sinceMs) return false;
      }
      return true;
    });
    var counts = { present: 0, absent: 0, late: 0, excused: 0 };
    rows.forEach(function (r) {
      if (counts[r.status] != null) counts[r.status]++;
    });
    var total = rows.length;
    var attended = counts.present + counts.late;
    var rate = total ? Math.round((attended / total) * 100) : null;
    return { total: total, counts: counts, presenceRate: rate, rows: rows };
  }

  // ---- CSV helpers (Excel-safe, BOM, RFC-4180 quoting) ------------
  // Used by the dashboard's "导出 CSV" buttons. Headers is an array of
  // [{ key, label }] objects describing which row props to project and
  // what to call them in the file. Empty/null are emitted as blanks.
  function csvEscape(v) {
    if (v == null) return "";
    var s = String(v);
    // Wrap in quotes if any special char; double internal quotes.
    if (/[",\r\n]/.test(s)) return '"' + s.replace(/"/g, '""') + '"';
    return s;
  }
  function toCsv(rows, headers) {
    if (!Array.isArray(rows)) rows = [];
    if (!Array.isArray(headers) || !headers.length) {
      // No headers supplied — derive from the first row's keys.
      var keys = rows[0] ? Object.keys(rows[0]) : [];
      headers = keys.map(function (k) { return { key: k, label: k }; });
    }
    var lines = [];
    lines.push(headers.map(function (h) { return csvEscape(h.label || h.key); }).join(","));
    rows.forEach(function (r) {
      lines.push(headers.map(function (h) {
        var v = (typeof h.value === "function") ? h.value(r) : r[h.key];
        return csvEscape(v);
      }).join(","));
    });
    return lines.join("\r\n");
  }
  function downloadCsv(filename, rows, headers) {
    var csv = toCsv(rows, headers);
    // BOM so Excel + WPS detect UTF-8 instead of mangling Chinese.
    var blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" });
    var url = URL.createObjectURL(blob);
    var a = document.createElement("a");
    a.href = url;
    a.download = filename || ("minddo-export-" + Date.now() + ".csv");
    a.style.display = "none";
    document.body.appendChild(a);
    a.click();
    setTimeout(function () {
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }, 0);
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

  // End-to-end commit for an assessment result. Writes:
  //   1. The assessment record (existing KEYS.assessments path)
  //   2. A growth-record snapshot keyed to today, so the parent
  //      Dashboard chart + skill bars pick up the new data instantly.
  //   3. The student level (KEYS.studentLevels) so Schedule auto-
  //      filters to matching offerings and Membership upgrades land
  //      on the right tier.
  // Payload shape (assessment.html builds this):
  //   { name, email, ageBand, background, goalCategory, scores:
  //     { ai, code, logic, create, project }  // 0-100 each
  //     composite: number, level: "Beginner|Intermediate|Advanced|
  //     Competition", quizCorrect, quizTotal, breakdown, level,
  //     answers, durationSec, autoSubmitted, createdAt }
  function applyAssessmentResult(payload) {
    if (!payload) return null;
    var saved = saveAssessment(payload);
    var sid = (saved && saved.studentId) || (getCurrentStudent() || {}).studentId;
    if (!sid) return saved;

    // Growth snapshot — uses the same shape buildGrowthSeries writes
    // in seedDemoData so the dashboard chart can't tell a seeded
    // record from a real one.
    if (payload.scores) {
      var period = (payload.createdAt || new Date().toISOString()).slice(0, 7);
      var growthList = readJson(KEYS.growth) || [];
      // Replace any existing same-period record for this student so
      // a retake within the same month overwrites rather than stacks.
      growthList = growthList.filter(function (r) {
        return !(String(r && r.studentId || "") === String(sid)
              && String(r && r.periodKey || "") === period);
      });
      growthList.push({
        studentId: sid,
        periodKey: period,
        createdAt: payload.createdAt || new Date().toISOString(),
        scores: {
          ai: Number(payload.scores.ai) || 0,
          code: Number(payload.scores.code) || 0,
          logic: Number(payload.scores.logic) || 0,
          create: Number(payload.scores.create) || 0,
          project: Number(payload.scores.project) || 0
        },
        teacherNote: payload.note || "",
        source: "assessment"
      });
      writeJson(KEYS.growth, growthList);
    }

    if (payload.level) setStudentLevel(sid, payload.level);
    return saved;
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
    // Referral attribution: if the signup carried a ?ref=CODE, link the
    // new account to its inviter and progress that referral to "signed_up".
    if (user.referralCode && record.email) {
      attachReferralOnSignup(record.email, user.referralCode);
    }
    return record;
  }

  function savePayment(payment) {
    var current = setCurrentStudent({
      email: payment.email
    });

    var record = appendRecord(KEYS.payments, Object.assign({}, payment, {
      email: payment.email || current.email,
      studentId: current.studentId
    }));
    // Referral lifecycle: a successful first payment progresses the
    // matching referral to "paid" and unlocks the inviter's reward.
    var emailForRef = (payment.email || current.email || "").trim();
    if (emailForRef) markReferralPaid(emailForRef);
    return record;
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

  // --------- Referral program ---------
  // Each guardian gets a deterministic 8-char code derived from their
  // accountId. We store referral records when the parent invites a
  // contact, then progress them through "sent" → "signed_up" → "paid"
  // as the lifecycle events fire. Rewards are computed lazily from
  // the records (cleaner than tracking redemptions separately).
  function referralCodeForAccount(accountId) {
    if (!accountId) return "";
    // Compact, uppercase, no ambiguous chars (no I/O/0/1).
    var alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    var hash = 0;
    var s = String(accountId);
    for (var i = 0; i < s.length; i++) {
      hash = ((hash << 5) - hash + s.charCodeAt(i)) | 0;
    }
    var u = (hash >>> 0);
    var out = "";
    for (var j = 0; j < 6; j++) {
      out += alphabet.charAt(u % alphabet.length);
      u = Math.floor(u / alphabet.length) || (u + 1);
    }
    return "MD-" + out;
  }
  function findAccountByReferralCode(code) {
    if (!code) return null;
    var normCode = String(code).trim().toUpperCase();
    var accounts = getAccounts();
    for (var i = 0; i < accounts.length; i++) {
      if (referralCodeForAccount(accounts[i].accountId) === normCode) {
        return accounts[i];
      }
    }
    return null;
  }
  function getReferrals() { return readJson(KEYS.referrals, []); }
  function getReferralsByReferrer(accountId) {
    if (!accountId) return [];
    return getReferrals().filter(function (r) {
      return r && String(r.referrerAccountId || "") === String(accountId);
    }).sort(function (a, b) {
      return new Date(b.createdAt || 0) - new Date(a.createdAt || 0);
    });
  }
  function recordReferralInvite(referrerAccountId, refereeEmail, refereeName) {
    if (!referrerAccountId || !refereeEmail) return null;
    var referrer = getAccounts().filter(function (a) { return a.accountId === referrerAccountId; })[0];
    if (!referrer) return null;
    var list = getReferrals();
    var dup = list.filter(function (r) {
      return String(r.referrerAccountId || "") === String(referrerAccountId)
        && norm(r.refereeEmail) === norm(refereeEmail);
    })[0];
    if (dup) return dup;
    var record = {
      id: genId("REF"),
      referrerAccountId: referrerAccountId,
      referrerEmail: referrer.email || "",
      code: referralCodeForAccount(referrerAccountId),
      refereeEmail: refereeEmail,
      refereeName: refereeName || "",
      status: "sent",
      createdAt: new Date().toISOString()
    };
    list.push(record);
    writeJson(KEYS.referrals, list);
    return record;
  }
  // Called from saveSignupUser when ?ref=CODE is present on the signup
  // URL. Marks the matching invite as "signed_up", or creates a fresh
  // referral if no prior invite was logged (e.g. parent shared the
  // code informally without using the formal "invite" CTA).
  function attachReferralOnSignup(refereeEmail, code) {
    if (!refereeEmail || !code) return null;
    var inviter = findAccountByReferralCode(code);
    if (!inviter) return null;
    var list = getReferrals();
    var existing = list.filter(function (r) {
      return String(r.referrerAccountId || "") === String(inviter.accountId)
        && norm(r.refereeEmail) === norm(refereeEmail);
    })[0];
    if (existing) {
      existing.status = (existing.status === "paid") ? existing.status : "signed_up";
      existing.signedUpAt = existing.signedUpAt || new Date().toISOString();
      writeJson(KEYS.referrals, list);
      return existing;
    }
    var record = {
      id: genId("REF"),
      referrerAccountId: inviter.accountId,
      referrerEmail: inviter.email || "",
      code: code,
      refereeEmail: refereeEmail,
      refereeName: "",
      status: "signed_up",
      createdAt: new Date().toISOString(),
      signedUpAt: new Date().toISOString()
    };
    list.push(record);
    writeJson(KEYS.referrals, list);
    return record;
  }
  function markReferralPaid(refereeEmail) {
    if (!refereeEmail) return false;
    var list = getReferrals();
    var changed = false;
    list.forEach(function (r) {
      if (norm(r.refereeEmail) === norm(refereeEmail) && r.status !== "paid") {
        r.status = "paid";
        r.paidAt = new Date().toISOString();
        changed = true;
      }
    });
    if (changed) writeJson(KEYS.referrals, list);
    return changed;
  }
  function getReferralRewards(accountId) {
    if (!accountId) return { earned: 0, pending: 0, paidCount: 0, signedUpCount: 0, sentCount: 0, bonus: 0, total: 0 };
    var refs = getReferralsByReferrer(accountId);
    var paidCount = 0, signedUpCount = 0, sentCount = 0;
    refs.forEach(function (r) {
      if (r.status === "paid") paidCount++;
      else if (r.status === "signed_up") signedUpCount++;
      else sentCount++;
    });
    var earned = paidCount * REFERRAL_REWARD_USD;
    var pending = signedUpCount * REFERRAL_REWARD_USD;
    var bonus = 0;
    REFERRAL_BONUS_TIERS.forEach(function (tier) {
      if (paidCount >= tier.count) bonus += tier.bonus;
    });
    return {
      earned: earned,
      pending: pending,
      bonus: bonus,
      total: earned + bonus,
      paidCount: paidCount,
      signedUpCount: signedUpCount,
      sentCount: sentCount,
      perRef: REFERRAL_REWARD_USD,
      tiers: REFERRAL_BONUS_TIERS
    };
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
      amount: 349,
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
      publishedAt: "2026-04-22T09:00:00Z",
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
      publishedAt: "2026-04-15T09:00:00Z",
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
      publishedAt: "2026-04-28T09:00:00Z",
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

  // =================================================================
  // Permission templates (RBAC for ops-side login identities)
  // -----------------------------------------------------------------
  // Each role in minddo_roles can carry a `template` ∈ this list. The
  // template defines (a) what permission set the role grants and (b)
  // whether the role is campus-scoped or global.
  //
  //   super-admin       : all campuses, all functions
  //   principal         : single-campus, full feature access (incl. $)
  //   campus-ops        : single-campus, ops features, masked $
  //   campus-marketing  : single-campus, marketing-only
  //
  // The full list of permission keys lives in PERMISSIONS for grep-ability.
  // =================================================================
  var PERMISSIONS = [
    "dashboard.view",
    "overview.view",
    "inbox.view",
    "approve.schedule",       // can approve leave / reschedule requests
    "approve.finance",        // can approve refunds / expenses / reimbursements
    "marketing.view", "marketing.write",
    "academic.view", "academic.write",
    "schedule.view",
    "attendance.view", "attendance.write",
    "students.view", "students.write",
    "students.status",        // can change a student's status (paused / withdrawn)
    "finance.view",           // can open the 财务中心 tab at all
    "finance.detail",         // sees raw $ amounts (orders, refunds, billing)
    "finance.payroll",        // sees 工资管理 sub-tab
    "finance.contracts",      // sees 电子合同 sub-tab
    "finance.renewals",       // sees 续费看板 sub-tab
    "data.view",
    "data.finance",           // financial widgets inside 数据中心
    "internal.view",          // sees 内部管理 (staff + roles, all campuses)
    "internal.view.campus",   // read-only own-campus staff list (no roles editor)
    "settings.view",          // global settings (all campuses)
    "settings.view.campus",   // own-campus settings only (hours / trial slots / classrooms)
    "shift.write",            // write shift-handover notes for own campus
    "audit.view"
  ];

  var PERMISSION_TEMPLATES = {
    "super-admin": {
      campusScope: "all",
      perms: ["*"]
    },
    "principal": {
      campusScope: "single",
      perms: ["*"]                       // full feature, but single-campus
    },
    "campus-ops": {
      campusScope: "single",
      perms: [
        "dashboard.view", "overview.view",
        "inbox.view", "approve.schedule",      // schedule approvals only — no refunds
        "marketing.view",                      // read-only CRM + trial table
        "academic.view", "academic.write",
        "schedule.view",
        "attendance.view", "attendance.write",
        "students.view", "students.write", "students.status",
        "finance.view", "finance.renewals",    // no detail / payroll / contracts
        "data.view",                           // no data.finance
        "internal.view.campus",                // own-campus staff (read-only)
        "settings.view.campus",                // own-campus settings only
        "shift.write"                          // 交班记录
      ]
    },
    "campus-marketing": {
      campusScope: "single",
      perms: [
        "dashboard.view", "overview.view",
        "marketing.view", "marketing.write",
        "data.view"
      ]
    }
  };

  // Role id → template. The 4 simplified roles map to themselves; the
  // older 13-role taxonomy is kept here too so any stale staff records
  // mid-migration still resolve to the right permission set.
  var ROLE_TEMPLATE_MAP = {
    // Simplified 4-role model (current)
    "super-admin":       "super-admin",
    "principal":         "principal",
    "campus-ops":        "campus-ops",
    "campus-marketing":  "campus-marketing",
    // Legacy ids (auto-collapsed by the 2026-05-rbac-collapse-roles
    // migration; kept as a safety net for any storage that hasn't
    // migrated yet).
    "owner":             "super-admin",
    "admin":             "super-admin",
    "campus-manager":    "principal",
    "academic-lead":     "principal",
    "finance":           "principal",
    "operations":        "campus-ops",
    "counselor":         "campus-ops",
    "frontdesk":         "campus-ops",
    "homeroom":          "campus-ops",
    "instructor-senior": "campus-ops",
    "instructor":        "campus-ops",
    "instructor-intern": "campus-ops",
    "marketing":         "campus-marketing"
  };

  function resolveTemplate(roleId) {
    if (!roleId) return null;
    var key = ROLE_TEMPLATE_MAP[roleId];
    if (!key) return null;
    var spec = PERMISSION_TEMPLATES[key];
    if (!spec) return null;
    return Object.assign({ id: key }, spec);
  }

  function getActivePermissions() {
    var active = getActiveOpsUser();
    if (!active || !active.staff) return null;
    var tmpl = resolveTemplate(active.staff.roleId);
    return tmpl || null;
  }
  function hasPerm(perm) {
    if (!perm) return true;
    var tmpl = getActivePermissions();
    if (!tmpl) return false;
    if (tmpl.perms.indexOf("*") >= 0) return true;
    if (tmpl.perms.indexOf(perm) >= 0) return true;
    // Broader perm implies its ".campus" variant — so a holder of
    // "internal.view" automatically passes a check for
    // "internal.view.campus", and "settings.view" passes
    // "settings.view.campus". This lets one sidebar gate cover both
    // global admins and campus-scoped operators without duplicating
    // perm strings on the HTML.
    if (perm.indexOf(".campus") > 0) {
      var broader = perm.replace(/\.campus$/, "");
      if (tmpl.perms.indexOf(broader) >= 0) return true;
    }
    return false;
  }
  function getActiveCampusScope() {
    var active = getActiveOpsUser();
    if (!active || !active.staff) return null;
    var tmpl = resolveTemplate(active.staff.roleId);
    if (!tmpl) return null;
    return {
      scope: tmpl.campusScope,                  // "all" | "single"
      campus: active.staff.campus || null,      // null when scope === "all"
      template: tmpl.id
    };
  }
  function inCampusScope(campusKey) {
    var s = getActiveCampusScope();
    if (!s) return false;
    if (s.scope === "all") return true;
    if (!s.campus) return true;                  // staff without a campus assigned
    if (!campusKey || campusKey === "all" || campusKey === "__none__") return true;
    return campusKey === s.campus;
  }
  // Money masking — caller decides what to render when no .detail perm.
  function maskMoney(amount, opts) {
    if (hasPerm("finance.detail")) return amount;
    return (opts && opts.placeholder) || "***";
  }

  // ---- Seed-version + active-ops-user (for "log in as role" testing) --
  // Bump SEED_VERSION whenever seedDemoData adds/changes shape so existing
  // localStorage gets refreshed automatically on next page load. Active
  // ops user is the staff record the dashboard treats as "currently
  // logged in" — visible in the topbar and switchable from the user menu.
  var SEED_VERSION = "2026-05-roles-v1";
  var KEY_SEED_VERSION = "minddo_seed_version";
  var KEY_ACTIVE_OPS_USER = "minddo_active_ops_user";

  function getSeedVersion() {
    try { return localStorage.getItem(KEY_SEED_VERSION) || ""; } catch (_) { return ""; }
  }
  function markSeedFresh() {
    try { localStorage.setItem(KEY_SEED_VERSION, SEED_VERSION); } catch (_) {}
  }
  function isSeedStale() { return getSeedVersion() !== SEED_VERSION; }

  function getActiveOpsUser() {
    try {
      var sid = localStorage.getItem(KEY_ACTIVE_OPS_USER);
      if (!sid) return null;
      var staff = readJson(KEYS.staff) || [];
      var roles = readJson(KEYS.roles) || [];
      var rec = staff.filter(function (s) { return s.id === sid; })[0];
      if (!rec) return null;
      var role = roles.filter(function (r) { return r.id === rec.roleId; })[0] || null;
      return { staff: rec, role: role };
    } catch (_) { return null; }
  }
  function setActiveOpsUser(staffId) {
    try {
      if (staffId) localStorage.setItem(KEY_ACTIVE_OPS_USER, staffId);
      else localStorage.removeItem(KEY_ACTIVE_OPS_USER);
    } catch (_) {}
    return getActiveOpsUser();
  }
  // "Log in as the highest-privilege role we have." Walks the staff list
  // looking for the first active member whose role.category matches; the
  // owner / admin pair sits at the top of the role hierarchy.
  function loginAsRole(roleCategory, opts) {
    var staff = readJson(KEYS.staff) || [];
    var roles = readJson(KEYS.roles) || [];
    var prefer = (opts && opts.preferRoleId) || null;
    if (prefer) {
      var direct = staff.filter(function (s) { return s.roleId === prefer && s.status === "active"; })[0];
      if (direct) return setActiveOpsUser(direct.id);
    }
    var match = staff.filter(function (s) {
      if (s.status !== "active") return false;
      var r = roles.filter(function (rr) { return rr.id === s.roleId; })[0];
      return r && r.category === roleCategory;
    })[0];
    if (match) return setActiveOpsUser(match.id);
    return null;
  }

  // Pick a sane default ops user after every fresh seed: super-admin if
  // present, otherwise principal, otherwise any active staff. Falls back
  // through legacy IDs too in case migration hasn't run yet.
  function defaultActiveOpsUser() {
    var staff = readJson(KEYS.staff) || [];
    function pickByRoleId(id) {
      return staff.filter(function (s) { return s.roleId === id && s.status === "active"; })[0];
    }
    return pickByRoleId("super-admin")
        || pickByRoleId("principal")
        || pickByRoleId("owner")          // legacy
        || pickByRoleId("admin")          // legacy
        || pickByRoleId("campus-manager") // legacy
        || staff[0];
  }

  // =================================================================
  // seedDemoData — full demo bootstrap. Wipes localStorage and reseeds
  // every namespace from scratch. Used only on first-time visits or
  // when ops explicitly hits "重置示例数据". For schema upgrades on
  // returning visitors, prefer adding a MIGRATIONS entry instead so
  // user progress isn't lost.
  //
  // Sections (in execution order):
  //   1. STUDENT JOURNEY  — currentStudent, leads, assessments,
  //                         signups, payments, memberships,
  //                         feedback, requests
  //   2. ACADEMIC         — portfolio, growth records, assignments,
  //                         student levels (canonical)
  //   3. MARKETING        — referrals
  //   4. FINANCE          — payroll, contracts, approvals
  //   5. INTERNAL         — staff + roles (with sensible defaults)
  //   6. ACTIVATION       — markSeedFresh + pick default ops user
  // =================================================================
  function seedDemoData() {
    clearFlowData();

    var now = new Date();
    function daysAgo(days) {
      var d = new Date(now);
      d.setDate(d.getDate() - days);
      return d.toISOString();
    }

    // ---- Section 1: STUDENT JOURNEY ----
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

    function dayString(offset) {
      var d = new Date(now); d.setDate(d.getDate() + offset);
      return d.toISOString().slice(0, 10);
    }
    writeJson(KEYS.leads, [
      {
        studentName: student.studentName,
        studentId: student.studentId,
        grade: student.grade, birthday: student.birthday,
        parentName: student.parentName, phone: student.phone,
        city: student.city, email: student.email,
        campus: "irvine", campusLabel: "加州 · 尔湾校区",
        trialDate: now.toISOString().slice(0, 10), trialTime: "18:30",
        channel: "wechat", channelLabel: "微信/社群",
        goal: student.goal, timeNote: "Prefer weekday evening slots.",
        consent: true, createdAt: daysAgo(5),
        crmStatus: "won", trialStatus: "done"
      },
      // ---- Marketing-CRM seed: a spread across pipeline stages so the
      // 市场中心 tab shows visible variety in the lead list + trial table.
      {
        studentName: "王浩",
        parentName: "王女士", phone: "626-555-0142",
        email: "wang.parent@example.com",
        campus: "arcadia", campusLabel: "加州 · 阿凯迪亚校区",
        trialDate: dayString(2), trialTime: "16:00",
        channel: "google", channelLabel: "Google 搜索",
        goal: "AI 编程入门", consent: true,
        createdAt: daysAgo(2),
        crmStatus: "follow", trialStatus: "confirmed"
      },
      {
        studentName: "陈乐",
        parentName: "陈先生", phone: "650-555-0163",
        email: "chen.parent@example.com",
        campus: "diamond-bar", campusLabel: "加州 · 钻石吧校区",
        trialDate: dayString(4), trialTime: "10:00",
        channel: "referral", channelLabel: "老学员推荐",
        goal: "项目营冲刺", consent: true,
        createdAt: daysAgo(1),
        crmStatus: "new", trialStatus: "booked"
      },
      {
        studentName: "林皓",
        parentName: "林女士", phone: "323-555-0177",
        email: "lin.family@example.com",
        campus: "hollywood", campusLabel: "加州 · 好莱坞校区",
        trialDate: dayString(0), trialTime: "19:00",
        channel: "instagram", channelLabel: "Instagram",
        goal: "AI 创意工坊", consent: true,
        createdAt: daysAgo(0),
        crmStatus: "new", trialStatus: "booked"
      },
      {
        studentName: "周雨",
        parentName: "周先生", phone: "858-555-0190",
        email: "zhou.parent@example.com",
        campus: "san-diego", campusLabel: "加州 · 圣地亚哥校区",
        trialDate: dayString(-12), trialTime: "15:30",
        channel: "tiktok", channelLabel: "抖音 / TikTok",
        goal: "兴趣探索", consent: true,
        createdAt: daysAgo(35),
        crmStatus: "lost", trialStatus: "noshow"
      }
    ]);

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
      amount: 349,
      source: "email",
      studentId: student.studentId,
      createdAt: daysAgo(2)
    }]);

    writeJson(KEYS.memberships, [{
      email: student.email,
      studentName: student.studentName,
      studentId: student.studentId,
      plan: "weekly2",
      addons: ["addon-1on1"],
      classMode: "1v1",
      billingCycle: "monthly",
      sessions: [
        { offeringId: "ai-fund-mon-16", courseName: "AI 启蒙入门", courseNameZh: "AI 启蒙入门", courseNameEn: "AI Fundamentals", level: "入门", teacher: "Dr. Sarah Chen", classMode: "small", dayKey: "mon", weekday: "周一", weekdayZh: "周一", weekdayEn: "Mon", slotKey: "t16", slotLabel: "16:00 – 17:00", timeSlot: "16:00 – 17:00" },
        { offeringId: "ai-fund-wed-16", courseName: "AI 启蒙入门", courseNameZh: "AI 启蒙入门", courseNameEn: "AI Fundamentals", level: "入门", teacher: "Dr. Sarah Chen", classMode: "small", dayKey: "wed", weekday: "周三", weekdayZh: "周三", weekdayEn: "Wed", slotKey: "t16", slotLabel: "16:00 – 17:00", timeSlot: "16:00 – 17:00" }
      ],
      weekday: "周一",
      timeSlot: "16:00 – 17:00",
      totalMonthly: "$349.00",
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

    // Provision the demo guardian account up-front so the family /
    // referral / settings tabs have a stable accountId to bind against
    // (otherwise account creation only happens later in
    // migrateLegacySignups, after seedDemoData returns).
    var demoAccount = provisionGuardianPrimary({
      email: student.email,
      studentName: student.studentName,
      studentId: student.studentId,
      parentName: student.parentName,
      phone: student.phone,
      grade: student.grade,
      birthday: student.birthday,
      password: ""
    });
    var demoAcctId = (demoAccount && demoAccount.accountId) || "";
    // Belt-and-braces: explicitly upsert the student entity with full
    // profile data so the kid card on the family panel always picks up
    // grade / birthday even if a prior seedDemoData run left a partial
    // record around.
    upsertStudent({
      studentId: student.studentId,
      familyId: demoAccount && demoAccount.familyId,
      name: student.studentName,
      grade: student.grade,
      birthday: student.birthday,
      gender: student.gender || "",
      email: student.email,
      phone: student.phone
    });
    // Auto-provision the primary student's learning login. The
    // provisionGuardianPrimary path only creates the *guardian* account;
    // without this, 李若安 would never get an email/password pair on the
    // Settings → Family card while 李若涵 (added via addChildToFamily)
    // would.
    if (demoAccount && demoAccount.familyId) {
      autoProvisionStudentAccount(demoAccount.familyId, student.studentId);
    }

    // Second demo child — exercises the multi-kid family panel + the
    // per-kid Schedule / Overview / Membership rendering paths.
    if (demoAccount && demoAccount.familyId) {
      addChildToFamily(demoAccount.familyId, {
        studentId: "MD2026-0418",
        name: "李若涵",
        grade: "五年级",
        birthday: "2015-09-12",
        gender: "female"
      });
    }

    // ---- Section 2: ACADEMIC ----
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

    // Six monthly growth snapshots per kid. Both ramp up over time but
    // start from different baselines and weight skills differently so
    // the dashboard's per-skill bars + composite line look distinct
    // when the parent flips between kids on the family panel.
    function buildGrowthSeries(studentId, monthsBack, baselines, slope) {
      var series = [];
      for (var i = monthsBack - 1; i >= 0; i--) {
        var d = new Date(now);
        d.setMonth(d.getMonth() - i);
        d.setDate(15); // mid-month so chart x-positions are stable
        var scores = {};
        var step = (monthsBack - 1 - i); // 0..monthsBack-1
        GROWTH_SKILLS.forEach(function (s) {
          var base = baselines[s.id] != null ? baselines[s.id] : 60;
          var perStep = slope[s.id] != null ? slope[s.id] : 3;
          // Tiny deterministic wobble keyed on step so the line isn't a
          // perfectly straight ramp.
          var wobble = ((step * 7 + s.id.length * 3) % 5) - 2;
          var v = Math.max(0, Math.min(100, Math.round(base + perStep * step + wobble)));
          scores[s.id] = v;
        });
        series.push({
          studentId: studentId,
          periodKey: d.toISOString().slice(0, 7),
          createdAt: d.toISOString(),
          scores: scores,
          // Lightweight teacher note — surfaced on hover/tooltip later.
          teacherNote: i === 0 ? "近月作品质量稳定，建议进入项目工坊。" : ""
        });
      }
      return series;
    }
    var growthRecords = [].concat(
      // 李若安 (older, more advanced) — strong AI/coding, steady growth.
      buildGrowthSeries(student.studentId, 6,
        { ai: 64, code: 60, logic: 68, create: 70, project: 58 },
        { ai: 4,  code: 5,  logic: 3,  create: 3,  project: 5 }),
      // 李若涵 (5th grade, newer) — lower start, steeper creativity slope.
      buildGrowthSeries("MD2026-0418", 6,
        { ai: 50, code: 46, logic: 58, create: 64, project: 48 },
        { ai: 3,  code: 4,  logic: 3,  create: 5,  project: 4 })
    );
    writeJson(KEYS.growth, growthRecords);

    // Billing profile — one record per family carrying the payment
    // method on file. Demo Visa ending 4242 with a future expiry.
    if (demoAccount && demoAccount.familyId) {
      writeJson(KEYS.billingProfile, [{
        familyId: demoAccount.familyId,
        paymentMethod: {
          brand: "visa",
          last4: "4242",
          expMonth: 12,
          expYear: 2028,
          holderName: "Li Mom",
          zip: "92614"
        },
        createdAt: now.toISOString()
      }]);
    }

    // Homework / assignment seed — mixed-status set spanning both kids
    // so the new Homework tab demos every state (assigned, in-progress,
    // submitted, graded) without needing a parent to click through.
    function dueIn(days, hour) {
      var d = new Date(now);
      d.setDate(d.getDate() + days);
      if (hour != null) d.setHours(hour, 0, 0, 0);
      return d.toISOString();
    }
    writeJson(KEYS.assignments, [
      {
        id: "HW-LIRO-001",
        studentId: student.studentId,
        courseName: { zh: "AI 启蒙入门", en: "AI Fundamentals" },
        title: { zh: "动手 Prompt：写 3 个不一样风格的小诗", en: "Prompt practice: 3 short poems, different styles" },
        brief: {
          zh: "用 ChatGPT 或类似工具，写出三段不同风格的小诗（古风 / 童趣 / 科幻），各 4 行以内。把你给 AI 的 prompt 也一起截图提交。",
          en: "Use ChatGPT or a similar tool to write three short poems in different styles (classical / playful / sci-fi), each up to 4 lines. Submit a screenshot of the prompt you used."
        },
        teacher: "Dr. Sarah Chen",
        points: 10,
        assignedAt: daysAgo(1),
        dueAt: dueIn(2, 19),
        status: "assigned"
      },
      {
        id: "HW-LIRO-002",
        studentId: student.studentId,
        courseName: { zh: "AI 启蒙入门", en: "AI Fundamentals" },
        title: { zh: "AI 工具体验日记", en: "AI tool field notes" },
        brief: {
          zh: "试用 2 个生活里的 AI 应用（导航、翻译、推荐都行），用 80 字写一段「这个 AI 帮我做了什么 / 哪里还不太聪明」。",
          en: "Try two AI tools you use in real life (navigation, translation, recommendations…). Write 80 words on what the AI did well and where it still feels dumb."
        },
        teacher: "Dr. Sarah Chen",
        points: 10,
        assignedAt: daysAgo(3),
        dueAt: dueIn(5, 21),
        status: "in_progress"
      },
      {
        id: "HW-LIRO-003",
        studentId: student.studentId,
        courseName: { zh: "AI 创意工坊", en: "AI Creative Studio" },
        title: { zh: "校园物品共享 · 项目营答辩准备", en: "Campus Share — project camp pitch prep" },
        brief: {
          zh: "把上周做的物品共享原型，整理成一份 5 页的答辩 deck（第一页：要解决什么问题；第二页：用户旅程；第三页：核心功能；第四页：演示截图；第五页：下一步）。",
          en: "Polish last week's borrow-and-return prototype into a 5-slide pitch deck (1: problem · 2: user journey · 3: core feature · 4: screenshots · 5: next steps)."
        },
        teacher: "David Park",
        points: 20,
        assignedAt: daysAgo(7),
        dueAt: daysAgo(1),
        submittedAt: daysAgo(2),
        submissionText: "已上传 5 页 deck，演示视频 1 分 20 秒。",
        submissionUrl: "https://drive.google.com/demo-shared-link",
        status: "submitted"
      },
      {
        id: "HW-LIRO-004",
        studentId: student.studentId,
        courseName: { zh: "AI 编程进阶", en: "AI Programming" },
        title: { zh: "Python 列表练习：Top-5 提取", en: "Python lists: extract Top-5" },
        brief: {
          zh: "给定一个 20 个数字的列表，用循环找出其中最大的 5 个数字并按从大到小输出。代码 + 一段 30 字解释。",
          en: "Given a list of 20 numbers, use a loop to find the largest 5 and print them in descending order. Submit the code + a 30-word explanation."
        },
        teacher: "Jenny Lin",
        points: 15,
        assignedAt: daysAgo(14),
        dueAt: daysAgo(7),
        submittedAt: daysAgo(8),
        submissionText: "用 sort() 加切片完成，但没用循环。",
        submissionUrl: "",
        status: "graded",
        grade: { score: 13, max: 15, comment: { zh: "结果对，但题目要求用循环理解过程；下次试试自己实现冒泡。", en: "Result correct but the brief asks for a loop-based approach. Next time try your own bubble pass." } }
      },
      {
        id: "HW-LIHA-001",
        studentId: "MD2026-0418",
        courseName: { zh: "AI 启蒙入门", en: "AI Fundamentals" },
        title: { zh: "找一个 AI 应用并解释给爸妈听", en: "Find an AI app and explain it to your parents" },
        brief: {
          zh: "找一个生活里看到的 AI 应用，用 1 分钟向爸妈解释它「在做什么、怎么做到的」。可以录一小段视频。",
          en: "Pick an AI app you've spotted in real life. Spend 1 minute explaining to a parent what it does and how. Optionally record a short video."
        },
        teacher: "Dr. Sarah Chen",
        points: 10,
        assignedAt: daysAgo(2),
        dueAt: dueIn(4, 19),
        status: "assigned"
      },
      {
        id: "HW-LIHA-002",
        studentId: "MD2026-0418",
        courseName: { zh: "AI 启蒙入门", en: "AI Fundamentals" },
        title: { zh: "Scratch 小练习：让小猫走 5 步", en: "Scratch warmup: walk the cat 5 steps" },
        brief: {
          zh: "用 Scratch 拖出「重复 5 次」积木，让小猫每次走 10 步并喵一声。完成后把项目链接贴上来。",
          en: "Drag a 'repeat 5 times' block in Scratch — make the cat walk 10 steps and meow each time. Paste the project link when done."
        },
        teacher: "Jenny Lin",
        points: 10,
        assignedAt: daysAgo(10),
        dueAt: daysAgo(5),
        submittedAt: daysAgo(6),
        submissionText: "完成了，小猫走得有点快。",
        submissionUrl: "https://scratch.mit.edu/projects/demo",
        status: "graded",
        grade: { score: 10, max: 10, comment: { zh: "完成度满分！下一次试试加一个声音变化。", en: "Full marks! Next time, try varying the sound." } }
      }
    ]);

    // ---- Section 3: MARKETING ----
    // Sample referrals: one paid (reward earned), one signed up (pending),
    // one still in "sent" status. Bound to the demo account provisioned
    // above so the parent hub can resolve them by accountId.
    writeJson(KEYS.referrals, [
      {
        id: "REF-DEMO-1",
        referrerAccountId: demoAcctId,
        referrerEmail: student.email,
        code: referralCodeForAccount(demoAcctId),
        refereeEmail: "wangmom@example.com",
        refereeName: "王女士",
        status: "paid",
        createdAt: daysAgo(20),
        signedUpAt: daysAgo(15),
        paidAt: daysAgo(10)
      },
      {
        id: "REF-DEMO-2",
        referrerAccountId: demoAcctId,
        referrerEmail: student.email,
        code: referralCodeForAccount(demoAcctId),
        refereeEmail: "chen.parent@example.com",
        refereeName: "陈先生",
        status: "signed_up",
        createdAt: daysAgo(8),
        signedUpAt: daysAgo(4)
      },
      {
        id: "REF-DEMO-3",
        referrerAccountId: demoAcctId,
        referrerEmail: student.email,
        code: referralCodeForAccount(demoAcctId),
        refereeEmail: "neighbor@example.com",
        refereeName: "邻居张家",
        status: "sent",
        createdAt: daysAgo(2)
      }
    ]);

    // ---- Section 4: FINANCE ----
    // Finance Center seed: payroll, e-contracts, approvals.
    // Mock data so the new finance sub-tabs render with visible variety;
    // each entry is shaped like what an LMS-style ops product would
    // expect, so the demo reads as plausible rather than placeholder.
    writeJson(KEYS.payroll, [
      { teacher: "Dr. Sarah Chen",  role: "讲师",     classes: 12, hours: 36, rate: 75, total: 2700, status: "paid",    period: "2026-04" },
      { teacher: "Jenny Lin",       role: "讲师",     classes: 10, hours: 30, rate: 65, total: 1950, status: "paid",    period: "2026-04" },
      { teacher: "Marcus Johnson",  role: "高级讲师", classes:  8, hours: 24, rate: 90, total: 2160, status: "pending", period: "2026-04" },
      { teacher: "David Park",      role: "高级讲师", classes:  9, hours: 27, rate: 95, total: 2565, status: "pending", period: "2026-04" },
      { teacher: "Amy Cheng",       role: "实习",     classes:  6, hours: 12, rate: 35, total:  420, status: "pending", period: "2026-04" },
      { teacher: "Wei Zhang",       role: "教学主管", classes:  4, hours: 12, rate: 110, total: 1320, status: "paid",   period: "2026-04" }
    ]);

    writeJson(KEYS.contracts, [
      { id: "CON-2026-001", party: "李若安 (家长 李女士)", type: "enrollment", signedAt: daysAgo(48),  expiresAt: daysAgo(-317), status: "signed" },
      { id: "CON-2026-002", party: "王浩 (家长 王女士)",   type: "enrollment", signedAt: daysAgo(12),  expiresAt: daysAgo(-353), status: "signed" },
      { id: "CON-2026-003", party: "陈乐 (家长 陈先生)",   type: "enrollment", signedAt: "",             expiresAt: "",             status: "pending" },
      { id: "CON-2025-088", party: "Dr. Sarah Chen",      type: "employment", signedAt: daysAgo(364), expiresAt: daysAgo(1),   status: "expiring" },
      { id: "CON-2025-091", party: "Jenny Lin",           type: "employment", signedAt: daysAgo(280), expiresAt: daysAgo(-85),  status: "signed" },
      { id: "CON-2025-094", party: "Marcus Johnson",      type: "employment", signedAt: daysAgo(190), expiresAt: daysAgo(-175), status: "signed" },
      { id: "CON-2024-019", party: "Irvine 校区物业",      type: "lease",     signedAt: daysAgo(720), expiresAt: daysAgo(-365), status: "signed" },
      { id: "CON-2025-070", party: "Diamond Bar 校区物业", type: "lease",     signedAt: daysAgo(330), expiresAt: daysAgo(35),  status: "expired" }
    ]);

    writeJson(KEYS.approvals, [
      { id: "AP-2026-001", type: "refund",   requester: "陈先生",      detail: "课程冲突，申请退订未上课时", amount: 150,  submittedAt: daysAgo(1),  status: "pending"  },
      { id: "AP-2026-002", type: "leave",    requester: "Dr. Sarah Chen", detail: "本周三因家庭事务请假",       amount: 0,    submittedAt: daysAgo(2),  status: "pending"  },
      { id: "AP-2026-003", type: "expense",  requester: "Jenny Lin",      detail: "项目营物料采购报销",         amount: 320,  submittedAt: daysAgo(4),  status: "pending"  },
      { id: "AP-2026-004", type: "resched",  requester: "李女士",         detail: "周二改至周四同时段",         amount: 0,    submittedAt: daysAgo(3),  status: "approved" },
      { id: "AP-2026-005", type: "payroll",  requester: "Marcus Johnson", detail: "课时费上调申请 +$10/h",      amount: 240,  submittedAt: daysAgo(7),  status: "approved" },
      { id: "AP-2026-006", type: "refund",   requester: "周先生",         detail: "孩子不再上课，申请退余额",   amount: 580,  submittedAt: daysAgo(9),  status: "rejected" }
    ]);

    // ---- Section 5: INTERNAL ----
    // Internal Management seed: staff + roles.
    // Staff list spans teaching, ops, and operations roles so the
    // 内部管理 → 员工 view shows real variety. Each staff entry
    // carries a roleId that joins to the roles seed below.
    writeJson(KEYS.staff, [
      { id: "EM001", name: "Dr. Sarah Chen",  roleId: "campus-ops", campus: "irvine",      department: "教学部", email: "sarah@minddo.local",  phone: "626-555-0102", status: "active",  joinedAt: daysAgo(450) },
      { id: "EM002", name: "Jenny Lin",       roleId: "campus-ops",        campus: "irvine",      department: "教学部", email: "jenny@minddo.local",  phone: "626-555-0118", status: "active",  joinedAt: daysAgo(380) },
      { id: "EM003", name: "Marcus Johnson",  roleId: "campus-ops", campus: "diamond-bar", department: "教学部", email: "marcus@minddo.local", phone: "626-555-0134", status: "active",  joinedAt: daysAgo(220) },
      { id: "EM004", name: "David Park",      roleId: "principal",     campus: "arcadia",     department: "教学部", email: "david@minddo.local",  phone: "626-555-0156", status: "active",  joinedAt: daysAgo(560) },
      { id: "EM005", name: "Wei Zhang",       roleId: "principal",    campus: "irvine",      department: "运营部", email: "wei@minddo.local",    phone: "626-555-0173", status: "active",  joinedAt: daysAgo(610) },
      { id: "EM006", name: "Amy Cheng",       roleId: "campus-ops", campus: "arcadia",     department: "教学部", email: "amy@minddo.local",    phone: "626-555-0188", status: "active",  joinedAt: daysAgo(60)  },
      { id: "EM007", name: "Kevin Wu",        roleId: "campus-marketing",         campus: "diamond-bar", department: "市场部", email: "kevin@minddo.local",  phone: "626-555-0210", status: "active",  joinedAt: daysAgo(180) },
      { id: "EM008", name: "Iris Yang",       roleId: "principal",           campus: "arcadia",     department: "财务部", email: "iris@minddo.local",   phone: "626-555-0225", status: "leave",   joinedAt: daysAgo(420) },
      { id: "EM009", name: "Lily Hsu",        roleId: "campus-ops",         campus: "irvine",      department: "运营部", email: "lily@minddo.local",   phone: "626-555-0246", status: "active",  joinedAt: daysAgo(150) },
      { id: "EM010", name: "Tom Liu",         roleId: "campus-marketing",         campus: "diamond-bar", department: "市场部", email: "tom@minddo.local",    phone: "626-555-0262", status: "inactive",joinedAt: daysAgo(540) },
      { id: "EM011", name: "Alex Chen",       roleId: "super-admin",             campus: null,          department: "管理层", email: "alex@minddo.local",   phone: "626-555-0301", status: "active",  joinedAt: daysAgo(900) },
      { id: "EM012", name: "Grace Wang",      roleId: "super-admin",             campus: null,          department: "管理层", email: "grace@minddo.local",  phone: "626-555-0312", status: "active",  joinedAt: daysAgo(720) },
      { id: "EM013", name: "Sophia Lee",      roleId: "campus-ops",        campus: "irvine",      department: "运营部", email: "sophia@minddo.local", phone: "626-555-0324", status: "active",  joinedAt: daysAgo(280) },
      { id: "EM014", name: "Daniel Liu",      roleId: "campus-ops",         campus: "diamond-bar", department: "运营部", email: "daniel@minddo.local", phone: "626-555-0335", status: "active",  joinedAt: daysAgo(200) },
      { id: "EM015", name: "Rachel Kim",      roleId: "campus-ops",          campus: "irvine",      department: "教学部", email: "rachel@minddo.local", phone: "626-555-0347", status: "active",  joinedAt: daysAgo(310) }
    ]);

    writeJson(KEYS.roles, [
      // Simplified 4-role login model. The detailed 13-role taxonomy
      // (instructors / counselor / frontdesk / …) was collapsed into
      // these four to keep the demo aligned with the permission matrix.
      { id: "super-admin",      template: "super-admin",      name: "超级管理员",   nameEn: "Super Admin",          category: "admin", desc: "可查看全部校区的所有运营 / 教务 / 财务功能与数据。",         descEn: "Sees every campus and every module across the ops dashboard.",                                          permissions: ["*.write"] },
      { id: "principal",        template: "principal",        name: "校长账户",     nameEn: "Principal",            category: "admin", desc: "适合校区校长，可查看本校区的全部功能与数据（含财务详情）。", descEn: "For a single campus's principal. Sees every module within that campus, including raw finance amounts.", permissions: ["*.write"] },
      { id: "campus-ops",       template: "campus-ops",       name: "校区运营",     nameEn: "Campus Operations",    category: "ops",   desc: "本校区运营 / 教务 / 出勤 / 续费等日常功能，金额信息脱敏。",  descEn: "Single-campus ops / academic / attendance / renewals — finance amounts masked.",                       permissions: ["academic.write", "students.write", "attendance.write"] },
      { id: "campus-marketing", template: "campus-marketing", name: "校区市场运营", nameEn: "Campus Marketing Ops", category: "ops",   desc: "本校区获客相关：试听、CRM、招生渠道、招生数据。",            descEn: "Single-campus marketing only: trials, CRM, channels, enrollment data.",                                permissions: ["leads.write", "marketing.write"] }
    ])

    // ---- Section 6: ACTIVATION ----
    // Stamp the seed version + pick a default ops user (owner) so the
    // dashboard topbar lights up with the highest-privilege identity
    // straight after a fresh seed.
    markSeedFresh();
    var defaultOps = defaultActiveOpsUser();
    if (defaultOps) setActiveOpsUser(defaultOps.id);
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
  // 🔴 DEMO ONLY: stores the password verbatim with a "plain:" prefix.
  // The frontend prototype has no server / hashing infrastructure; a real
  // deployment must replace this with a salted KDF behind a backend API.
  // We warn loudly the first time we hash so anyone exploring the code
  // in DevTools sees this isn't production behaviour.
  var __pwWarned = false;
  function hashPassword(plain) {
    if (!__pwWarned && typeof console !== "undefined" && console.warn) {
      __pwWarned = true;
      console.warn("[MindDo demo] passwords are stored unhashed in localStorage. Do not deploy this build.");
    }
    return "plain:" + String(plain || "");
  }
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

  // ---- Audit log ------------------------------------------------------
  // Append-only history of meaningful ops actions. Each entry:
  //   { id, at, actor, kind, target, summary, before, after }
  // Caller passes a "summary" string so the log is readable without
  // diffing JSON in DevTools.
  function appendAudit(entry) {
    if (!entry) return;
    var list = readJson(KEYS.auditLog, []) || [];
    var row = Object.assign({
      id: "AU-" + Date.now() + "-" + Math.floor(Math.random() * 1000),
      at: new Date().toISOString()
    }, entry);
    // Keep the log bounded so demo storage doesn't grow unbounded.
    list.push(row);
    if (list.length > 500) list = list.slice(list.length - 500);
    writeJson(KEYS.auditLog, list);
    return row;
  }
  function getAuditLog(filter) {
    var rows = readJson(KEYS.auditLog, []) || [];
    if (!filter) return rows.slice();
    return rows.filter(function (r) {
      if (filter.kind && r.kind !== filter.kind) return false;
      if (filter.target && r.target !== filter.target) return false;
      return true;
    });
  }

  // ---- updateStudentProfile -------------------------------------------
  // One-stop save used by the dashboard's student-detail drawer. Handles:
  //   - upsertStudent (the per-student record)
  //   - latest membership's parent contact fields (parentName/phone/email)
  //   - currentStudent mirror (if this is the active one)
  //   - setStudentLevel
  //   - email migration across leads/payments/feedback when changed
  //   - audit log entry with a friendly summary
  function updateStudentProfile(studentId, patch, opts) {
    if (!studentId || !patch) return null;
    var before = findStudentById(studentId) || {};
    var prevEmail = norm(before.email);
    var nextEmail = patch.email != null ? norm(patch.email) : prevEmail;

    // 1. Upsert the student record itself.
    var saved = upsertStudent(Object.assign({}, before, patch, { studentId: studentId }));

    // 2. Mirror to currentStudent if same id.
    try {
      var cur = getCurrentStudent();
      if (cur && cur.studentId === studentId) {
        writeJson(KEYS.currentStudent, Object.assign({}, cur, saved));
      }
    } catch (_) {}

    // 3. Update the parent-contact fields on the latest membership for
    //    this student (those are what the schedule / dashboard reads).
    try {
      var mems = readJson(KEYS.memberships, []) || [];
      var changed = false;
      mems.forEach(function (m) {
        if (m && m.studentId === studentId) {
          if (patch.parentName != null) { m.parentName = patch.parentName; changed = true; }
          if (patch.phone != null)      { m.phone = patch.phone; changed = true; }
          if (patch.email != null)      { m.email = patch.email; changed = true; }
          if (patch.name != null)       { m.studentName = patch.name; changed = true; }
          if (patch.grade != null)      { m.grade = patch.grade; changed = true; }
        }
      });
      if (changed) writeJson(KEYS.memberships, mems);
    } catch (_) {}

    // 4. Email change → propagate join-key changes across legacy records.
    if (prevEmail && nextEmail && prevEmail !== nextEmail) {
      try { migrateEmailAcrossRecords(prevEmail, nextEmail, studentId); } catch (_) {}
    }

    // 5. Level — separate setter that maintains canonical-level map.
    if (patch.level != null) {
      try { setStudentLevel(studentId, patch.level); } catch (_) {}
    }

    // 6. Audit entry.
    var summary = (opts && opts.summary) || ("Updated profile for " + (saved.name || studentId));
    appendAudit({
      actor: (opts && opts.actor) || "ops",
      kind: "student.update",
      target: studentId,
      summary: summary,
      before: before,
      after: saved
    });

    return saved;
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
    applyAssessmentResult: applyAssessmentResult,
    saveSignupUser: saveSignupUser,
    savePayment: savePayment,
    getPortfolioForStudent: getPortfolioForStudent,
    savePortfolioItem: savePortfolioItem,
    referralCodeForAccount: referralCodeForAccount,
    findAccountByReferralCode: findAccountByReferralCode,
    getReferrals: getReferrals,
    getReferralsByReferrer: getReferralsByReferrer,
    recordReferralInvite: recordReferralInvite,
    attachReferralOnSignup: attachReferralOnSignup,
    markReferralPaid: markReferralPaid,
    getReferralRewards: getReferralRewards,
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
    getMembershipPlans: getMembershipPlans,
    findMembershipPlan: findMembershipPlan,
    getMembershipAddOns: getMembershipAddOns,
    getMembershipPolicy: getMembershipPolicy,
    getGrowthSkills: getGrowthSkills,
    getStudentGrowth: getStudentGrowth,
    compositeGrowthScore: compositeGrowthScore,
    getStudentMetrics: getStudentMetrics,
    getStudentAssignments: getStudentAssignments,
    findAssignmentById: findAssignmentById,
    upsertAssignment: upsertAssignment,
    updateAssignmentStatus: updateAssignmentStatus,
    getBillingProfile: getBillingProfile,
    upsertBillingProfile: upsertBillingProfile,
    planPerSession: planPerSession,
    planMonthlyEquivalent: planMonthlyEquivalent,
    planAnnualSaving: planAnnualSaving,
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
    buildClaimUrl: buildClaimUrl,
    // Active ops user (mock auth for dashboard testing)
    SEED_VERSION: SEED_VERSION,
    isSeedStale: isSeedStale,
    markSeedFresh: markSeedFresh,
    getActiveOpsUser: getActiveOpsUser,
    setActiveOpsUser: setActiveOpsUser,
    loginAsRole: loginAsRole,
    defaultActiveOpsUser: defaultActiveOpsUser,
    runMigrations: runMigrations,
    // CSV export helpers (used by dashboard "导出 CSV" buttons)
    toCsv: toCsv,
    downloadCsv: downloadCsv,
    // Class attendance
    ATTENDANCE_STATUSES: ATTENDANCE_STATUSES,
    getAttendance: getAttendance,
    recordAttendance: recordAttendance,
    getStudentAttendanceSummary: getStudentAttendanceSummary,
    // Student edit + audit log
    updateStudentProfile: updateStudentProfile,
    appendAudit: appendAudit,
    getAuditLog: getAuditLog,
    // Permission / scope (RBAC for ops dashboard)
    PERMISSIONS: PERMISSIONS,
    PERMISSION_TEMPLATES: PERMISSION_TEMPLATES,
    ROLE_TEMPLATE_MAP: ROLE_TEMPLATE_MAP,
    resolveTemplate: resolveTemplate,
    getActivePermissions: getActivePermissions,
    hasPerm: hasPerm,
    getActiveCampusScope: getActiveCampusScope,
    inCampusScope: inCampusScope,
    maskMoney: maskMoney
  };

  // =================================================================
  // Bootstrap — incremental, non-destructive
  // -----------------------------------------------------------------
  // First-time visitor (no current student) → run full seedDemoData.
  // Returning visitor → walk MIGRATIONS, applying only ones that
  // haven't run yet. This replaces the previous SEED_VERSION-wipe
  // approach so user edits / progress survive demo upgrades.
  // =================================================================
  var KEY_MIGRATIONS_APPLIED = "minddo_migrations_applied";

  var MIGRATIONS = [
    {
      id: "2026-05-roles-extend",
      description: "Append owner / admin / homeroom / operations / counselor roles + EM011-EM015 staff if missing",
      run: function () {
        // Roles — append only the ones that don't already exist.
        var roles = readJson(KEYS.roles) || [];
        var have = {};
        roles.forEach(function (r) { if (r && r.id) have[r.id] = true; });
        var NEW_ROLES = [
          { id: "owner",       name: "超级管理员", nameEn: "Owner",               category: "admin",    desc: "系统所有者，拥有全部权限，可配置角色与计费。", descEn: "System owner — full permissions across all modules; can manage roles and billing.", permissions: ["*.write", "staff.write", "billing.write", "academic.write", "marketing.write", "approvals.approve"] },
          { id: "admin",       name: "管理员",     nameEn: "Admin",               category: "admin",    desc: "日常系统管理：员工 / 角色 / 校区 / 配置。",    descEn: "Day-to-day system administration — staff, roles, campuses, configuration.",        permissions: ["staff.write", "roles.write", "campuses.write", "settings.write", "reports.view"] },
          { id: "homeroom",    name: "班主任",     nameEn: "Homeroom Teacher",    category: "academic", desc: "对接学生与家长，跟进学习进度与课堂出勤。",   descEn: "Owns the student–parent relationship, tracks progress and attendance.",             permissions: ["students.write", "feedback.write", "requests.approve"] },
          { id: "operations",  name: "运营专员",   nameEn: "Operations",          category: "ops",      desc: "日常运营执行：排课、活动、家长沟通与跟进。", descEn: "Day-to-day operations: scheduling, events, parent follow-up.",                       permissions: ["academic.view", "leads.view", "requests.approve", "reports.view"] },
          { id: "counselor",   name: "学习顾问",   nameEn: "Education Counselor", category: "ops",      desc: "面向家长的咨询、试课跟进与升学规划建议。",   descEn: "Parent-facing consultation: trial follow-up + admissions planning.",                  permissions: ["leads.write", "students.view", "marketing.view"] }
        ];
        var toAdd = NEW_ROLES.filter(function (r) { return !have[r.id]; });
        if (toAdd.length) writeJson(KEYS.roles, toAdd.concat(roles));

        // Staff — same de-dup by id.
        var staff = readJson(KEYS.staff) || [];
        var haveStaff = {};
        staff.forEach(function (s) { if (s && s.id) haveStaff[s.id] = true; });
        var NEW_STAFF = [
          { id: "EM011", name: "Alex Chen",  roleId: "super-admin",      department: "管理层", email: "alex@minddo.local",   phone: "626-555-0301", status: "active", joinedAt: new Date(Date.now() - 900 * 86400000).toISOString() },
          { id: "EM012", name: "Grace Wang", roleId: "super-admin",      department: "管理层", email: "grace@minddo.local",  phone: "626-555-0312", status: "active", joinedAt: new Date(Date.now() - 720 * 86400000).toISOString() },
          { id: "EM013", name: "Sophia Lee", roleId: "campus-ops", department: "运营部", email: "sophia@minddo.local", phone: "626-555-0324", status: "active", joinedAt: new Date(Date.now() - 280 * 86400000).toISOString() },
          { id: "EM014", name: "Daniel Liu", roleId: "campus-ops",  department: "运营部", email: "daniel@minddo.local", phone: "626-555-0335", status: "active", joinedAt: new Date(Date.now() - 200 * 86400000).toISOString() },
          { id: "EM015", name: "Rachel Kim", roleId: "campus-ops",   department: "教学部", email: "rachel@minddo.local", phone: "626-555-0347", status: "active", joinedAt: new Date(Date.now() - 310 * 86400000).toISOString() }
        ].filter(function (s) { return !haveStaff[s.id]; });
        if (NEW_STAFF.length) writeJson(KEYS.staff, staff.concat(NEW_STAFF));
      }
    },
    {
      id: "2026-05-rbac-templates",
      description: "Assign permission templates to existing roles + campus keys to existing staff for RBAC gating.",
      run: function () {
        // 1) Stamp template on every role record so the dashboard can
        //    resolve permissions even after this migration runs.
        var roles = readJson(KEYS.roles) || [];
        var rolesChanged = false;
        roles.forEach(function (r) {
          if (!r || !r.id) return;
          var tpl = ROLE_TEMPLATE_MAP[r.id];
          if (tpl && r.template !== tpl) { r.template = tpl; rolesChanged = true; }
        });
        if (rolesChanged) writeJson(KEYS.roles, roles);

        // 2) Assign each seeded staff to a default campus so campus
        //    scoping has something to test against. Owners / admins
        //    explicitly get no campus (they're global).
        var campusByStaffId = {
          // Global (super-admin / owner)
          "EM011": null,         // Alex Chen — owner
          "EM012": null,         // Grace Wang — admin
          // Irvine
          "EM001": "irvine",     // Dr. Sarah Chen — instructor-senior
          "EM002": "irvine",     // Jenny Lin — instructor
          "EM005": "irvine",     // Wei Zhang — campus-manager
          "EM009": "irvine",     // Lily Hsu — frontdesk
          "EM013": "irvine",     // Sophia Lee — operations
          "EM015": "irvine",     // Rachel Kim — homeroom
          // Diamond Bar
          "EM003": "diamond-bar",// Marcus Johnson — instructor-senior
          "EM007": "diamond-bar",// Kevin Wu — marketing
          "EM010": "diamond-bar",// Tom Liu — marketing
          "EM014": "diamond-bar",// Daniel Liu — counselor
          // Arcadia
          "EM004": "arcadia",    // David Park — academic-lead
          "EM006": "arcadia",    // Amy Cheng — instructor-intern
          "EM008": "arcadia"     // Iris Yang — finance
        };
        var staff = readJson(KEYS.staff) || [];
        var staffChanged = false;
        staff.forEach(function (s) {
          if (!s || !s.id) return;
          if (s.campus !== undefined) return;     // already migrated for this row
          if (campusByStaffId.hasOwnProperty(s.id)) {
            s.campus = campusByStaffId[s.id];
            staffChanged = true;
          } else {
            // Unknown staff (custom add) — default to no campus so they
            // appear cross-campus until ops sets one explicitly.
            s.campus = null;
            staffChanged = true;
          }
        });
        if (staffChanged) writeJson(KEYS.staff, staff);
      }
    },
    {
      id: "2026-05-rbac-collapse-roles",
      description: "Collapse 13 detailed roles down to the 4 simplified login templates (super-admin / principal / campus-ops / campus-marketing). Remaps every staff.roleId accordingly and rewrites the roles table with just 4 entries.",
      run: function () {
        var COLLAPSE = {
          "owner":             "super-admin",
          "admin":             "super-admin",
          "campus-manager":    "principal",
          "academic-lead":     "principal",
          "finance":           "principal",
          "instructor-senior": "campus-ops",
          "instructor":        "campus-ops",
          "instructor-intern": "campus-ops",
          "homeroom":          "campus-ops",
          "operations":        "campus-ops",
          "counselor":         "campus-ops",
          "frontdesk":         "campus-ops",
          "marketing":         "campus-marketing"
        };
        // 1) Remap staff.roleId
        var staff = readJson(KEYS.staff) || [];
        var staffChanged = false;
        staff.forEach(function (s) {
          if (!s || !s.roleId) return;
          if (COLLAPSE[s.roleId]) { s.roleId = COLLAPSE[s.roleId]; staffChanged = true; }
        });
        if (staffChanged) writeJson(KEYS.staff, staff);

        // 2) Rewrite roles table with just the 4 simplified entries.
        writeJson(KEYS.roles, [
          { id: "super-admin",      template: "super-admin",      name: "超级管理员",   nameEn: "Super Admin",          category: "admin", desc: "可查看全部校区的所有运营 / 教务 / 财务功能与数据。",         descEn: "Sees every campus and every module across the ops dashboard.",                                          permissions: ["*.write"] },
          { id: "principal",        template: "principal",        name: "校长账户",     nameEn: "Principal",            category: "admin", desc: "适合校区校长，可查看本校区的全部功能与数据（含财务详情）。", descEn: "For a single campus's principal. Sees every module within that campus, including raw finance amounts.", permissions: ["*.write"] },
          { id: "campus-ops",       template: "campus-ops",       name: "校区运营",     nameEn: "Campus Operations",    category: "ops",   desc: "本校区运营 / 教务 / 出勤 / 续费等日常功能，金额信息脱敏。",  descEn: "Single-campus ops / academic / attendance / renewals — finance amounts masked.",                       permissions: ["academic.write", "students.write", "attendance.write"] },
          { id: "campus-marketing", template: "campus-marketing", name: "校区市场运营", nameEn: "Campus Marketing Ops", category: "ops",   desc: "本校区获客相关：试听、CRM、招生渠道、招生数据。",            descEn: "Single-campus marketing only: trials, CRM, channels, enrollment data.",                                permissions: ["leads.write", "marketing.write"] }
        ]);
      }
    },
    {
      // Split the legacy "inbox.approve" perm into two narrower ones —
      // "approve.schedule" for leave/reschedule requests (granted to
      // campus-ops) and "approve.finance" for refunds/expenses (kept at
      // principal+). Existing storage is fully derived from
      // PERMISSION_TEMPLATES at runtime, so no actual data rewrite is
      // needed; this entry exists so returning visitors who saved a
      // stale snapshot of the perm strings still get the new behaviour.
      id: "2026-05-rbac-split-approvals",
      description: "Split inbox.approve into approve.schedule + approve.finance; add settings.view.campus / internal.view.campus / students.status / shift.write for campus-ops.",
      run: function () {
        // Nothing to migrate — PERMISSION_TEMPLATES is the source of
        // truth and is read fresh on every call to hasPerm().
      }
    }
  ];

  function readMigrationsApplied() {
    try { return JSON.parse(localStorage.getItem(KEY_MIGRATIONS_APPLIED) || "[]") || []; }
    catch (_) { return []; }
  }
  function writeMigrationsApplied(list) {
    try { localStorage.setItem(KEY_MIGRATIONS_APPLIED, JSON.stringify(list)); } catch (_) {}
  }
  function runMigrations() {
    var applied = readMigrationsApplied();
    var appliedSet = {};
    applied.forEach(function (id) { appliedSet[id] = true; });
    var ran = [];
    MIGRATIONS.forEach(function (m) {
      if (appliedSet[m.id]) return;
      try {
        m.run();
        applied.push(m.id);
        ran.push(m.id);
      } catch (e) {
        if (typeof console !== "undefined" && console.warn) {
          console.warn("[MindDo] migration failed:", m.id, e && e.message);
        }
      }
    });
    if (ran.length) writeMigrationsApplied(applied);
    return ran;
  }

  try {
    if (typeof localStorage !== "undefined") {
      var hasStudent = !!getCurrentStudent();
      if (!hasStudent) {
        // True first-time visitor — full seed (includes the new roles).
        seedDemoData();
        // Mark every existing migration as already-applied: the seed
        // already contains their effects, no need to re-run.
        var initialApplied = MIGRATIONS.map(function (m) { return m.id; });
        writeMigrationsApplied(initialApplied);
      } else {
        // Returning visitor — apply incremental migrations without
        // touching their existing data.
        runMigrations();
        if (!getActiveOpsUser()) {
          var def = defaultActiveOpsUser();
          if (def) setActiveOpsUser(def.id);
        }
      }
    }
  } catch (_) { /* localStorage unavailable; pages will fall back */ }
})();
