import { Sidebar } from "@/components/layout/sidebar";
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  return (
    <div className="grid min-h-screen grid-cols-[240px_1fr] max-[720px]:grid-cols-1">
      <div className="max-[720px]:hidden">
        <Sidebar userEmail={user.email ?? null} />
      </div>
      <main className="px-11 py-9 pb-16 max-w-[1400px] w-full max-[720px]:px-6 max-[720px]:py-6">
        {children}
      </main>
    </div>
  );
}
