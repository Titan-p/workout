import { NextResponse } from "next/server";

export function okJson(payload: unknown, init?: ResponseInit) {
  return NextResponse.json(payload, init);
}

export function errorJson(error: unknown, status = 400) {
  const message = error instanceof Error
    ? error.message
    : error && typeof error === "object" && "message" in error
      ? String((error as { message?: unknown }).message || "请求失败")
      : String(error || "请求失败");
  return NextResponse.json({ error: message }, { status });
}

export async function readJson(request: Request): Promise<Record<string, unknown>> {
  try {
    const payload = await request.json();
    return payload && typeof payload === "object" ? payload as Record<string, unknown> : {};
  } catch {
    return {};
  }
}
