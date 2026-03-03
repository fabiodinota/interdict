"use client";

import { useState } from "react";
import {
  LayoutDashboard,
  Shield,
  ScrollText,
  Building2,
  Scale,
  FileText,
  PanelLeftClose,
  PanelLeftOpen,
  ShieldCheck,
  MessageSquareWarning,
  Building,
  AlertTriangle,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

const NAV_ITEMS = [
  { label: "Home", icon: LayoutDashboard, href: "/" },
  { label: "Policies", icon: Shield, href: "/policies" },
  { label: "Audit Trail", icon: ScrollText, href: "/audit" },
  { label: "Vendors", icon: Building2, href: "/vendors" },
  { label: "Regulatory", icon: Scale, href: "/regulatory" },
  { label: "Reports", icon: FileText, href: "/reports" },
  { label: "Evidence", icon: ShieldCheck, href: "/evidence" },
  { label: "Reviews", icon: MessageSquareWarning, href: "/reviews" },
  { label: "Dept Policies", icon: Building, href: "/department-policies" },
  { label: "Anomalies", icon: AlertTriangle, href: "/anomalies" },
] as const;

export function Sidebar() {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);

  const isActive = (href: string) => {
    if (href === "/") return pathname === "/";
    return pathname.startsWith(href);
  };

  return (
    <aside
      className={`flex flex-col border-r bg-background/95 backdrop-blur supports-backdrop-filter:bg-background/60 transition-all duration-200 ${
        collapsed ? "w-16" : "w-64"
      }`}
    >
      {/* Brand */}
      <div className="p-4 border-b flex items-center gap-3">
        <div className="h-8 w-8 rounded-md bg-primary flex items-center justify-center shadow-sm shrink-0">
          <ShieldCheck className="h-4 w-4 text-primary-foreground" />
        </div>
        {!collapsed && (
          <div className="overflow-hidden">
            <h2 className="text-sm font-bold tracking-tight text-foreground leading-tight">
              Interdict
            </h2>
            <p className="text-[10px] uppercase font-semibold text-muted-foreground tracking-widest mt-0.5">
              Compliance
            </p>
          </div>
        )}
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto p-3 space-y-1">
        {NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          const active = isActive(item.href);

          if (collapsed) {
            return (
              <Tooltip key={item.href} delayDuration={0}>
                <TooltipTrigger asChild>
                  <Link
                    href={item.href}
                    className={`flex items-center justify-center p-2 rounded-md transition-colors ${
                      active
                        ? "bg-muted text-foreground"
                        : "text-muted-foreground hover:bg-muted hover:text-foreground"
                    }`}
                  >
                    <Icon className="h-4 w-4" />
                  </Link>
                </TooltipTrigger>
                <TooltipContent side="right">{item.label}</TooltipContent>
              </Tooltip>
            );
          }

          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                active
                  ? "bg-muted text-foreground"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground"
              }`}
            >
              <Icon className="h-4 w-4 opacity-70" />
              {item.label}
            </Link>
          );
        })}
      </nav>

      {/* Status indicator */}
      <div className="p-3 border-t space-y-2">
        {!collapsed && (
          <div className="flex items-center gap-3 px-3 py-2 rounded-md bg-muted/50 border border-border/50">
            <div className="h-2 w-2 rounded-full bg-green-500 ring-2 ring-green-500/20" />
            <span className="text-xs font-medium text-muted-foreground">
              Control Plane Online
            </span>
          </div>
        )}

        {/* Collapse toggle */}
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setCollapsed(!collapsed)}
          className={`w-full ${collapsed ? "justify-center px-2" : "justify-start"}`}
        >
          {collapsed ? (
            <PanelLeftOpen className="h-4 w-4" />
          ) : (
            <>
              <PanelLeftClose className="h-4 w-4 mr-2" />
              <span className="text-xs">Collapse</span>
            </>
          )}
        </Button>
      </div>
    </aside>
  );
}
