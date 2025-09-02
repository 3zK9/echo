import { redirect } from "next/navigation";

export default async function DMPage() {
  // Direct Messages are not available yet: guard this route
  redirect("/?feature=messages-coming-soon");
}
