"use client";
// app/checkin/page.tsx
// Màn hình khách quét QR → nhập tên → bắt đầu tính giờ
// Giao diện thoáng đạt, rộng rãi, không bị dồn chữ, KHÔNG dùng dấu chấm trong thông tin giá

import { useState, useRef, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import { createSession } from "@/app/actions/createSession";

export default function CheckInPage() {
  const [customerName, setCustomerName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const isSubmitting = useRef(false);

  // Tự động khôi phục phiên nếu khách mở lại trình duyệt hoặc quét lại QR trong khi phiên chưa kết thúc
  useEffect(() => {
    if (typeof window === "undefined") return;

    const savedSessionId = localStorage.getItem("active_session_id");
    if (!savedSessionId) return;

    // Kiểm tra trạng thái phiên trên Supabase
    async function checkActiveSession() {
      try {
        const supabase = createClient();
        const { data } = await supabase
          .from("sessions")
          .select("status")
          .eq("id", savedSessionId)
          .single();

        if (data && data.status === "active") {
          // Phiên vẫn đang chạy -> tự động chuyển khách về màn hình tính giờ ngay!
          window.location.href = `/session/${savedSessionId}`;
        } else {
          // Phiên đã xong hoặc không tồn tại -> xóa bộ nhớ đệm
          localStorage.removeItem("active_session_id");
        }
      } catch {
        // Lỗi kết nối -> giữ nguyên
      }
    }

    checkActiveSession();
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    
    // Ngăn chặn bấm đúp (double-click) khi mạng chậm hoặc đang xử lý
    if (loading || isSubmitting.current) return;

    if (!customerName.trim()) {
      setError("Vui lòng nhập tên của bạn để bắt đầu tính giờ.");
      return;
    }

    isSubmitting.current = true;
    setError("");
    setLoading(true);

    try {
      // 1. Kiểm tra mạng thiết bị trước khi gửi request
      if (typeof window !== "undefined" && !window.navigator.onLine) {
        setError("Vui lòng kiểm tra Wifi/3G và thử lại.");
        setLoading(false);
        isSubmitting.current = false;
        return;
      }

      const result = await createSession({ customerName });

      if (!result.success) {
        setError(result.error || "Hệ thống quá tải tạm thời. Vui lòng thử lại.");
        setLoading(false);
        isSubmitting.current = false;
        return;
      }

      if (typeof window !== "undefined") {
        localStorage.setItem("active_session_id", result.sessionId!);
      }

      window.location.href = `/session/${result.sessionId}`;
    } catch (err: any) {
      console.error("Checkin network/server error:", err);
      
      // Kiểm tra nếu là lỗi mạng / fetch thất bại do ngắt wifi/3g
      const errString = String(err?.message || err || "").toLowerCase();
      const isNetworkError =
        (typeof window !== "undefined" && !window.navigator.onLine) ||
        errString.includes("fetch") ||
        errString.includes("network") ||
        errString.includes("failed to fetch") ||
        errString.includes("offline");

      if (isNetworkError) {
        setError("Vui lòng kiểm tra Wifi/3G và thử lại.");
      } else {
        setError("Máy chủ phản hồi chậm hoặc tạm thời quá tải. Vui lòng thử lại sau vài giây.");
      }

      setLoading(false);
      isSubmitting.current = false;
    }
  }

  return (
    <main className="relative min-h-[100dvh] w-full flex items-center justify-center p-4 sm:p-6 overflow-hidden">
      {/* Background Wallpaper Image */}
      <div className="bg-cafe-wallpaper" />

      {/* Floating White Card */}
      <div className="card-floating animate-slide-up">
        {/* Header Section */}
        <div style={{ textAlign: "center", marginBottom: "28px" }}>
          <h1
            style={{
              fontSize: "1.5rem",
              fontWeight: 700,
              color: "#111827",
              lineHeight: 1.3,
              marginBottom: "8px",
            }}
          >
            Chào mừng bạn đến CoffeeShop
          </h1>
          <p
            style={{
              fontSize: "0.92rem",
              color: "#6b7280",
              lineHeight: 1.4,
              margin: 0,
            }}
          >
            Nhập tên để bắt đầu tính giờ nhé!
          </p>
        </div>

        {/* Form Section */}
        <form onSubmit={handleSubmit} noValidate id="checkin-form">
          <div style={{ marginBottom: error ? "16px" : "24px" }}>
            <label
              htmlFor="customer-name"
              style={{
                display: "block",
                fontSize: "0.78rem",
                fontWeight: 600,
                color: "#374151",
                letterSpacing: "0.06em",
                textTransform: "uppercase",
                marginBottom: "10px",
              }}
            >
              Tên của bạn
            </label>
            <input
              id="customer-name"
              className="input-light-gray"
              type="text"
              placeholder="Nhập tên của bạn..."
              value={customerName}
              onChange={(e) => {
                setCustomerName(e.target.value);
                if (error) setError("");
              }}
              disabled={loading}
              autoFocus
              autoComplete="given-name"
              maxLength={50}
              style={
                error
                  ? {
                      borderColor: "#ef4444",
                      backgroundColor: "#fff5f5",
                      boxShadow: "0 0 0 3px rgba(239, 68, 68, 0.15)",
                    }
                  : {}
              }
            />
          </div>

          {error && (
            <div
              role="alert"
              style={{
                padding: "12px 16px",
                borderRadius: "12px",
                backgroundColor: "#fef2f2",
                border: "1px solid #fecaca",
                color: "#dc2626",
                fontSize: "0.88rem",
                marginBottom: "20px",
                textAlign: "left",
                fontWeight: 500,
                display: "flex",
                alignItems: "center",
                gap: "8px",
              }}
            >
              <span style={{ fontSize: "1.1rem" }}>⚠️</span>
              <span>{error}</span>
            </div>
          )}

          <button
            type="submit"
            id="checkin-submit-btn"
            className="btn-black-pill"
            disabled={loading}
          >
            {loading ? (
              <>
                <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                Đang xử lý...
              </>
            ) : (
              "Bắt đầu tính giờ"
            )}
          </button>
        </form>

        {/* Pricing Info Footer — 1 dòng tinh gọn */}
        <div
          style={{
            borderTop: "1px solid #e5e7eb",
            marginTop: "24px",
            paddingTop: "16px",
            textAlign: "center",
            fontSize: "0.82rem",
            color: "#6b7280",
          }}
        >
          <strong style={{ color: "#111827", fontWeight: 700 }}>30.000đ</strong> / 4h đầu (+30.000đ mỗi 4h tiếp theo)
        </div>
      </div>
    </main>
  );
}
