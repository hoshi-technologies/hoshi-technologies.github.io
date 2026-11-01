import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import { handleOrderPaid } from "../loyalty.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop, payload } = await authenticate.webhook(request);
  try {
    await handleOrderPaid(shop, payload as Parameters<typeof handleOrderPaid>[1]);
  } catch (error) {
    console.error("orders/paid", error);
    return new Response(null, { status: 500 }); // Shopify réessaiera
  }
  return new Response();
};
