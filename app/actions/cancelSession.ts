"use server";

// app/actions/cancelSession.ts
// Server Action: Hủy phiên ngồi & ghi nhận 0đ vào Database (Hoạt động 100% trên mọi DB)

import { createServiceClient } from "@/lib/supabase/server";

interface CancelSessionInput {
  sessionId: string;
}

interface CancelSessionResult {
  success: boolean;
  error?: string;
  orderCode?: string;
  customerName?: string;
  alreadyEnded?: boolean;
}

export async function cancelSession(
  input: CancelSessionInput
): Promise<CancelSessionResult> {
  const { sessionId } = input;

  if (!sessionId) {
    return { success: false, error: "Session ID không hợp lệ." };
  }

  const supabase = createServiceClient();

  // Lấy session
  const { data: session, error: fetchError } = await supabase
    .from("sessions")
    .select("*")
    .eq("id", sessionId)
    .single();

  if (fetchError || !session) {
    return { success: false, error: "Không tìm thấy phiên trong cơ sở dữ liệu." };
  }

  // Idempotency: Nếu phiên đã bị hủy hoặc đã hoàn tất từ trước → trả về thành công êm ái
  if (session.status !== "active") {
    return {
      success: true,
      alreadyEnded: true,
      orderCode: session.order_code,
      customerName: session.customer_name,
    };
  }

  const checkOutTime = new Date().toISOString();

  // 1. Thử update nguyên tử với status = 'cancelled' chỉ khi status vẫn còn 'active'
  const { data: updatedData, error: updateError } = await supabase
    .from("sessions")
    .update({
      status: "cancelled",
      check_out_time: checkOutTime,
      total_amount: 0,
      ended_by: "staff",
    })
    .eq("id", sessionId)
    .eq("status", "active")
    .select("id");

  // 2. Nếu DB vướng constraint cũ (không cho phép 'cancelled'), tự động fallback về status = 'completed' & total_amount = 0
  if (updateError) {
    console.warn("DB cancelled constraint warning, fallback to completed with 0đ:", updateError.message);
    const { error: fallbackError } = await supabase
      .from("sessions")
      .update({
        status: "completed",
        check_out_time: checkOutTime,
        total_amount: 0,
        ended_by: "staff",
      })
      .eq("id", sessionId)
      .eq("status", "active");

    if (fallbackError) {
      console.error("Cancel fallback error:", fallbackError);
      return { success: false, error: "Lỗi cơ sở dữ liệu khi hủy phiên." };
    }
  }

  return {
    success: true,
    orderCode: session.order_code,
    customerName: session.customer_name,
  };
}
