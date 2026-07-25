import { redirect } from "next/navigation";

// AI Performance was folded into the "Performance" tab on /ai-journal during
// the 2026-07 redesign (one stats surface instead of two competing pages).
// Kept as a redirect so old bookmarks/links don't 404.
export default function AiPerformanceRedirect() {
  redirect("/ai-journal");
}
