export const dynamic = "force-dynamic";
export const revalidate = 0;

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createServiceClient } from "@/lib/supabase/server";
import CheckInClientForm from "./CheckInClientForm";

export default async function CheckInPage() {
  const cookieStore = await cookies();
  const activeSessionId = cookieStore.get("active_session_id")?.value;

  if (activeSessionId) {
    try {
      const supabase = createServiceClient();
      const { data } = await supabase
        .from("sessions")
        .select("status")
        .eq("id", activeSessionId)
        .single();

      if (data && data.status === "active") {
        // Tự động chuyển hướng ngay lập tức tại Server (Instant HTTP Redirect - không bị nảy màn hình)
        redirect(`/session/${activeSessionId}`);
      } else {
        cookieStore.delete("active_session_id");
      }
    } catch (e: any) {
      if (e?.digest?.startsWith("NEXT_REDIRECT")) {
        throw e;
      }
      console.error("Server checkin cookie redirect error:", e);
    }
  }

  return <CheckInClientForm />;
}
