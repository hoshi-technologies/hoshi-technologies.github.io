import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import { handleRefund } from "../loyalty.server";
import { syncMemberTag } from "../levels.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop, payload, admin } = await authenticate.webhook(request);
  try {
    const memberId = await handleRefund(shop, payload as Parameters<typeof handleRefund>[1]);
    if (memberId && admin) await syncMemberTag(admin, shop, memberId);
  } catch (error) {
    console.error("refunds/create", error);
    return new Response(null, { status: 500 });
  }
  return new Response();
};
