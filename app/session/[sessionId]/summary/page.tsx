export const dynamic = "force-dynamic";
export const revalidate = 0;

import { createServiceClient } from "@/lib/supabase/server";
import { formatCurrency, formatDurationDisplay } from "@/lib/pricing";
import { notFound } from "next/navigation";
import Link from "next/link";

interface PageProps {
  params: Promise<{ sessionId: string }>;
}

export default async function SummaryPage({ params }: PageProps) {
  const { sessionId } = await params;
  const supabase = createServiceClient();

  const { data: session, error } = await supabase
    .from("sessions")
    .select("*")
    .eq("id", sessionId)
    .single();

  if (error || !session) {
    notFound();
  }

  // Nếu session vẫn active → redirect về trang đếm giờ
  if (session.status === "active") {
    return (
      <main className="relative min-h-[100dvh] w-full flex items-center justify-center p-4">
        <div className="bg-cafe-wallpaper" />
        <div className="card-floating animate-slide-up text-center">
          <p className="text-gray-900 font-bold text-lg mb-4">
            Phiên này vẫn đang hoạt động.
          </p>
          <a href={`/session/${sessionId}`} className="btn-black-pill">
            Quay lại đồng hồ
          </a>
        </div>
      </main>
    );
  }

  const checkIn = new Date(session.check_in_time);
  const checkOut = session.check_out_time ? new Date(session.check_out_time) : new Date();
  const durationMs = checkOut.getTime() - checkIn.getTime();

  const inTimeStr = checkIn.toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" });
  const outTimeStr = checkOut.toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" });

  // Format tiếng Việt: vd "4 giờ 12 phút" hoặc "1 phút"
  const totalMins = Math.max(1, Math.floor(durationMs / (1000 * 60)));
  const hours = Math.floor(totalMins / 60);
  const mins = totalMins % 60;
  let vietnameseDuration = `${mins} phút`;
  if (hours > 0) {
    vietnameseDuration = mins > 0 ? `${hours} giờ ${mins} phút` : `${hours} giờ`;
  }

  const isCancelled =
    session.status === "cancelled" ||
    (session.total_amount === 0 && session.ended_by === "staff");

  return (
    <main className="relative min-h-[100dvh] w-full flex items-center justify-center p-4 sm:p-6 overflow-hidden">
      {/* Background Wallpaper Image */}
      <div className="bg-cafe-wallpaper" />

      {/* Floating White Card — Compact & Sleek */}
      <div className="card-floating animate-slide-up" style={{ maxWidth: "360px", padding: "20px 20px" }}>
        {/* Header & Icon Row */}
        <div style={{ textAlign: "center", marginBottom: "12px" }}>
          {/* 1. Top Title Text */}
          <h1
            style={{
              fontSize: "1.05rem",
              fontWeight: 800,
              color: isCancelled ? "#dc2626" : "#111827",
              letterSpacing: "0.02em",
              textTransform: "uppercase",
              margin: "0 0 10px 0",
            }}
          >
            {isCancelled ? "PHIÊN ĐÃ ĐƯỢC HỦY" : "ĐÃ CHECKOUT THÀNH CÔNG"}
          </h1>

          {/* 2. Icon below title with sparkle dashes (gọn gàng xinh xắn) */}
          <div style={{ position: "relative", width: "72px", height: "72px", margin: "0 auto 8px auto", display: "flex", alignItems: "center", justifyContent: "center" }}>
            {!isCancelled && (
              <svg
                className="animate-sparkle"
                style={{ position: "absolute", inset: 0, width: "100%", height: "100%", color: "#4ade80" }}
                viewBox="0 0 100 100"
                fill="none"
                stroke="currentColor"
                strokeWidth="3.5"
                strokeLinecap="round"
              >
                {/* 8 tia phát sáng */}
                <line x1="50" y1="3" x2="50" y2="11" />
                <line x1="50" y1="89" x2="50" y2="97" />
                <line x1="3" y1="50" x2="11" y2="50" />
                <line x1="89" y1="50" x2="97" y2="50" />
                <line x1="17" y1="17" x2="23" y2="23" />
                <line x1="77" y1="77" x2="83" y2="83" />
                <line x1="23" y1="77" x2="17" y2="83" />
                <line x1="77" y1="23" x2="83" y2="17" />
              </svg>
            )}

            <div
              className="animate-pop-in"
              style={{
                width: "44px",
                height: "44px",
                borderRadius: "50%",
                backgroundColor: isCancelled ? "#fef2f2" : "#dcfce7",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                zIndex: 10,
                boxShadow: isCancelled
                  ? "0 4px 12px rgba(220, 38, 38, 0.15)"
                  : "0 4px 14px rgba(34, 197, 94, 0.2)",
              }}
            >
              {isCancelled ? (
                <span style={{ fontSize: "1.2rem", color: "#dc2626", fontWeight: 700 }}>✕</span>
              ) : (
                <svg
                  style={{ width: "22px", height: "22px", color: "#16a34a" }}
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                  strokeWidth="3.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              )}
            </div>
          </div>

          {/* 3. Subtitle */}
          <p style={{ fontSize: "0.8rem", color: "#6b7280", margin: 0, fontWeight: 500 }}>
            {isCancelled
              ? "Phiên dịch vụ này đã được hủy tại quầy."
              : "Cảm ơn bạn đã ghé quán hôm nay! ❤️"}
          </p>
        </div>

        {/* Integrated Card Box: Total Amount + Details */}
        <div
          style={{
            backgroundColor: "#f8fafc",
            border: "1px solid #e2e8f0",
            borderRadius: "14px",
            padding: "12px 14px",
            marginBottom: "14px",
          }}
        >
          {/* Total Amount Top Section */}
          <div
            style={{
              textAlign: "center",
              marginBottom: "10px",
              paddingBottom: "10px",
              borderBottom: "1px dashed #cbd5e1",
            }}
          >
            <p
              style={{
                fontSize: "0.7rem",
                color: "#64748b",
                fontWeight: 600,
                marginBottom: "2px",
                textTransform: "uppercase",
                letterSpacing: "0.04em",
              }}
            >
              Số tiền cần thanh toán
            </p>
            <p
              style={{
                fontSize: "1.65rem",
                fontWeight: 900,
                color: "#0f172a",
                lineHeight: 1.1,
                margin: 0,
                letterSpacing: "-0.02em",
              }}
            >
              {formatCurrency(session.total_amount || 0)}
            </p>
          </div>

          {/* Details Rows */}
          <div style={{ display: "flex", flexDirection: "column", gap: "6px", fontSize: "0.8rem" }}>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span style={{ color: "#64748b", fontWeight: 500 }}>Mã đơn</span>
              <span style={{ color: "#0f172a", fontWeight: 600 }}>{session.order_code}</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span style={{ color: "#64748b", fontWeight: 500 }}>Tên khách</span>
              <span style={{ color: "#0f172a", fontWeight: 600 }}>{session.customer_name}</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span style={{ color: "#64748b", fontWeight: 500 }}>Giờ vào - Giờ ra</span>
              <span style={{ color: "#0f172a", fontWeight: 600 }}>
                {inTimeStr} - {outTimeStr}
              </span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span style={{ color: "#64748b", fontWeight: 500 }}>Tổng thời gian</span>
              <span style={{ color: "#0f172a", fontWeight: 600 }}>{vietnameseDuration}</span>
            </div>
          </div>
        </div>

        {/* Friendly Payment Instruction (Tách khoảng cách rõ ràng với nút Hoàn tất) */}
        {!isCancelled && (
          <p
            style={{
              backgroundColor: "#f0fdf4",
              border: "1px solid #bbf7d0",
              borderRadius: "12px",
              padding: "8px 12px",
              textAlign: "center",
              fontSize: "0.8rem",
              color: "#166534",
              fontWeight: 500,
              margin: "0 0 16px 0",
              lineHeight: 1.4,
            }}
          >
            Bạn gửi thu ngân xem màn hình này để thanh toán nhé!
          </p>
        )}

        {/* Action Button: Hoàn tất */}
        <Link
          href="/checkin"
          className="btn-black-pill"
          style={{
            width: "100%",
            padding: "12px",
            fontSize: "0.88rem",
            fontWeight: 600,
            textAlign: "center",
            display: "block",
            textDecoration: "none",
          }}
        >
          Hoàn tất
        </Link>
      </div>
    </main>
  );
}
