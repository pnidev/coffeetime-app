"use client";
// app/session/[sessionId]/page.tsx
// Màn hình đang tính giờ — Bấm "Check-out" là chuyển ngay sang trang Hóa đơn (Image 1)

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { endSession } from "@/app/actions/endSession";
import {
  calculatePreviewPrice,
  formatCurrency,
  formatDurationDisplay,
} from "@/lib/pricing";

interface SessionData {
  id: string;
  order_code: string;
  customer_name: string;
  check_in_time: string;
  status: string;
}

interface PageProps {
  params: Promise<{ sessionId: string }>;
}

export default function SessionPage({ params }: PageProps) {
  const router = useRouter();
  const [session, setSession] = useState<SessionData | null>(null);
  const [loading, setLoading] = useState(true);
  const [ending, setEnding] = useState(false);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [error, setError] = useState("");
  const [elapsed, setElapsed] = useState(0);
  const [sessionId, setSessionId] = useState<string>("");
  const [isOffline, setIsOffline] = useState(false);
  const [showOfflineModal, setShowOfflineModal] = useState(false);

  // Monitor network online / offline events
  useEffect(() => {
    function handleOnline() {
      setIsOffline(false);
    }
    function handleOffline() {
      setIsOffline(true);
    }

    if (typeof window !== "undefined") {
      setIsOffline(!window.navigator.onLine);
      window.addEventListener("online", handleOnline);
      window.addEventListener("offline", handleOffline);
    }

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  // Resolve params
  useEffect(() => {
    params.then((p) => setSessionId(p.sessionId));
  }, [params]);

  // Load session data
  useEffect(() => {
    if (!sessionId) return;

    const supabase = createClient();

    async function loadSession() {
      try {
        const { data, error } = await supabase
          .from("sessions")
          .select("*")
          .eq("id", sessionId)
          .single();

        if (error || !data) {
          setError("Không tìm thấy phiên. Vui lòng quét lại mã QR.");
          setLoading(false);
          return;
        }

        if (data.status === "completed" || data.status === "cancelled") {
          if (typeof window !== "undefined") {
            localStorage.removeItem("active_session_id");
          }
          window.location.href = `/session/${sessionId}/summary`;
          return;
        }

        if (typeof window !== "undefined") {
          localStorage.setItem("active_session_id", data.id);
        }

        setSession(data as SessionData);
        setIsOffline(false);
        setLoading(false);
      } catch (err) {
        setIsOffline(true);
        setLoading(false);
      }
    }

    loadSession();

    // Polling 1s kiểm tra trạng thái + phát hiện mất mạng / tự kết nối lại
    const pollInterval = setInterval(async () => {
      try {
        const { data, error } = await supabase
          .from("sessions")
          .select("status, total_amount, ended_by")
          .eq("id", sessionId)
          .single();

        if (error) {
          setIsOffline(true);
          return;
        }

        // Tự động khôi phục kết nối thành công mà không cần khách bấm gì
        setIsOffline(false);

        if (data && data.status !== "active") {
          if (typeof window !== "undefined") {
            localStorage.removeItem("active_session_id");
          }
          window.location.href = `/session/${sessionId}/summary`;
        }
      } catch (err) {
        setIsOffline(true);
      }
    }, 3000);

    // Realtime listener: Nếu nhân viên thanh toán hoặc hủy phiên từ quầy → tự động chuyển trang ngay
    const channel = supabase
      .channel(`session:${sessionId}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "sessions",
          filter: `id=eq.${sessionId}`,
        },
        (payload) => {
          const updated = payload.new as SessionData;
          if (updated.status === "completed" || updated.status === "cancelled") {
            if (typeof window !== "undefined") {
              localStorage.removeItem("active_session_id");
            }
            window.location.href = `/session/${sessionId}/summary`;
          }
        }
      )
      .subscribe();

    return () => {
      clearInterval(pollInterval);
      supabase.removeChannel(channel);
    };
  }, [sessionId]);

  // Tick đồng hồ mỗi giây dựa trên check_in_time (vẫn chạy mịn ngay cả khi mất mạng tạm thời)
  useEffect(() => {
    if (!session) return;
    const checkIn = new Date(session.check_in_time).getTime();

    function tick() {
      setElapsed(Date.now() - checkIn);
    }
    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [session]);

  const handleConfirmCheckout = useCallback(async () => {
    if (!session || ending) return;
    setShowConfirmModal(false);
    setEnding(true);
    setError("");

    const result = await endSession({
      sessionId: session.id,
      endedBy: "customer",
    });

    if (!result.success && !result.alreadyEnded) {
      setError(result.error || "Lỗi kết thúc phiên.");
      setEnding(false);
      return;
    }

    if (typeof window !== "undefined") {
      localStorage.removeItem("active_session_id");
    }
    window.location.href = `/session/${session.id}/summary`;
  }, [session, ending]);

  // ---- Loading state ----
  if (loading) {
    return (
      <main className="relative min-h-[100dvh] w-full flex items-center justify-center p-4">
        <div className="bg-cafe-wallpaper" />
        <div className="card-floating animate-slide-up text-center py-10">
          <div className="w-12 h-12 border-4 border-gray-200 border-t-black rounded-full animate-spin mx-auto mb-4" />
          <p className="text-gray-600 font-medium">Đang tải phiên...</p>
        </div>
      </main>
    );
  }

  // ---- Error state ----
  if (error || !session) {
    return (
      <main className="relative min-h-[100dvh] w-full flex items-center justify-center p-4">
        <div className="bg-cafe-wallpaper" />
        <div className="card-floating animate-slide-up text-center">
          <div className="text-4xl mb-3">⚠️</div>
          <p className="text-red-600 font-medium mb-6">{error || "Phiên không hợp lệ."}</p>
          <a href="/checkin" className="btn-black-pill">
            Quay lại check-in
          </a>
        </div>
      </main>
    );
  }

  const previewPrice = calculatePreviewPrice(session.check_in_time, 30000, 4);
  const durationDisplay = formatDurationDisplay(elapsed);

  return (
    <main className="relative min-h-[100dvh] w-full flex items-center justify-center p-4 sm:p-6 overflow-hidden">
      {/* Background Wallpaper Image */}
      <div className="bg-cafe-wallpaper" />

      {/* Floating White Card — Chuẩn 100% tinh tế, không rườm rà */}
      <div className="card-floating animate-slide-up">
        {/* Top Header Row */}
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "10px", marginBottom: "20px" }}>
          <div style={{ minWidth: 0, flex: 1 }}>
            <h1 style={{ fontSize: "1.2rem", fontWeight: 700, color: "#111827", lineHeight: 1.2, margin: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              CoffeeShop
            </h1>
            <p style={{ fontSize: "0.8rem", color: "#6b7280", fontWeight: 500, marginTop: "2px", marginBottom: 0 }}>
              Đã check-in
            </p>
          </div>
          {isOffline ? (
            <button
              onClick={() => setShowOfflineModal(true)}
              style={{
                backgroundColor: "#fffbe5",
                color: "#b45309",
                border: "1px solid #fde68a",
                padding: "4px 10px",
                borderRadius: "9999px",
                fontSize: "0.72rem",
                fontWeight: 700,
                display: "flex",
                alignItems: "center",
                gap: "4px",
                whiteSpace: "nowrap",
                flexShrink: 0,
                cursor: "pointer",
              }}
            >
              <span style={{ width: "5px", height: "5px", borderRadius: "50%", backgroundColor: "#d97706", flexShrink: 0 }} />
              Mất kết nối ⓘ
            </button>
          ) : (
            <div
              style={{
                backgroundColor: "#dcfce7",
                color: "#15803d",
                border: "1px solid #bbf7d0",
                padding: "4px 10px",
                borderRadius: "9999px",
                fontSize: "0.72rem",
                fontWeight: 700,
                display: "flex",
                alignItems: "center",
                gap: "4px",
                whiteSpace: "nowrap",
                flexShrink: 0,
              }}
            >
              <span style={{ width: "5px", height: "5px", borderRadius: "50%", backgroundColor: "#16a34a", flexShrink: 0 }} />
              Đang tính giờ
            </div>
          )}
        </div>

        {/* Time & Money Metric Columns — Thiết kế nhỏ gọn sang trọng */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: "10px", marginBottom: "20px" }}>
          <div style={{ minWidth: 0, flex: 1 }}>
            <p style={{ fontSize: "0.78rem", color: "#6b7280", fontWeight: 500, marginBottom: "3px", whiteSpace: "nowrap" }}>
              Thời gian đã dùng
            </p>
            <p style={{ fontSize: "1.1rem", fontWeight: 700, color: "#111827", lineHeight: 1.1, letterSpacing: "-0.01em", whiteSpace: "nowrap" }}>
              {durationDisplay}
            </p>
          </div>

          <div style={{ textAlign: "right", minWidth: 0, flex: 1 }}>
            <p style={{ fontSize: "0.78rem", color: "#6b7280", fontWeight: 500, marginBottom: "3px", textAlign: "right", whiteSpace: "nowrap" }}>
              Số tiền
            </p>
            <p style={{ fontSize: "1.1rem", fontWeight: 700, color: "#111827", lineHeight: 1.1, letterSpacing: "-0.01em", textAlign: "right", whiteSpace: "nowrap" }}>
              {formatCurrency(previewPrice)}
            </p>
          </div>
        </div>

        {/* Order Code Row — Thanh mảnh gọn gàng */}
        <div
          style={{
            backgroundColor: "#f8fafc",
            border: "1px solid #e2e8f0",
            borderRadius: "12px",
            padding: "10px 14px",
            marginBottom: "20px",
            textAlign: "left",
          }}
        >
          <p style={{ fontSize: "0.82rem", color: "#4b5563", margin: 0, fontWeight: 500 }}>
            Mã đơn hàng: <span style={{ color: "#111827", fontWeight: 600 }}>{session.order_code}</span>
          </p>
        </div>

        {/* Error Notification */}
        {error && (
          <div
            role="alert"
            style={{
              padding: "10px 14px",
              borderRadius: "12px",
              backgroundColor: "#fef2f2",
              border: "1px solid #fecaca",
              color: "#dc2626",
              fontSize: "0.82rem",
              marginBottom: "16px",
              textAlign: "center",
              fontWeight: 500,
            }}
          >
            {error}
          </div>
        )}

        {/* Action Button: Opens Check-out Confirmation Modal */}
        <button
          id="btn-checkout"
          onClick={() => setShowConfirmModal(true)}
          disabled={ending}
          className="btn-black-pill"
          style={{
            width: "100%",
            padding: "13px",
            fontSize: "0.9rem",
            fontWeight: 600,
          }}
        >
          {ending ? "Đang xử lý..." : "Check-out"}
        </button>
      </div>

      {/* Confirmation Modal */}
      {showConfirmModal && (
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
            <h3 style={{ fontSize: "1.2rem", fontWeight: 700, color: "#111827", marginBottom: "10px" }}>
              Xác nhận Check-out
            </h3>
            <p style={{ fontSize: "0.9rem", color: "#6b7280", lineHeight: 1.45, marginBottom: "24px" }}>
              Bạn có chắc chắn muốn kết thúc tính giờ để tiến hành thanh toán không?
            </p>

            <div style={{ display: "flex", gap: "12px" }}>
              <button
                onClick={() => setShowConfirmModal(false)}
                style={{
                  flex: 1,
                  padding: "13px",
                  borderRadius: "9999px",
                  backgroundColor: "#f3f4f6",
                  color: "#374151",
                  fontWeight: 600,
                  fontSize: "0.92rem",
                  border: "none",
                  cursor: "pointer",
                }}
              >
                Quay lại
              </button>
              <button
                onClick={handleConfirmCheckout}
                disabled={ending}
                className="btn-black-pill"
                style={{
                  flex: 1,
                  padding: "13px",
                  fontSize: "0.92rem",
                  fontWeight: 600,
                }}
              >
                {ending ? "Đang xử lý..." : "Xác nhận"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Offline Explanation Modal — Trấn an khách hàng khi Wifi/3G chập chờn */}
      {showOfflineModal && (
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
                backgroundColor: "#fffbe5",
                borderRadius: "50%",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                margin: "0 auto 16px auto",
                fontSize: "1.4rem",
              }}
            >
              📡
            </div>

            <h3 style={{ fontSize: "1.15rem", fontWeight: 700, color: "#111827", marginBottom: "10px" }}>
              Đang thử kết nối lại...
            </h3>
            <p style={{ fontSize: "0.88rem", color: "#4b5563", lineHeight: 1.5, marginBottom: "20px" }}>
              Kết nối Wifi/3G trên thiết bị của bạn đang tạm thời chập chờn. Hệ thống đang tự động đồng bộ lại.
            </p>
            <div
              style={{
                backgroundColor: "#f8fafc",
                border: "1px solid #e2e8f0",
                borderRadius: "14px",
                padding: "12px 14px",
                marginBottom: "24px",
                textAlign: "left",
              }}
            >
              <p style={{ fontSize: "0.82rem", color: "#15803d", fontWeight: 600, margin: 0 }}>
                Thời gian tính giờ của bạn vẫn chạy chính xác trên hệ thống, quý khách hoàn toàn yên tâm!
              </p>
            </div>

            <button
              onClick={() => setShowOfflineModal(false)}
              className="btn-black-pill"
              style={{
                width: "100%",
                padding: "13px",
                fontSize: "0.92rem",
                fontWeight: 600,
              }}
            >
              Đã hiểu
            </button>
          </div>
        </div>
      )}
    </main>
  );
}
