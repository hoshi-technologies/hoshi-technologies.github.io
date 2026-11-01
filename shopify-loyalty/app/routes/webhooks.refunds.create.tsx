import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import { handleRefund } from "../loyalty.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop, payload } = await authenticate.webhook(request);
  try {
    await handleRefund(shop, payload as Parameters<typeof handleRefund>[1]);
  } catch (error) {
    console.error("refunds/create", error);
    return new Response(null, { status: 500 });
  }
  return new Response();
};
