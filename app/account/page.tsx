import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";

export const dynamic = "force-dynamic";
export const metadata = { title: "Account" };

// Basic users have no self-service account page. Staff manage their own
// password inside the admin area; a super admin manages the basic user's.
export default async function AccountPage() {
  const user = await getSession();
  if (!user) redirect("/login");
  if (user.role !== "user") redirect("/admin/account");
  redirect("/");
}
