import type { OrderStatus } from "./orders";

export function statusLabel(status: OrderStatus) {
  switch (status) {
    case "pending":
      return "Not paid yet";
    case "paid":
      return "Paid";
    case "fulfilling":
      return "Being packed";
    case "shipped":
      return "On the way";
    case "payment_failed":
      return "Payment did not go through";
    case "canceled":
      return "Canceled";
  }
}
