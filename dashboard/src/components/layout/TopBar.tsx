"use client";

import { LogOut, ChevronRight } from "lucide-react";
import { usePathname } from "next/navigation";
import Link from "next/link";
import { ThemeToggle } from "@/components/theme-toggle";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/hooks/useAuth";

const ROUTE_LABELS: Record<string, string> = {
  "/": "Home",
  "/policies": "Policies",
  "/audit": "Audit Trail",
  "/vendors": "Vendors",
  "/regulatory": "Regulatory",
  "/reports": "Reports",
};

function formatRole(role: string): string {
  return role
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

export function TopBar() {
  const pathname = usePathname();
  const { user, logout } = useAuth();

  // Derive breadcrumb from pathname
  const segments = pathname.split("/").filter(Boolean);
  const breadcrumbs =
    segments.length === 0
      ? [{ label: "Home", href: "/" }]
      : segments.map((segment, index) => {
          const href = "/" + segments.slice(0, index + 1).join("/");
          return {
            label: ROUTE_LABELS[href] || segment.charAt(0).toUpperCase() + segment.slice(1),
            href,
          };
        });

  // User initials
  const userInitials = user
    ? user.displayName
      ? user.displayName
          .split(" ")
          .map((n) => n[0])
          .join("")
          .toUpperCase()
          .slice(0, 2)
      : user.email.slice(0, 2).toUpperCase()
    : "??";

  return (
    <header className="h-14 border-b shrink-0 px-4 flex items-center justify-between bg-background/95 backdrop-blur supports-backdrop-filter:bg-background/60 z-10">
      {/* Breadcrumb */}
      <nav className="flex items-center gap-1 text-sm">
        {breadcrumbs.map((crumb, index) => (
          <span key={crumb.href} className="flex items-center gap-1">
            {index > 0 && (
              <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
            )}
            {index === breadcrumbs.length - 1 ? (
              <span className="font-medium text-foreground">{crumb.label}</span>
            ) : (
              <Link
                href={crumb.href}
                className="text-muted-foreground hover:text-foreground transition-colors"
              >
                {crumb.label}
              </Link>
            )}
          </span>
        ))}
      </nav>

      {/* Right side: Theme + User */}
      <div className="flex items-center gap-1">
        <ThemeToggle />
        <div className="h-5 w-px bg-border mx-1" />

        {/* User avatar dropdown */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-muted transition-colors">
              <div className="h-7 w-7 rounded-full bg-primary flex items-center justify-center text-primary-foreground text-xs font-semibold shrink-0">
                {userInitials}
              </div>
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuLabel className="font-normal">
              <div className="flex flex-col space-y-1">
                <p className="text-sm font-medium leading-none">
                  {user?.displayName ?? user?.email ?? "Unknown"}
                </p>
                {user?.displayName && (
                  <p className="text-xs leading-none text-muted-foreground">
                    {user.email}
                  </p>
                )}
                <div className="pt-1">
                  <Badge
                    variant="secondary"
                    className="text-[10px] px-1.5 py-0 font-mono rounded-sm bg-primary/10 text-primary"
                  >
                    {user?.role ? formatRole(user.role) : "Unknown"}
                  </Badge>
                </div>
              </div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={() => logout()}
              className="text-destructive focus:text-destructive cursor-pointer"
            >
              <LogOut className="mr-2 h-4 w-4" />
              Sign out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
