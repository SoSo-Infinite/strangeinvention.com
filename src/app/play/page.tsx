import { affiliateLinksConfigured } from "@/play/affiliate";
import { toClientCatalog } from "@/play/catalog";
import { loadCatalog } from "@/play/load-catalog";
import { guardCheckoutEnv, storageConfigured } from "@/play/stripe-guard";
import { PlayFrame } from "@/play/ui/Frame";
import { PlayClient } from "./play-client";

export const dynamic = "force-dynamic";

export default async function PlayPage() {
  const catalog = toClientCatalog(await loadCatalog());
  const checkout = guardCheckoutEnv(process.env);
  return (
    <PlayFrame>
      <PlayClient
        catalog={catalog}
        checkoutReady={checkout.ok && storageConfigured(process.env)}
        affiliateReady={affiliateLinksConfigured(process.env.EBAY_EPN_CAMPID)}
      />
    </PlayFrame>
  );
}
