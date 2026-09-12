"use client";

import { useEffect } from "react";

export function ClearActiveSession() {
  useEffect(() => {
    if (typeof window !== "undefined") {
      localStorage.removeItem("active_session_id");
      document.cookie = "active_session_id=; path=/; max-age=0";
    }
  }, []);

  return null;
}
