# Task Board · Paul — Operations dashboard (Admin)

> **Role**: operations dashboard (metrics overview, lead pipeline, student management, approvals, email outbox).
> **How to use**: when done, change `- [ ]` to `- [x]`. `d` = dev-day; **dates are hard deadlines**.
> **Overview**: [DEV_TASK_PLAN.md](../DEV_TASK_PLAN.md)

---

## W1 · 6/9–6/15 — Scaffolding (parallel on mock, don't wait for David)
- [ ] `schedule_requests`/`approvals` (module G) schema PR — ~1d — **due 6/13**
- [ ] Build the "metrics overview" page layout + routing + role guard on mock data (follow `dashboard.html`) — ~1.5d — **due 6/15**

**Weekly load ≈ 2.5d (light; spend slack learning the existing admin code).**

## W2 · 6/16–6/22 — Metrics + lead pipeline
- [ ] Aggregation endpoints: registration/payment/assessment/conversion metrics + alerts (filtered by campus) — ~2d — **due 6/19**
- [ ] Frontend: core metric cards + trend charts (on real aggregation endpoints) — ~1d — **due 6/20**
- [ ] 🔵 Lead pipeline page: combine existing `contact-requests` + new `leads` into one CRM list/filter/detail/contact-log (depends on Austin's 6/18 leads endpoints) — ~2.5d — **due 6/22**

**Weekly load ≈ 5.5d ⚠️ (slightly over).** Mitigation: build the lead pipeline frontend on mock first, wire real data once Austin's 6/18 leads endpoints land.

## W3 · 6/23–6/29 — Student management + approvals
- [ ] 🔵 Student management page: list + drawer (homework/growth/change-history/profile, based on module C, depends on David's 6/15) — ~2.5d — **due 6/26**
- [ ] Approval queue + `POST /api/approvals/:id/decide` (writes audit) + `request-center` leave/reschedule — ~2d — **due 6/29**
- [ ] `new-trials`/`new-students` today lists — ~0.5d — **due 6/27**

**Weekly load ≈ 5d.**

## W4 · 6/30–7/6 — Wrap-up
- [ ] Email outbox (extend existing `email` module) + renewal/absence auto-drafts — ~1.5d — **due 7/2**
- [ ] Audit log viewer (consumes David's `GET /api/audit`) — ~1d — **due 7/3**
- [ ] Integration + QA + bug fixing — ~1.5d — **due 7/4**

**Weekly load ≈ 4d.**

---

### Dependencies & reminders
- Lead pipeline depends on Austin's `leads` endpoints (6/18); student management depends on David's `students/guardians` (6/15). If blocked, mock first.
- All write operations (approval decide, etc.) must go to `audit_log` (David's W2 interceptor provides it).
- The existing `/contact-requests` page is a base — don't tear it down; upgrade and fold it into the lead pipeline.
