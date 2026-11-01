/**
 * API du widget de la boutique, appelée via le proxy d'application :
 *   GET  /apps/fidelite/loyalty               → programme, solde, niveau, récompenses…
 *   GET  /apps/fidelite/loyalty?ref=CODE      → infos de parrainage pour un ami invité
 *   POST /apps/fidelite/loyalty  { action, … } → redeem | referral | birthday | social
 * Shopify signe chaque requête et ajoute `logged_in_customer_id`.
 */
import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import db from "../db.server";
import {
  activeBonus,
  ensureMember,
  getProgram,
  getTiers,
  memberTier,
  nextTier,
  redeemReward,
  rewardLabel,
  tierPerks,
} from "../loyalty.server";
import type { AdminGraphql } from "../loyalty.server";
import {
  SOCIAL_NETWORKS,
  claimReferral,
  claimSocial,
  findReferrer,
  friendRewardLabel,
  getReferralCode,
  pointsExpireAt,
  setBirthday,
} from "../engagement.server";
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
  const bonus = activeBonus(program);

  const social = (Object.keys(SOCIAL_NETWORKS) as (keyof typeof SOCIAL_NETWORKS)[])
    .filter((key) => program[SOCIAL_NETWORKS[key].field])
    .map((key) => ({ network: key, label: SOCIAL_NETWORKS[key].label, url: program[SOCIAL_NETWORKS[key].field] }));

  const base = {
    enabled: program.enabled,
    pointsName: program.pointsName,
    pointsPerUnit: program.pointsPerUnit,
    signupPoints: program.signupPoints,
    firstOrderPoints: program.firstOrderPoints,
    birthdayPoints: program.birthdayPoints,
    socialPoints: program.socialPoints,
    social: program.socialPoints > 0 ? social : [],
    referral: program.referralEnabled
      ? { referrerPoints: program.referrerPoints, friendReward: friendRewardLabel(program) }
      : null,
    bonus:
      bonus > 1
        ? { multiplier: bonus, label: program.bonusLabel, endsAt: program.bonusEndsAt }
        : null,
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
    include: {
      redemptions: { where: { usedAt: null }, orderBy: { createdAt: "desc" }, take: 5 },
      transactions: { where: { type: "SOCIAL" }, select: { reference: true } },
      _count: { select: { referrals: { where: { status: "COMPLETED" } } } },
    },
  });

  const tier = memberTier(tiers, member);
  const next = nextTier(tiers, member);
  const doneSocial = new Set(member.transactions.map((t) => t.reference?.split(":")[1]));
  return {
    ...base,
    member: {
      points: member.points,
      lifetimePoints: member.lifetimePoints,
      firstName: member.firstName,
      multiplier: (tier?.multiplier ?? 1) * bonus,
      tier: tier
        ? { name: tier.name, color: tier.color, multiplier: tier.multiplier, perks: tierPerks(tier, program.pointsName) }
        : null,
      nextTier: next ? { name: next.name, missing: next.minPoints - member.lifetimePoints } : null,
      codes: member.redemptions.map((r) => ({ title: r.title, code: r.code, createdAt: r.createdAt })),
      birthday: member.birthday,
      socialDone: [...doneSocial].filter(Boolean),
      referralCode: program.referralEnabled ? await getReferralCode(member) : null,
      referralsCompleted: member._count.referrals,
      expiresAt: member.points > 0 ? pointsExpireAt(program, member) : null,
    },
  };
}

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session, admin } = await authenticate.public.appProxy(request);
  if (!session) return json({ error: "Application non installée" }, 404);
  const url = new URL(request.url);

  // Ami invité : qui l'a parrainé et que gagne-t-il ?
  const ref = url.searchParams.get("ref");
  if (ref) {
    const program = await getProgram(session.shop);
    const referrer = program.enabled && program.referralEnabled ? await findReferrer(session.shop, ref) : null;
    if (!referrer) return json({ error: "Lien de parrainage invalide" }, 404);
    return json({
      referrerName: referrer.firstName || "Un ami",
      reward: friendRewardLabel(program),
      color: program.widgetColor,
    });
  }

  const customerId = url.searchParams.get("logged_in_customer_id") || null;
  return json(await memberState(session.shop, customerId, admin));
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session, admin } = await authenticate.public.appProxy(request);
  if (!session || !admin) return json({ error: "Application non installée" }, 404);
  const shop = session.shop;
  const customerId = new URL(request.url).searchParams.get("logged_in_customer_id");
  const body = (await request.json().catch(() => ({}))) as Record<string, string | number | undefined>;
  const action = String(body.action || "redeem");

  try {
    // Seule action possible sans être connecté : demander son code de parrainage.
    if (action === "referral") {
      const result = await claimReferral(admin, shop, String(body.ref || ""), String(body.email || ""));
      return json({ ok: true, ...result });
    }

    if (!customerId) return json({ error: "Connectez-vous pour profiter du programme" }, 401);
    const member = await ensureMember(shop, { id: customerId });

    if (action === "birthday") {
      await setBirthday(shop, member.id, Number(body.month), Number(body.day));
      return json({ ok: true, message: "Anniversaire enregistré 🎂", state: await memberState(shop, customerId, admin) });
    }
    if (action === "social") {
      const credited = await claimSocial(shop, member.id, String(body.network));
      await syncMemberTag(admin, shop, member.id);
      return json({
        ok: true,
        message: credited ? "Merci ! Vos points ont été ajoutés" : "Points déjà obtenus pour ce réseau",
        state: await memberState(shop, customerId, admin),
      });
    }
    if (!body.rewardId) return json({ error: "Récompense manquante" }, 400);
    const result = await redeemReward(admin, shop, member.id, String(body.rewardId));
    return json({ ok: true, ...result, state: await memberState(shop, customerId, admin) });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : "Erreur inattendue" }, 400);
  }
};
