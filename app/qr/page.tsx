// app/qr/page.tsx
// Trang tạo & in QR code tĩnh — chỉ cần chạy 1 lần, in ra đặt tại quầy
// Protected: chỉ accessible sau khi đã đăng nhập nhân viên

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import QrDisplay from "./QrDisplay";

export const metadata = {
  title: "Mã QR Quán — CoffeeShop",
};

export default async function QrPage() {
  // Kiểm tra auth nhân viên
  const cookieStore = await cookies();
  const auth = cookieStore.get("staff_auth");
  if (auth?.value !== "authenticated") {
    redirect("/staff/login?from=/qr");
  }

  const appUrl =
    process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  const checkinUrl = `${appUrl}/checkin`;

  return (
    <main
      style={{
        minHeight: "100dvh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        padding: "32px 24px",
      }}
    >
      <div
        className="glass-card animate-slide-in no-print"
        style={{ maxWidth: "480px", width: "100%", padding: "40px 32px", textAlign: "center" }}
      >
        <h1
          style={{
            fontSize: "1.4rem",
            fontWeight: 800,
            marginBottom: "8px",
            color: "var(--text-primary)",
          }}
        >
          📱 Mã QR Quét Check-in
        </h1>
        <p style={{ color: "var(--text-muted)", fontSize: "0.85rem", marginBottom: "28px" }}>
          In ra và đặt tại quầy thu ngân. Khách quét để bắt đầu phiên ngồi.
        </p>

        <QrDisplay url={checkinUrl} />

        <p
          style={{
            marginTop: "16px",
            fontSize: "0.78rem",
            color: "var(--text-muted)",
            fontFamily: "monospace",
            wordBreak: "break-all",
          }}
        >
          {checkinUrl}
        </p>

        <div className="divider" />

        <div style={{ display: "flex", gap: "12px", justifyContent: "center", flexWrap: "wrap" }}>
          <button
            onClick={() => window.print()}
            className="btn-primary"
            id="print-qr-btn"
            style={{ maxWidth: "200px" }}
          >
            🖨️ In mã QR
          </button>
          <a
            href="/staff"
            className="btn-ghost"
            id="back-to-staff"
            style={{ textDecoration: "none", padding: "14px 24px" }}
          >
            ← Về Dashboard
          </a>
        </div>
      </div>

      {/* Print-only view */}
      <style>{`
        @media print {
          .no-print { display: none !important; }
          body { background: white !important; }
          .print-only { display: block !important; }
        }
        .print-only { display: none; }
      `}</style>

      <div className="print-only" style={{ textAlign: "center", padding: "40px" }}>
        <h2 style={{ fontSize: "24px", marginBottom: "8px" }}>☕ CoffeeShop</h2>
        <p style={{ marginBottom: "16px", color: "#666" }}>Quét mã QR để bắt đầu tính giờ</p>
        <QrDisplay url={checkinUrl} printMode />
        <p style={{ marginTop: "12px", fontSize: "12px", color: "#999" }}>{checkinUrl}</p>
      </div>
    </main>
  );
}
