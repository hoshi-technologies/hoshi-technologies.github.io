import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import { ensureMember } from "../loyalty.server";
import { syncMemberTag } from "../levels.server";

interface CustomerPayload {
  id: number;
  email?: string | null;
  first_name?: string | null;
  last_name?: string | null;
}

export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop, payload, admin } = await authenticate.webhook(request);
  const customer = payload as CustomerPayload;
  try {
    // Crée le membre et crédite le bonus de bienvenue
    const member = await ensureMember(shop, {
      id: customer.id,
      email: customer.email,
      firstName: customer.first_name,
      lastName: customer.last_name,
    });
    if (admin) await syncMemberTag(admin, shop, member.id);
  } catch (error) {
    console.error("customers/create", error);
    return new Response(null, { status: 500 });
  }
  return new Response();
};
