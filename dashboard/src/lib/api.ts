// Centralized fetch wrapper for client-side API calls.
// All calls go through the BFF proxy (/api/proxy/...), NOT directly to the control plane.

export class ApiError extends Error {
  status: number;
  code?: string;

  constructor(message: string, status: number, code?: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
  }
}

export async function api<T>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const res = await fetch(`/api/proxy${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...options.headers,
    },
  });

  if (!res.ok) {
    const error = await res
      .json()
      .catch(() => ({ error: { message: res.statusText } }));
    throw new ApiError(
      error.error?.message || `API error ${res.status}`,
      res.status,
      error.error?.code
    );
  }

  return res.json();
}
