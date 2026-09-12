"use server";
// app/actions/endSession.ts
// Server Action: Kết thúc phiên & tính tiền tại server (tinh gọn)

import { createServiceClient } from "@/lib/supabase/server";
import { calculatePrice } from "@/lib/pricing";
import { cookies } from "next/headers";

interface EndSessionInput {
  sessionId: string;
  endedBy: "customer" | "staff";
}

interface EndSessionResult {
  success: boolean;
  totalAmount?: number;
  orderCode?: string;
  error?: string;
  alreadyEnded?: boolean;
}

export async function endSession(
  input: EndSessionInput
): Promise<EndSessionResult> {
  const { sessionId, endedBy } = input;

  if (!sessionId) {
    return { success: false, error: "Session ID không hợp lệ." };
  }

  // Clear cookie
  try {
    const cookieStore = await cookies();
    cookieStore.delete("active_session_id");
  } catch (e) {
    console.error("Failed to delete session cookie:", e);
  }

  const supabase = createServiceClient();

  // Lấy session
  const { data: session, error: fetchError } = await supabase
    .from("sessions")
    .select("*")
    .eq("id", sessionId)
    .single();

  if (fetchError || !session) {
    return { success: false, error: "Không tìm thấy phiên." };
  }

  // Idempotency: Nếu phiên đã kết thúc (completed) hoặc đã bị hủy (cancelled) → trả về dữ liệu hiện có thành công, KHÔNG ghi đè check_out_time/total_amount
  if (session.status === "completed" || session.status === "cancelled") {
    return {
      success: true,
      alreadyEnded: true,
      totalAmount: session.total_amount || 0,
      orderCode: session.order_code,
    };
  }

  // Tính tiền tại server (giá cố định 30.000đ / 4h)
  const checkInTime = new Date(session.check_in_time);
  const checkOutTime = new Date();

  const totalAmount = calculatePrice(
    checkInTime,
    checkOutTime,
    30000,
    4
  );

  // Update session nguyên tử (chỉ update khi status vẫn còn active)
  const { data: updatedData, error: updateError } = await supabase
    .from("sessions")
    .update({
      status: "completed",
      check_out_time: checkOutTime.toISOString(),
      total_amount: totalAmount,
      ended_by: endedBy,
    })
    .eq("id", sessionId)
    .eq("status", "active")
    .select("id, total_amount, order_code");

  if (updateError) {
    console.error("End session error:", updateError);
    return { success: false, error: "Lỗi kết thúc phiên. Vui lòng thử lại." };
  }

  // Nếu câu lệnh update không khớp hàng nào (do race condition vừa được kết thúc ở request khác)
  if (!updatedData || updatedData.length === 0) {
    const { data: refreshed } = await supabase
      .from("sessions")
      .select("*")
      .eq("id", sessionId)
      .single();

    return {
      success: true,
      alreadyEnded: true,
      totalAmount: refreshed?.total_amount || 0,
      orderCode: refreshed?.order_code || session.order_code,
    };
  }

  return {
    success: true,
    totalAmount,
    orderCode: session.order_code,
  };
}
