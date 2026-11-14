import { toPublicOrder } from "@/play/orders";
import { getOrderStore } from "@/play/store";
import { PlayFrame } from "@/play/ui/Frame";
import { OrderView } from "@/play/ui/OrderView";

export const dynamic = "force-dynamic";

const TOKEN = /^[a-f0-9]{64}$/;

export default async function ThanksPage({
  searchParams,
}: {
  searchParams: Promise<{ order?: string }>;
}) {
  const { order: token } = await searchParams;
  if (!token || !TOKEN.test(token)) {
    return (
      <PlayFrame>
        <div className="order-wrap">
          <p>This order link is not valid.</p>
        </div>
      </PlayFrame>
    );
  }

  let view: ReturnType<typeof toPublicOrder> | null = null;
  let closed = false;
  try {
    const order = await (await getOrderStore()).get(token);
    if (order) view = toPublicOrder(order);
  } catch {
    closed = true;
  }
  return (
    <PlayFrame>
      <div className="order-wrap">
        {view ? (
          <OrderView initial={view} token={token} thanks />
        ) : (
          <p>{closed ? "The order page is not connected yet." : "This order link is not valid."}</p>
        )}
      </div>
    </PlayFrame>
  );
}
