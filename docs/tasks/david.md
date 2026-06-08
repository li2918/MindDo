# Task Board · David — Data-model alignment + backend foundation

> **Role**: lead the data-model alignment toward the 49-table design + backend foundation + unified schema-PR review. **He is the critical path; W1 blocks everyone.**
> **How to use**: when done, change `- [ ]` to `- [x]`. `d` = dev-day; **dates are hard deadlines** (back-calculated from effort + dependencies).
> **Overview**: [DEV_TASK_PLAN.md](../DEV_TASK_PLAN.md)

---

## W1 · 6/9–6/15 — Model foundation (top priority)
- [ ] Common columns (created_by/updated_by/deleted_at/org_id) + `updated_at` trigger + soft-delete middleware skeleton — ~0.5d — **due 6/10**
- [ ] `roles`/`permissions`/`role_permissions` (keep 5 role enum values) + `staff` profile table — ~1.5d — **due 6/11**
- [ ] Backend CI workflow (lint + test + build image) — ~0.5d — **due 6/11**
- [ ] "Migrate + align" sample PR (one table: add→migrate data→switch) for Austin/Paul — ~0.5d — **due 6/12**
- [ ] `campuses`/`classrooms` + `TrialCourse.campus` string → FK migration — ~1.5d — **due 6/13**
- [ ] `seed` script (campuses/roles/demo data, ported from prototype seedDemoData) — ~0.5d — **due 6/13**
- [ ] 🔴 `families`/`students`/`guardians` + `User`-hierarchy → 3-table **migration script** (blocks Austin's C frontend, Paul's student management) — ~2.5d — **due 6/15**

**Weekly load ≈ 7.5d ⚠️ (>5d).** Mitigation: `families/students/guardians` (6/15) is the must-hit blocker, highest priority; if squeezed, push `seed`/CI to 6/16 and ship staff+campuses first so the other two can work in parallel.

## W2 · 6/16–6/22 — Foundation completion
- [ ] Audit interceptor → `audit_log` (module I) + soft-delete middleware live + pagination helper + global exception filter — ~2d — **due 6/18**
- [ ] `GET /api/audit?kind=&actor=&from=` query endpoint (for Paul's audit viewer) — ~0.5d — **due 6/19**
- [ ] Merge and coordinate Austin/Paul schema PRs, keep migration order conflict-free — ~1d (ongoing) — **due 6/20**

**Weekly load ≈ 3.5d.**

## W3 · 6/23–6/29 — Indexes / payment review
- [ ] Add key indexes per `DATABASE_DESIGN.md` + performance review — ~1d — **due 6/26**
- [ ] Payment tables (memberships/payments/invoices) schema review + migration gatekeeping (with Austin) — ~0.5d — **due 6/27**

**Weekly load ≈ 1.5d (buffer kept for migration firefighting).**

## W4 · 6/30–7/6 — Launch
- [ ] Prod deploy + DB backups + monitoring/alerts — ~1.5d — **due 7/2**
- [ ] Launch checklist + rollback plan + end-to-end integration gatekeeping — ~1.5d — **due 7/4**

**Weekly load ≈ 3d.**

---

### Dependencies & reminders
- The W1 A/B/C blocks are everyone's foundation; **must be usable before 6/15**, or Austin/Paul's whole W2 slips.
- All destructive changes go via "add new table/column → migrate data → drop old" across multiple PRs. **No big-bang rewrite.**
- You review & merge every new/changed-table PR; when a migration blocks someone, call it out at standup.
