# MindDo Frontend Feature Inventory

## Purpose

This document records the current frontend system scope for the MindDo prototype.

It is designed for three practical uses:

1. Review what has already been implemented.
2. Locate the file and storage entry for each feature quickly.
3. Remove a feature safely later without searching the whole project blindly.

This document should be updated whenever a visible user-facing module, dashboard capability, or local demo data flow is added or removed.

## Current System Scope

The current frontend prototype now covers a usable end-to-end education operations flow:

1. Public business overview
2. Trial registration
3. Assessment and sample quiz
4. Student sign-up and existing-account login
5. Course selection and membership
6. Student home after login
7. Feedback and semester reporting
8. Operations dashboard
9. Special lists for newly registered trials and students
10. Student leave/reschedule request and dashboard-side visibility
11. Student management workspace
12. Operator request processing center with status updates

## Page Map

### `index.html`

Purpose:
Main system landing page / unified entry hub.

Primary users:
Parents, students, operators, internal stakeholders.

Key role in system:
Acts as the main front door for the full frontend system and links into the high-frequency pages by role and usage.

Current implemented capabilities:

1. Landing-style hero section
2. Primary launch dock for common pages
3. Role-based portals for visitor, student, and operations
4. Full page library for all available prototype pages
5. Bilingual switching consistent with the rest of the site
6. No project explanation blocks; this page now focuses only on entry and navigation

Safe removal note:
If only the front-door landing is not needed, this file can be simplified or replaced without breaking the shared local data flow logic.

### `trial.html`

Purpose:
Self-service trial booking.

Primary users:
Parents / students before formal enrollment.

Key implemented capabilities:

1. Trial registration form
2. Writes lead data into local storage
3. Links into student account and assessment flow
4. Supports current student prefill via shared local flow state

Related local storage:

- `minddo_trial_leads`
- `minddo_current_student`

Remove if not needed:

- Trial booking UX
- Trial lead source analytics on dashboard
- Trial list page usefulness decreases

### `assessment.html`

Purpose:
Assessment intake and lightweight sample quiz.

Primary users:
Students, consultants, academic staff.

Key implemented capabilities:

1. Profile-level assessment form
2. Extra fields such as confidence and learning style
3. Sample quiz with auto score preview
4. Auto recommendation text
5. One-click sample fill
6. Saved assessment payload includes quiz score and recommendation

Related local storage:

- `minddo_assessments`
- `minddo_current_student`

Remove if not needed:

- Quiz UI
- Recommendation block
- Dashboard assessment stats become less meaningful

### `signup.html`

Purpose:
Student registration and login entry page.

Primary users:
New and existing students / parents.

Key implemented capabilities:

1. New user registration
2. Existing account login section
3. Third-party login buttons
4. Google / Microsoft / Apple visual login buttons with logo-style markers
5. Social login mock flow
6. Registration success always routes to student page, even if email API is unavailable
7. Existing-account login uses locally stored signup users

Related local storage:

- `minddo_signup_users`
- `minddo_current_student`

Potential future upgrade:

- Real password verification
- Forgot password flow
- Real OAuth callback flow

Remove if not needed:

- Existing login section can be removed without affecting registration itself
- Social login buttons can be removed independently

### `course-selection.html`

Purpose:
Membership selection, schedule preference capture, add-ons, and pricing summary.

Primary users:
Students / parents after sign-up or assessment.

Key implemented capabilities:

1. Membership plan selection
2. Class mode selection
3. Billing cycle selection
4. Preferred weekday and time slot
5. Add-on selection
6. Price summary calculation
7. Membership order save to local storage
8. Student meta prefill from shared flow state

Related local storage:

- `minddo_membership_orders`
- `minddo_current_student`

Remove if not needed:

- Membership pricing UI
- Student home course/schedule view will lose source data

### `student-account.html`

Purpose:
Logged-in student home page.

Primary users:
Students / parents after sign-up or login.

Current implemented modules:

1. Student profile section
2. Learning summary
3. Current flow status
4. Quick actions
5. Course selection entry
6. Assessment entry
7. Feedback entry
8. Trial re-entry
9. Logout
10. Course summary
11. Schedule summary
12. Weekly schedule board
13. Multi-course / multi-slot weekly schedule aggregation
14. Next lesson reminder
15. Leave / reschedule request form
16. Leave / reschedule request history

Related local storage:

- `minddo_current_student`
- `minddo_membership_orders`
- `minddo_trial_leads`
- `minddo_assessments`
- `minddo_feedback`
- `minddo_schedule_requests`

Remove if not needed:

- `Logout`: remove both logout buttons and `logout()` logic
- `Weekly schedule board`: remove `week-board` markup, CSS, and render block
- `Next lesson reminder`: remove reminder card and related render logic
- `Leave / reschedule`: remove request form, request history, and storage key usage

### `feedback.html`

Purpose:
Learning feedback collection / parent-facing progress record.

Primary users:
Teachers, operators, students, parents.

Key role:
Stores learning feedback tied to the current student.

Related local storage:

- `minddo_feedback`

### `semester-report.html`

Purpose:
Milestone report / stage summary.

Primary users:
Parents, operators, teachers.

Key role:
Displays stage reporting and next-term suggestions.

### `dashboard.html`

Purpose:
Operations dashboard.

Primary users:
Operations, consultants, internal management.

Current implemented modules:

1. Registration metrics
2. Payment metrics
3. Assessment metrics
4. Conversion metrics
5. New trial alert card
6. New student alert card
7. Pending leave/reschedule request count
8. Level distribution
9. Lead source distribution
10. Payment entry tool
11. Recent payments table
12. Recent leave/reschedule requests table
13. Direct entries to student management and request processing pages

Related local storage:

- `minddo_signup_users`
- `minddo_assessments`
- `minddo_trial_leads`
- `minddo_payments`
- `minddo_schedule_requests`

Remove if not needed:

- Alert strip can be removed independently
- Request table can be removed without affecting student-side request submission

### `student-management.html`

Purpose:
Dedicated operator page for student lifecycle management.

Primary users:
Operations, consultants, academic coordinators.

Current implemented modules:

1. Student list card view
2. Search by name, email, or student ID
3. Status filtering
4. `NEW` badge for students registered today
5. Joined view of sign-up, assessment, feedback, and membership status
6. Quick entry to student profile page
7. Quick entry to request processing center

Related local storage:

- `minddo_signup_users`
- `minddo_assessments`
- `minddo_feedback`
- `minddo_membership_orders`

Remove if not needed:

- The full page can be deleted independently if operators do not need a dedicated student workspace
- Dashboard and student page remain usable without this page

### `request-center.html`

Purpose:
Dedicated operator page for leave/reschedule request handling.

Primary users:
Operations, consultants, scheduling staff.

Current implemented modules:

1. Unified request list
2. Search by student, email, course, or reason
3. Request status filtering
4. Action buttons for `approved`, `rejected`, and `completed`
5. Processing metrics for all requests
6. Shared request status update flow

Related local storage:

- `minddo_schedule_requests`

Remove if not needed:

- This page can be removed without breaking student submission itself
- If removed, also remove dashboard/request links and shared request status update usage

### `new-trials.html`

Purpose:
Dedicated list page for today’s newly registered trial leads.

Primary users:
Operations.

Key role:
Quick review page linked from dashboard alert card.

Related local storage:

- `minddo_trial_leads`

### `new-students.html`

Purpose:
Dedicated list page for today’s newly registered students.

Primary users:
Operations.

Key role:
Quick review page linked from dashboard alert card.

Current implemented detail:

1. Includes explicit `NEW` badge for each listed student

Related local storage:

- `minddo_signup_users`

## Shared Frontend Data Layer

### Main helper file

File:
`assets/minddo-flow.js`

Primary role:
Acts as the shared local demo state layer across pages.

Current exported/shared responsibilities:

1. Current student state
2. Lead save
3. Assessment save
4. Signup save
5. Payment save
6. Membership save
7. Feedback save
8. Prefill helpers
9. Demo data seed
10. Floating flow test panel
11. Centralized schedule request read/write helpers
12. Request status update helper for operations

### Storage Keys In Use

These keys are currently part of the demo frontend state model:

- `minddo_current_student`
- `minddo_signup_users`
- `minddo_assessments`
- `minddo_trial_leads`
- `minddo_payments`
- `minddo_feedback`
- `minddo_membership_orders`
- `minddo_schedule_requests`

Important note:
`minddo_schedule_requests` is now shared through `assets/minddo-flow.js`, and both student-side submission and operator-side processing rely on it.

## Feature Removal Guide

This section is intentionally practical. If you later decide a feature is unnecessary, delete or simplify using the matching section below.

### Remove Third-Party Login

Files:

- `signup.html`

Remove:

1. OAuth button block
2. Provider text entries in i18n
3. `handleOAuth()` logic
4. Button event listeners

Storage/data impact:

- Existing saved users with `provider` fields remain harmless

### Remove Existing Account Login

Files:

- `signup.html`

Remove:

1. Login form section
2. Login i18n copy
3. `findUserByEmail()`
4. Login submit handler

### Remove Assessment Quiz

Files:

- `assessment.html`

Remove:

1. Quiz question block
2. Score badge
3. Auto recommendation logic
4. Quiz answer fields from payload

### Remove Student Schedule Board

Files:

- `student-account.html`

Remove:

1. `week-board` section
2. Day-card CSS
3. Membership aggregation render block

### Remove Leave / Reschedule Flow

Files:

- `student-account.html`
- `dashboard.html`
- `request-center.html`

Remove:

1. Request form
2. Request history list
3. Dashboard pending request metric
4. Dashboard recent requests table
5. Request center page
6. References to `minddo_schedule_requests`

Optional cleanup:

- Remove old request data from local storage manually

### Remove New Trial / New Student Operational Lists

Files:

- `dashboard.html`
- `new-trials.html`
- `new-students.html`

Remove:

1. Dashboard alert cards
2. Dedicated list pages
3. Links to those pages

## Recommended Next Features

These are not all implemented yet, but they are the most natural next steps if the goal is a more production-like frontend.

### High Priority

1. Stronger student course calendar with actual dates, not only weekday/time
2. Student “next assignment” and “remaining sessions” card
3. Parent-facing message center / notification history
4. Payment status badges and overdue reminder logic
5. Student risk warning for inactive or feedback-missing accounts

### Medium Priority

1. Search and filtering across trial and payment records
2. Better risk indicators for missing feedback or inactive students
3. Parent contact timeline
4. Multi-role navigation shell
5. Operator note-taking per student

### Lower Priority

1. Profile editing
2. Avatar support
3. Theme refinement per user role
4. Exportable reports

## Definition Of “Usable Frontend” For This Prototype

For this project, a usable frontend means:

1. A user can enter from landing, trial, assessment, or sign-up.
2. A student can register or log in.
3. A student can reach a complete student home page after login.
4. A student can view profile, course selection, schedule, assessment, and feedback entry points.
5. A student can submit leave/reschedule requests.
6. Operations can see new trials, new students, payments, and request activity on the dashboard.
7. Demo data moves across pages consistently through local storage.

The system already satisfies that prototype-level definition.

## Maintenance Rule

Whenever a new visible frontend capability is added, update this document with:

1. Feature name
2. File location
3. Related local storage key or shared helper
4. Safe removal instructions

That keeps the prototype extensible without becoming hard to trim later.
