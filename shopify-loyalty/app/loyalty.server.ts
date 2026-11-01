/**
 * Logique métier du programme de fidélité : réglages, membres, points,
 * paliers VIP et échange de récompenses contre des codes de réduction.
 */
import { Prisma } from "@prisma/client";
import type { Member, Program, Reward, Tier } from "@prisma/client";
import db from "./db.server";
import { rewardLabel } from "./rewards";

export { rewardLabel };

export type RewardType = "AMOUNT" | "PERCENT" | "FREE_SHIPPING";

export interface CustomerInfo {
  id: string | number; // GID ou identifiant numérique
  email?: string | null;
  firstName?: string | null;
  lastName?: string | null;
}

/** Interface minimale d'un client GraphQL Admin (admin.graphql). */
export interface AdminGraphql {
  graphql: (
    query: string,
    options?: { variables?: Record<string, unknown> },
  ) => Promise<Response>;
}

export function customerGid(id: string | number): string {
  const s = String(id);
  return s.startsWith("gid://") ? s : `gid://shopify/Customer/${s}`;
}

export function numericId(gid: string): string {
  return gid.split("/").pop() ?? gid;
}

/* ------------------------------------------------------------------ */
/* Programme                                                           */
/* ------------------------------------------------------------------ */

/** Récupère les réglages ; à la première visite, crée un programme prêt à l'emploi. */
export async function getProgram(shop: string): Promise<Program> {
  const existing = await db.program.findUnique({ where: { shop } });
  if (existing) return existing;

  try {
    return await db.$transaction(async (tx) => {
      const program = await tx.program.create({ data: { shop } });
      await tx.tier.createMany({
        data: [
          { shop, name: "Bronze", minPoints: 0, multiplier: 1, color: "#B08D57" },
          { shop, name: "Argent", minPoints: 500, multiplier: 1.25, color: "#9CA3AF" },
          { shop, name: "Or", minPoints: 1500, multiplier: 1.5, color: "#D4A017" },
        ],
      });
      await tx.reward.createMany({
        data: [
          { shop, title: "5 € de réduction", type: "AMOUNT", value: 5, pointsCost: 500 },
          { shop, title: "10 % de réduction", type: "PERCENT", value: 10, pointsCost: 1000 },
          { shop, title: "Livraison offerte", type: "FREE_SHIPPING", value: 0, pointsCost: 300 },
        ],
      });
      return program;
    });
  } catch (error) {
    // Deux requêtes simultanées : l'autre a déjà créé le programme.
    if (isUniqueError(error)) {
      return db.program.findUniqueOrThrow({ where: { shop } });
    }
    throw error;
  }
}

export async function getTiers(shop: string): Promise<Tier[]> {
  return db.tier.findMany({ where: { shop }, orderBy: { minPoints: "asc" } });
}

/** Palier atteint pour un total de points cumulés. */
export function tierFor(tiers: Tier[], lifetimePoints: number): Tier | null {
  let current: Tier | null = null;
  for (const tier of [...tiers].sort((a, b) => a.minPoints - b.minPoints)) {
    if (lifetimePoints >= tier.minPoints) current = tier;
  }
  return current;
}

export function nextTier(tiers: Tier[], lifetimePoints: number): Tier | null {
  return (
    [...tiers]
      .sort((a, b) => a.minPoints - b.minPoints)
      .find((t) => t.minPoints > lifetimePoints) ?? null
  );
}

/* ------------------------------------------------------------------ */
/* Membres et points                                                   */
/* ------------------------------------------------------------------ */

function isUniqueError(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2002"
  );
}

/**
 * Crée le membre s'il n'existe pas (avec bonus de bienvenue) et met à jour
 * ses coordonnées sinon.
 */
export async function ensureMember(
  shop: string,
  customer: CustomerInfo,
): Promise<Member> {
  const customerId = customerGid(customer.id);
  const program = await getProgram(shop);
  const contact = {
    email: customer.email ?? undefined,
    firstName: customer.firstName ?? undefined,
    lastName: customer.lastName ?? undefined,
  };

  const existing = await db.member.findUnique({
    where: { shop_customerId: { shop, customerId } },
  });
  if (existing) {
    if (
      (contact.email && contact.email !== existing.email) ||
      (contact.firstName && contact.firstName !== existing.firstName) ||
      (contact.lastName && contact.lastName !== existing.lastName)
    ) {
      return db.member.update({ where: { id: existing.id }, data: contact });
    }
    return existing;
  }

  let member: Member;
  try {
    member = await db.member.create({ data: { shop, customerId, ...contact } });
  } catch (error) {
    if (isUniqueError(error)) {
      return db.member.findUniqueOrThrow({
        where: { shop_customerId: { shop, customerId } },
      });
    }
    throw error;
  }

  if (program.enabled && program.signupPoints > 0) {
    const updated = await addPoints({
      shop,
      memberId: member.id,
      points: program.signupPoints,
      type: "SIGNUP",
      description: "Bonus de bienvenue",
      reference: customerId,
    });
    if (updated) member = updated;
  }
  return member;
}

/**
 * Ajoute (ou retire si négatif) des points et enregistre la transaction.
 * Si `reference` est fourni, l'opération n'est jamais appliquée deux fois
 * (webhooks rejoués). Retourne null si déjà appliquée.
 */
export async function addPoints(args: {
  shop: string;
  memberId: string;
  points: number;
  type: string;
  description: string;
  reference?: string;
}): Promise<Member | null> {
  const points = Math.trunc(args.points);
  if (points === 0) return null;

  try {
    return await db.$transaction(async (tx) => {
      await tx.transaction.create({
        data: {
          shop: args.shop,
          memberId: args.memberId,
          points,
          type: args.type,
          description: args.description,
          reference: args.reference ?? null,
        },
      });
      const member = await tx.member.findUniqueOrThrow({
        where: { id: args.memberId },
      });
      // Le solde ne descend jamais sous zéro.
      const newBalance = Math.max(0, member.points + points);
      // Les points cumulés (pour les paliers) ne comptent que les gains.
      const lifetimeDelta = points > 0 ? points : 0;
      return tx.member.update({
        where: { id: args.memberId },
        data: {
          points: newBalance,
          lifetimePoints: member.lifetimePoints + lifetimeDelta,
        },
      });
    });
  } catch (error) {
    if (isUniqueError(error)) return null;
    throw error;
  }
}

/** Ajustement manuel depuis l'administration. */
export async function adjustPoints(
  shop: string,
  memberId: string,
  points: number,
  reason: string,
) {
  const member = await db.member.findFirst({ where: { id: memberId, shop } });
  if (!member) throw new Error("Membre introuvable");
  return addPoints({
    shop,
    memberId,
    points,
    type: "ADJUST",
    description: reason || (points > 0 ? "Ajout manuel" : "Retrait manuel"),
  });
}

/* ------------------------------------------------------------------ */
/* Commandes et remboursements (webhooks)                              */
/* ------------------------------------------------------------------ */

interface OrderPayload {
  id: number | string;
  name?: string;
  current_subtotal_price?: string;
  subtotal_price?: string;
  customer?: {
    id: number | string;
    email?: string | null;
    first_name?: string | null;
    last_name?: string | null;
  } | null;
}

export async function handleOrderPaid(shop: string, order: OrderPayload) {
  if (!order.customer?.id) return; // commande invité : pas de points
  const program = await getProgram(shop);
  if (!program.enabled) return;

  const member = await ensureMember(shop, {
    id: order.customer.id,
    email: order.customer.email,
    firstName: order.customer.first_name,
    lastName: order.customer.last_name,
  });

  const tiers = await getTiers(shop);
  const tier = tierFor(tiers, member.lifetimePoints);
  const subtotal = parseFloat(
    order.current_subtotal_price ?? order.subtotal_price ?? "0",
  );
  const points = Math.floor(
    subtotal * program.pointsPerUnit * (tier?.multiplier ?? 1),
  );
  const orderRef = String(order.id);
  const label = order.name ?? `#${orderRef}`;

  const result = await addPoints({
    shop,
    memberId: member.id,
    points,
    type: "ORDER",
    description: `Commande ${label}`,
    reference: orderRef,
  });

  // Webhook déjà traité : on s'arrête là.
  if (!result && points > 0) return;

  const updated = await db.member.update({
    where: { id: member.id },
    data: { ordersCount: { increment: 1 } },
  });

  if (updated.ordersCount === 1 && program.firstOrderPoints > 0) {
    await addPoints({
      shop,
      memberId: member.id,
      points: program.firstOrderPoints,
      type: "FIRST_ORDER",
      description: "Bonus première commande",
      reference: orderRef,
    });
  }
}

interface RefundPayload {
  id: number | string;
  order_id: number | string;
  refund_line_items?: { subtotal?: number | string }[];
}

export async function handleRefund(shop: string, refund: RefundPayload) {
  const orderRef = String(refund.order_id);
  const earned = await db.transaction.findUnique({
    where: { shop_type_reference: { shop, type: "ORDER", reference: orderRef } },
  });
  if (!earned || earned.points <= 0) return;

  const program = await getProgram(shop);
  const refunded = (refund.refund_line_items ?? []).reduce(
    (sum, line) => sum + parseFloat(String(line.subtotal ?? 0)),
    0,
  );
  if (refunded <= 0) return;

  // Points déjà retirés pour cette commande (remboursements partiels successifs).
  const previous = await db.transaction.aggregate({
    where: { shop, type: "REFUND", memberId: earned.memberId, description: { endsWith: `(${orderRef})` } },
    _sum: { points: true },
  });
  const alreadyRemoved = -(previous._sum.points ?? 0);
  const toRemove = Math.min(
    Math.floor(refunded * program.pointsPerUnit),
    earned.points - alreadyRemoved,
  );
  if (toRemove <= 0) return;

  await addPoints({
    shop,
    memberId: earned.memberId,
    points: -toRemove,
    type: "REFUND",
    description: `Remboursement (${orderRef})`,
    reference: String(refund.id),
  });
}

/* ------------------------------------------------------------------ */
/* Récompenses                                                         */
/* ------------------------------------------------------------------ */

function randomCode(prefix = "FID") {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 8; i++) {
    code += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return `${prefix}-${code}`;
}

const BASIC_CREATE = `#graphql
  mutation LoyaltyBasicDiscount($discount: DiscountCodeBasicInput!) {
    discountCodeBasicCreate(basicCodeDiscount: $discount) {
      codeDiscountNode { id }
      userErrors { field message }
    }
  }`;

const SHIPPING_CREATE = `#graphql
  mutation LoyaltyShippingDiscount($discount: DiscountCodeFreeShippingInput!) {
    discountCodeFreeShippingCreate(freeShippingCodeDiscount: $discount) {
      codeDiscountNode { id }
      userErrors { field message }
    }
  }`;

const DISCOUNT_DELETE = `#graphql
  mutation LoyaltyDeleteDiscount($id: ID!) {
    discountCodeDelete(id: $id) { deletedCodeDiscountId }
  }`;

async function createDiscountCode(
  admin: AdminGraphql,
  reward: Reward,
  member: Member,
  code: string,
): Promise<string> {
  const common = {
    title: `Fidélité – ${reward.title} (${code})`,
    code,
    startsAt: new Date().toISOString(),
    usageLimit: 1,
    appliesOncePerCustomer: true,
    context: { customers: { add: [member.customerId] } },
    combinesWith: {
      orderDiscounts: false,
      productDiscounts: true,
      shippingDiscounts: reward.type !== "FREE_SHIPPING",
    },
    ...(reward.minSubtotal
      ? {
          minimumRequirement: {
            subtotal: { greaterThanOrEqualToSubtotal: String(reward.minSubtotal) },
          },
        }
      : {}),
  };

  let response: Response;
  let key: "discountCodeBasicCreate" | "discountCodeFreeShippingCreate";
  if (reward.type === "FREE_SHIPPING") {
    key = "discountCodeFreeShippingCreate";
    response = await admin.graphql(SHIPPING_CREATE, {
      variables: { discount: { ...common, destination: { all: true } } },
    });
  } else {
    key = "discountCodeBasicCreate";
    const value =
      reward.type === "PERCENT"
        ? { percentage: Math.min(100, reward.value) / 100 }
        : { discountAmount: { amount: String(reward.value), appliesOnEachItem: false } };
    response = await admin.graphql(BASIC_CREATE, {
      variables: {
        discount: { ...common, customerGets: { value, items: { all: true } } },
      },
    });
  }

  const json = (await response.json()) as {
    data?: Record<string, { codeDiscountNode?: { id: string }; userErrors: { message: string }[] }>;
    errors?: unknown;
  };
  const payload = json.data?.[key];
  if (!payload?.codeDiscountNode?.id) {
    const message =
      payload?.userErrors?.map((e) => e.message).join(", ") ||
      "Impossible de créer le code de réduction";
    throw new Error(message);
  }
  return payload.codeDiscountNode.id;
}

/**
 * Échange des points contre une récompense : crée un code de réduction
 * à usage unique réservé au client, puis débite les points.
 */
export async function redeemReward(
  admin: AdminGraphql,
  shop: string,
  memberId: string,
  rewardId: string,
) {
  const [member, reward, program] = await Promise.all([
    db.member.findFirst({ where: { id: memberId, shop } }),
    db.reward.findFirst({ where: { id: rewardId, shop, active: true } }),
    getProgram(shop),
  ]);
  if (!program.enabled) throw new Error("Le programme de fidélité est désactivé");
  if (!member) throw new Error("Membre introuvable");
  if (!reward) throw new Error("Récompense indisponible");
  if (member.points < reward.pointsCost) {
    throw new Error(`Il vous manque ${reward.pointsCost - member.points} ${program.pointsName}`);
  }

  const code = randomCode();
  const discountId = await createDiscountCode(admin, reward, member, code);

  // Débit conditionnel : évite un double échange simultané.
  const debited = await db.member.updateMany({
    where: { id: member.id, points: { gte: reward.pointsCost } },
    data: { points: { decrement: reward.pointsCost } },
  });
  if (debited.count === 0) {
    await admin.graphql(DISCOUNT_DELETE, { variables: { id: discountId } }).catch(() => {});
    throw new Error("Solde de points insuffisant");
  }

  await db.$transaction([
    db.transaction.create({
      data: {
        shop,
        memberId: member.id,
        points: -reward.pointsCost,
        type: "REDEEM",
        description: `Échange : ${reward.title}`,
        reference: code,
      },
    }),
    db.redemption.create({
      data: {
        shop,
        memberId: member.id,
        rewardId: reward.id,
        title: reward.title,
        code,
        discountId,
        pointsCost: reward.pointsCost,
      },
    }),
  ]);

  return { code, title: reward.title };
}

/* ------------------------------------------------------------------ */
/* Statistiques du tableau de bord                                     */
/* ------------------------------------------------------------------ */

export async function getDashboardStats(shop: string) {
  const since = new Date(Date.now() - 30 * 24 * 3600 * 1000);
  const [members, newMembers, earned, spent, redemptions, recent] =
    await Promise.all([
      db.member.count({ where: { shop } }),
      db.member.count({ where: { shop, createdAt: { gte: since } } }),
      db.transaction.aggregate({
        where: { shop, points: { gt: 0 } },
        _sum: { points: true },
      }),
      db.transaction.aggregate({
        where: { shop, type: "REDEEM" },
        _sum: { points: true },
      }),
      db.redemption.count({ where: { shop } }),
      db.transaction.findMany({
        where: { shop },
        orderBy: { createdAt: "desc" },
        take: 8,
        include: { member: true },
      }),
    ]);

  return {
    members,
    newMembers,
    pointsEarned: earned._sum.points ?? 0,
    pointsSpent: -(spent._sum.points ?? 0),
    redemptions,
    recent,
  };
}

/** Données GDPR : supprime toutes les données d'un client. */
export async function redactCustomer(shop: string, customerId: string | number) {
  await db.member.deleteMany({ where: { shop, customerId: customerGid(customerId) } });
}

export async function redactShop(shop: string) {
  await db.$transaction([
    db.transaction.deleteMany({ where: { shop } }),
    db.redemption.deleteMany({ where: { shop } }),
    db.member.deleteMany({ where: { shop } }),
    db.reward.deleteMany({ where: { shop } }),
    db.tier.deleteMany({ where: { shop } }),
    db.program.deleteMany({ where: { shop } }),
    db.session.deleteMany({ where: { shop } }),
  ]);
}
