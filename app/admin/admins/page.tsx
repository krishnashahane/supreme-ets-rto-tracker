import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { AdminManager } from "@/components/AdminManager";

export const dynamic = "force-dynamic";
export const metadata = { title: "Administrators" };

export default async function AdminsPage() {
  const user = await getSession();
  if (!user || user.role !== "superadmin") redirect("/admin");
  return <AdminManager />;
}
