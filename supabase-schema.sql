-- Run this in your Supabase SQL editor to create the required tables
-- Safe to run multiple times (uses IF NOT EXISTS / ADD COLUMN IF NOT EXISTS)

create table if not exists analyses (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz default now(),
  overall_score integer,
  hip_shoulder_sep float,
  lead_knee_fs float,
  shoulder_abduction float,
  elbow_flexion float,
  trunk_tilt float,
  arm_slot float,
  lead_knee_extension float,
  phase_frames jsonb,
  top_priorities jsonb
);

create table if not exists leads (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz default now(),
  first_name text not null,
  email text not null,
  phone text,
  age integer,
  source text,
  analysis_id uuid references analyses(id),
  drip_stage integer default 0
);

-- Add drip_stage if table already exists without it
alter table leads add column if not exists drip_stage integer default 0;

-- Indexes for admin queries and drip email cron
create index if not exists leads_created_at_idx on leads(created_at desc);
create index if not exists leads_email_idx on leads(email);
create index if not exists leads_drip_stage_idx on leads(drip_stage);
