import { redirect } from "next/navigation";

// Root "/" → redirect về /checkin
export default function HomePage() {
  redirect("/checkin");
}
