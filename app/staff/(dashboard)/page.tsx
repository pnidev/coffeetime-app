"use client";

// app/staff/(dashboard)/page.tsx
// Màn hình Vận hành Dashboard Nhân viên — Thẻ Thống kê chuẩn UI, VND & 0 VND màu đen đồng bộ

import { useEffect, useState, useCallback, useRef, useMemo } from "react";
import { createClient } from "@/lib/supabase/client";
import { endSession } from "@/app/actions/endSession";
import { cancelSession } from "@/app/actions/cancelSession";
import {
  calculatePreviewPrice,
  formatCurrency,
  formatDurationDisplay,
} from "@/lib/pricing";
import type { Session } from "@/lib/supabase/server";

interface Toast {
  id: string;
  message: string;
  type: "success" | "info" | "warning";
}

export default function StaffDashboard() {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<"active" | "history">("active");
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [now, setNow] = useState<Date>(new Date());
  
  // Modals & Connection state
  const [paymentSession, setPaymentSession] = useState<Session | null>(null);
  const [cancelSessionItem, setCancelSessionItem] = useState<Session | null>(null);
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [realtimeStatus, setRealtimeStatus] = useState<"connected" | "reconnecting" | "disconnected">("connected");

  const isFirstLoad = useRef(true);
  const notifiedSessionIds = useRef<Set<string>>(new Set());

  // Toast helper
  const addToast = useCallback(
    (message: string, type: Toast["type"] = "info") => {
      const id = Math.random().toString(36).slice(2);
      setToasts((prev) => [...prev, { id, message, type }]);
      setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== id));
      }, 4000);
    },
    []
  );

  // Real-time tick every second
  useEffect(() => {
    const interval = setInterval(() => {
      setNow(new Date());
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  // Load & Subscribe Realtime sessions for Today (from 00:00) + Connection status monitoring
  useEffect(() => {
    const supabase = createClient();

    const today = new Date();
    const startOfToday = new Date(
      today.getFullYear(),
      today.getMonth(),
      today.getDate(),
      0,
      0,
      0,
      0
    );
    const startOfTodayISO = startOfToday.toISOString();

    async function loadTodaySessions() {
      try {
        const { data, error } = await supabase
          .from("sessions")
          .select("*")
          .gte("check_in_time", startOfTodayISO)
          .order("check_in_time", { ascending: true });

        if (!error && data) {
          setSessions(data as Session[]);
          data.forEach((s) => notifiedSessionIds.current.add(s.id));
          setRealtimeStatus("connected");
        } else if (error) {
          setRealtimeStatus("reconnecting");
        }
      } catch (err) {
        setRealtimeStatus("disconnected");
      }
      setLoading(false);
      isFirstLoad.current = false;
    }

    loadTodaySessions();

    // Subscribe Realtime với theo dõi kết nối (status listener)
    const channel = supabase
      .channel("staff:sessions")
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "sessions",
        },
        (payload) => {
          const newSession = payload.new as Session;
          if (!newSession || !newSession.id) return;

          // Tránh bắn toast lặp (khi React StrictMode hoặc Supabase event trùng)
          if (notifiedSessionIds.current.has(newSession.id)) {
            return;
          }
          notifiedSessionIds.current.add(newSession.id);

          if (new Date(newSession.check_in_time) >= startOfToday) {
            addToast(
              `Khách mới check-in: ${newSession.customer_name} (${newSession.order_code})`,
              "info"
            );
            setSessions((prev) => {
              if (prev.some((s) => s.id === newSession.id)) return prev;
              return [...prev, newSession];
            });
          }
        }
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "sessions",
        },
        (payload) => {
          const updated = payload.new as Session;
          setSessions((prev) => {
            const exists = prev.some((s) => s.id === updated.id);
            if (exists) {
              return prev.map((s) => (s.id === updated.id ? updated : s));
            } else if (new Date(updated.check_in_time) >= startOfToday) {
              return [...prev, updated];
            }
            return prev;
          });
        }
      )
      .subscribe((status) => {
        if (status === "SUBSCRIBED") {
          setRealtimeStatus("connected");
        } else if (status === "CLOSED" || status === "TIMED_OUT" || status === "CHANNEL_ERROR") {
          setRealtimeStatus("reconnecting");
        }
      });

    // Polling dự phòng 5s phòng trường hợp WebSocket bị đứt ngầm mà Supabase chưa phát hiện
    const pollInterval = setInterval(async () => {
      try {
        const { data, error } = await supabase
          .from("sessions")
          .select("*")
          .gte("check_in_time", startOfTodayISO)
          .order("check_in_time", { ascending: true });

        if (error) {
          setRealtimeStatus((prev) => (prev === "connected" ? "reconnecting" : "disconnected"));
          return;
        }

        setRealtimeStatus("connected");
        if (data) {
          setSessions((prev) => {
            const sessionMap = new Map(prev.map((s) => [s.id, s]));
            data.forEach((s) => {
              sessionMap.set(s.id, s);
              notifiedSessionIds.current.add(s.id);
            });
            return Array.from(sessionMap.values());
          });
        }
      } catch (err) {
        setRealtimeStatus("disconnected");
      }
    }, 5000);

    // Lắng nghe sự kiện Online / Offline của trình duyệt để tự kết nối lại
    function handleOnline() {
      setRealtimeStatus("connected");
      loadTodaySessions();
    }
    function handleOffline() {
      setRealtimeStatus("disconnected");
    }

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    return () => {
      clearInterval(pollInterval);
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
      if (channel) {
        supabase.removeChannel(channel).catch(() => {});
      }
    };
  }, [addToast]);

  // Execute Payment
  const handleConfirmPayment = async () => {
    if (!paymentSession || processingId) return;
    const session = paymentSession;
    setProcessingId(session.id);

    const calculatedPrice = calculatePreviewPrice(session.check_in_time, 30000, 4);

    // Optimistic Update
    setSessions((prev) =>
      prev.map((s) =>
        s.id === session.id
          ? {
              ...s,
              status: "completed",
              check_out_time: new Date().toISOString(),
              total_amount: calculatedPrice,
              ended_by: "staff",
            }
          : s
      )
    );

    setPaymentSession(null);
    addToast(`Đã thanh toán: ${session.order_code} (${session.customer_name})`, "success");

    const result = await endSession({
      sessionId: session.id,
      endedBy: "staff",
    });

    if (!result.success && !result.alreadyEnded) {
      setSessions((prev) => prev.map((s) => (s.id === session.id ? session : s)));
      addToast(`Lỗi thanh toán: ${result.error}`, "warning");
    }

    setProcessingId(null);
  };

  // Execute Cancellation
  const handleConfirmCancel = async () => {
    if (!cancelSessionItem || processingId) return;
    const session = cancelSessionItem;
    setProcessingId(session.id);

    // Optimistic Update
    setSessions((prev) =>
      prev.map((s) =>
        s.id === session.id
          ? {
              ...s,
              status: "cancelled",
              check_out_time: new Date().toISOString(),
              total_amount: 0,
              ended_by: "staff",
            }
          : s
      )
    );

    setCancelSessionItem(null);
    addToast(`Đã hủy phiên: ${session.order_code} (${session.customer_name})`, "warning");

    const result = await cancelSession({
      sessionId: session.id,
    });

    if (!result.success) {
      setSessions((prev) => prev.map((s) => (s.id === session.id ? session : s)));
      addToast(`Lỗi khi hủy: ${result.error}`, "warning");
    }

    setProcessingId(null);
  };

  // Active Sessions: Earliest check-in time first (khách ngồi lâu nhất lên trên)
  const activeSessions = useMemo(() => {
    return sessions
      .filter((s) => s.status === "active")
      .sort((a, b) => new Date(a.check_in_time).getTime() - new Date(b.check_in_time).getTime());
  }, [sessions]);

  // History Sessions: Finished today (completed or cancelled)
  const historySessions = useMemo(() => {
    return sessions
      .filter((s) => s.status === "completed" || s.status === "cancelled")
      .sort((a, b) => {
        const timeA = a.check_out_time ? new Date(a.check_out_time).getTime() : new Date(a.check_in_time).getTime();
        const timeB = b.check_out_time ? new Date(b.check_out_time).getTime() : new Date(b.check_in_time).getTime();
        return timeB - timeA;
      });
  }, [sessions]);

  // Total Revenue Today (Only completed sessions with amount > 0 count)
  const totalRevenueToday = useMemo(() => {
    return sessions.reduce((sum, s) => {
      if (s.status === "completed" && (s.total_amount || 0) > 0) {
        return sum + (s.total_amount || 0);
      }
      return sum;
    }, 0);
  }, [sessions]);

  return (
    <div
      style={{
        backgroundColor: "#f4f5f7",
        minHeight: "100vh",
        padding: "24px 32px",
        fontFamily: "var(--font-sans), 'Be Vietnam Pro', 'Inter', sans-serif",
        color: "#111827",
      }}
    >
      <div style={{ maxWidth: "1240px", margin: "0 auto", display: "flex", flexDirection: "column", gap: "20px" }}>
        
        {/* Header Title & Connection Badge */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div>
            <h1 style={{ fontSize: "1.5rem", fontWeight: 800, color: "#111827", margin: 0, letterSpacing: "-0.01em" }}>
              Dashboard Nhân viên
            </h1>
            <p style={{ fontSize: "0.85rem", color: "#6b7280", margin: "4px 0 0 0", fontWeight: 500 }}>
              Theo dõi khách đang ngồi và đối chiếu thanh toán trong ngày
            </p>
          </div>

          {/* Realtime Connection Status Indicator Badge */}
          <div
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "8px",
              padding: "6px 14px",
              borderRadius: "9999px",
              fontSize: "0.8rem",
              fontWeight: 600,
              backgroundColor:
                realtimeStatus === "connected"
                  ? "#ecfdf5"
                  : realtimeStatus === "reconnecting"
                  ? "#fef3c7"
                  : "#fef2f2",
              color:
                realtimeStatus === "connected"
                  ? "#065f46"
                  : realtimeStatus === "reconnecting"
                  ? "#92400e"
                  : "#991b1b",
              border: `1px solid ${
                realtimeStatus === "connected"
                  ? "#a7f3d0"
                  : realtimeStatus === "reconnecting"
                  ? "#fde68a"
                  : "#fecaca"
              }`,
              boxShadow: "0 1px 3px rgba(0,0,0,0.05)",
            }}
          >
            {/* Pulsing colored dot indicator */}
            <span
              style={{
                width: "8px",
                height: "8px",
                borderRadius: "50%",
                backgroundColor:
                  realtimeStatus === "connected"
                    ? "#10b981"
                    : realtimeStatus === "reconnecting"
                    ? "#f59e0b"
                    : "#ef4444",
                boxShadow:
                  realtimeStatus === "connected"
                    ? "0 0 0 3px rgba(16, 185, 129, 0.25)"
                    : realtimeStatus === "reconnecting"
                    ? "0 0 0 3px rgba(245, 158, 11, 0.25)"
                    : "0 0 0 3px rgba(239, 68, 68, 0.25)",
              }}
            />
            <span>
              {realtimeStatus === "connected" && "Realtime đang hoạt động"}
              {realtimeStatus === "reconnecting" && "Đang kết nối lại..."}
              {realtimeStatus === "disconnected" && "Mất kết nối — Bấm tải lại trang"}
            </span>

            {/* Manual reload trigger if disconnected or reconnecting */}
            {realtimeStatus !== "connected" && (
              <button
                onClick={() => window.location.reload()}
                style={{
                  marginLeft: "4px",
                  padding: "2px 8px",
                  borderRadius: "6px",
                  border: "none",
                  backgroundColor: realtimeStatus === "disconnected" ? "#ef4444" : "#f59e0b",
                  color: "#ffffff",
                  fontSize: "0.75rem",
                  fontWeight: 700,
                  cursor: "pointer",
                }}
              >
                Tải lại
              </button>
            )}
          </div>
        </div>

        {/* 2 Tabs chuyển đổi chính ở đầu trang */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "6px",
              backgroundColor: "#e5e7eb",
              padding: "4px",
              borderRadius: "12px",
            }}
          >
            {/* Tab 1: Đang ngồi */}
            <button
              onClick={() => setActiveTab("active")}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "8px",
                padding: "8px 20px",
                borderRadius: "8px",
                fontSize: "0.88rem",
                fontWeight: activeTab === "active" ? 700 : 600,
                backgroundColor: activeTab === "active" ? "#ffffff" : "transparent",
                color: activeTab === "active" ? "#111827" : "#4b5563",
                border: "none",
                boxShadow: activeTab === "active" ? "0 2px 6px rgba(0,0,0,0.08)" : "none",
                cursor: "pointer",
                transition: "all 0.15s ease",
              }}
            >
              <span>Đang ngồi</span>
              <span
                style={{
                  backgroundColor: activeTab === "active" ? "#111827" : "#9ca3af",
                  color: "#ffffff",
                  fontSize: "0.75rem",
                  fontWeight: 700,
                  padding: "2px 8px",
                  borderRadius: "9999px",
                }}
              >
                {activeSessions.length}
              </span>
            </button>

            {/* Tab 2: Lịch sử hôm nay */}
            <button
              onClick={() => setActiveTab("history")}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "8px",
                padding: "8px 20px",
                borderRadius: "8px",
                fontSize: "0.88rem",
                fontWeight: activeTab === "history" ? 700 : 600,
                backgroundColor: activeTab === "history" ? "#ffffff" : "transparent",
                color: activeTab === "history" ? "#111827" : "#4b5563",
                border: "none",
                boxShadow: activeTab === "history" ? "0 2px 6px rgba(0,0,0,0.08)" : "none",
                cursor: "pointer",
                transition: "all 0.15s ease",
              }}
            >
              <span>Lịch sử hôm nay</span>
              <span
                style={{
                  backgroundColor: activeTab === "history" ? "#111827" : "#9ca3af",
                  color: "#ffffff",
                  fontSize: "0.75rem",
                  fontWeight: 700,
                  padding: "2px 8px",
                  borderRadius: "9999px",
                }}
              >
                {historySessions.length}
              </span>
            </button>
          </div>
        </div>

        {/* NẾU Ở TAB 2 (LỊCH SỬ): 2 Thẻ Thống Kê Chuẩn UI */}
        {activeTab === "history" && (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: "20px", margin: "4px 0" }}>
            {/* Thẻ 1: Tổng số lượt khách đã phục vụ (Xóa dấu ba chấm, lượt chữ đen cùng định dạng) */}
            <div
              style={{
                backgroundColor: "#ffffff",
                borderRadius: "20px",
                padding: "22px 24px",
                border: "1px solid #e5e7eb",
                boxShadow: "0 2px 10px rgba(0, 0, 0, 0.03)",
                display: "flex",
                flexDirection: "column",
                gap: "16px",
              }}
            >
              {/* Dòng 1: Icon container + Tiêu đề */}
              <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                <div
                  style={{
                    width: "40px",
                    height: "40px",
                    borderRadius: "12px",
                    backgroundColor: "#ecfdf5",
                    color: "#059669",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <svg style={{ width: "20px", height: "20px" }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                  </svg>
                </div>
                <span style={{ fontSize: "1rem", fontWeight: 700, color: "#111827" }}>
                  Tổng số lượt khách đã phục vụ
                </span>
              </div>

              {/* Dòng 2: Giá trị số lượt màu đen đồng bộ */}
              <div>
                <p style={{ fontSize: "2.1rem", fontWeight: 800, color: "#111827", margin: 0, lineHeight: 1 }}>
                  {historySessions.length} <span style={{ color: "#111827", fontWeight: 800 }}>lượt</span>
                </p>
              </div>
            </div>

            {/* Thẻ 2: Tổng doanh thu trong ngày (Xóa dấu ba chấm, VND màu đen) */}
            <div
              style={{
                backgroundColor: "#ffffff",
                borderRadius: "20px",
                padding: "22px 24px",
                border: "1px solid #e5e7eb",
                boxShadow: "0 2px 10px rgba(0, 0, 0, 0.03)",
                display: "flex",
                flexDirection: "column",
                gap: "16px",
              }}
            >
              {/* Dòng 1: Icon container + Tiêu đề */}
              <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                <div
                  style={{
                    width: "40px",
                    height: "40px",
                    borderRadius: "12px",
                    backgroundColor: "#ecfdf5",
                    color: "#059669",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <svg style={{ width: "20px", height: "20px" }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
                <span style={{ fontSize: "1rem", fontWeight: 700, color: "#111827" }}>
                  Tổng doanh thu trong ngày
                </span>
              </div>

              {/* Dòng 2: Giá trị tiền VND bự màu đen */}
              <div>
                <p style={{ fontSize: "2.1rem", fontWeight: 800, color: "#111827", margin: 0, lineHeight: 1 }}>
                  {formatCurrency(totalRevenueToday)}
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Main Table Container */}
        <div
          style={{
            backgroundColor: "#ffffff",
            borderRadius: "16px",
            border: "1px solid #e5e7eb",
            boxShadow: "0 2px 12px rgba(0, 0, 0, 0.04)",
            overflow: "hidden",
          }}
        >
          {/* TAB 1: BẢNG KHÁCH ĐANG NGỒI */}
          {activeTab === "active" && (
            <div>
              {loading ? (
                <div style={{ padding: "48px 0", textAlign: "center", color: "#6b7280" }}>
                  <p style={{ fontSize: "0.9rem", fontWeight: 500 }}>Đang tải danh sách khách đang ngồi...</p>
                </div>
              ) : activeSessions.length === 0 ? (
                <div style={{ padding: "48px 20px", textAlign: "center", backgroundColor: "#fafafa" }}>
                  <p style={{ fontSize: "0.95rem", fontWeight: 700, color: "#111827", margin: 0 }}>
                    Chưa có khách nào đang ngồi
                  </p>
                  <p style={{ fontSize: "0.82rem", color: "#6b7280", marginTop: "4px" }}>
                    Khi khách quét mã QR check-in, thông tin sẽ tự động xuất hiện ở đây.
                  </p>
                </div>
              ) : (
                <div style={{ overflowX: "auto" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse" }}>
                    <thead>
                      <tr style={{ backgroundColor: "#f9fafb", borderBottom: "1px solid #e5e7eb", fontSize: "0.85rem", fontWeight: 700, color: "#374151" }}>
                        <th style={{ padding: "14px 20px", textAlign: "left" }}>Mã đơn</th>
                        <th style={{ padding: "14px 20px", textAlign: "left" }}>Tên khách</th>
                        <th style={{ padding: "14px 20px", textAlign: "left" }}>Giờ bắt đầu</th>
                        <th style={{ padding: "14px 20px", textAlign: "left" }}>Thời gian đã ngồi</th>
                        <th style={{ padding: "14px 20px", textAlign: "left" }}>Tiền tạm tính</th>
                        <th style={{ padding: "14px 20px", textAlign: "center" }}>Hành động</th>
                      </tr>
                    </thead>
                    <tbody style={{ fontSize: "0.88rem" }}>
                      {activeSessions.map((session) => {
                        const checkInDate = new Date(session.check_in_time);
                        const elapsedMs = Math.max(0, now.getTime() - checkInDate.getTime());
                        const currentPrice = calculatePreviewPrice(session.check_in_time, 30000, 4);
                        const durationText = formatDurationDisplay(elapsedMs);

                        return (
                          <tr
                            key={session.id}
                            style={{
                              borderBottom: "1px solid #f3f4f6",
                            }}
                          >
                            {/* 1. Mã đơn */}
                            <td style={{ padding: "16px 20px" }}>
                              <span
                                style={{
                                  fontWeight: 800,
                                  color: "#111827",
                                  backgroundColor: "#f3f4f6",
                                  border: "1px solid #d1d5db",
                                  padding: "5px 12px",
                                  borderRadius: "6px",
                                  fontSize: "0.88rem",
                                  display: "inline-block",
                                }}
                              >
                                {session.order_code}
                              </span>
                            </td>

                            {/* 2. Tên khách */}
                            <td style={{ padding: "16px 20px", fontWeight: 700, color: "#111827" }}>
                              {session.customer_name}
                            </td>

                            {/* 3. Giờ bắt đầu */}
                            <td style={{ padding: "16px 20px", color: "#374151", fontWeight: 500 }}>
                              {checkInDate.toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" })}
                            </td>

                            {/* 4. Thời gian đã ngồi */}
                            <td style={{ padding: "16px 20px" }}>
                              <span
                                style={{
                                  backgroundColor: "#fef3c7",
                                  color: "#92400e",
                                  border: "1px solid #fde68a",
                                  padding: "4px 12px",
                                  borderRadius: "6px",
                                  fontSize: "0.82rem",
                                  fontWeight: 700,
                                  display: "inline-block",
                                }}
                              >
                                {durationText}
                              </span>
                            </td>

                            {/* 5. Tiền tạm tính VND màu đen */}
                            <td style={{ padding: "16px 20px", fontWeight: 800, color: "#111827", fontSize: "0.98rem" }}>
                              {formatCurrency(currentPrice)}
                            </td>

                            {/* 6. Cột hành động */}
                            <td style={{ padding: "16px 20px", textAlign: "center" }}>
                              <div style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", gap: "12px" }}>
                                <button
                                  onClick={() => setPaymentSession(session)}
                                  style={{
                                    backgroundColor: "#000000",
                                    color: "#ffffff",
                                    fontWeight: 700,
                                    fontSize: "0.85rem",
                                    padding: "8px 16px",
                                    borderRadius: "8px",
                                    border: "none",
                                    cursor: "pointer",
                                    boxShadow: "0 1px 3px rgba(0,0,0,0.15)",
                                  }}
                                >
                                  Thanh toán
                                </button>

                                <button
                                  onClick={() => setCancelSessionItem(session)}
                                  style={{
                                    backgroundColor: "#ffffff",
                                    color: "#000000",
                                    fontWeight: 700,
                                    fontSize: "0.82rem",
                                    padding: "7px 14px",
                                    borderRadius: "8px",
                                    border: "1px solid #000000",
                                    cursor: "pointer",
                                    transition: "all 0.15s ease",
                                  }}
                                  onMouseEnter={(e) => {
                                    e.currentTarget.style.backgroundColor = "#f3f4f6";
                                  }}
                                  onMouseLeave={(e) => {
                                    e.currentTarget.style.backgroundColor = "#ffffff";
                                  }}
                                >
                                  Hủy
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* TAB 2: LỊCH SỬ HÔM NAY */}
          {activeTab === "history" && (
            <div>
              {loading ? (
                <div style={{ padding: "48px 0", textAlign: "center", color: "#6b7280" }}>
                  <p style={{ fontSize: "0.9rem", fontWeight: 500 }}>Đang tải lịch sử hôm nay...</p>
                </div>
              ) : historySessions.length === 0 ? (
                <div style={{ padding: "48px 20px", textAlign: "center", backgroundColor: "#fafafa" }}>
                  <p style={{ fontSize: "0.95rem", fontWeight: 700, color: "#111827", margin: 0 }}>
                    Chưa có lịch sử phiên hôm nay
                  </p>
                  <p style={{ fontSize: "0.82rem", color: "#6b7280", marginTop: "4px" }}>
                    Các đơn hoàn tất hoặc bị hủy trong ngày sẽ xuất hiện tại đây.
                  </p>
                </div>
              ) : (
                <div style={{ overflowX: "auto" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", textAlign: "left" }}>
                    <thead>
                      <tr style={{ backgroundColor: "#f9fafb", borderBottom: "1px solid #e5e7eb", fontSize: "0.85rem", fontWeight: 700, color: "#374151" }}>
                        <th style={{ padding: "14px 20px" }}>Mã đơn</th>
                        <th style={{ padding: "14px 20px" }}>Tên khách</th>
                        <th style={{ padding: "14px 20px" }}>Giờ vào</th>
                        <th style={{ padding: "14px 20px" }}>Giờ ra</th>
                        <th style={{ padding: "14px 20px" }}>Số tiền</th>
                        <th style={{ padding: "14px 20px" }}>Trạng thái</th>
                      </tr>
                    </thead>
                    <tbody style={{ fontSize: "0.88rem" }}>
                      {historySessions.map((session) => {
                        const checkInDate = new Date(session.check_in_time);
                        const checkOutDate = session.check_out_time ? new Date(session.check_out_time) : null;
                        const isCancelled =
                          session.status === "cancelled" ||
                          (session.total_amount === 0 && session.ended_by === "staff");

                        return (
                          <tr
                            key={session.id}
                            style={{
                              borderBottom: "1px solid #f3f4f6",
                              backgroundColor: isCancelled ? "#fafafa" : "#ffffff",
                            }}
                          >
                            {/* Mã đơn */}
                            <td style={{ padding: "16px 20px", fontWeight: 700, color: "#374151" }}>
                              {session.order_code}
                            </td>

                            {/* Tên khách */}
                            <td style={{ padding: "16px 20px", fontWeight: 700, color: "#111827" }}>
                              {session.customer_name}
                            </td>

                            {/* Giờ vào */}
                            <td style={{ padding: "16px 20px", color: "#374151" }}>
                              {checkInDate.toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" })}
                            </td>

                            {/* Giờ ra */}
                            <td style={{ padding: "16px 20px", color: "#374151" }}>
                              {checkOutDate
                                ? checkOutDate.toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" })
                                : "—"}
                            </td>

                            {/* Số tiền: Hủy cũng hiển thị 0 VND màu đen chuẩn như số khác */}
                            <td style={{ padding: "16px 20px", fontWeight: 800, color: "#111827" }}>
                              {isCancelled ? "0 VND" : formatCurrency(session.total_amount || 0)}
                            </td>

                            {/* Nhãn trạng thái */}
                            <td style={{ padding: "16px 20px" }}>
                              {isCancelled ? (
                                <span
                                  style={{
                                    backgroundColor: "#fef2f2",
                                    color: "#dc2626",
                                    border: "1px solid #fecaca",
                                    padding: "4px 12px",
                                    borderRadius: "9999px",
                                    fontSize: "0.78rem",
                                    fontWeight: 700,
                                    display: "inline-block",
                                  }}
                                >
                                  Đã hủy
                                </span>
                              ) : (
                                <span
                                  style={{
                                    backgroundColor: "#ecfdf5",
                                    color: "#047857",
                                    border: "1px solid #a7f3d0",
                                    padding: "4px 12px",
                                    borderRadius: "9999px",
                                    fontSize: "0.78rem",
                                    fontWeight: 700,
                                    display: "inline-block",
                                  }}
                                >
                                  Đã thanh toán
                                </span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* Dòng tổng số phiên ở cuối bảng */}
          <div
            style={{
              padding: "14px 20px",
              borderTop: "1px solid #e5e7eb",
              backgroundColor: "#ffffff",
              fontSize: "0.82rem",
              color: "#6b7280",
              fontWeight: 500,
            }}
          >
            Hiển thị{" "}
            <strong style={{ color: "#111827" }}>
              {activeTab === "active" ? activeSessions.length : historySessions.length}
            </strong>{" "}
            phiên làm việc
          </div>
        </div>
      </div>

      {/* POPUP 1: Xác nhận Thanh toán */}
      {paymentSession && (
        <div style={{ position: "fixed", inset: 0, zIndex: 100, backgroundColor: "rgba(15, 23, 42, 0.6)", backdropFilter: "blur(4px)", display: "flex", alignItems: "center", justifyContent: "center", padding: "16px" }}>
          <div style={{ backgroundColor: "#ffffff", borderRadius: "20px", width: "100%", maxWidth: "440px", padding: "24px 28px", boxShadow: "0 25px 50px -12px rgba(0,0,0,0.25)", border: "1px solid #f1f5f9" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", paddingBottom: "14px", borderBottom: "1px solid #f1f5f9" }}>
              <div>
                <h3 style={{ fontSize: "1.15rem", fontWeight: 800, color: "#0f172a", margin: 0 }}>
                  Xác nhận thanh toán đơn hàng
                </h3>
                <p style={{ fontSize: "0.82rem", color: "#64748b", margin: "4px 0 0 0" }}>
                  Kiểm tra thông tin chi tiết trước khi hoàn tất thu tiền
                </p>
              </div>
              <button onClick={() => setPaymentSession(null)} style={{ border: "none", background: "none", cursor: "pointer", color: "#94a3b8", fontSize: "1.2rem" }}>✕</button>
            </div>

            <div style={{ margin: "20px 0", backgroundColor: "#f8fafc", padding: "18px", borderRadius: "14px", border: "1px solid #e2e8f0", display: "flex", flexDirection: "column", gap: "12px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.88rem" }}>
                <span style={{ color: "#64748b", fontWeight: 500 }}>Mã đơn hàng:</span>
                <span style={{ fontWeight: 800, color: "#0f172a" }}>{paymentSession.order_code}</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.88rem" }}>
                <span style={{ color: "#64748b", fontWeight: 500 }}>Tên khách hàng:</span>
                <span style={{ fontWeight: 700, color: "#0f172a" }}>{paymentSession.customer_name}</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.88rem" }}>
                <span style={{ color: "#64748b", fontWeight: 500 }}>Giờ bắt đầu:</span>
                <span style={{ fontWeight: 600, color: "#334155" }}>
                  {new Date(paymentSession.check_in_time).toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" })}
                </span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.88rem" }}>
                <span style={{ color: "#64748b", fontWeight: 500 }}>Thời gian sử dụng:</span>
                <span style={{ fontWeight: 700, color: "#0f172a" }}>
                  {formatDurationDisplay(Math.max(0, now.getTime() - new Date(paymentSession.check_in_time).getTime()))}
                </span>
              </div>
              <div style={{ paddingTop: "12px", borderTop: "1px solid #e2e8f0", display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                <span style={{ fontSize: "0.95rem", fontWeight: 700, color: "#0f172a" }}>Tổng tiền thanh toán:</span>
                <span style={{ fontSize: "1.4rem", fontWeight: 900, color: "#0f172a" }}>
                  {formatCurrency(calculatePreviewPrice(paymentSession.check_in_time, 30000, 4))}
                </span>
              </div>
            </div>

            <div style={{ display: "flex", justifyContent: "flex-end", gap: "12px" }}>
              <button
                onClick={() => setPaymentSession(null)}
                style={{ padding: "9px 18px", borderRadius: "10px", border: "1px solid #d1d5db", backgroundColor: "#ffffff", color: "#374151", fontWeight: 600, fontSize: "0.85rem", cursor: "pointer" }}
              >
                Quay lại
              </button>
              <button
                onClick={handleConfirmPayment}
                disabled={Boolean(processingId)}
                style={{ padding: "9px 22px", borderRadius: "10px", border: "none", backgroundColor: "#000000", color: "#ffffff", fontWeight: 700, fontSize: "0.85rem", cursor: "pointer", boxShadow: "0 2px 6px rgba(0,0,0,0.15)" }}
              >
                {processingId ? "Đang xử lý..." : "Xác nhận thu tiền"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* POPUP 2: Xác nhận Hủy phiên */}
      {cancelSessionItem && (
        <div style={{ position: "fixed", inset: 0, zIndex: 100, backgroundColor: "rgba(15, 23, 42, 0.6)", backdropFilter: "blur(4px)", display: "flex", alignItems: "center", justifyContent: "center", padding: "16px" }}>
          <div style={{ backgroundColor: "#ffffff", borderRadius: "20px", width: "100%", maxWidth: "440px", padding: "24px 28px", boxShadow: "0 25px 50px -12px rgba(0,0,0,0.25)", border: "1px solid #f1f5f9" }}>
            <div style={{ paddingBottom: "14px", borderBottom: "1px solid #f1f5f9", textAlign: "center" }}>
              <h3 style={{ fontSize: "1.15rem", fontWeight: 800, color: "#0f172a", margin: 0 }}>
                Xác nhận hủy phiên dịch vụ
              </h3>
            </div>

            <div style={{ margin: "20px 0", backgroundColor: "#f8fafc", padding: "16px 18px", borderRadius: "14px", border: "1px solid #e2e8f0", display: "flex", flexDirection: "column", gap: "10px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.88rem" }}>
                <span style={{ color: "#64748b", fontWeight: 500 }}>Mã đơn hàng:</span>
                <span style={{ fontWeight: 800, color: "#0f172a" }}>{cancelSessionItem.order_code}</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.88rem" }}>
                <span style={{ color: "#64748b", fontWeight: 500 }}>Tên khách hàng:</span>
                <span style={{ fontWeight: 700, color: "#0f172a" }}>{cancelSessionItem.customer_name}</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.88rem" }}>
                <span style={{ color: "#64748b", fontWeight: 500 }}>Doanh thu ghi nhận:</span>
                <span style={{ fontWeight: 800, color: "#0f172a" }}>0 VND</span>
              </div>
            </div>

            <div style={{ display: "flex", justifyContent: "center", gap: "12px" }}>
              <button
                onClick={() => setCancelSessionItem(null)}
                style={{ padding: "9px 18px", borderRadius: "10px", border: "1px solid #d1d5db", backgroundColor: "#ffffff", color: "#374151", fontWeight: 600, fontSize: "0.85rem", cursor: "pointer" }}
              >
                Quay lại
              </button>
              <button
                onClick={handleConfirmCancel}
                disabled={Boolean(processingId)}
                style={{ padding: "9px 20px", borderRadius: "10px", border: "none", backgroundColor: "#dc2626", color: "#ffffff", fontWeight: 700, fontSize: "0.85rem", cursor: "pointer", boxShadow: "0 2px 6px rgba(220, 38, 38, 0.25)" }}
              >
                {processingId ? "Đang xử lý..." : "Xác nhận hủy"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Toast notifications */}
      <div
        style={{
          position: "fixed",
          top: "24px",
          left: "50%",
          transform: "translateX(-50%)",
          zIndex: 200,
          display: "flex",
          flexDirection: "column",
          gap: "10px",
          alignItems: "center",
          pointerEvents: "none",
        }}
      >
        {toasts.map((toast) => (
          <div
            key={toast.id}
            style={{
              pointerEvents: "auto",
              padding: "12px 24px",
              borderRadius: "12px",
              backgroundColor: toast.type === "success" ? "#111827" : toast.type === "warning" ? "#78350f" : "#1f2937",
              color: "#ffffff",
              fontSize: "0.88rem",
              fontWeight: 600,
              boxShadow: "0 10px 25px rgba(0,0,0,0.18)",
            }}
          >
            {toast.message}
          </div>
        ))}
      </div>
    </div>
  );
}
