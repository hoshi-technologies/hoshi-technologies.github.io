import { useEffect, useState } from "react";
import type {
  ActionFunctionArgs,
  HeadersFunction,
  LoaderFunctionArgs,
} from "react-router";
import { useFetcher, useLoaderData, useNavigate, useSearchParams } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import db from "../db.server";
import { customerGid, getProgram, getTiers, tierFor } from "../loyalty.server";
import { ColorDot, formatNumber, memberName, useActionToast } from "../components/ui";

const PAGE_SIZE = 25;

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;
  const url = new URL(request.url);
  const q = (url.searchParams.get("q") || "").trim();
  const page = Math.max(1, Number(url.searchParams.get("page")) || 1);
  const sort = url.searchParams.get("sort") === "recent" ? "recent" : "points";

  const where = {
    shop,
    ...(q
      ? {
          OR: [
            { email: { contains: q } },
            { firstName: { contains: q } },
            { lastName: { contains: q } },
          ],
        }
      : {}),
  };
  const [program, tiers, total, members] = await Promise.all([
    getProgram(shop),
    getTiers(shop),
    db.member.count({ where }),
    db.member.findMany({
      where,
      orderBy: sort === "recent" ? { createdAt: "desc" } : { points: "desc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
  ]);

  return {
    q,
    page,
    sort,
    total,
    pages: Math.max(1, Math.ceil(total / PAGE_SIZE)),
    pointsName: program.pointsName,
    members: members.map((m) => {
      const tier = tierFor(tiers, m.lifetimePoints);
      return { ...m, tier: tier ? { name: tier.name, color: tier.color } : null };
    }),
  };
};

const CUSTOMERS_QUERY = `#graphql
  query LoyaltyCustomers($cursor: String) {
    customers(first: 250, after: $cursor) {
      nodes {
        id
        firstName
        lastName
        defaultEmailAddress { emailAddress }
        numberOfOrders
      }
      pageInfo { hasNextPage endCursor }
    }
  }`;

interface CustomerPage {
  nodes: {
    id: string;
    firstName: string | null;
    lastName: string | null;
    defaultEmailAddress: { emailAddress: string | null } | null;
    numberOfOrders: string;
  }[];
  pageInfo: { hasNextPage: boolean; endCursor: string | null };
}

/** Importe les clients existants de la boutique comme membres (sans bonus). */
export const action = async ({ request }: ActionFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);
  const shop = session.shop;
  let cursor: string | null = null;
  let imported = 0;

  for (let i = 0; i < 20; i++) {
    const response: Response = await admin.graphql(CUSTOMERS_QUERY, { variables: { cursor } });
    const json = (await response.json()) as { data?: { customers?: CustomerPage } };
    const conn = json.data?.customers;
    if (!conn) break;

    for (const c of conn.nodes) {
      const customerId = customerGid(c.id);
      const exists = await db.member.findUnique({
        where: { shop_customerId: { shop, customerId } },
        select: { id: true },
      });
      if (exists) continue;
      await db.member.create({
        data: {
          shop,
          customerId,
          email: c.defaultEmailAddress?.emailAddress ?? null,
          firstName: c.firstName,
          lastName: c.lastName,
          ordersCount: Number(c.numberOfOrders) || 0,
        },
      });
      imported++;
    }
    if (!conn.pageInfo.hasNextPage) break;
    cursor = conn.pageInfo.endCursor ?? null;
  }

  return {
    ok: true,
    message: imported
      ? `${imported} client(s) importé(s)`
      : "Tous vos clients sont déjà membres",
  };
};

export default function Members() {
  const data = useLoaderData<typeof loader>();
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const fetcher = useFetcher<typeof action>();
  useActionToast(fetcher.data);
  const [search, setSearch] = useState(data.q);

  // Recherche avec un léger délai pendant la saisie
  useEffect(() => {
    if (search === data.q) return;
    const t = setTimeout(() => {
      const next = new URLSearchParams(params);
      if (search) next.set("q", search);
      else next.delete("q");
      next.delete("page");
      setParams(next, { replace: true });
    }, 300);
    return () => clearTimeout(t);
  }, [search, data.q, params, setParams]);

  const goTo = (page: number) => {
    const next = new URLSearchParams(params);
    next.set("page", String(page));
    setParams(next);
  };

  return (
    <s-page heading="Membres">
      <s-button
        slot="primary-action"
        onClick={() => fetcher.submit({}, { method: "POST" })}
        {...(fetcher.state !== "idle" ? { loading: true } : {})}
      >
        Importer mes clients existants
      </s-button>

      <s-section padding="none">
        <s-table
          paginate={data.pages > 1}
          hasPreviousPage={data.page > 1}
          hasNextPage={data.page < data.pages}
          onPreviousPage={() => goTo(data.page - 1)}
          onNextPage={() => goTo(data.page + 1)}
        >
          <s-grid slot="filters" gridTemplateColumns="1fr auto" gap="small">
            <s-search-field
              label="Rechercher"
              labelAccessibilityVisibility="exclusive"
              placeholder="Nom ou e-mail"
              value={search}
              onInput={(e) => setSearch(e.currentTarget.value)}
            />
            <s-select
              label="Trier"
              labelAccessibilityVisibility="exclusive"
              value={data.sort}
              onChange={(e) => {
                const next = new URLSearchParams(params);
                next.set("sort", e.currentTarget.value);
                setParams(next);
              }}
            >
              <s-option value="points">Plus de points</s-option>
              <s-option value="recent">Plus récents</s-option>
            </s-select>
          </s-grid>
          <s-table-header-row>
            <s-table-header listSlot="primary">Client</s-table-header>
            <s-table-header listSlot="secondary">E-mail</s-table-header>
            <s-table-header>Palier</s-table-header>
            <s-table-header format="numeric">Solde</s-table-header>
            <s-table-header format="numeric">Cumulés</s-table-header>
            <s-table-header format="numeric">Commandes</s-table-header>
          </s-table-header-row>
          <s-table-body>
            {data.members.map((m) => (
              <s-table-row key={m.id} clickDelegate={`member-${m.id}`}>
                <s-table-cell>
                  <s-link id={`member-${m.id}`} onClick={() => navigate(`/app/members/${m.id}`)}>
                    {memberName(m)}
                  </s-link>
                </s-table-cell>
                <s-table-cell>{m.email ?? "—"}</s-table-cell>
                <s-table-cell>
                  {m.tier ? (
                    <s-stack direction="inline" gap="small-300" alignItems="center">
                      <ColorDot color={m.tier.color} />
                      <s-text>{m.tier.name}</s-text>
                    </s-stack>
                  ) : (
                    "—"
                  )}
                </s-table-cell>
                <s-table-cell>
                  <s-text type="strong">{formatNumber(m.points)}</s-text>
                </s-table-cell>
                <s-table-cell>{formatNumber(m.lifetimePoints)}</s-table-cell>
                <s-table-cell>{m.ordersCount}</s-table-cell>
              </s-table-row>
            ))}
          </s-table-body>
        </s-table>
        {data.members.length === 0 && (
          <s-stack gap="small" alignItems="center" padding="large">
            <span style={{ fontSize: 40 }} aria-hidden="true">👥</span>
            <s-text color="subdued">
              {data.q
                ? "Aucun membre ne correspond à votre recherche."
                : "Aucun membre pour l'instant. Importez vos clients existants ou attendez les premières inscriptions."}
            </s-text>
          </s-stack>
        )}
      </s-section>
      <s-text color="subdued">
        {formatNumber(data.total)} membre(s) · {data.pointsName}
      </s-text>
    </s-page>
  );
}

export const headers: HeadersFunction = (headersArgs) =>
  boundary.headers(headersArgs);
