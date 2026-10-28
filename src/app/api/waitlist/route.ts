import { after } from "next/server";
import { handleTicket, handleWaitlist } from "@/lib/waitlist";

export const dynamic = "force-dynamic";

export function GET(request: Request): Response {
  return handleTicket(request);
}

export function POST(request: Request): Promise<Response> {
  return handleWaitlist(request, {
    defer(task) {
      after(task);
    },
  });
}
