import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import { handleOrderPaid } from "../loyalty.server";
import { handleOrderCodes } from "../engagement.server";
import { syncMemberTag } from "../levels.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop, payload, admin } = await authenticate.webhook(request);
  try {
    const order = payload as Parameters<typeof handleOrderPaid>[1];
    const memberId = await handleOrderPaid(shop, order);
    // Codes de récompense utilisés + parrainage
    const referrerId = await handleOrderCodes(shop, order);
    // Le client (et le parrain) ont peut-être changé de niveau.
    if (admin) {
      if (memberId) await syncMemberTag(admin, shop, memberId);
      if (referrerId) await syncMemberTag(admin, shop, referrerId);
    }
  } catch (error) {
    console.error("orders/paid", error);
    return new Response(null, { status: 500 }); // Shopify réessaiera
  }
  return new Response();
};
