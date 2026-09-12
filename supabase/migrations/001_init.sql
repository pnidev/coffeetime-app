-- ============================================================
-- CoffeeTimer — Supabase Migration 001 (Tinh gọn tối đa)
-- Run this in Supabase SQL Editor
-- ============================================================

-- Bảng phiên ngồi của khách (gọn nhẹ duy nhất 1 bảng)
create table if not exists sessions (
  id uuid primary key default gen_random_uuid(),
  order_code text unique not null,           -- mã đơn, vd: HD-000123
  customer_name text not null,
  check_in_time timestamptz not null default now(),
  check_out_time timestamptz,
  total_amount numeric,                      -- chỉ có giá trị sau khi checkout, tính tại server
  status text not null default 'active'
    check (status in ('active', 'completed', 'cancelled')),
  ended_by text check (ended_by in ('customer', 'staff')),
  created_at timestamptz not null default now()
);

-- Index cho dashboard nhân viên
create index if not exists idx_sessions_status on sessions(status);
create index if not exists idx_sessions_created_at on sessions(created_at desc);

-- ============================================================
-- Row Level Security (RLS)
-- ============================================================
alter table sessions enable row level security;

-- sessions: insert công khai (khách check-in không cần login)
create policy "sessions_insert_public"
  on sessions for insert
  with check (true);

-- sessions: select công khai
create policy "sessions_select_public"
  on sessions for select
  using (true);

-- ============================================================
-- Bật Realtime cho bảng sessions (QUAN TRỌNG)
-- ============================================================
-- Chạy lệnh này trong Supabase Dashboard > Database > Replication
-- Hoặc uncomment dòng dưới:
-- alter publication supabase_realtime add table sessions;
