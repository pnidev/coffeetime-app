// app/staff/login/page.tsx
// Trang đăng nhập PIN cho nhân viên (mã PIN mặc định: staff2026)

import { staffLogin } from "@/app/actions/staffLogin";

interface PageProps {
  searchParams: Promise<{ error?: string; from?: string }>;
}

export const metadata = {
  title: "Đăng nhập nhân viên — CoffeeShop",
};

export default async function StaffLoginPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const hasError = params.error === "1";
  const from = params.from || "/staff";

  return (
    <main className="relative min-h-[100dvh] w-full flex items-center justify-center p-4 sm:p-6 overflow-hidden">
      {/* Background Wallpaper Image */}
      <div className="bg-cafe-wallpaper" />

      {/* Floating White Card */}
      <div className="card-floating animate-slide-up">
        {/* Header */}
        <div style={{ textAlign: "center", marginBottom: "28px" }}>
          <h1 style={{ fontSize: "1.4rem", fontWeight: 700, color: "#111827", lineHeight: 1.3, marginBottom: "8px" }}>
            Trang dành cho nhân viên
          </h1>
          <p style={{ fontSize: "0.9rem", color: "#6b7280", margin: 0, fontWeight: 500 }}>
            Nhập mật khẩu để truy cập Dashboard
          </p>
        </div>

        {hasError && (
          <div
            role="alert"
            style={{
              backgroundColor: "#fef2f2",
              border: "1px solid #fecaca",
              color: "#dc2626",
              fontSize: "0.88rem",
              borderRadius: "14px",
              padding: "12px 16px",
              marginBottom: "24px",
              textAlign: "center",
              fontWeight: 500,
            }}
          >
            Mật khẩu không đúng. Vui lòng thử lại.
          </div>
        )}

        <form action={staffLogin}>
          <input type="hidden" name="from" value={from} />

          <div style={{ marginBottom: "24px" }}>
            <label
              htmlFor="staff-password"
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
              Mật khẩu
            </label>
            <input
              id="staff-password"
              name="password"
              className="input-light-gray"
              type="password"
              placeholder="Nhập mật khẩu nhân viên..."
              required
              autoFocus
              autoComplete="current-password"
            />
          </div>

          <button
            type="submit"
            id="staff-login-btn"
            className="btn-black-pill"
          >
            Đăng nhập
          </button>
        </form>
      </div>
    </main>
  );
}
