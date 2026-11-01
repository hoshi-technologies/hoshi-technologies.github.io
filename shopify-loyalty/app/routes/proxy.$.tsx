/**
 * API du widget de la boutique, appelée via le proxy d'application :
 *   GET  https://<boutique>/apps/fidelite/loyalty   → solde, palier, récompenses
 *   POST https://<boutique>/apps/fidelite/loyalty   → { rewardId } échange de points
 * Shopify signe chaque requête et ajoute `logged_in_customer_id`.
 */
import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import db from "../db.server";
import {
  ensureMember,
  getProgram,
  getTiers,
  nextTier,
  redeemReward,
  memberTier,
  rewardLabel,
  tierPerks,
} from "../loyalty.server";
import type { AdminGraphql } from "../loyalty.server";
import { syncMemberTag } from "../levels.server";

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}

async function memberState(shop: string, customerId: string | null, admin?: AdminGraphql) {
  const program = await getProgram(shop);
  const [tiers, rewards] = await Promise.all([
    getTiers(shop),
    db.reward.findMany({ where: { shop, active: true }, orderBy: { pointsCost: "asc" } }),
  ]);

  const base = {
    enabled: program.enabled,
    pointsName: program.pointsName,
    pointsPerUnit: program.pointsPerUnit,
    signupPoints: program.signupPoints,
    title: program.widgetTitle,
    color: program.widgetColor,
    position: program.widgetPosition,
    rewards: rewards.map((r) => ({
      id: r.id,
      title: r.title,
      description: rewardLabel(r),
      pointsCost: r.pointsCost,
      minSubtotal: r.minSubtotal,
    })),
    // Seuls les niveaux automatiques sont présentés publiquement.
    tiers: tiers
      .filter((t) => t.mode !== "MANUAL")
      .map((t) => ({ name: t.name, minPoints: t.minPoints, color: t.color, perks: tierPerks(t, program.pointsName) })),
  };

  if (!customerId) return { ...base, member: null };

  // Le client peut être connecté avant que le webhook customers/create soit traité.
  const { id: memberId } = await ensureMember(shop, { id: customerId });
  if (admin) await syncMemberTag(admin, shop, memberId, tiers);
  const member = await db.member.findUniqueOrThrow({
    where: { id: memberId },
    include: { redemptions: { orderBy: { createdAt: "desc" }, take: 5 } },
  });

  const tier = memberTier(tiers, member);
  const next = nextTier(tiers, member);
  return {
    ...base,
    member: {
      points: member.points,
      lifetimePoints: member.lifetimePoints,
      firstName: member.firstName,
      tier: tier
        ? { name: tier.name, color: tier.color, multiplier: tier.multiplier, perks: tierPerks(tier, program.pointsName) }
        : null,
      nextTier: next ? { name: next.name, missing: next.minPoints - member.lifetimePoints } : null,
      codes: member.redemptions.map((r) => ({ title: r.title, code: r.code, createdAt: r.createdAt })),
    },
  };
}

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session, admin } = await authenticate.public.appProxy(request);
  if (!session) return json({ error: "Application non installée" }, 404);
  const customerId = new URL(request.url).searchParams.get("logged_in_customer_id") || null;
  return json(await memberState(session.shop, customerId, admin));
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session, admin } = await authenticate.public.appProxy(request);
  if (!session || !admin) return json({ error: "Application non installée" }, 404);

  const customerId = new URL(request.url).searchParams.get("logged_in_customer_id");
  if (!customerId) return json({ error: "Connectez-vous pour échanger vos points" }, 401);

  const body = (await request.json().catch(() => ({}))) as { rewardId?: string };
  if (!body.rewardId) return json({ error: "Récompense manquante" }, 400);

  try {
    const member = await ensureMember(session.shop, { id: customerId });
    const result = await redeemReward(admin, session.shop, member.id, body.rewardId);
    return json({ ok: true, ...result, state: await memberState(session.shop, customerId, admin) });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : "Erreur inattendue" }, 400);
  }
};
