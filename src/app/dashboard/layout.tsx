import type { ReactNode } from "react";
import { TopNav } from "@/components/dashboard/top-nav";

export default function DashboardLayout({ children }: { children: ReactNode }) {
  return (
    <div className="mx-auto flex min-h-screen w-full max-w-md flex-col bg-slate-50 pb-safe">
      <TopNav />
      <main className="flex-1 px-4 py-6">{children}</main>
    </div>
  );
}
