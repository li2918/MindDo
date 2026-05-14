# MindDo · localStorage Schema

All persistent state lives in `localStorage`. Every key in this document is
defined in [`assets/minddo-flow.js`](../assets/minddo-flow.js) at the top of
the IIFE as part of the `KEYS` object — keep this file in sync when you add
new keys or change record shapes.

> **Status legend** · 🟢 stable · 🟡 evolving · 🔴 demo-only / not safe for prod

---

## Core student journey

### `minddo_current_student` 🟢
The single "currently viewed" student. Read on every parent-side page to
hydrate hero / nav / metadata.

```js
{
  studentName: "李若安",
  name: "李若安",            // alias kept for older code paths
  email: "leo.li@example.com",
  phone: "317-555-0188",
  city: "Indianapolis",
  grade: "六年级",
  birthday: "2014-05-18",
  parentName: "李女士",
  provider: "email",         // "email" | "google" | "microsoft" | "apple"
  goal: "AI创造力提升",
  studentId: "MD2026-0417"   // format MD{YYYY}-{MMDD}
}
```

### `minddo_trial_leads` 🟢 (array)
Trial-class lead funnel. Each row represents one parent who booked a trial.

```js
{
  studentName, studentId, grade, birthday,
  parentName, phone, city, email,
  subject, subjectLabel,
  trialDate, trialTime,
  channel, channelLabel,
  goal, timeNote, consent,
  createdAt,                       // ISO timestamp
  crmStatus,                       // "new" | "contacted" | "follow" | "won" | "lost"
  trialStatus,                     // "scheduled" | "completed" | "noshow"
  // Marketing CRM extensions (all optional — older rows lack them):
  lastContactAt,                   // ISO of most recent contact
  nextContactAt,                   // "YYYY-MM-DD" — scheduled next callback
  tags,                            // array of strings, e.g. ["高意向", "中文家长"]
  contactLog,                      // array of {at, by, channel, note}
  note                             // free-text marketing note
}
```

### `minddo_assessments` 🟢 (array, upserted by email)

```js
{ name, studentName, studentId, email, level, goal,
  learningStyle, confidence, quizScore, recommendation,
  notes, createdAt }
```

### `minddo_signup_users` 🟡 (array, upserted by email)

```js
{ provider, studentName, email, studentId, password, createdAt }
```
> 🔴 `password` is stored as `"plain:<value>"` for demo only.

### `minddo_payments` 🟢 (array)

```js
{ email, amount, source, studentId,
  method,        // "alipay" | "wechat" | "card" | "email"
  status,        // "paid" | "refunded" | ...
  createdAt }
```

### `minddo_membership_orders` 🟢 (array)
Active membership orders. Each row's `sessions` array determines which class
offerings the student is enrolled in.

```js
{ email, studentName, studentId,
  plan,                        // "weekly1" | "weekly2" | "weekly3" | ...
  addons: ["addon-1on1", ...],
  classMode,                   // "small" | "1v1"
  billingCycle,                // "monthly" | "annual"
  sessions: [
    { offeringId, courseName, courseNameZh, courseNameEn,
      level, teacher, classMode,
      dayKey, weekday, weekdayZh, weekdayEn,
      slotKey, slotLabel, timeSlot }
  ],
  weekday, timeSlot,
  totalMonthly,
  createdAt }
```

### `minddo_feedback` 🟢 (array)

```js
{ studentName, email, studentId,
  trialDate, trialTime, subject,
  rating, nextStep, highlights, suggestion,
  createdAt }
```

### `minddo_schedule_requests` 🟢 (array)

```js
{ type: "leave" | "reschedule",
  targetLabel, reason,
  email, studentName, studentId,
  status: "pending" | "approved" | "rejected" | "completed",
  createdAt, updatedAt }
```

---

## Academic catalog

### `minddo_class_offerings` 🟢 (array)
The class catalog parents browse and ops edits in `course-offerings.html`.

```js
{ id,                          // e.g. "ai-fund-mon-16" or "custom-1"
  courseName: { zh, en },
  level: { zh, en },           // canonical en values: Beginner / Intermediate / Advanced / Competition / Project Camp
  teacher,
  classMode: "small" | "1v1",
  dayKey,                      // "mon" .. "sun"
  weekday: { zh, en },
  slotKey,                     // "t09" .. "t20"
  timeSlot,                    // "16:00 – 17:00"
  seatsTotal, seatsTaken }
```

### `minddo_student_levels` 🟢 (object: `{ studentId: levelEn }`)
Canonical level mapping. Source of truth for which offerings appear on the
parent's schedule page.

### `minddo_trial_slots` 🟢 (object)
Campus-aware trial-class slot configuration.

```js
{
  "_default": { weekday: ["15:00", ...], weekend: ["09:00", ...] },
  "<campusKey>": { weekday: [...], weekend: [...] }
}
```

### `minddo_portfolio` 🟢 (array)
Student projects shown on the parent-side Portfolio panel.

### `minddo_growth_records` 🟢 (array)
Per-student monthly skill scores feeding the growth-curve chart.

### `minddo_assignments` 🟢 (array)
Homework lifecycle records (`assigned` → `in_progress` → `submitted` → `graded`).

---

## Family + multi-account

### `minddo_families` 🟢 (array)
```js
{ familyId, studentIds: [], guardianIds: [], createdAt }
```

### `minddo_students` 🟢 (array)
Per-child student records (separate from `minddo_current_student`).

### `minddo_guardians` 🟢 (array)
Parent / co-parent records, joined to families via `familyId`.

### `minddo_accounts` 🟢 (array)
Login credentials and account types (guardian_primary / guardian_secondary /
student).

### `minddo_invite_tokens` 🟢 (array)
Co-parent + student-account invitation tokens (single-use).

### `minddo_account_invites` 🟡 (array)
Email-invite history (for the post-trial "invite parent" flow).

### `minddo_billing_profile` 🟢 (array, keyed by familyId)
Card on file + subscription state per family.

---

## Marketing / ops

### `minddo_referrals` 🟢 (array)
Referral entries, joined to a referrer account.

```js
{ id, referrerAccountId, referrerCode,
  refereeName, refereeEmail,
  status: "sent" | "signed_up" | "paid",
  rewardClaimedAt, createdAt }
```

### `minddo_trial_evaluations` 🟢 (array)
Post-trial evaluations recorded by ops (`new-trials.html` modal).

### `minddo_trial_completions` 🟢 (array)
Snapshots of trials marked completed by ops; mirrored from leads so the
legacy page can read them.

### `minddo_email_outbox` 🟡 (array)
Mock-email log used by `email-outbox.html`.

### `minddo_marketing_templates` 🟢 (array)
Communication templates the lead-detail "添加跟进" 📋 button inserts
into the contact-log note. Seeded with 4 starter rows on first read.

```js
{ id, title, body, createdAt }
```

### `minddo_newsletter` 🟡 (array of strings)
Newsletter subscriber emails captured on `index.html`.

---

## Operations / finance

### `minddo_payroll` 🟢 (array)
```js
{ teacher, role, classes, hours, rate, total, status: "paid" | "pending" }
```

### `minddo_contracts` 🟢 (array)
```js
{ id, type: "enrollment" | "employment" | "lease" | "other",
  party, signedAt, expiresAt,
  status: "pending" | "signed" | "expiring" | "expired" }
```

### `minddo_approvals` 🟢 (array)
```js
{ id, type, requester, detail, amount, submittedAt,
  status: "pending" | "approved" | "rejected" }
```

---

## Internal management

### `minddo_staff` 🟢 (array)
```js
{ id, name, roleId, department, email, phone,
  status: "active" | "leave" | "inactive",
  joinedAt }
```

### `minddo_roles` 🟢 (array)
```js
{ id, name, nameEn,
  category: "admin" | "academic" | "ops",
  desc, descEn,
  permissions: ["*.write" | "staff.write" | ...] }
```

### `minddo_audit_log` 🟢 (array, bounded to 500)
Append-only history of ops-side state changes (currently: student
profile edits via the detail-drawer editor; more callsites to follow).

```js
{
  id,                       // "AU-<ts>-<random>"
  at,                       // ISO timestamp
  actor,                    // staff id or "ops" (mock auth)
  kind,                     // e.g. "student.update"
  target,                   // entity id this entry is about
  summary,                  // human-readable one-liner
  before, after             // full snapshots for diffing
}
```

Helpers: `appendAudit(entry)`, `getAuditLog({kind, target})`. The
log is capped at 500 rows — older rows drop off so demo storage stays
bounded.

> **Note on `minddo_students` schema**: rows now optionally carry a
> `status` field ∈ `"active" | "paused" | "withdrawn"` set by the
> student-detail drawer's editor. Older records without `status` are
> treated as `"active"`.

### `minddo_attendance` 🟢 (array)
Class attendance records, one row per (student × class session).
Multiple records per session — one row per enrolled student.

```js
{
  id,                       // "AT-<offeringId>-<classDate>-<studentId>"
  offeringId,               // matches minddo_class_offerings.id
  classDate,                // "YYYY-MM-DD"
  studentId,
  status,                   // "present" | "absent" | "late" | "excused"
  note,
  recordedBy,               // staff id or "ops"
  recordedAt                // ISO timestamp
}
```

Helpers: `getAttendance({offeringId, classDate, studentId})`,
`recordAttendance(offeringId, classDate, records, opts)` (replace-set
semantics), `getStudentAttendanceSummary(studentId, sinceDays)`.

### `minddo_teacher_availability` 🟢 (object, keyed by teacher name)
Used by `course-offerings.html` conflict detection.

```js
{
  "Dr. Sarah Chen": {
    mon: { enabled: true, start: "14:00", end: "21:00" },
    ...
  }
}
```

---

## System / housekeeping

### `minddo_lang` 🟢
`"zh-CN"` or `"en"`. Selected language; mirrored to `<html lang="…">`.

### `minddo_seed_version` 🟢
Marker stamped by `seedDemoData()` so first-time visitors get a full seed
exactly once. **Returning visitors should use the MIGRATIONS framework
instead** — see [`assets/minddo-flow.js`](../assets/minddo-flow.js) bottom.

### `minddo_migrations_applied` 🟢 (array of migration ids)
List of MIGRATIONS entries already executed. Each entry runs at most once
per browser; new entries are appended on subsequent page loads. See
`runMigrations()` in `minddo-flow.js`.

### `minddo_active_ops_user` 🟢
Staff `id` representing the "currently logged in" ops user — mock auth for
dashboard testing. Defaults to the highest-privilege staff (owner → admin
→ campus-manager) on fresh seed; switchable from the dashboard top-right
user menu.

### `minddo_dashboard_tab` / `minddo_dash_<area>_subtab` / `minddo_acct_*` 🟢
Sticky tab/sub-tab selections. Safe to clear without losing data.

### `minddo_franchise_inquiries` / `minddo_franchise_draft` 🟢
Partnership-program form submissions + auto-saved draft state.

---

## Adding a new key — checklist

1. Add the key to the `KEYS` object at the top of `minddo-flow.js`.
2. Document its shape here (with a 🟡 status if still evolving).
3. **For schema changes that need to flow to existing users**, add an entry
   to the `MIGRATIONS` array at the bottom of `minddo-flow.js` so returning
   visitors get the change non-destructively. Don't bump `SEED_VERSION` —
   that wipes everything.
4. Update any existing read helpers (`getX` / `findX`) that should hydrate
   the new field with defaults.
