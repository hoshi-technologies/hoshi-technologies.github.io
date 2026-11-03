/** Recherche de clients Shopify (utilisée par « Ajouter un client »). */
import type { LoaderFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import db from "../db.server";

const SEARCH = `#graphql
  query LoyaltyCustomerSearch($query: String) {
    customers(first: 10, query: $query, sortKey: UPDATED_AT, reverse: true) {
      nodes {
        id
        firstName
        lastName
        defaultEmailAddress { emailAddress }
        numberOfOrders
      }
    }
  }`;

interface SearchResult {
  data?: {
    customers?: {
      nodes: {
        id: string;
        firstName: string | null;
        lastName: string | null;
        defaultEmailAddress: { emailAddress: string | null } | null;
        numberOfOrders: string;
      }[];
    };
  };
}

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);
  const q = (new URL(request.url).searchParams.get("q") || "").trim();
  const response = await admin.graphql(SEARCH, { variables: { query: q || null } });
  const json = (await response.json()) as SearchResult;
  const nodes = json.data?.customers?.nodes ?? [];

  const existing = await db.member.findMany({
    where: { shop: session.shop, customerId: { in: nodes.map((n) => n.id) } },
    select: { customerId: true, id: true },
  });
  const memberByCustomer = new Map(existing.map((m) => [m.customerId, m.id]));

  return {
    customers: nodes.map((n) => ({
      id: n.id,
      name: [n.firstName, n.lastName].filter(Boolean).join(" ") || n.defaultEmailAddress?.emailAddress || "—",
      email: n.defaultEmailAddress?.emailAddress ?? null,
      firstName: n.firstName,
      lastName: n.lastName,
      orders: Number(n.numberOfOrders) || 0,
      memberId: memberByCustomer.get(n.id) ?? null,
    })),
  };
};
