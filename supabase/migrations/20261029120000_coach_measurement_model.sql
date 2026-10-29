-- Coach measurement model rebuild (app_version 2.0.0-coach-model)
-- Adds everything Coach Grady needs to review an analysis after the fact.
-- Existing columns are untouched and keep being written for backward
-- compatibility. Safe to run multiple times.

alter table analyses add column if not exists throwing_hand text
  check (throwing_hand in ('left', 'right') or throwing_hand is null);

-- Hand the user selected (throwing_hand is the hand the motion showed;
-- they differ when the user picked wrong or the video reads mirrored).
alter table analyses add column if not exists declared_hand text
  check (declared_hand in ('left', 'right') or declared_hand is null);

alter table analyses add column if not exists level text;

alter table analyses add column if not exists app_version text;

-- Frame index of each detected phase: {legLift, drift, footStrike, mer, release, deceleration}
-- (phase_frames already exists in the original schema but was never populated;
--  this guard keeps the migration safe on databases created before it existed)
alter table analyses add column if not exists phase_frames jsonb;

-- Per-phase score and letter grade: {footStrike: {score: 82, grade: "B"}, ...}
alter table analyses add column if not exists phase_grades jsonb;

-- Every metric with value OR null, unit, grade or "not_measured",
-- measured flag, and confidence 0-1:
-- {"footStrike.hipShoulderSep": {value: 38, unit: "deg", grade: "A", measured: true, confidence: 0.91}, ...}
alter table analyses add column if not exists metrics_full jsonb;

-- True when the pitcher was too small in frame for reliable measurement
alter table analyses add column if not exists framing_warning boolean;

create index if not exists analyses_app_version_idx on analyses(app_version);
