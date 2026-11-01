import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import db from "../db.server";
import { customerGid, redactCustomer, redactShop } from "../loyalty.server";

/** Webhooks RGPD obligatoires pour les applications publiques. */
export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop, topic, payload } = await authenticate.webhook(request);
  const customerId = (payload as { customer?: { id?: number } }).customer?.id;

  switch (topic) {
    case "CUSTOMERS_DATA_REQUEST": {
      // Les données détenues sont visibles dans l'admin (page Membres).
      // On les journalise pour que le marchand puisse les transmettre.
      if (customerId) {
        const member = await db.member.findUnique({
          where: { shop_customerId: { shop, customerId: customerGid(customerId) } },
          include: { transactions: true, redemptions: true },
        });
        console.log("customers/data_request", shop, JSON.stringify(member));
      }
      break;
    }
    case "CUSTOMERS_REDACT":
      if (customerId) await redactCustomer(shop, customerId);
      break;
    case "SHOP_REDACT":
      await redactShop(shop);
      break;
  }
  return new Response();
};
