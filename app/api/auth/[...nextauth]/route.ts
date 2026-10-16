import { handlers } from "@/auth";
import { BASE_PATH } from "@/lib/base-path";
import { getSiteUrl } from "@/lib/site-url";
import { popRecentAuthError } from "@/lib/auth-diagnostics";
import { NextRequest } from "next/server";

function withNormalizedRequest(req: NextRequest): NextRequest {
  const url = new URL(req.url);

  // Normalize protocol from reverse proxy (Traefik/Coolify SSL termination)
  const forwardedProto = req.headers.get("x-forwarded-proto");
  const isLocal =
    url.hostname === "localhost" ||
    url.hostname === "127.0.0.1" ||
    url.hostname === "0.0.0.0";
  const proto = forwardedProto || (isLocal ? "http" : "https");
  url.protocol = `${proto}:`;

  // Normalize host from reverse proxy
  const forwardedHost = req.headers.get("x-forwarded-host");
  const host = forwardedHost || req.headers.get("host") || url.host;
  url.host = host;

  // Clear internal container port if behind public reverse proxy
  if (
    url.protocol === "https:" &&
    (url.port === "3000" || url.port === "3001")
  ) {
    url.port = "";
  }
  if (forwardedHost && !forwardedHost.includes(":")) {
    url.port = "";
  }

  // Restore subpath if stripped by Next.js router
  if (!url.pathname.startsWith(BASE_PATH)) {
    url.pathname = `${BASE_PATH}${url.pathname}`;
  }

  return new NextRequest(url, req);
}

function normalizeResponse(response: Response): Response {
  const location = response.headers.get("Location");
  if (!location) {
    return response;
  }

  let targetUrl: URL | null = null;
  try {
    targetUrl = new URL(location);
    if (
      !targetUrl.pathname.startsWith(BASE_PATH) &&
      (targetUrl.pathname === "/login" || targetUrl.pathname.startsWith("/login/"))
    ) {
      targetUrl.pathname = `${BASE_PATH}${targetUrl.pathname}`;
    }
  } catch {
    if (
      location.startsWith("/login") &&
      !location.startsWith(`${BASE_PATH}/login`)
    ) {
      targetUrl = new URL(`${BASE_PATH}${location}`, new URL(getSiteUrl()).origin);
    }
  }

  const recentReason = popRecentAuthError();
  if (location.includes("error=") && recentReason && targetUrl) {
    targetUrl.searchParams.set("reason", recentReason);
  }

  const finalLocation = targetUrl ? targetUrl.toString() : location;

  if (location.includes("error=")) {
    console.error("[AUTH_REDIRECT_ERROR]", {
      location: finalLocation,
      reason: recentReason,
      status: response.status,
    });
  }

  if (finalLocation === location) {
    return response;
  }

  // Use a new Response to avoid "TypeError: immutable" on guarded headers
  const newHeaders = new Headers(response.headers);
  newHeaders.set("Location", finalLocation);

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: newHeaders,
  });
}

export async function GET(req: NextRequest) {
  try {
    const res = await handlers.GET(withNormalizedRequest(req));
    return normalizeResponse(res);
  } catch (error) {
    console.error("[auth] GET handler threw exception:", error);
    const reason = error instanceof Error ? error.message : String(error);
    const redirectUrl = new URL(
      `${BASE_PATH}/login?error=Configuration&reason=${encodeURIComponent(reason)}`,
      req.nextUrl.origin,
    );
    return Response.redirect(redirectUrl.toString());
  }
}

export async function POST(req: NextRequest) {
  try {
    const res = await handlers.POST(withNormalizedRequest(req));
    return normalizeResponse(res);
  } catch (error) {
    console.error("[auth] POST handler threw exception:", error);
    const reason = error instanceof Error ? error.message : String(error);
    const redirectUrl = new URL(
      `${BASE_PATH}/login?error=Configuration&reason=${encodeURIComponent(reason)}`,
      req.nextUrl.origin,
    );
    return Response.redirect(redirectUrl.toString());
  }
}
