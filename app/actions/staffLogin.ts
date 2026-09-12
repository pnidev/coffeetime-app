"use server";
// app/actions/staffLogin.ts
// Server Action: Xác thực mật khẩu nhân viên → set cookie

import { cookies } from "next/headers";
import { redirect } from "next/navigation";

export async function staffLogin(formData: FormData) {
  const password = formData.get("password") as string;
  const from = (formData.get("from") as string) || "/staff";

  const correctPassword = process.env.STAFF_PASSWORD || "staff2026";

  if (password !== correctPassword) {
    redirect(`/staff/login?error=1&from=${encodeURIComponent(from)}`);
  }

  const cookieStore = await cookies();
  cookieStore.set("staff_auth", "authenticated", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 60 * 30, // 30 phút
    path: "/",
  });

  redirect(from);
}

export async function staffLogout() {
  const cookieStore = await cookies();
  cookieStore.delete("staff_auth");
  redirect("/staff/login");
}
