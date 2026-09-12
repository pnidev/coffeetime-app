"use client";

import { useState, useRef, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import { createSession } from "@/app/actions/createSession";

export default function CheckInClientForm() {
  const [customerName, setCustomerName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const isSubmitting = useRef(false);

  // Client-side backup restore (tự động khôi phục nếu Cookie bị lỡ mất trên 1 số WebView)
  useEffect(() => {
    if (typeof window === "undefined") return;

    // Đọc từ cookie hoặc localStorage
    const match = document.cookie.match(/(?:^|; )active_session_id=([^;]*)/);
    const cookieSessionId = match ? decodeURIComponent(match[1]) : null;
    const savedSessionId = localStorage.getItem("active_session_id") || cookieSessionId;

    if (!savedSessionId) return;

    // Kiểm tra trạng thái phiên trên Supabase
    async function checkActiveSession() {
      try {
        const supabase = createClient();
        const { data } = await supabase
          .from("sessions")
          .select("status")
          .eq("id", savedSessionId!)
          .single();

        if (data && data.status === "active") {
          // Ghi đè đồng bộ lại cả 2 nơi cho chắc chắn
          localStorage.setItem("active_session_id", savedSessionId!);
          document.cookie = `active_session_id=${savedSessionId!}; path=/; max-age=86400; SameSite=Lax; Secure`;

          // Phiên vẫn đang chạy -> chuyển khách về màn hình tính giờ ngay!
          window.location.href = `/session/${savedSessionId}`;
        } else {
          // Phiên đã xong hoặc không tồn tại -> xóa bộ nhớ đệm
          localStorage.removeItem("active_session_id");
          document.cookie = "active_session_id=; path=/; max-age=0; Secure";
        }
      } catch {
        // Lỗi kết nối -> giữ nguyên
      }
    }

    checkActiveSession();
  }, []);

  const [duplicateSession, setDuplicateSession] = useState<{
    id: string;
    orderCode: string;
    customerName: string;
    checkInTime: string;
  } | null>(null);

  async function handleConfirmResume() {
    if (!duplicateSession) return;
    setLoading(true);
    setDuplicateSession(null);
    try {
      const res = await createSession({
        customerName,
        confirmResumeSessionId: duplicateSession.id,
      });
      if (res.success && res.sessionId) {
        if (typeof window !== "undefined") {
          localStorage.setItem("active_session_id", res.sessionId);
          document.cookie = `active_session_id=${res.sessionId}; path=/; max-age=86400; SameSite=Lax; Secure`;
        }
        window.location.href = `/session/${res.sessionId}`;
      } else {
        setError(res.error || "Không thể nối lại phiên.");
        setLoading(false);
      }
    } catch {
      setError("Lỗi kết nối.");
      setLoading(false);
    }
  }

  async function handleForceNew() {
    setDuplicateSession(null);
    setLoading(true);
    try {
      const res = await createSession({
        customerName,
        forceNew: true,
      });
      if (res.success && res.sessionId) {
        if (typeof window !== "undefined") {
          localStorage.setItem("active_session_id", res.sessionId);
          document.cookie = `active_session_id=${res.sessionId}; path=/; max-age=86400; SameSite=Lax; Secure`;
        }
        window.location.href = `/session/${res.sessionId}`;
      } else {
        setError(res.error || "Lỗi tạo phiên mới.");
        setLoading(false);
      }
    } catch {
      setError("Lỗi kết nối.");
      setLoading(false);
    }
  }

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
        if (result.isDuplicateName && result.existingSession) {
          setDuplicateSession(result.existingSession);
          setLoading(false);
          isSubmitting.current = false;
          return;
        }

        setError(result.error || "Hệ thống quá tải tạm thời. Vui lòng thử lại.");
        setLoading(false);
        isSubmitting.current = false;
        return;
      }

      if (typeof window !== "undefined" && result.sessionId) {
        localStorage.setItem("active_session_id", result.sessionId);
        document.cookie = `active_session_id=${result.sessionId}; path=/; max-age=86400; SameSite=Lax; Secure`;
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

      {/* Duplicate Session Modal */}
      {duplicateSession && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            backgroundColor: "rgba(0, 0, 0, 0.45)",
            backdropFilter: "blur(4px)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "20px",
            zIndex: 9999,
          }}
        >
          <div
            className="animate-slide-up"
            style={{
              backgroundColor: "#ffffff",
              borderRadius: "24px",
              padding: "28px 24px",
              width: "100%",
              maxWidth: "360px",
              boxShadow: "0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)",
              textAlign: "center",
            }}
          >
            <div
              style={{
                width: "48px",
                height: "48px",
                backgroundColor: "#eff6ff",
                borderRadius: "50%",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                margin: "0 auto 16px auto",
                fontSize: "1.4rem",
              }}
            >
              🔍
            </div>

            <h3 style={{ fontSize: "1.15rem", fontWeight: 700, color: "#111827", marginBottom: "8px" }}>
              Tìm thấy phiên đang chạy!
            </h3>
            <p style={{ fontSize: "0.88rem", color: "#4b5563", lineHeight: 1.45, marginBottom: "16px" }}>
              Tên <strong style={{ color: "#111827" }}>&quot;{duplicateSession.customerName}&quot;</strong> đang có một phiên đếm giờ hoạt động trên hệ thống (mã <span style={{ fontFamily: "monospace", fontWeight: 600 }}>{duplicateSession.orderCode}</span>).
            </p>

            <div
              style={{
                backgroundColor: "#f8fafc",
                border: "1px solid #e2e8f0",
                borderRadius: "14px",
                padding: "12px 14px",
                marginBottom: "20px",
                fontSize: "0.82rem",
                color: "#334155",
                textAlign: "left",
              }}
            >
              <p style={{ margin: "0 0 4px 0" }}>
                📌 <strong>Đây có phải là phiên của bạn không?</strong>
              </p>
              <p style={{ margin: 0, color: "#64748b" }}>
                Nếu bạn lỡ đóng tab hoặc quét lại QR, bấm tiếp tục để mở lại đồng hồ. Nếu bạn là khách mới, bấm tạo phiên mới.
              </p>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
              <button
                onClick={handleConfirmResume}
                disabled={loading}
                className="btn-black-pill"
                style={{
                  width: "100%",
                  padding: "13px",
                  fontSize: "0.9rem",
                  fontWeight: 600,
                }}
              >
                {loading ? "Đang xử lý..." : "Đúng vậy, mở lại đồng hồ"}
              </button>

              <button
                onClick={handleForceNew}
                disabled={loading}
                style={{
                  width: "100%",
                  padding: "12px",
                  borderRadius: "9999px",
                  backgroundColor: "#f3f4f6",
                  color: "#374151",
                  fontWeight: 600,
                  fontSize: "0.88rem",
                  border: "none",
                  cursor: "pointer",
                }}
              >
                Tôi là khách mới (Tạo phiên mới)
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
