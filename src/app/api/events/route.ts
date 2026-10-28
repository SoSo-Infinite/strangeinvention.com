import { handleClientEvent } from "@/lib/waitlist";

export const dynamic = "force-dynamic";

export function POST(request: Request): Promise<Response> {
  return handleClientEvent(request);
}
