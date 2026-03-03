"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import type { AuthenticatedUser } from "@/types/api";

interface AuthState {
  user: AuthenticatedUser | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  login: (apiKey: string) => Promise<AuthenticatedUser>;
  logout: () => Promise<void>;
}

export function useAuth(): AuthState {
  const router = useRouter();
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery<{ success: boolean; data: AuthenticatedUser }>({
    queryKey: ["auth", "me"],
    queryFn: async () => {
      const res = await fetch("/api/auth/me");
      if (!res.ok) throw new Error("Not authenticated");
      return res.json();
    },
    retry: false,
    staleTime: 5 * 60 * 1000, // 5 minutes
  });

  const user = data?.data ?? null;

  async function login(apiKey: string): Promise<AuthenticatedUser> {
    const res = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ apiKey }),
    });

    if (!res.ok) {
      const error = await res.json().catch(() => ({ error: { message: "Login failed" } }));
      throw new Error(error.error?.message || "Login failed");
    }

    const result = await res.json();
    // Invalidate the auth query to refetch user data
    await queryClient.invalidateQueries({ queryKey: ["auth", "me"] });
    router.push("/");
    return result.data;
  }

  async function logout(): Promise<void> {
    await fetch("/api/auth/logout", { method: "POST" });
    queryClient.clear();
    router.push("/login");
  }

  return {
    user,
    isLoading,
    isAuthenticated: !!user,
    login,
    logout,
  };
}
