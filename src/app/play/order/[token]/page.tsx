import { toPublicOrder } from "@/play/orders";
import { getOrderStore } from "@/play/store";
import { PlayFrame } from "@/play/ui/Frame";
import { OrderView } from "@/play/ui/OrderView";

export const dynamic = "force-dynamic";

const TOKEN = /^[a-f0-9]{64}$/;

export default async function OrderStatusPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  if (!TOKEN.test(token)) {
    return (
      <PlayFrame>
        <div className="order-wrap">
          <p>This order link is not valid.</p>
        </div>
      </PlayFrame>
    );
  }
  let view: ReturnType<typeof toPublicOrder> | null = null;
  try {
    const order = await (await getOrderStore()).get(token);
    if (order) view = toPublicOrder(order);
  } catch {
    view = null;
  }
  return (
    <PlayFrame>
      <div className="order-wrap">
        {view ? <OrderView initial={view} token={token} /> : <p>This order link is not valid.</p>}
      </div>
    </PlayFrame>
  );
}
