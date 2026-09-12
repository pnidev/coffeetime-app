// lib/supabase/server.ts
// Supabase server client với service_role key — dùng trong Server Actions

import { createClient as createSupabaseClient } from "@supabase/supabase-js";

export function createServiceClient() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    }
  );
}

// Types cho database (tinh gọn)
export interface Session {
  id: string;
  order_code: string;
  customer_name: string;
  check_in_time: string;
  check_out_time: string | null;
  total_amount: number | null;
  status: "active" | "completed" | "cancelled";
  ended_by: "customer" | "staff" | null;
  created_at: string;
}
