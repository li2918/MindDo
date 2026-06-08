# Task Board · Austin — Funnel + family portal + academic + finance (incl. payments)

> **Role**: public funnel, family portal, academic, **finance/payments** (heaviest this phase).
> **How to use**: when done, change `- [ ]` to `- [x]`. `d` = dev-day; **dates are hard deadlines**.
> **Overview**: [DEV_TASK_PLAN.md](../DEV_TASK_PLAN.md)

---

## 📐 Prototype reference (Austin's area)
- **Run/view**: click pages online, or locally `npm run serve` → <http://localhost:8765/>
- **Funnel**: <https://li2918.github.io/MindDo/trial.html> · <https://li2918.github.io/MindDo/trial-register.html> · <https://li2918.github.io/MindDo/assessment.html> · <https://li2918.github.io/MindDo/signup.html> · <https://li2918.github.io/MindDo/profile-setup.html>
- **Family portal**: <https://li2918.github.io/MindDo/student-account.html> (main hub) · <https://li2918.github.io/MindDo/add-child.html> · <https://li2918.github.io/MindDo/add-coparent.html> · <https://li2918.github.io/MindDo/feedback.html> · <https://li2918.github.io/MindDo/semester-report.html>
- **Enroll / payment / invoice**: <https://li2918.github.io/MindDo/course-selection.html> · <https://li2918.github.io/MindDo/course-payment.html> · <https://li2918.github.io/MindDo/course-confirm.html> · <https://li2918.github.io/MindDo/invoice.html>

---

## W1 · 6/9–6/15 — Assessment + schema
- [ ] `leads`/`lead_contacts`/`assessments` (module D) schema PR (coordinate with David's migration) — ~1d — **due 6/13**
- [ ] Assessment page `assessment` frontend scaffold + port prototype scoring logic — ~1.5d — **due 6/15**

**Weekly load ≈ 2.5d.**

## W2 · 6/16–6/22 — Leads + assessment + students
- [ ] 🔵 `TrialCourse`/`trial-registrations` → `leads` migration + endpoints (keep bookingRef) **(Paul's lead pipeline waits on this — ship first)** — ~2d — **due 6/18**
- [ ] `assessments` endpoints + auto scoring/recommendation — ~1.5d — **due 6/20**
- [ ] `students`/`guardians` frontend: upgrade family tab to read module C instead of User-children (depends on David's 6/15) — ~1.5d — **due 6/22**

**Weekly load ≈ 5d.**

## W3 · 6/23–6/29 — Payments (core, heaviest)
- [ ] `membership_plans`/`memberships`/`payments`/`invoices` endpoints (module F) — ~2d — **due 6/25**
- [ ] 🔴 Stripe integration (Payment Intents + webhook reconciliation) + persist `payments` — ~2.5d — **due 6/28**
- [ ] Frontend: course-selection → course-payment → course-confirm + invoice — ~2d — **due 6/29**

**Weekly load ≈ 6.5d ⚠️ (clearly over).** Mitigation: payments is the only hard goal this week; push the W4 "academic module E" block **entirely to Phase 2** to free up time for payments.

## W4 · 6/30–7/6 — Family portal + wrap-up
- [ ] Family portal: membership + billing (payment method/history) + schedule (read-only) — ~2d — **due 7/2**
- [ ] feedback / semester-report frontend — ~1d — **due 7/3**
- [ ] Integration + QA + bug fixing — ~1.5d — **due 7/4**
- [ ] (if capacity) Module E minimal subset: `class_offerings`/`class_sessions`/`class_enrollments` read + schedule display — ~1.5d — **due 7/4 / else → Phase 2**

**Weekly load ≈ 4.5d (excluding optional E).**

---

### Dependencies & reminders
- **Ship the leads endpoints by 6/18** — Paul's lead pipeline is waiting.
- Payment gateway = **Stripe** (decided); within W1 register the account, get a test API key, and get a minimal Payment Intent demo working — don't wait until W3.
- You're the heaviest-loaded this phase; **module E (academic) is the first thing to cut** — prioritize "funnel + payments + family portal".
- `students/guardians` frontend depends on David's 6/15 migration; if blocked, mock first.
