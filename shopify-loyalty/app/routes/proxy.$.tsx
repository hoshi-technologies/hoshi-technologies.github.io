/**
 * API du widget de la boutique, appelée via le proxy d'application :
 *   GET  /apps/hoshi-club/loyalty?locale=fr           → programme, solde, niveau, récompenses, textes
 *   GET  /apps/hoshi-club/loyalty?ref=CODE&locale=fr  → infos de parrainage pour un ami invité
 *   POST /apps/hoshi-club/loyalty?locale=fr { action } → redeem | referral | birthday | social
 * Shopify signe chaque requête et ajoute `logged_in_customer_id`.
 * Le paramètre `locale` est la langue de la boutique affichée au client.
 */
import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import { readJson } from "../utils.server";
import db from "../db.server";
import {
  activeBonus,
  ensureMember,
  getProgram,
  getTiers,
  memberTier,
  nextTier,
  redeemReward,
} from "../loyalty.server";
import type { AdminGraphql } from "../loyalty.server";
import {
  SOCIAL_NETWORKS,
  claimReferral,
  claimSocial,
  findReferrer,
  getReferralCode,
  pointsExpireAt,
  setBirthday,
} from "../engagement.server";
import { syncMemberTag } from "../levels.server";
import { friendRewardLabel, rewardLabel, rewardTitle, tierPerks } from "../labels";
import { LoyaltyError } from "../errors";
import { getT, pickMessages } from "../i18n/i18n.server";
import { DEFAULT_LOCALE, isRtl, matchLocale } from "../i18n/config";
import { createFormatters } from "../i18n/translate";

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}

/** Langue demandée par le widget (celle de la boutique affichée au client). */
function widgetLocale(request: Request) {
  return matchLocale(new URL(request.url).searchParams.get("locale")) ?? DEFAULT_LOCALE;
}

/** Message d'erreur traduit pour le client. */
function errorJson(error: unknown, locale: string, status = 400) {
  const t = getT(locale);
  if (error instanceof LoyaltyError) return json({ error: t(`errors.${error.code}`, error.params) }, status);
  console.error("Widget", error);
  return json({ error: t("errors.generic") }, status);
}

async function memberState(shop: string, customerId: string | null, locale: string, admin?: AdminGraphql) {
  const program = await getProgram(shop);
  const t = getT(locale);
  const fmt = createFormatters(locale, program.currency);
  const [tiers, rewards] = await Promise.all([
    getTiers(shop),
    db.reward.findMany({ where: { shop, active: true }, orderBy: { pointsCost: "asc" } }),
  ]);
  const bonus = activeBonus(program);

  const social = (Object.keys(SOCIAL_NETWORKS) as (keyof typeof SOCIAL_NETWORKS)[])
    .filter((key) => program[SOCIAL_NETWORKS[key].field])
    .map((key) => ({ network: key, label: SOCIAL_NETWORKS[key].label, url: program[SOCIAL_NETWORKS[key].field] }));

  const base = {
    locale,
    dir: isRtl(locale) ? "rtl" : "ltr",
    currency: program.currency,
    i18n: pickMessages(locale, ["widget"]).widget,
    enabled: program.enabled,
    pointsName: program.pointsName,
    pointsPerUnit: program.pointsPerUnit,
    signupPoints: program.signupPoints,
    firstOrderPoints: program.firstOrderPoints,
    birthdayPoints: program.birthdayPoints,
    socialPoints: program.socialPoints,
    social: program.socialPoints > 0 ? social : [],
    referral: program.referralEnabled
      ? { referrerPoints: program.referrerPoints, friendReward: friendRewardLabel(program, t, fmt.money) }
      : null,
    bonus:
      bonus > 1
        ? {
            multiplier: bonus,
            label: program.bonusLabel || t("widget.bonusDefault", { pointsName: program.pointsName, multiplier: bonus }),
            endsAt: program.bonusEndsAt,
          }
        : null,
    title: program.widgetTitle || t("widget.title"),
    color: program.widgetColor,
    position: program.widgetPosition,
    rewards: rewards.map((r) => ({
      id: r.id,
      title: rewardTitle(r, t, fmt.money),
      description: rewardLabel(r, t, fmt.money),
      pointsCost: r.pointsCost,
      minSubtotal: r.minSubtotal ? fmt.money(r.minSubtotal) : null,
    })),
    // Seuls les niveaux automatiques sont présentés publiquement.
    tiers: tiers
      .filter((tier) => tier.mode !== "MANUAL")
      .map((tier) => ({
        name: tier.name,
        minPoints: tier.minPoints,
        color: tier.color,
        perks: tierPerks(tier, t, fmt.money, program.pointsName),
      })),
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
  const doneSocial = new Set(member.transactions.map((tx) => tx.reference?.split(":")[1]));
  return {
    ...base,
    member: {
      points: member.points,
      lifetimePoints: member.lifetimePoints,
      firstName: member.firstName,
      multiplier: (tier?.multiplier ?? 1) * bonus,
      tier: tier
        ? {
            name: tier.name,
            color: tier.color,
            multiplier: tier.multiplier,
            perks: tierPerks(tier, t, fmt.money, program.pointsName),
          }
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
  const locale = widgetLocale(request);
  const { session, admin } = await authenticate.public.appProxy(request);
  if (!session) return json({ error: getT(locale)("errors.notInstalled") }, 404);
  const url = new URL(request.url);

  // Ami invité : qui l'a parrainé et que gagne-t-il ?
  const ref = url.searchParams.get("ref");
  if (ref) {
    const program = await getProgram(session.shop);
    const referrer = program.enabled && program.referralEnabled ? await findReferrer(session.shop, ref) : null;
    if (!referrer) return json({ error: getT(locale)("errors.invalidReferral") }, 404);
    const t = getT(locale);
    return json({
      locale,
      dir: isRtl(locale) ? "rtl" : "ltr",
      i18n: pickMessages(locale, ["widget"]).widget,
      referrerName: referrer.firstName || t("widget.aFriend"),
      reward: friendRewardLabel(program, t, createFormatters(locale, program.currency).money),
      color: program.widgetColor,
    });
  }

  const customerId = url.searchParams.get("logged_in_customer_id") || null;
  try {
    return json(await memberState(session.shop, customerId, locale, admin));
  } catch (error) {
    return errorJson(error, locale, 500);
  }
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const locale = widgetLocale(request);
  const t = getT(locale);
  const { session, admin } = await authenticate.public.appProxy(request);
  if (!session || !admin) return json({ error: t("errors.notInstalled") }, 404);
  const shop = session.shop;
  const customerId = new URL(request.url).searchParams.get("logged_in_customer_id");
  const body = (await readJson(request)) as Record<string, string | number | undefined>;
  const action = String(body.action || "redeem");

  try {
    // Seule action possible sans être connecté : demander son code de parrainage.
    if (action === "referral") {
      const program = await getProgram(shop);
      const result = await claimReferral(admin, shop, String(body.ref || ""), String(body.email || ""));
      return json({
        ok: true,
        ...result,
        reward: friendRewardLabel(program, t, createFormatters(locale, program.currency).money),
      });
    }

    if (!customerId) return json({ error: t("errors.loginRequired") }, 401);
    const member = await ensureMember(shop, { id: customerId });

    if (action === "birthday") {
      await setBirthday(shop, member.id, Number(body.month), Number(body.day));
      return json({ ok: true, message: t("widget.birthdaySaved"), state: await memberState(shop, customerId, locale, admin) });
    }
    if (action === "social") {
      const credited = await claimSocial(shop, member.id, String(body.network));
      await syncMemberTag(admin, shop, member.id);
      return json({
        ok: true,
        message: credited ? t("widget.socialThanks") : t("widget.socialAlready"),
        state: await memberState(shop, customerId, locale, admin),
      });
    }
    if (!body.rewardId) throw new LoyaltyError("rewardUnavailable");
    const result = await redeemReward(admin, shop, member.id, String(body.rewardId), locale);
    return json({ ok: true, ...result, state: await memberState(shop, customerId, locale, admin) });
  } catch (error) {
    return errorJson(error, locale);
  }
};
