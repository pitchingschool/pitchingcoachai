# VIP Coach Hub — Plan

Status: **waiting for Mike's approval. Nothing has been built and nothing in the database has been changed.**

This file lives in a public repository, so it leaves out project identifiers, keys and the specifics of
the security findings. Those were reported to Mike directly.

## 0. Decisions from Mike (Nov 16)

- Plan direction approved. Code goes in a **new private repo and a new Netlify site**.
- Triage rules in section 6 approved as proposed.
- **Attendance comes from the jump, not a tap.** Every athlete jumps in the first 10 minutes, so an athlete
  is "here" when a force plate test lands in his class window. This replaces the tap-to-mark-present design
  and the `checkins` table in section 4; a small manual override remains for athletes who cannot jump.
- The Supabase project is on a paid plan, so branches are available.
- Ingest and read keys will be rotated (Mike updates the callers).

## 1. What I read

- All 14 tables, all 17 views (full SQL), the 5 database functions, the one trigger and the cron job.
- All 8 Edge Functions, line by line.
- Both prototypes, completely. They are not in `/reference` in this repo; the page code lives in the two
  Claude artifacts ("VIP Athlete Dashboard", "VIP Force Plate Report"). I pulled the code from there and
  wrote a formula-by-formula spec of each (about 100 KB in total, kept out of this public repo).
- Supabase security advisors, grants, policies, Realtime publication, migration history.

### Things that change the plan

| Finding | Why it matters |
|---|---|
| This repo is the **public** PitchingCoachAI site, live at pitchingcoachai.com. | A minors' health app should not share a public repo or a Netlify site with a marketing site. See question 1. |
| The database has **no migration history** and no branches. | Step one is a baseline migration that captures today's schema exactly, so every later change is reviewable and reversible. |
| `grad_year` is empty for all 102 active athletes. `level` is filled for 97. | "Compare against athletes at his own level" cannot use grad year until it is entered. See question 5. |
| "Not cleared" today includes **blank** readiness answers. 15 athletes' latest check-in has no readiness answer and is counted as not cleared. | This alone is about half of the "29 need a look" problem. |
| The force plate report's numbers (per-kg values, imbalance, ASH percent, validity checks) were computed in hand-built CSV files, not in the page. | Those formulas must be rebuilt in SQL from raw Hawkin rows and proven against the last CSV export. I need the 5 CSV files as the test fixture. |
| The force plate report mixes mean, median and thirds across tabs, and blank values count as zero in bucket math. | The rebuild uses one fixed cut point per metric per level band, stored in a table. Numbers near a line will differ from the prototype on purpose; the test report will list every athlete who moves. |
| The "Notes and cleanup" tab is hand-typed text, not computed. | Data health becomes real queries. Current data: 111 tests under 10 Hawkin names with no roster match, 2 mislabeled test types, 12 active athletes with no Hawkin link. |
| No source records a sync time for Breely bookings or Session Logs. | Freshness for those comes from the newest row plus an expected schedule; ingest functions get a one-line `sync_state` write. |
| Hawkin publishes no numeric rate limit that I could find. | Faster sync (Phase 3) needs a written answer from Hawkin support or their API reference before the cron job changes. |
| Realtime is not enabled on any table. | Phase 1 adds the five tables to the Realtime publication. |

## 2. Stack

Next.js (App Router, TypeScript) on Netlify with Supabase Postgres, Auth and Realtime, as requested. I do
not see a clearly better stack. Two specifics:

- A **new, private repository and a new Netlify site** for the hub (recommended; question 1).
- `@supabase/ssr` for cookie-based sessions. Pages are server-rendered with the signed-in coach's own
  session, so RLS applies to every read. The browser only ever holds the publishable key and the coach's
  session.

## 3. Architecture

```
Browser (phone / iPad / TV)
  │  session cookie, publishable key only
  ▼
Next.js on Netlify
  ├─ Server Components: read views as the signed-in staff member (RLS enforced)
  ├─ Server Actions:    mark present, add/resolve note, acknowledge flag  (RLS enforced)
  ├─ /api/sync/hawkin:  checks staff session → takes the site-wide lock → calls hawkin-sync
  └─ /api/admin/invite: owner only → Supabase Auth invite
  ▼
Supabase
  ├─ Auth (magic link, sign-ups disabled, invite only)
  ├─ Postgres: existing tables and views untouched; new objects added beside them
  ├─ Realtime: session_logs, force_plate_tests, attendance, coach_notes, vip_classes
  └─ Edge Functions: all 8 keep working; hawkin-sync gets a stricter caller check
```

- **Service role key**: Netlify server environment only, used in exactly two routes (invite, sync trigger).
  Never in a client bundle; a build check fails the deploy if it appears in browser output.
- **Realtime**: the browser subscribes with the coach's session. An event carries no health data to the
  screen directly; it tells the page which athlete changed and the page refetches through the server.
- **One definition per number**: every metric is a SQL view or function. The app formats and displays; it
  does not calculate.
- **Times**: stored as UTC, converted to America/New_York in SQL, as the existing views already do.
- **Privacy**: athlete ids are UUIDs in URLs, never names. No analytics, no third-party scripts, fonts
  self-hosted. Server logs carry ids and error codes only.

## 4. Data model changes (all additive, all by migration)

Nothing existing is dropped or renamed. New views are prefixed `hub_` so the old ones keep feeding the
prototypes and `vip-data` until Mike retires them.

**New tables**

| Table | Purpose |
|---|---|
| `staff` | One row per login: user id, name, role (`owner`, `coach`, `strength`, `pt`), `can_view_contacts`, active. |
| `family_contacts` | Parent names, phones, emails per athlete, replacing the contact list that is currently embedded in a view. Owner-only. |
| `triage_settings` | Thresholds as rows Mike can edit (key, value, label, plain-words explanation, updated by/at). |
| `flag_acks` | Coach acknowledged a flag: athlete, flag type, note, who, when, and the data timestamp it covered. New data after that timestamp brings the flag back. |
| `checkins` | Coach marked an athlete present/absent for a class. Separate from Breely rows in `attendance` so the webhook's upserts can never overwrite a coach's tap. (Question 4.) |
| `fp_cut_points` | Fixed bucket cut points per metric per level band, with effective date. Only the owner changes them. |
| `fp_bucket_history` | Snapshot of each athlete's bucket and group whenever a new qualifying test arrives. |
| `sync_runs` | Every sync: source, started/finished, who pressed it, result summary. Also the site-wide lock and cooldown. |
| `audit_log` | Who changed what (table, row, before/after ids, who, when). Written by database triggers, not by the app. |
| `profile_views` | Who opened which athlete profile and when. |
| `source_schedule` | Expected freshness per source (for example Hawkin 20 min, TrackMan 7 days) for amber/red. |

**Small additions to existing tables** (new nullable columns only)

- `force_plate_tests.first_seen_at` (default now): lets the Sync button say "3 new jumps" without touching
  the function's upsert.
- `coach_notes.resolved_by`, `coach_notes.created_by` (staff id). The Google Form path keeps working and
  leaves these empty.
- `vip_roster.throws` (L/R) if it is not derivable from the screen data, for throwing arm vs glove arm.

**New views and functions**

- `hub_logs`: like `v_logs`, plus `readiness_answered` so blank is no longer "not cleared".
- `hub_cmj_reps`, `hub_cmj_tests`, `hub_cmj_readiness`: one definition of jump metrics for both the floor
  view and the lab. `hub_cmj_readiness` reads its percent threshold, metric count and baseline size from
  `triage_settings`; with default settings it must equal `v_cmj_readiness` row for row.
- `hub_iso_tests`, `hub_ash`, `hub_dsi`, `hub_fp_buckets`, `hub_training_groups`: the force plate lab.
- `hub_triage`: one row per athlete with level (Hold, Modify, Watch, Go), the reasons in plain words, and
  whether each reason is acknowledged.
- `hub_today`: classes today with one card's worth of data per booked athlete.
- `hub_athlete_timeline`: every event type in one list for the profile page.
- `hub_checkin_compliance`: built on the existing `v_checkins` logic.
- `hub_data_health`: one row per problem with "what to fix and where".
- `hub_source_freshness`: last update per source against `source_schedule`.
- `hub_wall`: first name, last initial, status. Nothing else, so the TV page cannot leak detail even by mistake.

## 5. Roles and RLS

Helper functions in a non-exposed schema (`private.staff_role()`, `private.is_staff()`,
`private.can_view_contacts()`), security definer, fixed search path.

| Data | owner | coach | strength | pt |
|---|---|---|---|---|
| Roster, classes, bookings, jumps, strength tests, TrackMan, Uplift | read | read | read | read |
| Check-ins, pain, arm health, screen flags, re-screens | read | read | read | read |
| Coach notes | read, write, resolve | read, write, resolve | read, write, resolve | read, write, resolve |
| Mark present | yes | yes | yes | yes |
| Acknowledge a flag | yes | yes | yes | yes |
| Family contacts | read, write | only if granted | only if granted | only if granted |
| Triage settings, cut points, source schedule | read, write | read | read | read |
| Staff list and invites | read, write | own row | own row | own row |
| Audit log, profile views | read | none | none | none |
| Press "Sync jumps" | yes | yes | yes | yes |

Question 6 asks whether `strength` and `pt` should really see everything a coach sees.

Rules of the design:

- Every table gets explicit policies for `authenticated` staff; `anon` gets nothing. Table and view grants
  for `anon` are revoked outright rather than relying on RLS alone.
- All `hub_` views are `security_invoker`, so they obey the caller's policies.
- Contact columns leave `vip_roster` reads for non-owners: staff read the roster through a view without
  email columns; base-table contact columns are owner-only via column grants.
- Inserts into `audit_log` and `profile_views` come from triggers and one function; staff cannot edit or delete them.
- Auth settings: sign-ups off, magic link only, invite by owner, short link expiry.
- Tests log in as each role plus signed-out and assert what each can and cannot read or write, table by table.

## 6. Triage rules on today's data

Roster: 102 active athletes. Today's "needs a look" list: 29.

| Version | Hold | Modify | Watch | Go |
|---|---|---|---|---|
| Rules exactly as written in the brief | 24 | 4 | 1 | 73 |
| Proposed (below) | 9 | 6 | 16 | 71 |

Why the literal version puts 24 on Hold: "not cleared on his last check-in" catches 20 athletes, and 15 of
those simply left the readiness question blank. 2 more answered MODIFIED, which reads as Modify, not Hold.

**Proposed starting rules** (every number is a row in `triage_settings`):

- **Hold**: pain reported on his most recent check-in; an active note with a doctor referral or a
  restriction; latest answered readiness is SHUT DOWN.
- **Modify**: latest answered readiness is MODIFIED; jump fatigue (3 of 5 metrics 10% or more worse than
  his previous 5 jumps); arm health 1.5 or more below his own average (needs at least 3 check-ins).
- **Watch**: pain on any check-in in the last 14 days that is not the latest; any other active coach note;
  2 of 5 jump metrics down; arm health 1.0 to 1.4 below his average.
- **Go**: none of the above.
- Risk tier (47 HIGH) and open correctives (123) stop being flags. They show on the card as context
  (intensity cap, top one or two correctives) because they describe the athlete, not today.
- No check-in at all (10 athletes) and a blank readiness answer are shown as "No check-in" on the card and
  on the compliance screen, not as a flag.

Mike confirms or edits these before Phase 2 is finalized (question 3).

## 7. Sync jumps button

1. Coach taps **Sync jumps**. The button shows a spinner.
2. The server route checks the staff session, then calls a database function that takes the site-wide
   lock, enforces the 20-second cooldown and records who pressed it in `sync_runs`. If another sync is
   running, the coach sees "Sync already running, results will appear here."
3. The route calls `hawkin-sync` (incremental, from the saved cursor), then the existing
   `link_force_plates()` matcher.
4. New tests are those with `first_seen_at` after the run started. The message is built from them:
   "3 new jumps: J. Smith, T. Jones", or "No new jumps yet. Hawkin can take a minute to upload, try again
   shortly." Unmatched names produce "1 jump came in under a name we could not match" with a link to Data health.
5. Hawkin errors or timeouts become "Could not reach Hawkin. Nothing was lost; try again in a minute."
6. Every open screen updates through Realtime on `force_plate_tests`.

`hawkin-sync` needs one compatible change: accept only a dedicated secret (or the service role) as its
caller. The cron job moves to the same secret, read from Supabase Vault. That cron edit is shown to Mike first.

**Faster sync during classes (Phase 3 proposal, not built until approved):** a one-minute cron that does
nothing unless the current time is inside a class window from `vip_classes` (15 minutes before start to
end), sharing the same lock so it never overlaps the button. The 15-minute job stays as the backstop.
Each run costs Hawkin 2 to 3 API calls, so class windows would add roughly 120 to 180 calls per class
hour. This waits on a confirmed rate limit from Hawkin.

## 8. Screens

| Screen | Built from | Phase |
|---|---|---|
| Today (default on phones) | `hub_today`, `hub_triage`, `checkins` | 1 (status shown read-only from draft rules), completed in 2 |
| Athlete profile | `hub_athlete_timeline`, trend views, baseline bands | 1 |
| Triage | `hub_triage`, `flag_acks`, `triage_settings` | 2 |
| Notes | `coach_notes` (form ingest keeps working) | 2 |
| Check-in compliance | `hub_checkin_compliance`, copyable reminder list | 2 |
| Force plate lab | `hub_fp_buckets`, `hub_ash`, `hub_iso_tests`, `hub_dsi`, `hub_training_groups`, history | 3 |
| Data health | `hub_data_health`, `hub_source_freshness` | 3 (freshness chips on every screen from Phase 1) |
| Wall display | `hub_wall` | 3 |
| Settings (owner) | staff, invites, contact grants, thresholds, cut points | 1 basic, 2 and 3 extend |

Prototype parity: every tab of both prototypes maps to a screen above. The 10-yard sprint board and the
arm health grid move into Check-in/Profile views and a "Leaderboards" section of the lab; nothing is dropped.
All "what this means / what to do" copy from the prototypes is carried over verbatim into a single
`metric_help` file so each explanation exists once.

Wall display login: a TV cannot click a magic link, so it uses a long-lived, revocable display token that
can read `hub_wall` and nothing else (question 7).

## 9. Design

Phone first, 48 px minimum touch targets, light and dark, status always as word + icon + color. Text
wordmark until the official logo file arrives. Before building all screens I will send **one mocked Today
screen** with a proposed visual direction for approval.

## 10. Testing

- **Database tests (pgTAP)** on a Supabase branch: RLS matrix per role; `hub_` views equal the existing
  `v_` views for the same athlete and day (for example `hub_cmj_readiness` vs `v_cmj_readiness`, row for row).
- **Prototype parity**: fixtures from the last force plate CSV export; tests assert the SQL reproduces
  those numbers, with a written list of intentional differences (fixed cut points, blanks no longer zero).
- **Regression for existing consumers**: `v_dashboard_snapshot` output and each Edge Function's response
  shape are captured before the first migration and compared after every migration.
- **App tests**: Playwright on phone viewport for login, Today, mark present, Sync button states.
- **Seed script**: about 40 invented athletes with realistic logs, jumps and bookings. No real data in the repo, ever.
- After each phase: tests, Supabase security advisors, and a plain-language report.

## 11. Phases

**Phase 0 — safety and foundations (before any screen)**
1. Fix the security findings reported to Mike (some need his action: rotating keys in Google Apps Script and Breely).
2. Baseline migration of today's schema; Supabase branch workflow; snapshot fixtures of current outputs.
3. Repo and Netlify site per question 1.
4. One mocked Today screen for design approval.

**Phase 1** — auth, roles, RLS, Realtime, freshness chips, Today screen, Sync jumps, athlete profile, on a
Netlify preview URL, with a phone test script.

**Phase 2** — triage with acknowledgements and editable thresholds, notes, mark present, check-in compliance.

**Phase 3** — force plate lab with history and level bands, data health, wall display, faster Hawkin sync.

## 12. Open questions for Mike

1. **Where does the code live?** Recommended: a new private GitHub repo and a new Netlify site (for
   example `coach.gradyspitchingschool.com`). Alternative: a folder in this public repo.
2. **Supabase plan.** Branches need a paid plan. Is the project on Pro, and is the small branch cost fine?
3. **Triage rules.** Approve the proposed rules in section 6, or change them. In particular: is MODIFIED a
   Modify, and should pain clear from Hold after one clean check-in or stay for a set number of days?
4. **Mark present.** Separate `checkins` table (recommended) or write into `attendance` as the brief says?
   Also: should walk-ins who did not book be addable from the Today screen?
5. **Level bands.** Can you supply grad years? Until then I would band by the existing `level` field
   (Varsity, JV, Travel, Showcase); 5 athletes have none.
6. **Roles.** Should `strength` and `pt` see everything a coach sees? Should `pt` alone be able to clear a
   doctor referral or restriction?
7. **Wall display.** Is a revocable display token acceptable for the TV, and which TV/browser is it?
8. **Staff list.** Names, emails and roles for the first invites.
9. **Throwing hand.** Where is it recorded today? The ASH test needs it for all athletes.
10. **Force plate CSVs.** Please share the 5 files from the last report so tests can prove parity.
11. **Old prototypes.** Keep both running until Phase 3 is accepted, then retire them and the `vip-data`
    connector? That decides how long the old views must stay.
12. **Logo.** Please send the official Grady's Pitching School file.
