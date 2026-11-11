-- Audit-fix columns (2026-11-11): record the hand cross-check and the
-- wrong-arm tripwire with every analysis so a coach reviewing a stored
-- row can tell "bad tracking" apart from "wrong hand selected".
--
-- The app keeps working before this runs: /api/lead retries the insert
-- without these columns, so no lead is ever lost to schema lag.
--
-- To apply: paste into the SQL editor at
-- https://supabase.com/dashboard/project/sqzuolsexkmohmdopwrv/sql

alter table analyses add column if not exists arm_tracking_warning boolean;
alter table analyses add column if not exists hand_mismatch boolean;
alter table analyses add column if not exists detected_hand text check (detected_hand in ('left', 'right'));

comment on column analyses.arm_tracking_warning is 'True when the throwing forearm never passed vertical between foot strike and release: arm metrics were excluded from the score.';
comment on column analyses.hand_mismatch is 'True when the motion detector read the opposite hand from the one the user declared. Measurement always uses the declared hand.';
comment on column analyses.detected_hand is 'Hand the motion detector read from the video (cross-check only).';
