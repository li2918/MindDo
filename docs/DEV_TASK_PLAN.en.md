# MindDo · Dev Task Plan (re-based on the existing minddoai codebase)

> **Goal**: On the already-started `minddoai` monorepo, **align the data model toward the rigorous `DATABASE_DESIGN.md` design**, **add payments**, and **ship the MVP by late June / early July**.
> **Audience**: David, Paul, Austin (3 full-stack engineers) + product owner.
> **Sources of truth**: MindDo HTML prototype (UI/feature reference) + [`DATABASE_DESIGN.md`](DATABASE_DESIGN.md) (DB contract, this phase's target) + [`BACKEND_MIGRATION.md`](BACKEND_MIGRATION.md) (API/permissions/migration).
> **Location**: temporarily in the prototype repo `docs/`; recommended to live in `minddoai/docs/` and be maintained via PR.
> **How to use**: each person checks off their own `- [ ]`; sync milestones every Friday.

---

## 0. Three locked decisions (premises of this plan)

1. **Data model → align toward the 49-table design**, via **incremental migration, not a big-bang rewrite**: new tables strictly follow `DATABASE_DESIGN.md`; legacy tables (`User` parent-child hierarchy / `ContactRequest` / `TrialCourse` / `Organization` / `Course`) migrate module by module, keeping the app working throughout. This phase includes only the **~18 MVP-critical tables** (see §3); the other 31 go to Phase 2.
2. **Keep the current 5 roles**: `SUPER_ADMIN / ORG_ADMIN / INSTRUCTOR / PARENT / STUDENT`. The prototype's principal / campus-ops / campus-marketing operational layering + amount masking → Phase 2.
3. **Payments are in this phase**: membership / payment / invoice built from scratch; **payment gateway = Stripe** (decided 2026-06-08).

---

## 1. Current baseline (already built — don't rebuild it)

### Backend `minddoai/backend` (NestJS 11 · Prisma 6 · Auth0 · 15 migrations)
- ✅ **Full Auth0**: `Auth0Strategy`(JWKS) · `RolesGuard` · `@Roles` · `syncUser` · M2M provisioning (`createAuth0User` etc.)
- ✅ **5-role RBAC** in place
- ✅ Completed modules: `auth`(`GET /api/auth/me`) · `users`(CRUD + children + co-parent invites) · `courses` · `trial-courses` · `trial-registrations`(public) · `organizations` · `contact-requests`(public submit + status machine) · `health` · `email`(Mailgun, invite-only)
- ✅ Global `ValidationPipe` · CORS · `Dockerfile`(runs `prisma migrate deploy` on start)
- ❌ Missing: global exception filter · **audit log** · soft delete · pagination · seed script · **backend CI workflow** (only a frontend deploy exists)

### Frontend `minddoai/frontend` (React 19 · Vite 8 · Tailwind 4 · RR7 · Auth0)
- ✅ Landing page (EN/ZH) · trial booking `/trial` · `/callback` · co-parent invite `/accept-invite/:token`
- ✅ Profile `/profile` (with Family tab: manage children, invite co-parent)
- ✅ Full admin CRUD: users `/dashboard` · courses `/course` · trials `/trialCourse` · orgs `/organizations` · instructors `/instructors` · contact requests `/contact-requests`
- ✅ API layer (`lib/api.ts` with Bearer + `public-api.ts`) · Auth0 provider · role-based route guards · `AdminLayout` · pagination/SlidePanel/shared components
- ❌ Missing: **dashboard metrics page** · lead pipeline · dedicated student management · **membership/billing** · **schedule/calendar** · homework · feedback · approvals · email outbox · **assessment page** · **payment flow**

---

## 📐 Prototype reference: where it is, how to run it, which page maps to your work

> This plan keeps saying "implement per the prototype." The prototype = this MindDo repo (pure HTML/CSS/vanilla JS, no build, all state in localStorage). **Fields, states, and interactions are already defined there — click through the flow once before you build.**

**How to run / view:**
- **Easiest — view online**: the prototype is hosted on GitHub Pages, just click:
  - Portal (bilingual, includes this plan): <https://li2918.github.io/MindDo/docs/dev-plan.html>
  - Prototype home: <https://li2918.github.io/MindDo/index.html>
  - Any page: `https://li2918.github.io/MindDo/<page-name>.html`
- **Run locally**: `git clone https://github.com/li2918/MindDo` → `npm run serve` (runs `python -m http.server 8765`) → open <http://localhost:8765/>; or just double-click any `.html`.
- **See/seed data**: the `MindDoFlow.injectPanel()` floating panel (bottom-right of every page) seeds demo data and switches the ops persona; all localStorage keys are in [`SCHEMA.md`](SCHEMA.md).
- **Self-check after edits**: `npm run smoke` parses every page for syntax errors.

**Which page maps to your work** (prefix `https://li2918.github.io/MindDo/`, click to view):

| Owner | Work area | Prototype pages |
|---|---|---|
| **David** | Data model / schema | [`DATABASE_DESIGN.md`](DATABASE_DESIGN.md) · `docs/schema-explorer.html` (visual table browser) · [`SCHEMA.md`](SCHEMA.md) |
| **David** | Roles / permissions / ops flows | `docs/super-admin-flow.html` · `docs/principal-flow.html` · `docs/campus-ops-flow.html` |
| **Austin** | Funnel | `trial.html` · `trial-register.html` · `assessment.html` · `signup.html` · `profile-setup.html` |
| **Austin** | Family portal | `student-account.html` (main hub) · `add-child.html` · `add-coparent.html` · `feedback.html` · `semester-report.html` |
| **Austin** | Enroll / payment / invoice | `course-selection.html` · `course-payment.html` · `course-confirm.html` · `invoice.html` |
| **Paul** | Operations dashboard | `dashboard.html` (main, ~18,700 lines) · `student-management.html` · `request-center.html` |
| **Paul** | Today lists / email | `new-trials.html` · `new-students.html` · `email-outbox.html` |

> Navigation backbone: `index → (funnel) trial→assessment→signup→course-*`, `(family) student-account`, `(ops) dashboard→student-management/request-center/...`.

---

## 2. Refactor alignment: legacy tables → 49-table design (incremental, David-led)

| Current (lean) | Target (DATABASE_DESIGN module) | Strategy |
|---|---|---|
| `User`(PARENT/STUDENT + parentId) | `families` + `students` + `guardians` (module C) | **Add new tables + migrate data**; User still carries Auth0 login identity, profile splits into students/guardians |
| `User`(INSTRUCTOR/ADMIN) | `staff` + `roles`/`permissions` (module A) | Add staff profiles; keep the 5 role enum values, add `role_permissions` |
| `TrialCourse` + `trial-registrations` | `leads` (module D.1) + trial fields | TrialCourse → leads core; keep bookingRef |
| `ContactRequest` | `leads`(channel=contact) or `lead_contacts` | Fold into the lead pipeline |
| `Organization` / `OrganizationMembership` | `campuses` (module B) / org | Clarify "org vs campus" semantics, then map |
| `Course` / `CourseInstructor` | `class_offerings` + `class_sessions` (module E) | Expand into schedule templates + session instances |
| (none) | `memberships`/`payments`/`invoices` (module F) | **Build new** |
| (none) | `audit_log` (module I) | **Build new**, global interceptor |

> **Iron rule**: migrate one module at a time, keeping the app runnable at each step; no all-at-once teardown. Every new/changed-table Prisma PR is **reviewed and merged by David**.

---

## 3. MVP table scope this phase (~18 of the 49)

**✅ Build/align now**: `roles` `permissions` `role_permissions` `staff` (A) · `campuses` `classrooms` (B) · `families` `students` `guardians` (C) · `leads` `lead_contacts` `assessments` (D) · `class_offerings` `class_sessions` `class_enrollments` (E) · `membership_plans` `memberships` `payments` `invoices` (F) · `schedule_requests` `approvals` (G) · `audit_log` (I)

**⏭️ Phase 2**: attendance/assignments automation, session_consumptions, teacher_rates/availability, growth_records, portfolio, marketing_templates/targets, payroll, contracts, referrals, shift_notes, campus_holidays/notices, student_level_history, multi-tenant org, operational-layer roles + amount masking.

---

## 4. Ownership (re-divided around the gap)

| Engineer | This phase's main line | Modules / pages |
|---|---|---|
| **David** | **Data-model alignment (lead) + backend foundation** | A/B/C tables & migration, `audit_log`, soft delete, pagination, exception filter, seed, backend CI, unified schema-PR review |
| **Paul** | **Operations dashboard (Admin)** | metrics overview page, lead pipeline (leads), student management, approvals / leave-reschedule (G), email outbox |
| **Austin** | **Public funnel + family portal + academic + finance (incl. payments)** | assessment page/scoring (D), family→students/guardians (C frontend), membership/payments (F), course-selection→payment→confirm, family portal billing/schedule, academic (E) |

---

## 5. Milestone timeline (4 weeks, high-risk, scope tightly)

> Today is 2026-06-08. Target launch **~2026-07-04**.

| Week | Dates | Theme | Exit criteria |
|---|---|---|---|
| **W1** | 6/9–6/15 | **Model foundation** | David lands A/B/C new tables + migration scripts + audit/soft-delete/pagination; Austin/Paul start their endpoints on the new schema (legacy endpoints keep running) |
| **W2** | 6/16–6/22 | **Leads + students + dashboard** | leads/assessments endpoints + assessment frontend; students/guardians migrated; metrics page + lead pipeline working |
| **W3** | 6/23–6/29 | **Payments + portal + ops** | membership/payment models + Stripe + course-selection→payment→confirm; family portal billing/schedule; approvals/student management |
| **W4** | 6/30–7/6 | **Integration · QA · launch** | end-to-end smoke passes; legacy migration finished; real data imported; prod deploy + rollback plan |

**Critical path**: David's W1 A/B/C model + migration blocks everyone → must land within W1; every legacy→new table move can ripple into existing admin endpoints, so David + the relevant owner must coordinate.

---

## 6. Detailed task lists

> **Per-developer boards (checkable + hard deadlines + effort)**: [David](tasks/david.md) · [Paul](tasks/paul.md) · [Austin](tasks/austin.md). The below is a summary; execute and check off in the personal boards.

### 6.1 David — data-model alignment + backend foundation
**W1 (top priority, blocks everyone)**
- [ ] `roles`/`permissions`/`role_permissions` (keep 5 role enum values, add permission mapping) + `staff` profile table
- [ ] `campuses`/`classrooms` (module B), migrate TrialCourse's campus string fields to FKs
- [ ] `families`/`students`/`guardians` (module C), write the `User`-hierarchy → 3-table **migration script**; User keeps login identity only
- [ ] Global **audit interceptor** → `audit_log` (module I); soft-delete middleware; pagination helper; global exception filter
- [ ] **Seed script** (campuses/roles/demo data, ported from prototype seedDemoData)
- [ ] **Backend CI workflow** (lint + test + build image)
- [ ] Common columns (created_by/updated_by/deleted_at/org_id) + `updated_at` trigger
- [ ] Produce a "migrate + align" sample PR for Austin/Paul to copy

**W2–W4**
- [ ] Merge Austin/Paul schema PRs, keep migration order conflict-free
- [ ] `GET /api/audit` query endpoint (for Paul's audit viewer)
- [ ] Add key indexes per `DATABASE_DESIGN.md`; performance review
- [ ] Prod deploy, backups, monitoring, launch checklist + rollback plan

### 6.2 Austin — funnel + family portal + academic + finance
**W1**
- [ ] schema PR: `leads`/`lead_contacts`/`assessments` (D) (coordinate with David's migration)
- [ ] Frontend assessment page scaffold (prototype fields + scoring)
**W2**
- [ ] `TrialCourse`/`trial-registrations` → `leads` migration + endpoints (keep bookingRef)
- [ ] `assessments` endpoints + auto scoring/recommendation (port prototype logic)
- [ ] `students`/`guardians` frontend (family tab upgrade: read from module C)
**W3**
- [ ] Module F: `membership_plans`/`memberships`/`payments`/`invoices` endpoints
- [ ] **Stripe integration** + webhook reconciliation
- [ ] Frontend: course-selection → course-payment → course-confirm + invoice
- [ ] Family portal: membership + billing (payment method/history) + schedule (read-only)
**W4**
- [ ] Module E minimal subset: `class_offerings`/`class_sessions`/`class_enrollments` read + schedule display
- [ ] feedback / semester-report frontend; integration + QA

### 6.3 Paul — operations dashboard (Admin)
**W1**
- [ ] schema PR: `schedule_requests`/`approvals` (G)
- [ ] Dashboard "metrics overview" page scaffold (admin currently lacks this overview; follow `dashboard.html`)
**W2**
- [ ] Aggregation endpoints: registration/payment/assessment/conversion metrics + alerts
- [ ] **Lead pipeline** page: combine existing `contact-requests` + new `leads` into one CRM list/filter/detail/contact-log
- [ ] Frontend: core metric cards + trend charts
**W3**
- [ ] **Student management** page: list + drawer (homework/growth/change-history/profile), based on module C
- [ ] Approval queue + `POST /api/approvals/:id/decide` (writes audit); leave/reschedule `request-center`
- [ ] new-trials / new-students today lists
**W4**
- [ ] Email outbox (extend the existing `email` module) + renewal/absence auto-drafts
- [ ] Audit log viewer (consumes `GET /api/audit`); integration + QA

---

## 7. Definition of Done (DoD)
A module is "done" when all 6 pass:
- [ ] Prisma table + migration merged (legacy data migrated, app still runs)
- [ ] REST endpoints (list/single/create/patch/soft-delete)
- [ ] Server-side validation (DTO + class-validator)
- [ ] Frontend on real API (mock removed)
- [ ] Permissions: `RolesGuard` + frontend hides by role
- [ ] Write operations go to `audit_log`

---

## 8. Cross-team conventions
- **Naming/types/indexes**: follow `DATABASE_DESIGN.md §3` (snake_case, `idx_*`/`uq_*`/`fk_*`, money `*_cents` BIGINT, UUID PKs, TIMESTAMPTZ).
- **Schema changes**: whoever owns the module opens the Prisma PR; **David reviews & merges centrally**, controlling migration order.
- **Migration discipline**: each PR must apply forward cleanly without breaking the app; destructive changes go add-new-column/table → migrate data → drop old, split across PRs.
- **Branching**: `feature/<module>` → `dev` → `main` (triggers deploy); each PR ≥1 review.
- **Secrets**: only in GitHub Secrets / `.env` (gateway, Auth0 M2M, DB), never in the repo.
- **Daily 15-min standup**: progress + blockers, name the owner (especially whether David's migration is blocking anyone).

---

## 9. Risk register
| Risk | Impact | Mitigation |
|---|---|---|
| Refactor + payments + 4 weeks = highest-risk combo | Slip / unstable launch | Only the 18 tables in §3; incremental migration; cut scope every Friday |
| Legacy→new migration ripples into existing admin endpoints | Regression of existing features | Add new tables side-by-side, migrate gradually; migrate one module, integrate one |
| David single point (model + infra + review) | Blocks everyone | W1 only A/B/C + infra; sample PR early; Austin/Paul work on stable columns in parallel |
| Payment compliance (US COPPA / minors / collecting money) | Legal risk | Assess minimal compliance for gateway + consent flow; don't collect until it's met |
| Demo data ≠ real campus data | Launch data mess | Dedicated real campus/plan/staff import + reconciliation in W4 |

---

## 10. Open decisions (affect work start, please settle ASAP)
1. ✅ **Payment gateway = Stripe** (decided 2026-06-08). Action: register a Stripe account early, get test/live API keys, configure webhook endpoint; WeChat/Alipay if needed → Phase 2.
2. **"Organization" vs "Campus" semantics**: how does the existing Organization map to/merge with the spec's campuses? → blocks David's module B migration.
3. **Migration-period data**: how much real data already exists in User/ContactRequest/TrialCourse to migrate, or is it still demo data that can be rebuilt? → determines migration-script effort.
4. **File storage** (portfolio/contract/invoice PDF): S3 / R2? (Phase 2 can defer, but invoice may be needed this phase.)
5. **Plan-doc ownership**: move this doc into `minddoai/docs/` maintained via PR (recommended), keeping the prototype-repo copy as a snapshot.

---

## 11. Progress tracking
- **Task level**: check off `- [ ]` in §6 / personal boards, commit with module name.
- **Weekly**: every Friday verify §5 exit criteria; for misses write the reason + recovery.
- **Decision level**: mark each §10 item ✅ with the conclusion once settled.
- **Living doc**: scope/ownership changes are edited here directly and noted in the commit.

---

_Baseline: existing minddoai code (45 PRs) + MindDo prototype + `DATABASE_DESIGN.md`. Last updated: 2026-06-08._
