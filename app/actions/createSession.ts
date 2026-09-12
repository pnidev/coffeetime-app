"use server";
// app/actions/createSession.ts
// Server Action: Tạo phiên check-in mới (tinh gọn)

import { createServiceClient } from "@/lib/supabase/server";
import { generateOrderCode } from "@/lib/order-code";
import { cookies } from "next/headers";

interface CreateSessionInput {
  customerName: string;
}

interface CreateSessionResult {
  success: boolean;
  sessionId?: string;
  orderCode?: string;
  error?: string;
}

export async function createSession(
  input: CreateSessionInput
): Promise<CreateSessionResult> {
  const { customerName } = input;

  // Validate
  if (!customerName || customerName.trim().length === 0) {
    return { success: false, error: "Vui lòng nhập tên khách." };
  }

  const supabase = createServiceClient();
  const trimmedName = customerName.trim();

  // 1. Kiểm tra xem khách hàng có cùng tên đang có phiên chạy (active) hay không
  // Rất hữu ích cho iOS Camera app / Zalo private webview khi bị xóa bộ nhớ đệm
  const { data: existingActive } = await supabase
    .from("sessions")
    .select("id, order_code")
    .eq("status", "active")
    .ilike("customer_name", trimmedName)
    .order("check_in_time", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (existingActive) {
    try {
      const cookieStore = await cookies();
      cookieStore.set("active_session_id", existingActive.id, {
        path: "/",
        maxAge: 60 * 60 * 24, // 24 hours
        sameSite: "lax",
        secure: true,
        httpOnly: false,
      });
    } catch (e) {
      console.error("Failed to set session cookie:", e);
    }

    return {
      success: true,
      sessionId: existingActive.id,
      orderCode: existingActive.order_code,
    };
  }

  // Sinh mã đơn, retry nếu trùng (cực hiếm)
  let orderCode = generateOrderCode();
  let attempts = 0;
  const maxAttempts = 5;

  while (attempts < maxAttempts) {
    const { data: session, error: insertError } = await supabase
      .from("sessions")
      .insert({
        order_code: orderCode,
        customer_name: trimmedName,
        status: "active",
        check_in_time: new Date().toISOString(),
      })
      .select("id, order_code")
      .single();

    if (!insertError && session) {
      try {
        const cookieStore = await cookies();
        cookieStore.set("active_session_id", session.id, {
          path: "/",
          maxAge: 60 * 60 * 24, // 24 hours
          sameSite: "lax",
          secure: true,
          httpOnly: false,
        });
      } catch (e) {
        console.error("Failed to set session cookie:", e);
      }

      return {
        success: true,
        sessionId: session.id,
        orderCode: session.order_code,
      };
    }

    // Nếu lỗi trùng order_code thì thử lại
    if (insertError?.code === "23505") {
      orderCode = generateOrderCode();
      attempts++;
      continue;
    }

    console.error("Insert session error:", insertError);
    if (insertError?.message?.includes("fetch") || insertError?.code === "PGRST301") {
      return { success: false, error: "Vui lòng kiểm tra Wifi/3G và thử lại." };
    }
    return { success: false, error: "Máy chủ tạm thời chưa phản hồi được. Vui lòng bấm thử lại." };
  }

  return { success: false, error: "Máy chủ bận khi tạo mã đơn. Vui lòng bấm thử lại." };
}
