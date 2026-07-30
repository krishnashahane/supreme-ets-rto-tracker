import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { ChangePassword } from "@/components/ChangePassword";

export const dynamic = "force-dynamic";
export const metadata = { title: "Account" };

export default async function AccountPage() {
  const user = await getSession();
  if (!user || user.role === "user") redirect("/");

  return (
    <div>
      <h1 className="text-2xl font-bold">My Account</h1>
      <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
        Signed in as <span className="font-medium">{user.username}</span>. Change your password below.
      </p>
      <div className="mt-6">
        <ChangePassword />
      </div>
    </div>
  );
}
