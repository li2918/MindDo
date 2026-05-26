# MindDo Frontend Feature Inventory

## Purpose

This document is the source-of-truth list of pages and capabilities in the MindDo / 馒头AI frontend prototype. It is meant for three practical uses:

1. Review what is already implemented before designing a new feature.
2. Locate the file and storage key for each surface quickly.
3. Remove a feature safely without grepping the whole project blindly.

Update this file when a visible page, dashboard section, or shared helper is added or removed.

---

## System Scope

The prototype now covers the full operations + family lifecycle:

1. Marketing / public surface (landing, about, franchise, campuses, contact)
2. Curriculum docs (course-system, course-offerings, college-prep)
3. Trial booking + assessment + auto-recommendation
4. Signup / login / claim invitation / profile setup
5. Course selection → payment → confirmation → invoice
6. Student/family hub (single 7400-line page with sub-tabs for dashboard, membership, billing, schedule, homework, portfolio, competitions, feedback, referrals, settings)
7. Family-graph management (add child, add co-parent, account settings)
8. Ops dashboard with KPIs, alerts, audit log viewer, ⌘K search, principal/super-admin overviews
9. Student management workspace with multi-tab drawer (作业 / 成长 / 变更历史 / 反馈)
10. Request center for leave/reschedule approvals
11. Today's-new-leads + today's-new-students alerts
12. Email outbox simulator
13. AI-suggest surfaces across marketing/campus-ops/principal/super-admin/parent panes
14. Role-based user-flow + training docs at `docs/`

---

## Page Map

### Marketing / public

- `index.html` — Landing hub, role-based portals.
- `about.html` — Company / mission page.
- `franchise.html` — Franchise/partnership pitch.
- `campuses.html` — Campus locations.
- `contact.html` — Contact form.
- `course-system.html`, `course-offerings.html`, `college-prep.html` — Curriculum docs.
- `privacy.html`, `terms.html` — Legal.
- `404.html` — Branded not-found page.

### Lead → signup funnel

- `trial.html` — Public trial booking. Writes to `minddo_trial_leads`.
- `trial-register.html` — Alt entry to the same flow.
- `trial-invite.html` — Invite-link variant.
- `assessment.html` — Intake form + auto-scored quiz + recommendation. Writes `minddo_assessments`.
- `signup.html` — Registration + login + mock OAuth (Google/Microsoft/Apple). Writes `minddo_signup_users`, `minddo_accounts`.
- `login.html` — Dedicated login surface.
- `claim-account.html` — Accept invite, link to existing family.
- `profile-setup.html` — Post-signup profile completion.

### Course selection & payment

- `course-selection.html` — Plan / class mode / billing cycle / preferred slot / add-ons. Writes `minddo_membership_orders`.
- `course-payment.html` — Payment step.
- `course-confirm.html` — Post-payment confirmation.
- `course-schedule.html` — Scheduled-classes confirmation.
- `invoice.html` — Printable A4 invoice (intentionally standalone — inline palette mirrors `assets/minddo-theme.css` so saved-offline copies still render in 馒头AI brand colors).

### Family hub (post-login)

- `student-account.html` — Main parent/student hub. Sub-modules:
  - Family panel + greeting / hero
  - Dashboard panel (`#dashPanel`)
  - Membership current / upgrade / add-ons / elite (`#memberCurrentPanel`, `#memberUpgradePanel`, `#memberAddOnsPanel`, `#memberElitePanel`)
  - Billing — payment method (`#bmPanel`) + history (`#billingPanel`)
  - Schedule — upcoming list + month calendar + history (`#upcomingPanel`, `#schedHistoryPanel`) + reschedule modal
  - Homework — assignments by status (`#hwPanel`) + submission modal
  - Learning snapshot / portfolio (`#portfolioPanel`)
  - Competitions (`#compListPanel`)
  - Feedback — latest + history (`#feedbackLatestPanel`, `#feedbackHistoryPanel`)
  - Referrals — rewards + share + tracked invites (`#refRewardsPanel`, `#refSharePanel`, `#refListPanel`)
  - Settings sub-tabs — account / family / security / preferences / help
- `account-settings.html` — Standalone settings page (alt entry).
- `add-child.html` — Add another student under the family.
- `add-coparent.html` — Invite a co-parent.
- `feedback.html` — Standalone feedback submission.
- `semester-report.html` — Term milestone report.

### Ops / internal

- `dashboard.html` — Main ops surface. Sub-tabs include:
  - Registration / payment / assessment / conversion metrics
  - New-trial + new-student alert cards
  - Pending leave/reschedule count
  - Level distribution + lead-source distribution
  - Payment entry tool + recent-payments table
  - Recent leave/reschedule requests table
  - Audit log viewer (`#auditLog`)
  - Principal first-screen overview (`#principalOverview`)
  - Super-admin first-screen overview (`#superAdminOverview`)
  - Approval detail modal with reason capture + permission gate
  - ⌘K global search palette
  - 教师管理 sub-tab
  - 数据完整性检查 sub-tab
  - Auto-draft messages for renewals + absentees
- `student-management.html` — Student list + 4-tab detail drawer (作业 / 成长 / 变更历史 / 反馈) with 联系家长 popover.
- `request-center.html` — Leave/reschedule approval queue.
- `new-trials.html` — Today's new trial leads.
- `new-students.html` — Today's new registered students.
- `email-outbox.html` — Simulated email-send log.

### Docs (`docs/`)

- `user-flows.html` — Index of role flows.
- `campus-marketing-flow.html` — Marketing flow diagram.
- `campus-ops-flow.html` — Campus operations flow.
- `campus-ops-training.html` — Click-by-click training manual.
- `principal-flow.html`, `super-admin-flow.html` — Principal + super-admin flows.
- `schema-explorer.html` — Searchable visual schema viewer.
- `BACKEND_MIGRATION.md`, `SCHEMA.md` — Backend planning.

---

## Shared Frontend Data Layer

### Main helper

`assets/minddo-flow.js` — central state library, exposed as `window.MindDoFlow`. Responsibilities:

1. `KEYS` dictionary — single source of truth for every localStorage key
2. Current student / current account / current guardian helpers
3. CRUD save helpers for every entity (lead, assessment, signup, payment, membership, feedback, schedule request, …)
4. Family-graph lookups: `findStudentById`, `findAccountByEmail`, `findGuardianById`, `findMembershipPlan`
5. Trial slot management + evaluation + completion
6. `aiSuggest()` helper used by AI surfaces across the app
7. Email outbox read/write
8. Audit log append + read
9. Migrations runner (`KEY_MIGRATIONS_APPLIED`)
10. Seed-data installer (`KEY_SEED_VERSION`)
11. Permission gating helpers tied to `KEY_ACTIVE_OPS_USER`
12. `injectPanel()` — floating debug/seed/persona switcher loaded on every page

### Shared CSS / JS modules

- `assets/minddo-theme.css` — Design tokens (colors, radii, spacing, shadows, motion, z-scale). Single source of truth for the 馒头AI palette.
- `assets/minddo-responsive.css` — Shared responsive breakpoints + utility classes.
- `assets/minddo-nav.js` — Unified top-nav widget.
- `assets/lang-switcher.js` — CN/EN toggle, writes `minddo_lang`.
- `assets/customer-service.js` — Floating chat + contact card.
- `assets/consent.js` — Cookie/consent banner.

### Storage keys

See full grouped list in the auto-memory `data_models.md`. Summary:

- Identity / access: `minddo_accounts`, `minddo_account_invites`, `minddo_invite_tokens`, `minddo_active_ops_user`, `minddo_current_student`
- Family graph: `minddo_families`, `minddo_students`, `minddo_guardians`, `minddo_signup_users`
- Lead → trial: `minddo_trial_leads`, `minddo_trial_slots`, `minddo_trial_evaluations`, `minddo_trial_completions`, `minddo_assessments`
- Membership / billing: `minddo_membership_orders`, `minddo_payments`, `minddo_billing_profile`
- Class delivery: `minddo_class_offerings`, `minddo_student_levels`, `minddo_assignments`, `minddo_attendance`, `minddo_growth_records`, `minddo_portfolio`, `minddo_feedback`, `minddo_schedule_requests`, `minddo_referrals`
- Ops / internal: `minddo_staff`, `minddo_roles`, `minddo_payroll`, `minddo_contracts`, `minddo_approvals`, `minddo_audit_log`, `minddo_email_outbox`
- System: `minddo_seed_version`, `minddo_migrations_applied`, `minddo_lang`

---

## Tooling

- `npm run smoke` — runs `tools/smoke.js`. Parses every `*.html` inline `<script>` block + every `assets/*.js` for syntax errors. Also checks balance of `<style>/<script>/<body>/<html>/<head>` tags (catches the unclosed-`<style>` class of bugs that silently empties the page).
- `npm run serve` — `python -m http.server 8765` for local preview.

---

## Removal Guide

When ripping out a feature, the storage key + page name combination tells you everything that has to go. Common removals:

- **Leave / reschedule flow** → remove the request form in `student-account.html`, the recent-requests block in `dashboard.html`, the entire `request-center.html`, and references to `minddo_schedule_requests`.
- **Membership add-ons** → remove `#memberAddOnsPanel` in `student-account.html` and the `addons` field from `minddo_membership_orders` writes in `course-selection.html`.
- **Audit log** → remove `#auditLog` block in `dashboard.html` + the `auditLog` key + all `auditLogAppend()` calls in `assets/minddo-flow.js`.
- **OAuth login** → remove the provider buttons + `handleOAuth()` block in `signup.html` and `login.html`.
- **Email outbox simulator** → remove `email-outbox.html` + the email-outbox read/write helpers in `assets/minddo-flow.js`.

When deleting a page, also remove its links from `index.html`, `dashboard.html`, `student-account.html`, and the bilingual nav in `assets/minddo-nav.js`.

---

## Maintenance Rule

When you add a visible page, ops sub-tab, or shared helper, append it here with:

1. File location
2. Storage key or shared helper touched
3. Where it's linked from (so the next removal is greppable)

That keeps the prototype extensible without becoming hard to trim.
