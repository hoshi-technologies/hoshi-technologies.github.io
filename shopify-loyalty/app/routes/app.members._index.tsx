import { useEffect, useState } from "react";
import type {
  ActionFunctionArgs,
  HeadersFunction,
  LoaderFunctionArgs,
} from "react-router";
import { useFetcher, useLoaderData, useNavigate, useSearchParams } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import type { Prisma } from "../generated/prisma/client";
import { authenticate } from "../shopify.server";
import { readJson } from "../utils.server";
import db from "../db.server";
import {
  addMemberManually,
  customerGid,
  getProgram,
  getTiers,
  memberTier,
} from "../loyalty.server";
import { syncMemberTag } from "../levels.server";
import { ColorDot, formatNumber, memberName, useActionToast } from "../components/ui";
import { hideModal, showModal } from "../components/modal";
import type { loader as searchLoader } from "./app.customers.search";

const PAGE_SIZE = 25;

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;
  const url = new URL(request.url);
  const q = (url.searchParams.get("q") || "").trim();
  const page = Math.max(1, Number(url.searchParams.get("page")) || 1);
  const sort = url.searchParams.get("sort") === "recent" ? "recent" : "points";
  const tierFilter = url.searchParams.get("tier") || "";

  const [program, tiers] = await Promise.all([getProgram(shop), getTiers(shop)]);

  // Filtre par niveau : niveau imposé, ou plage de points pour un niveau automatique.
  let tierWhere: Prisma.MemberWhereInput = {};
  const selected = tiers.find((t) => t.id === tierFilter);
  if (selected?.mode === "MANUAL") {
    tierWhere = { manualTierId: selected.id };
  } else if (selected) {
    const autoTiers = tiers.filter((t) => t.mode !== "MANUAL");
    const next = autoTiers.find((t) => t.minPoints > selected.minPoints);
    tierWhere = {
      manualTierId: null,
      lifetimePoints: { gte: selected.minPoints, ...(next ? { lt: next.minPoints } : {}) },
    };
  }

  const where: Prisma.MemberWhereInput = {
    shop,
    ...tierWhere,
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
  const [total, members] = await Promise.all([
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
    tierFilter,
    total,
    pages: Math.max(1, Math.ceil(total / PAGE_SIZE)),
    pointsName: program.pointsName,
    signupPoints: program.signupPoints,
    tiers: tiers.map((t) => ({ id: t.id, name: t.name, mode: t.mode, color: t.color })),
    members: members.map((m) => {
      const tier = memberTier(tiers, m);
      return {
        ...m,
        tier: tier ? { name: tier.name, color: tier.color, manual: Boolean(m.manualTierId) } : null,
      };
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

export const action = async ({ request }: ActionFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);
  const shop = session.shop;
  const data = await readJson(request);

  // Ajout d'un client précis, avec niveau éventuel
  if (data.intent === "add") {
    try {
      const { member, created } = await addMemberManually(
        shop,
        {
          id: String(data.customerId),
          email: data.email,
          firstName: data.firstName,
          lastName: data.lastName,
        },
        {
          manualTierId: data.tierId ? String(data.tierId) : null,
          welcomeBonus: Boolean(data.welcomeBonus),
        },
      );
      await syncMemberTag(admin, shop, member.id);
      return {
        ok: true,
        added: member.id,
        message: created ? `${memberName(member)} a rejoint le programme` : `Niveau de ${memberName(member)} mis à jour`,
      };
    } catch (e) {
      return { error: e instanceof Error ? e.message : "Erreur inattendue" };
    }
  }

  // Import de tous les clients existants (sans bonus)
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
      const member = await db.member.create({
        data: {
          shop,
          customerId,
          email: c.defaultEmailAddress?.emailAddress ?? null,
          firstName: c.firstName,
          lastName: c.lastName,
          ordersCount: Number(c.numberOfOrders) || 0,
        },
      });
      await syncMemberTag(admin, shop, member.id);
      imported++;
    }
    if (!conn.pageInfo.hasNextPage) break;
    cursor = conn.pageInfo.endCursor ?? null;
  }

  return {
    ok: true,
    message: imported ? `${imported} client(s) importé(s)` : "Tous vos clients sont déjà membres",
  };
};

export default function Members() {
  const data = useLoaderData<typeof loader>();
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const fetcher = useFetcher<typeof action>();
  useActionToast(fetcher.data);
  const [search, setSearch] = useState(data.q);

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

  const setParam = (key: string, value: string) => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    if (key !== "page") next.delete("page");
    setParams(next);
  };

  return (
    <s-page heading="Membres">
      <s-button slot="primary-action" variant="primary" onClick={() => showModal("add-member-modal")}>
        Ajouter un client
      </s-button>
      <s-button
        slot="secondary-actions"
        onClick={() => fetcher.submit({ intent: "import" }, { method: "POST", encType: "application/json" })}
        {...(fetcher.state !== "idle" ? { loading: true } : {})}
      >
        Importer tous mes clients
      </s-button>

      <s-section padding="none">
        <s-table
          paginate={data.pages > 1}
          hasPreviousPage={data.page > 1}
          hasNextPage={data.page < data.pages}
          onPreviousPage={() => setParam("page", String(data.page - 1))}
          onNextPage={() => setParam("page", String(data.page + 1))}
        >
          <s-grid slot="filters" gridTemplateColumns="1fr auto auto" gap="small">
            <s-search-field
              label="Rechercher"
              labelAccessibilityVisibility="exclusive"
              placeholder="Nom ou e-mail"
              value={search}
              onInput={(e) => setSearch(e.currentTarget.value)}
            />
            <s-select
              label="Niveau"
              labelAccessibilityVisibility="exclusive"
              value={data.tierFilter}
              onChange={(e) => setParam("tier", e.currentTarget.value)}
            >
              <s-option value="">Tous les niveaux</s-option>
              {data.tiers.map((t) => (
                <s-option key={t.id} value={t.id}>
                  {t.name}
                </s-option>
              ))}
            </s-select>
            <s-select
              label="Trier"
              labelAccessibilityVisibility="exclusive"
              value={data.sort}
              onChange={(e) => setParam("sort", e.currentTarget.value)}
            >
              <s-option value="points">Plus de points</s-option>
              <s-option value="recent">Plus récents</s-option>
            </s-select>
          </s-grid>
          <s-table-header-row>
            <s-table-header listSlot="primary">Client</s-table-header>
            <s-table-header listSlot="secondary">E-mail</s-table-header>
            <s-table-header>Niveau</s-table-header>
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
                      {m.tier.manual && <s-badge>Attribué</s-badge>}
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
              {data.q || data.tierFilter
                ? "Aucun membre ne correspond à votre recherche."
                : "Aucun membre pour l'instant. Ajoutez un client ou importez tous vos clients."}
            </s-text>
          </s-stack>
        )}
      </s-section>
      <s-text color="subdued">{formatNumber(data.total)} membre(s)</s-text>

      <AddMemberModal
        tiers={data.tiers}
        signupPoints={data.signupPoints}
        pointsName={data.pointsName}
        onAdded={(id) => navigate(`/app/members/${id}`)}
      />
    </s-page>
  );
}

function AddMemberModal({
  tiers,
  signupPoints,
  pointsName,
  onAdded,
}: {
  tiers: { id: string; name: string; mode: string; color: string }[];
  signupPoints: number;
  pointsName: string;
  onAdded: (memberId: string) => void;
}) {
  const search = useFetcher<typeof searchLoader>();
  const add = useFetcher<typeof action>();
  useActionToast(add.data);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<NonNullable<typeof search.data>["customers"][number] | null>(null);
  const [tierId, setTierId] = useState("");
  const [welcomeBonus, setWelcomeBonus] = useState(true);

  // Recherche des clients Shopify pendant la saisie
  useEffect(() => {
    const t = setTimeout(() => search.load(`/app/customers/search?q=${encodeURIComponent(query)}`), 250);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);

  useEffect(() => {
    if (add.state === "idle" && add.data && "added" in add.data && add.data.added) {
      hideModal("add-member-modal");
      setSelected(null);
      onAdded(add.data.added);
    }
  }, [add.state, add.data, onAdded]);

  const results = search.data?.customers ?? [];

  return (
    <s-modal id="add-member-modal" heading="Ajouter un client au programme" size="large">
      {!selected ? (
        <s-stack gap="base">
          <s-search-field
            label="Rechercher un client Shopify"
            placeholder="Nom, e-mail ou téléphone"
            value={query}
            onInput={(e) => setQuery(e.currentTarget.value)}
          />
          {search.state === "loading" && results.length === 0 ? (
            <s-stack alignItems="center" padding="base">
              <s-spinner accessibilityLabel="Recherche" />
            </s-stack>
          ) : results.length === 0 ? (
            <s-text color="subdued">Aucun client trouvé.</s-text>
          ) : (
            <s-stack gap="small-200">
              {results.map((c) => (
                <s-clickable key={c.id} onClick={() => setSelected(c)} padding="small" borderRadius="base" border="base">
                  <s-stack direction="inline" justifyContent="space-between" alignItems="center" gap="base">
                    <s-stack gap="none">
                      <s-text type="strong">{c.name}</s-text>
                      <s-text color="subdued">
                        {c.email ?? "Pas d'e-mail"} · {c.orders} commande(s)
                      </s-text>
                    </s-stack>
                    {c.memberId ? <s-badge tone="success">Déjà membre</s-badge> : <s-badge>Choisir</s-badge>}
                  </s-stack>
                </s-clickable>
              ))}
            </s-stack>
          )}
        </s-stack>
      ) : (
        <s-stack gap="base">
          <s-box padding="base" background="subdued" borderRadius="base">
            <s-stack direction="inline" justifyContent="space-between" alignItems="center">
              <s-stack gap="none">
                <s-text type="strong">{selected.name}</s-text>
                <s-text color="subdued">{selected.email ?? "Pas d'e-mail"}</s-text>
              </s-stack>
              <s-button variant="tertiary" onClick={() => setSelected(null)}>
                Changer
              </s-button>
            </s-stack>
          </s-box>
          <s-select
            label="Niveau du client"
            details="« Automatique » : le niveau évolue selon les points. Sinon, le niveau choisi est imposé."
            value={tierId}
            onChange={(e) => setTierId(e.currentTarget.value)}
          >
            <s-option value="">Automatique (selon les {pointsName})</s-option>
            {tiers.map((t) => (
              <s-option key={t.id} value={t.id}>
                {t.name}
                {t.mode === "MANUAL" ? " (sur invitation)" : ""}
              </s-option>
            ))}
          </s-select>
          {!selected.memberId && signupPoints > 0 && (
            <s-checkbox
              label={`Offrir le bonus de bienvenue (${signupPoints} ${pointsName})`}
              checked={welcomeBonus}
              onChange={(e) => setWelcomeBonus(e.currentTarget.checked)}
            />
          )}
        </s-stack>
      )}
      <s-button
        slot="primary-action"
        variant="primary"
        disabled={!selected}
        onClick={() =>
          selected &&
          add.submit(
            {
              intent: "add",
              customerId: selected.id,
              email: selected.email,
              firstName: selected.firstName,
              lastName: selected.lastName,
              tierId,
              welcomeBonus,
            },
            { method: "POST", encType: "application/json" },
          )
        }
        {...(add.state !== "idle" ? { loading: true } : {})}
      >
        {selected?.memberId ? "Mettre à jour" : "Ajouter au programme"}
      </s-button>
      <s-button slot="secondary-actions" commandFor="add-member-modal" command="--hide">
        Annuler
      </s-button>
    </s-modal>
  );
}

export const headers: HeadersFunction = (headersArgs) =>
  boundary.headers(headersArgs);
