import { NextRequest, NextResponse } from "next/server";
import { getSessionToken, getControlPlaneUrl } from "@/lib/auth";

// Disable static caching for all proxy routes; required for SSE streaming to work
export const dynamic = "force-dynamic";

async function proxyRequest(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> },
) {
  const token = await getSessionToken();

  if (!token) {
    return NextResponse.json(
      { success: false, error: { message: "Not authenticated" } },
      { status: 401 },
    );
  }

  const { path } = await params;
  const controlPlaneUrl = getControlPlaneUrl();
  const targetPath = path.join("/");
  const searchParams = request.nextUrl.searchParams.toString();
  const url = `${controlPlaneUrl}/api/v1/${targetPath}${searchParams ? `?${searchParams}` : ""}`;

  const headers: HeadersInit = {
    Authorization: `Bearer ${token}`,
  };

  // Check if this is a streaming endpoint (SSE)
  if (targetPath.endsWith("audit/stream")) {
    try {
      const res = await fetch(url, {
        headers,
      });

      if (!res.ok) {
        return NextResponse.json(
          { success: false, error: { message: `Upstream error ${res.status}` } },
          { status: res.status },
        );
      }

      // Stream the SSE response back
      return new Response(res.body, {
        headers: {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache",
          Connection: "keep-alive",
        },
      });
    } catch {
      return NextResponse.json(
        { success: false, error: { message: "Stream connection failed" } },
        { status: 502 },
      );
    }
  }

  // Standard proxy for non-streaming requests
  const fetchOptions: RequestInit = {
    method: request.method,
    headers,
  };

  // Forward body for non-GET requests
  if (request.method !== "GET" && request.method !== "HEAD") {
    const contentType = request.headers.get("content-type");
    if (contentType?.includes("application/json")) {
      headers["Content-Type"] = "application/json";
      fetchOptions.body = await request.text();
    }
  }

  try {
    const res = await fetch(url, fetchOptions);
    const upstreamContentType = res.headers.get("content-type") ?? "";
    const isJsonResponse =
      upstreamContentType === "" || upstreamContentType.startsWith("application/json");

    if (isJsonResponse) {
      const data = await res.json();
      return NextResponse.json(data, { status: res.status });
    }

    // Non-JSON response (binary PDF, text/csv, etc.) -- pipe raw body through
    if (!res.body) {
      return NextResponse.json(
        { success: false, error: { message: "Empty upstream response body" } },
        { status: 502 },
      );
    }

    const responseHeaders = new Headers();
    responseHeaders.set("Content-Type", upstreamContentType);
    const contentDisposition = res.headers.get("content-disposition");
    if (contentDisposition) {
      responseHeaders.set("Content-Disposition", contentDisposition);
    }
    const contentLength = res.headers.get("content-length");
    if (contentLength) {
      responseHeaders.set("Content-Length", contentLength);
    }

    return new Response(res.body, {
      status: res.status,
      headers: responseHeaders,
    });
  } catch {
    // JSON parse failures are now scoped only to actual JSON responses
    return NextResponse.json(
      { success: false, error: { message: "Proxy request failed" } },
      { status: 502 },
    );
  }
}

export const GET = proxyRequest;
export const POST = proxyRequest;
export const PUT = proxyRequest;
export const DELETE = proxyRequest;
