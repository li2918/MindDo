# MindDo · Backend Migration Guide

This doc covers how to move MindDo from a frontend-only prototype (all data
in `localStorage`) to a real backend with persistent storage and proper
authentication. The current `localStorage` schema in [`SCHEMA.md`](SCHEMA.md)
is the source of truth for the data model — this doc maps each key to a
suggested DB table / REST endpoint and outlines the migration order.

> **Status**: planning doc. Not a step-by-step migration script.
>
> **For backend devs starting now**: the full table-by-table DDL reference
> lives in [`DATABASE_DESIGN.md`](DATABASE_DESIGN.md) — 49 tables with
> columns, types, constraints, and indexes. This file stays as the
> migration *strategy*; that file is the *implementation contract*.

---

## Current architecture (recap)

- **Storage**: 38+ `minddo_*` keys in `localStorage`, defined in
  [`assets/minddo-flow.js`](../assets/minddo-flow.js) `KEYS` object.
- **Access pattern**: `flow.readJson(key)` / `flow.writeJson(key, value)` —
  synchronous, parse-then-mutate-then-stringify.
- **Auth**: mock — `minddo_active_ops_user` holds the staff id of the
  "logged-in" user. The top-right user-menu switches identities.
- **Audit**: `appendAudit({kind, target, summary, before, after})` writes
  to a bounded 500-row array.

Everything runs in the browser — no server. Migrating to a real backend
means replacing the storage layer + adding network calls + introducing
real auth.

---

## Suggested stack

| Layer | Recommendation | Why |
|---|---|---|
| Backend framework | **FastAPI** (Python) or **Express** (Node) | Both quick to stand up; mirror the JS schema closely |
| Database | **PostgreSQL** | Mature; JSON columns useful for `sessions[]` / `contactLog[]` arrays |
| Auth | **Auth0** / **Clerk** / **Supabase Auth** | Off-the-shelf; supports RBAC out of the box |
| API style | **REST** (matches existing CRUD pattern) or **tRPC** if Node | Single-page admin — REST is plenty |
| Frontend changes | Keep current HTML/CSS, replace `flow.readJson/writeJson` with `fetch()` calls | Minimize rewrite scope |

---

## Schema → DB table mapping

### Core student journey

| `minddo_*` key | Suggested table | Notes |
|---|---|---|
| `minddo_current_student` | (no table — session state) | Move to JWT claims or `/api/me` endpoint |
| `minddo_trial_leads` | `leads` | Add foreign keys: `assigned_to → staff.id`, `campus_id → campuses.id`. `tags`, `contactLog` → JSONB or separate `lead_tags` + `lead_contacts` tables |
| `minddo_assessments` | `assessments` | One-to-one with leads via email or studentId |
| `minddo_signup_users` | (replace) | Replaced by real auth. Password storage = ❌ — use bcrypt + provider tokens |
| `minddo_payments` | `payments` | FK: `student_id`, `membership_id`. Add `gateway_id`, `gateway_meta` for real payment processing |
| `minddo_membership_orders` | `memberships` + `membership_sessions` | Two tables — `sessions[]` becomes a child relation |
| `minddo_feedback` | `trial_feedback_parent` | Distinct from `trial_evaluations` + `trial_feedback` (marketer-side) |
| `minddo_schedule_requests` | `schedule_requests` | Workflow rows; consider state machine table |

### Academic catalog

| `minddo_*` key | Suggested table |
|---|---|
| `minddo_class_offerings` | `class_offerings` |
| `minddo_student_levels` | `student_levels` (or column on students) |
| `minddo_trial_slots` | `trial_slot_config` (campus_id PK + JSONB) |
| `minddo_portfolio` | `student_portfolio` |
| `minddo_growth_records` | `student_growth_records` |
| `minddo_assignments` | `assignments` |

### Family + multi-account

| `minddo_*` key | Suggested table |
|---|---|
| `minddo_families` | `families` |
| `minddo_students` | `students` |
| `minddo_guardians` | `guardians` (or `users` with role='guardian') |
| `minddo_accounts` | (replaced by auth provider) |
| `minddo_invite_tokens` | `invite_tokens` (single-use, with expiry) |
| `minddo_account_invites` | `account_invites` |
| `minddo_billing_profile` | `billing_profiles` |

### Marketing / ops

| `minddo_*` key | Suggested table |
|---|---|
| `minddo_referrals` | `referrals` |
| `minddo_trial_evaluations` | `trial_evaluations` |
| `minddo_trial_completions` | `trial_completions` (or `status` column on leads) |
| `minddo_email_outbox` | `messages` (becomes the queue for a real provider — SendGrid / Postmark / SES) |
| `minddo_marketing_templates` | `message_templates` |
| `minddo_trial_feedback` | `trial_feedback` (note: keyed by lead.createdAt currently — change to lead_id FK) |
| `minddo_campus_hours` | `campus_hours` (campus_id PK + JSONB) |
| `minddo_classrooms` | `classrooms` |
| `minddo_campus_notice` | `campus_notices` |
| `minddo_shift_notes` | `shift_notes` |
| `minddo_marketing_targets` | `marketing_targets` (staff_id + period composite PK) |

### Operations / finance / internal

| `minddo_*` key | Suggested table |
|---|---|
| `minddo_payroll` | `payroll_entries` |
| `minddo_contracts` | `contracts` |
| `minddo_approvals` | `approvals` (with `decided_at`, `decided_by`, `decision_reason`) |
| `minddo_staff` | `staff` (or `users` with role attached) |
| `minddo_roles` | `roles` + `role_permissions` (many-to-many) |
| `minddo_audit_log` | `audit_log` (drop the 500-row cap; let it grow with partitioning by month) |
| `minddo_attendance` | `attendance` |
| `minddo_teacher_availability` | `teacher_availability` |
| `minddo_teacher_rates` | `teacher_rates` (or column on staff) |

### System

| `minddo_*` key | Replace with |
|---|---|
| `minddo_lang` | User preferences row + cookie |
| `minddo_seed_version` | (delete — was for first-time seed) |
| `minddo_migrations_applied` | Server-side migration system (Alembic / Knex / Prisma) |
| `minddo_active_ops_user` | JWT / session cookie |
| `minddo_dashboard_tab` / `minddo_dash_*` | User preferences or just URL state |
| `minddo_franchise_inquiries` | `franchise_inquiries` |
| `minddo_franchise_draft` | (delete — moves to localStorage for in-progress only) |

---

## REST API sketch

For each table, a standard 5-endpoint REST set:

```
GET    /api/leads               → list (filtered by campus from JWT)
GET    /api/leads/:id           → single
POST   /api/leads               → create
PATCH  /api/leads/:id           → partial update
DELETE /api/leads/:id           → soft delete (audit'd)
```

Special endpoints worth calling out:

| Endpoint | Purpose |
|---|---|
| `POST /api/auth/login` | Issue JWT |
| `GET /api/me` | Replaces `minddo_current_student` for parent side + `minddo_active_ops_user` for ops |
| `POST /api/leads/import` | CSV import endpoint (batch + dup check on server) |
| `POST /api/approvals/:id/decide` | One endpoint for approve/reject (writes audit) |
| `POST /api/leads/:id/contact` | Append contact-log entry (server stamps `at` + `by`) |
| `POST /api/messages/draft` | Server-side draft generation (renewal / absentee) |
| `GET /api/audit?kind=&actor=&from=` | Filtered audit history |
| `GET /api/integrity/report` | Run the same 8 checks server-side |

---

## Permissions

Current frontend has `PERMISSION_TEMPLATES` mapping role → perm-list, with
`hasPerm()` checking at render-time. On the backend:

1. Move templates to a `permission_templates` table keyed by role.
2. Wrap every endpoint with a middleware: `requirePerm("approve.finance")`.
3. Server returns 403 when perm missing; frontend keeps the `hasPerm()`
   check for hide/disable UX, but trusts the server for final say.
4. The `.campus` variant logic stays the same: a check for
   `X.campus` passes if the user has the broader `X`. Implement in
   middleware.

JWT payload should include:
```json
{
  "user_id": "EM001",
  "role_id": "principal",
  "campus_id": "irvine",       // null for super-admin
  "permissions": ["academic.write", "approve.finance", ...]
}
```

---

## Migration order

Do this in stages, not big-bang. The dashboard can keep working from
`localStorage` while individual modules graduate to the API.

1. **Auth + staff/roles first** — pick an auth provider, replace
   `loginAsRole` mock with real login. Migrate `minddo_staff` + `minddo_roles`
   to DB. `hasPerm()` reads from the JWT now.
2. **Leads + marketing CRM** — typically the highest-business-value module
   and the one with the most user data already. Migrate leads, trial_feedback,
   marketing_templates, marketing_targets.
3. **Students + memberships + payments** — the money path. Wrap payments
   behind a real gateway (Stripe / Alipay).
4. **Academic** — class_offerings, attendance, student_levels.
5. **Approvals + audit** — these depend on staff IDs being real.
6. **Settings** — campus_hours / classrooms / notice / trial_slots.
7. **Everything else** — referrals, contracts, payroll, etc.

For each module:

```
[ ] Create DB tables + migration
[ ] Build REST endpoints
[ ] Add server-side validation
[ ] Swap frontend readJson/writeJson for fetch
[ ] Keep localStorage cache for offline reads (optional)
[ ] Remove the migrated key from the seedDemoData() call
```

---

## Frontend code changes

Most of the dashboard.html JS is structured as `var rows = flow.readJson(key)`
→ filter / sort / render. The smallest possible swap:

```js
// before
var leads = flow.readJson(flow.keys.leads) || [];

// after
async function getLeads() {
  const r = await fetch("/api/leads", { credentials: "include" });
  return r.ok ? r.json() : [];
}
var leads = await getLeads();
```

Helpers in `minddo-flow.js` to update:
- `readJson(key)` → `apiGet(path)`
- `writeJson(key, value)` → `apiPost(path, value)` / `apiPatch`
- `appendAudit({...})` → server-side automatic
- `hasPerm(perm)` → read from JWT (cached in memory)

Render functions stay the same — they take the data array and produce
HTML. The page becomes harder to load (waiting on network) so add loading
states + optimistic UI to the modals that take user input.

---

## What stays in localStorage

After migration, these can stay client-side:

- `minddo_lang` — UI language preference
- `minddo_dashboard_tab` / `minddo_dash_*` — sticky tab choices
- `minddo_dashboard_range` — selected time range
- `minddo_franchise_draft` — in-progress form data
- `minddo_draft_actions` — "I dismissed this draft today" tracking

These are pure UX state — no need to persist server-side.

---

## Audit considerations

The current 500-row cap is for demo storage. On a real backend:
- No cap; partition by month for query speed
- Add structured fields beyond `summary`: `entity_type`, `entity_id`,
  `diff` as JSONB (just the changed keys, not full snapshots)
- Index on `actor`, `kind`, `at` for filtering
- Consider event sourcing for high-write entities (`leads`, `attendance`)

---

## Open questions for the migration

- **Multi-tenant?** If MindDo becomes SaaS, add `org_id` everywhere
  (currently single-org, multi-campus).
- **File storage?** Portfolio / brand materials currently mocked — need
  S3 / R2 for real files.
- **Real-time?** The dashboard re-renders only on user action. Live
  updates (new lead arrives, approval submitted) would need WebSocket
  or SSE.
- **Compliance?** PII handling for students (under-13 in some jurisdictions);
  retention policy for `audit_log`; data export for GDPR-style requests.

---

*Maintained alongside [`SCHEMA.md`](SCHEMA.md). When you add a new
`minddo_*` key, update both files.*
