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
          style: {
            fontSize: "14px",
            padding: "16px",
            borderRadius: "12px",
            boxShadow: "0 8px 30px rgba(0,0,0,0.12), 0 2px 8px rgba(0,0,0,0.08)",
          },
        }}
        visibleToasts={3}
        duration={4000}
        offset={24}
      />
    </>
  );
}
