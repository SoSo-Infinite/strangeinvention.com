export const CARRIERS = ["USPS", "UPS", "FedEx", "DHL", "Other"] as const;
export type Carrier = (typeof CARRIERS)[number];

export function trackingUrl(carrier: string, trackingNumber: string) {
  const number = encodeURIComponent(trackingNumber.trim());
  switch (carrier) {
    case "USPS":
      return `https://tools.usps.com/go/TrackConfirmAction?tLabels=${number}`;
    case "UPS":
      return `https://www.ups.com/track?tracknum=${number}`;
    case "FedEx":
      return `https://www.fedex.com/fedextrack/?trknbr=${number}`;
    case "DHL":
      return `https://www.dhl.com/us-en/home/tracking.html?tracking-id=${number}`;
    default:
      return null;
  }
}

export function cleanTrackingNumber(value: string) {
  const trimmed = value.trim();
  if (!/^[A-Za-z0-9][A-Za-z0-9 -]{3,39}$/.test(trimmed)) return null;
  return trimmed;
}

export function asCarrier(value: string): Carrier | null {
  return CARRIERS.find((carrier) => carrier === value) ?? null;
}
