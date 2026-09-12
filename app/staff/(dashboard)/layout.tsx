// app/staff/layout.tsx
// Layout cho toàn bộ khu vực /staff
// Kiểm tra cookie auth — nếu chưa đăng nhập → redirect về login

import { cookies } from "next/headers";
import { redirect } from "next/navigation";

export default async function StaffLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const cookieStore = await cookies();
  const authCookie = cookieStore.get("staff_auth");

  if (authCookie?.value !== "authenticated") {
    redirect("/staff/login");
  }

  return <>{children}</>;
}
