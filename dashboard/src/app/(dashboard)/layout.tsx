import { Suspense } from "react";
import { Sidebar } from "@/components/layout/Sidebar";
import { TopBar } from "@/components/layout/TopBar";
import { Toaster } from "sonner";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <Suspense>
        <Sidebar />
      </Suspense>
      <div className="flex flex-col flex-1 overflow-hidden">
        <TopBar />
        <main className="flex-1 overflow-auto relative">{children}</main>
      </div>
      <Toaster
        position="bottom-right"
        richColors
        toastOptions={{
          className:
            "text-sm p-4 rounded-xl shadow-[0_8px_30px_rgba(0,0,0,0.12),0_2px_8px_rgba(0,0,0,0.08)]",
        }}
        visibleToasts={3}
        duration={4000}
        offset={24}
      />
    </>
  );
}
