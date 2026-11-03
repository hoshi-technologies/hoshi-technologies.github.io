/**
 * Fonctionnalités d'engagement : parrainage, anniversaire, réseaux sociaux,
 * suivi des codes utilisés, expiration des points et tâches quotidiennes.
 */
import type { Member, Program } from "./generated/prisma/client";
import { Prisma } from "./generated/prisma/client";
import db from "./db.server";
import type { AdminGraphql } from "./loyalty.server";
import { addPoints, customerGid, getProgram } from "./loyalty.server";
import { LoyaltyError } from "./errors";

export const SOCIAL_NETWORKS = {
  instagram: { label: "Instagram", field: "instagramUrl" },
  facebook: { label: "Facebook", field: "facebookUrl" },
  tiktok: { label: "TikTok", field: "tiktokUrl" },
} as const;
export type SocialNetwork = keyof typeof SOCIAL_NETWORKS;

function randomChars(n: number) {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let out = "";
  for (let i = 0; i < n; i++) out += alphabet[Math.floor(Math.random() * alphabet.length)];
  return out;
}

/* ------------------------------------------------------------------ */
/* Parrainage                                                          */
/* ------------------------------------------------------------------ */

/** Code de parrainage personnel du membre (créé à la demande). */
export async function getReferralCode(member: Member): Promise<string> {
  if (member.referralCode) return member.referralCode;
  const prefix = (member.firstName || "CLUB")
    .normalize("NFD")
    .replace(/[^A-Za-z]/g, "")
    .toUpperCase()
    .slice(0, 6) || "CLUB";
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = `${prefix}-${randomChars(4)}`;
    try {
      const updated = await db.member.update({ where: { id: member.id }, data: { referralCode: code } });
      return updated.referralCode!;
    } catch (error) {
      if (!(error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002")) throw error;
    }
  }
  throw new LoyaltyError("referralCodeFailed");
}

export async function findReferrer(shop: string, code: string) {
  return db.member.findUnique({
    where: { shop_referralCode: { shop, referralCode: code.trim().toUpperCase() } },
  });
}

const CODE_CREATE = `#graphql
  mutation LoyaltyReferralCode($discount: DiscountCodeBasicInput!) {
    discountCodeBasicCreate(basicCodeDiscount: $discount) {
      codeDiscountNode { id }
      userErrors { message }
    }
  }`;
const SHIPPING_CODE_CREATE = `#graphql
  mutation LoyaltyReferralShipping($discount: DiscountCodeFreeShippingInput!) {
    discountCodeFreeShippingCreate(freeShippingCodeDiscount: $discount) {
      codeDiscountNode { id }
      userErrors { message }
    }
  }`;

/**
 * Un ami invité saisit son e-mail : on lui crée un code de bienvenue à usage unique.
 * Un même e-mail ne peut être parrainé qu'une fois (on lui renvoie son code).
 */
export async function claimReferral(admin: AdminGraphql, shop: string, referralCode: string, rawEmail: string) {
  const program = await getProgram(shop);
  if (!program.enabled || !program.referralEnabled) throw new LoyaltyError("referralUnavailable");

  const email = rawEmail.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new LoyaltyError("invalidEmail");

  const referrer = await findReferrer(shop, referralCode);
  if (!referrer) throw new LoyaltyError("invalidReferral");
  if (referrer.email?.toLowerCase() === email) throw new LoyaltyError("selfReferral");

  const existing = await db.referral.findUnique({ where: { shop_friendEmail: { shop, friendEmail: email } } });
  if (existing) {
    if (existing.status === "COMPLETED") throw new LoyaltyError("referralAlreadyUsed");
    return { code: existing.code };
  }

  const alreadyCustomer = await db.member.findFirst({
    where: { shop, email: { equals: email }, ordersCount: { gt: 0 } },
    select: { id: true },
  });
  if (alreadyCustomer) throw new LoyaltyError("referralNewCustomersOnly");

  const code = `HCR-${randomChars(8)}`;
  const common = {
    title: `Hoshi Club – referral ${code}`,
    code,
    startsAt: new Date().toISOString(),
    usageLimit: 1,
    appliesOncePerCustomer: true,
    context: { all: "ALL" },
    combinesWith: { orderDiscounts: false, productDiscounts: true, shippingDiscounts: program.friendRewardType !== "FREE_SHIPPING" },
    ...(program.friendMinSubtotal
      ? { minimumRequirement: { subtotal: { greaterThanOrEqualToSubtotal: String(program.friendMinSubtotal) } } }
      : {}),
  };

  let response: Response;
  let key: string;
  if (program.friendRewardType === "FREE_SHIPPING") {
    key = "discountCodeFreeShippingCreate";
    response = await admin.graphql(SHIPPING_CODE_CREATE, {
      variables: { discount: { ...common, destination: { all: true } } },
    });
  } else {
    key = "discountCodeBasicCreate";
    const value =
      program.friendRewardType === "PERCENT"
        ? { percentage: Math.min(100, program.friendRewardValue) / 100 }
        : { discountAmount: { amount: String(program.friendRewardValue), appliesOnEachItem: false } };
    response = await admin.graphql(CODE_CREATE, {
      variables: { discount: { ...common, customerGets: { value, items: { all: true } } } },
    });
  }
  const json = (await response.json()) as {
    data?: Record<string, { codeDiscountNode?: { id: string }; userErrors: { message: string }[] }>;
  };
  const payload = json.data?.[key];
  if (!payload?.codeDiscountNode?.id) {
    throw new LoyaltyError("discountFailed", { details: payload?.userErrors?.map((e) => e.message).join(", ") || "" });
  }

  await db.referral.create({
    data: { shop, referrerId: referrer.id, friendEmail: email, code, discountId: payload.codeDiscountNode.id },
  });
  return { code };
}

interface PaidOrder {
  id: number | string;
  name?: string;
  email?: string | null;
  current_total_price?: string;
  total_price?: string;
  discount_codes?: { code: string }[];
  customer?: { id: number | string; email?: string | null } | null;
}

/**
 * Après une commande payée : marque les codes de récompense utilisés et
 * récompense le parrain si la commande utilise un code de parrainage.
 * Retourne l'identifiant du parrain récompensé (pour mettre à jour son niveau).
 */
export async function handleOrderCodes(shop: string, order: PaidOrder): Promise<string | undefined> {
  const codes = (order.discount_codes ?? []).map((d) => d.code.toUpperCase());
  if (!codes.length) return;
  const orderId = String(order.id);
  const total = parseFloat(order.current_total_price ?? order.total_price ?? "0") || 0;

  await db.redemption.updateMany({
    where: { shop, code: { in: codes }, usedAt: null },
    data: { usedAt: new Date(), orderId, orderTotal: total },
  });

  const referral = await db.referral.findFirst({
    where: { shop, code: { in: codes }, status: "PENDING" },
    include: { referrer: true },
  });
  if (!referral) return;

  // On évite qu'un membre utilise son propre lien.
  if (order.customer?.id && customerGid(order.customer.id) === referral.referrer.customerId) return;

  const done = await db.referral.updateMany({
    where: { id: referral.id, status: "PENDING" },
    data: { status: "COMPLETED", orderId, orderTotal: total, completedAt: new Date() },
  });
  if (done.count === 0) return;

  const program = await getProgram(shop);
  if (program.enabled && program.referrerPoints > 0) {
    await addPoints({
      shop,
      memberId: referral.referrerId,
      points: program.referrerPoints,
      type: "REFERRAL",
      description: JSON.stringify({ friend: referral.friendEmail.replace(/(.{2}).*@/, "$1…@") }),
      reference: orderId,
    });
  }
  return referral.referrerId;
}

/* ------------------------------------------------------------------ */
/* Anniversaire et réseaux sociaux                                     */
/* ------------------------------------------------------------------ */

/** Le client renseigne sa date d'anniversaire (une seule fois). */
export async function setBirthday(shop: string, memberId: string, month: number, day: number) {
  const valid = month >= 1 && month <= 12 && day >= 1 && day <= new Date(2024, month, 0).getDate();
  if (!valid) throw new LoyaltyError("invalidDate");
  const member = await db.member.findFirst({ where: { id: memberId, shop } });
  if (!member) throw new LoyaltyError("memberNotFound");
  if (member.birthday) throw new LoyaltyError("birthdayAlreadySet");
  const birthday = `${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  return db.member.update({ where: { id: member.id }, data: { birthday, birthdaySetAt: new Date() } });
}

/** Points pour une action sociale (une fois par réseau). */
export async function claimSocial(shop: string, memberId: string, network: string) {
  const program = await getProgram(shop);
  const info = SOCIAL_NETWORKS[network as SocialNetwork];
  if (!program.enabled || !info || !program[info.field] || program.socialPoints <= 0) {
    throw new LoyaltyError("actionUnavailable");
  }
  const result = await addPoints({
    shop,
    memberId,
    points: program.socialPoints,
    type: "SOCIAL",
    description: JSON.stringify({ network: info.label }),
    reference: `${memberId}:${network}`,
  });
  return Boolean(result);
}

/* ------------------------------------------------------------------ */
/* Tâches quotidiennes                                                 */
/* ------------------------------------------------------------------ */

const DAY = 24 * 3600 * 1000;

/** Date d'expiration des points d'un membre (null si pas d'expiration). */
export function pointsExpireAt(program: Pick<Program, "expirationMonths">, member: Pick<Member, "lastActivityAt">) {
  if (!program.expirationMonths) return null;
  const d = new Date(member.lastActivityAt);
  d.setMonth(d.getMonth() + program.expirationMonths);
  return d;
}

/**
 * Bonus d'anniversaire : crédité le jour J (ou jusqu'à 7 jours après en cas de retard),
 * une fois par an, si la date a été enregistrée au moins 30 jours avant (anti-abus).
 */
export async function awardBirthdays(shop: string, now = new Date()): Promise<string[]> {
  const program = await getProgram(shop);
  if (!program.enabled || program.birthdayPoints <= 0) return [];
  const members = await db.member.findMany({
    where: { shop, birthday: { not: null }, birthdaySetAt: { lte: new Date(now.getTime() - 30 * DAY) } },
    select: { id: true, birthday: true },
  });
  const awarded: string[] = [];
  for (const m of members) {
    const [mm, dd] = m.birthday!.split("-").map(Number);
    const thisYear = new Date(now.getFullYear(), mm - 1, dd);
    const diff = now.getTime() - thisYear.getTime();
    if (diff < 0 || diff > 7 * DAY) continue;
    const res = await addPoints({
      shop,
      memberId: m.id,
      points: program.birthdayPoints,
      type: "BIRTHDAY",
      description: JSON.stringify({ year: now.getFullYear() }),
      reference: `${m.id}:${now.getFullYear()}`,
    });
    if (res) awarded.push(m.id);
  }
  return awarded;
}

/** Fait expirer les points des membres inactifs depuis trop longtemps. */
export async function expirePoints(shop: string, now = new Date()): Promise<number> {
  const program = await getProgram(shop);
  if (!program.expirationMonths) return 0;
  const limit = new Date(now);
  limit.setMonth(limit.getMonth() - program.expirationMonths);
  const members = await db.member.findMany({
    where: { shop, points: { gt: 0 }, lastActivityAt: { lt: limit } },
    select: { id: true, points: true },
  });
  let count = 0;
  for (const m of members) {
    const res = await addPoints({
      shop,
      memberId: m.id,
      points: -m.points,
      type: "EXPIRE",
      description: JSON.stringify({ months: program.expirationMonths }),
      reference: `${m.id}:${now.toISOString().slice(0, 10)}`,
    });
    if (res) count++;
  }
  return count;
}
