import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import { handleOrderPaid } from "../loyalty.server";
import { syncMemberTag } from "../levels.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop, payload, admin } = await authenticate.webhook(request);
  try {
    const memberId = await handleOrderPaid(shop, payload as Parameters<typeof handleOrderPaid>[1]);
    // Le client a peut-être changé de niveau : mise à jour de son étiquette Shopify.
    if (memberId && admin) await syncMemberTag(admin, shop, memberId);
  } catch (error) {
    console.error("orders/paid", error);
    return new Response(null, { status: 500 }); // Shopify réessaiera
  }
  return new Response();
};
