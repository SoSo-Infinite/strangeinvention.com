import { NextRequest, NextResponse } from "next/server";
import { DESK_COOKIE } from "@/play/desk-auth";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const response = NextResponse.redirect(new URL("/desk", request.url), 303);
  response.cookies.set(DESK_COOKIE, "", { httpOnly: true, path: "/", maxAge: 0 });
  return response;
}
