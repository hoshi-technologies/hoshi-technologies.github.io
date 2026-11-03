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
import { ColorDot, useActionToast, useMemberName } from "../components/ui";
import { useI18n } from "../i18n/react";
import { errorPayload } from "../errors";
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
        message: {
          key: created ? "members.joined" : "members.tierUpdated",
          params: { name: [member.firstName, member.lastName].filter(Boolean).join(" ") || member.email || "" },
        },
      };
    } catch (e) {
      return { error: errorPayload(e) };
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
    message: imported
      ? { key: "members.imported", params: { count: imported } }
      : { key: "members.allImported" },
  };
};

export default function Members() {
  const data = useLoaderData<typeof loader>();
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const fetcher = useFetcher<typeof action>();
  useActionToast(fetcher.data);
  const { t, number } = useI18n();
  const memberName = useMemberName();
  const [search, setSearch] = useState(data.q);

  useEffect(() => {
    if (search === data.q) return;
    const timer = setTimeout(() => {
      const next = new URLSearchParams(params);
      if (search) next.set("q", search);
      else next.delete("q");
      next.delete("page");
      setParams(next, { replace: true });
    }, 300);
    return () => clearTimeout(timer);
  }, [search, data.q, params, setParams]);

  const setParam = (key: string, value: string) => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    if (key !== "page") next.delete("page");
    setParams(next);
  };

  return (
    <s-page heading={t("members.title")}>
      <s-button slot="primary-action" variant="primary" onClick={() => showModal("add-member-modal")}>
        {t("members.add")}
      </s-button>
      <s-button
        slot="secondary-actions"
        onClick={() => fetcher.submit({ intent: "import" }, { method: "POST", encType: "application/json" })}
        {...(fetcher.state !== "idle" ? { loading: true } : {})}
      >
        {t("members.importAll")}
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
              label={t("members.search")}
              labelAccessibilityVisibility="exclusive"
              placeholder={t("members.searchPlaceholder")}
              value={search}
              onInput={(e) => setSearch(e.currentTarget.value)}
            />
            <s-select
              label={t("members.tier")}
              labelAccessibilityVisibility="exclusive"
              value={data.tierFilter}
              onChange={(e) => setParam("tier", e.currentTarget.value)}
            >
              <s-option value="">{t("members.allTiers")}</s-option>
              {data.tiers.map((t) => (
                <s-option key={t.id} value={t.id}>
                  {t.name}
                </s-option>
              ))}
            </s-select>
            <s-select
              label={t("members.sort")}
              labelAccessibilityVisibility="exclusive"
              value={data.sort}
              onChange={(e) => setParam("sort", e.currentTarget.value)}
            >
              <s-option value="points">{t("members.sortPoints")}</s-option>
              <s-option value="recent">{t("members.sortRecent")}</s-option>
            </s-select>
          </s-grid>
          <s-table-header-row>
            <s-table-header listSlot="primary">{t("common.customer")}</s-table-header>
            <s-table-header listSlot="secondary">{t("members.email")}</s-table-header>
            <s-table-header>{t("members.tier")}</s-table-header>
            <s-table-header format="numeric">{t("members.balance")}</s-table-header>
            <s-table-header format="numeric">{t("members.lifetime")}</s-table-header>
            <s-table-header format="numeric">{t("members.orders")}</s-table-header>
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
                      {m.tier.manual && <s-badge>{t("members.assigned")}</s-badge>}
                    </s-stack>
                  ) : (
                    "—"
                  )}
                </s-table-cell>
                <s-table-cell>
                  <s-text type="strong">{number(m.points)}</s-text>
                </s-table-cell>
                <s-table-cell>{number(m.lifetimePoints)}</s-table-cell>
                <s-table-cell>{number(m.ordersCount)}</s-table-cell>
              </s-table-row>
            ))}
          </s-table-body>
        </s-table>
        {data.members.length === 0 && (
          <s-stack gap="small" alignItems="center" padding="large">
            <span style={{ fontSize: 40 }} aria-hidden="true">👥</span>
            <s-text color="subdued">
              {data.q || data.tierFilter
                ? t("members.noResults")
                : t("members.empty")}
            </s-text>
          </s-stack>
        )}
      </s-section>
      <s-text color="subdued">{t("members.total", { count: data.total })}</s-text>

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
  const { t } = useI18n();
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
    <s-modal id="add-member-modal" heading={t("addMember.title")} size="large">
      {!selected ? (
        <s-stack gap="base">
          <s-search-field
            label={t("addMember.search")}
            placeholder={t("addMember.searchPlaceholder")}
            value={query}
            onInput={(e) => setQuery(e.currentTarget.value)}
          />
          {search.state === "loading" && results.length === 0 ? (
            <s-stack alignItems="center" padding="base">
              <s-spinner accessibilityLabel={t("addMember.searching")} />
            </s-stack>
          ) : results.length === 0 ? (
            <s-text color="subdued">{t("addMember.noResults")}</s-text>
          ) : (
            <s-stack gap="small-200">
              {results.map((c) => (
                <s-clickable key={c.id} onClick={() => setSelected(c)} padding="small" borderRadius="base" border="base">
                  <s-stack direction="inline" justifyContent="space-between" alignItems="center" gap="base">
                    <s-stack gap="none">
                      <s-text type="strong">{c.name}</s-text>
                      <s-text color="subdued">
                        {c.email ?? t("addMember.noEmail")} · {t("addMember.orders", { count: c.orders })}
                      </s-text>
                    </s-stack>
                    {c.memberId ? <s-badge tone="success">{t("addMember.alreadyMember")}</s-badge> : <s-badge>{t("addMember.choose")}</s-badge>}
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
                <s-text color="subdued">{selected.email ?? t("addMember.noEmail")}</s-text>
              </s-stack>
              <s-button variant="tertiary" onClick={() => setSelected(null)}>
                {t("common.change")}
              </s-button>
            </s-stack>
          </s-box>
          <s-select
            label={t("addMember.tierLabel")}
            details={t("addMember.tierDetails")}
            value={tierId}
            onChange={(e) => setTierId(e.currentTarget.value)}
          >
            <s-option value="">{t("addMember.autoTier", { pointsName })}</s-option>
            {tiers.map((tier) => (
              <s-option key={tier.id} value={tier.id}>
                {tier.mode === "MANUAL" ? t("addMember.invitationTier", { name: tier.name }) : tier.name}
              </s-option>
            ))}
          </s-select>
          {!selected.memberId && signupPoints > 0 && (
            <s-checkbox
              label={t("addMember.welcomeBonus", { points: signupPoints, pointsName })}
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
        {selected?.memberId ? t("addMember.update") : t("addMember.submit")}
      </s-button>
      <s-button slot="secondary-actions" commandFor="add-member-modal" command="--hide">
        {t("common.cancel")}
      </s-button>
    </s-modal>
  );
}

export const headers: HeadersFunction = (headersArgs) =>
  boundary.headers(headersArgs);
