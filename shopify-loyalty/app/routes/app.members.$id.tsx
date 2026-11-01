import { useEffect, useState } from "react";
import type {
  ActionFunctionArgs,
  HeadersFunction,
  LoaderFunctionArgs,
} from "react-router";
import { redirect, useFetcher, useLoaderData } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import db from "../db.server";
import {
  adjustPoints,
  getProgram,
  getTiers,
  memberTier,
  nextTier,
  numericId,
  redeemReward,
  setMemberTier,
  tierFor,
  tierPerks,
} from "../loyalty.server";
import { syncMemberTag } from "../levels.server";
import {
  ColorDot,
  PointsDelta,
  TransactionBadge,
  formatDate,
  formatNumber,
  memberName,
  useActionToast,
} from "../components/ui";

export const loader = async ({ request, params }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;
  const member = await db.member.findFirst({
    where: { id: params.id, shop },
    include: {
      transactions: { orderBy: { createdAt: "desc" }, take: 50 },
      redemptions: { orderBy: { createdAt: "desc" }, take: 20 },
    },
  });
  if (!member) throw new Response("Membre introuvable", { status: 404 });

  const [program, tiers, rewards] = await Promise.all([
    getProgram(shop),
    getTiers(shop),
    db.reward.findMany({ where: { shop, active: true }, orderBy: { pointsCost: "asc" } }),
  ]);
  return {
    member,
    pointsName: program.pointsName,
    tier: (() => {
      const t = memberTier(tiers, member);
      return t ? { ...t, perkList: tierPerks(t, program.pointsName) } : null;
    })(),
    autoTier: tierFor(tiers, member.lifetimePoints),
    next: nextTier(tiers, member),
    tiers: tiers.map((t) => ({ id: t.id, name: t.name, mode: t.mode })),
    rewards,
    customerAdminUrl: `shopify://admin/customers/${numericId(member.customerId)}`,
  };
};

export const action = async ({ request, params }: ActionFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);
  const data = await request.json();
  const memberId = String(params.id);

  try {
    if (data.intent === "tier") {
      await setMemberTier(session.shop, memberId, data.tierId ? String(data.tierId) : null);
      await syncMemberTag(admin, session.shop, memberId);
      return { ok: true, message: "Niveau mis à jour" };
    }
    if (data.intent === "remove") {
      // Retire l'étiquette de niveau dans Shopify puis supprime le membre.
      await setMemberTier(session.shop, memberId, null);
      await syncMemberTag(admin, session.shop, memberId, []); // aucun niveau → étiquette retirée
      await db.member.deleteMany({ where: { id: memberId, shop: session.shop } });
      return redirect("/app/members");
    }
    if (data.intent === "redeem") {
      const { code } = await redeemReward(admin, session.shop, memberId, String(data.rewardId));
      return { ok: true, message: `Code créé : ${code}` };
    }
    const points = Math.round(Number(data.points) || 0) * (data.direction === "remove" ? -1 : 1);
    if (!points) return { error: "Indiquez un nombre de points" };
    await adjustPoints(session.shop, memberId, points, String(data.reason || ""));
    return { ok: true, message: points > 0 ? "Points ajoutés" : "Points retirés", adjusted: true };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Une erreur est survenue" };
  }
};

export default function MemberDetail() {
  const { member, pointsName, tier, autoTier, next, rewards, customerAdminUrl, tiers } =
    useLoaderData<typeof loader>();
  const fetcher = useFetcher<typeof action>();
  useActionToast(fetcher.data);

  const [points, setPoints] = useState("100");
  const [reason, setReason] = useState("");
  const [direction, setDirection] = useState("add");
  const [rewardId, setRewardId] = useState(rewards[0]?.id ?? "");
  const [tierChoice, setTierChoice] = useState(member.manualTierId ?? "");
  useEffect(() => setTierChoice(member.manualTierId ?? ""), [member.manualTierId]);

  useEffect(() => {
    if (fetcher.data && "adjusted" in fetcher.data) setReason("");
  }, [fetcher.data]);

  const progress = next
    ? Math.min(100, Math.round(((member.lifetimePoints - (tier?.minPoints ?? 0)) / (next.minPoints - (tier?.minPoints ?? 0))) * 100))
    : 100;
  const busy = fetcher.state !== "idle";

  return (
    <s-page heading={memberName(member)}>
      <s-link slot="breadcrumb-actions" href="/app/members">
        Membres
      </s-link>
      <s-button
        slot="secondary-actions"
        href={customerAdminUrl}
        target="_blank"
      >
        Voir la fiche client
      </s-button>

      {member.email && <s-text color="subdued">{member.email}</s-text>}
      <s-section padding="none">
        <div
          style={{
            background: `linear-gradient(135deg, ${tier?.color ?? "#5C6AC4"}, #1f2140)`,
            color: "#fff",
            borderRadius: 12,
            padding: "22px 26px",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 16 }}>
            <div>
              <div style={{ opacity: 0.8, fontSize: 13 }}>Solde disponible</div>
              <div style={{ fontSize: 36, fontWeight: 700 }}>
                {formatNumber(member.points)} <span style={{ fontSize: 16, fontWeight: 500 }}>{pointsName}</span>
              </div>
            </div>
            <div style={{ textAlign: "right" }}>
              <div style={{ opacity: 0.8, fontSize: 13 }}>Niveau{member.manualTierId ? " (attribué)" : ""}</div>
              <div style={{ fontSize: 22, fontWeight: 700 }}>★ {tier?.name ?? "Aucun"}</div>
              <div style={{ opacity: 0.8, fontSize: 13 }}>
                {formatNumber(member.lifetimePoints)} cumulés · {member.ordersCount} commande(s)
              </div>
            </div>
          </div>
          {next && (
            <div style={{ marginTop: 16 }}>
              <div style={{ height: 8, borderRadius: 999, background: "rgba(255,255,255,0.25)" }}>
                <div style={{ width: `${progress}%`, height: "100%", borderRadius: 999, background: "#fff" }} />
              </div>
              <div style={{ fontSize: 13, marginTop: 6, opacity: 0.9 }}>
                Encore {formatNumber(next.minPoints - member.lifetimePoints)} {pointsName} pour atteindre {next.name}
              </div>
            </div>
          )}
        </div>
      </s-section>

      <s-section heading="Historique des points">
        {member.transactions.length === 0 ? (
          <s-text color="subdued">Aucun mouvement pour l'instant.</s-text>
        ) : (
          <s-table>
            <s-table-header-row>
              <s-table-header listSlot="primary">Détail</s-table-header>
              <s-table-header>Type</s-table-header>
              <s-table-header format="numeric">Points</s-table-header>
              <s-table-header>Date</s-table-header>
            </s-table-header-row>
            <s-table-body>
              {member.transactions.map((tx) => (
                <s-table-row key={tx.id}>
                  <s-table-cell>{tx.description}</s-table-cell>
                  <s-table-cell><TransactionBadge type={tx.type} /></s-table-cell>
                  <s-table-cell><PointsDelta points={tx.points} /></s-table-cell>
                  <s-table-cell>{formatDate(tx.createdAt)}</s-table-cell>
                </s-table-row>
              ))}
            </s-table-body>
          </s-table>
        )}
      </s-section>

      {member.redemptions.length > 0 && (
        <s-section heading="Codes de réduction obtenus">
          <s-table>
            <s-table-header-row>
              <s-table-header listSlot="primary">Récompense</s-table-header>
              <s-table-header>Code</s-table-header>
              <s-table-header format="numeric">Coût</s-table-header>
              <s-table-header>Date</s-table-header>
            </s-table-header-row>
            <s-table-body>
              {member.redemptions.map((r) => (
                <s-table-row key={r.id}>
                  <s-table-cell>{r.title}</s-table-cell>
                  <s-table-cell><s-badge>{r.code}</s-badge></s-table-cell>
                  <s-table-cell>{formatNumber(r.pointsCost)}</s-table-cell>
                  <s-table-cell>{formatDate(r.createdAt)}</s-table-cell>
                </s-table-row>
              ))}
            </s-table-body>
          </s-table>
        </s-section>
      )}

      <s-section slot="aside" heading="Ajuster le solde">
        <s-stack gap="base">
          <s-select label="Action" value={direction} onChange={(e) => setDirection(e.currentTarget.value)}>
            <s-option value="add">Ajouter des points</s-option>
            <s-option value="remove">Retirer des points</s-option>
          </s-select>
          <s-number-field label="Nombre de points" min={1} step={10} value={points} onChange={(e) => setPoints(e.currentTarget.value)} />
          <s-text-field label="Motif (visible dans l'historique)" placeholder="Geste commercial" value={reason} onChange={(e) => setReason(e.currentTarget.value)} />
          <s-button
            variant="primary"
            onClick={() => fetcher.submit({ intent: "adjust", points, reason, direction }, { method: "POST", encType: "application/json" })}
            {...(busy ? { loading: true } : {})}
          >
            Valider
          </s-button>
        </s-stack>
      </s-section>

      {rewards.length > 0 && (
        <s-section slot="aside" heading="Offrir une récompense">
          <s-stack gap="base">
            <s-text color="subdued">Génère un code personnel et débite les points du client.</s-text>
            <s-select label="Récompense" value={rewardId} onChange={(e) => setRewardId(e.currentTarget.value)}>
              {rewards.map((r) => (
                <s-option key={r.id} value={r.id} disabled={r.pointsCost > member.points}>
                  {r.title} — {formatNumber(r.pointsCost)} {pointsName}
                </s-option>
              ))}
            </s-select>
            <s-button
              onClick={() => fetcher.submit({ intent: "redeem", rewardId }, { method: "POST", encType: "application/json" })}
              {...(busy ? { loading: true } : {})}
            >
              Générer le code
            </s-button>
          </s-stack>
        </s-section>
      )}

      <s-section slot="aside" heading="Niveau du client">
        <s-stack gap="base">
          <s-select
            label="Niveau"
            details={
              tierChoice
                ? "Niveau imposé : il ne change plus avec les points."
                : `Automatique : actuellement ${autoTier?.name ?? "aucun"}, évolue avec les ${pointsName}.`
            }
            value={tierChoice}
            onChange={(e) => setTierChoice(e.currentTarget.value)}
          >
            <s-option value="">Automatique (selon les {pointsName})</s-option>
            {tiers.map((t) => (
              <s-option key={t.id} value={t.id}>
                {t.name}
                {t.mode === "MANUAL" ? " (sur invitation)" : ""}
              </s-option>
            ))}
          </s-select>
          <s-button
            disabled={tierChoice === (member.manualTierId ?? "")}
            onClick={() => fetcher.submit({ intent: "tier", tierId: tierChoice }, { method: "POST", encType: "application/json" })}
            {...(busy ? { loading: true } : {})}
          >
            Appliquer le niveau
          </s-button>
          {tier && (
            <s-stack gap="small-200">
              <s-stack direction="inline" gap="small" alignItems="center">
                <ColorDot color={tier.color} />
                <s-text type="strong">Avantages {tier.name}</s-text>
              </s-stack>
              {tier.perkList.length ? (
                tier.perkList.map((p) => <s-text key={p}>✓ {p}</s-text>)
              ) : (
                <s-text color="subdued">Aucun avantage défini pour ce niveau.</s-text>
              )}
              {member.appliedTag && <s-text color="subdued">Étiquette Shopify : {member.appliedTag}</s-text>}
            </s-stack>
          )}
        </s-stack>
      </s-section>

      <s-section slot="aside" heading="Zone sensible">
        <s-button
          tone="critical"
          variant="secondary"
          onClick={() => {
            if (confirm("Retirer ce client du programme ? Son solde et son historique seront supprimés."))
              fetcher.submit({ intent: "remove" }, { method: "POST", encType: "application/json" });
          }}
        >
          Retirer du programme
        </s-button>
      </s-section>
    </s-page>
  );
}

export const headers: HeadersFunction = (headersArgs) =>
  boundary.headers(headersArgs);
