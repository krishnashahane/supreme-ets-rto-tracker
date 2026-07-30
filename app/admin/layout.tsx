import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { AdminHeader } from "@/components/AdminHeader";

export const dynamic = "force-dynamic";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await getSession();
  if (!user) redirect("/login");
  if (user.role === "user") redirect("/");

  return (
    <div className="flex min-h-screen flex-col">
      <AdminHeader role={user.role} username={user.username} />
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8">{children}</main>
    </div>
  );
}
