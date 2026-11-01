import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import db from "../db.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop, session, topic } = await authenticate.webhook(request);
  console.log(`Received ${topic} webhook for ${shop}`);
  // Les données du programme sont conservées (réinstallation possible) ;
  // elles sont supprimées par le webhook shop/redact 48 h après la désinstallation.
  if (session) {
    await db.session.deleteMany({ where: { shop } });
  }
  return new Response();
};
