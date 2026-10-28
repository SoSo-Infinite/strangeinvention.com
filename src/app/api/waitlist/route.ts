import { after } from "next/server";
import { handleWaitlist } from "@/lib/waitlist";

export const dynamic = "force-dynamic";

export function POST(request: Request): Promise<Response> {
  return handleWaitlist(request, {
    defer(task) {
      after(task);
    },
  });
}
