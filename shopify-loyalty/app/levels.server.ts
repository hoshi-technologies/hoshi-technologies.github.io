/**
 * Synchronisation des niveaux clients avec Shopify :
 *  - chaque niveau a une étiquette client (ex. « Fidélité Or ») posée sur les membres ;
 *  - si le niveau a des avantages, un segment « clients avec cette étiquette » est créé
 *    et des remises automatiques (sans code) lui sont réservées.
 * Ainsi la remise s'applique toute seule au paiement, y compris hors du widget.
 */
import type { Tier } from "./generated/prisma/client";
import db from "./db.server";
import type { AdminGraphql } from "./loyalty.server";
import { getTiers, memberTier } from "./loyalty.server";

type GqlResult = { data?: Record<string, any>; errors?: { message: string }[] };

async function gql(admin: AdminGraphql, query: string, variables: Record<string, unknown>) {
  const response = await admin.graphql(query, { variables });
  const json = (await response.json()) as GqlResult;
  if (json.errors?.length) throw new Error(json.errors.map((e) => e.message).join(", "));
  const payload = Object.values(json.data ?? {})[0] as
    | { userErrors?: { message: string }[] }
    | undefined;
  if (payload?.userErrors?.length) {
    throw new Error(payload.userErrors.map((e) => e.message).join(", "));
  }
  return payload as Record<string, any>;
}

const TAGS_ADD = `#graphql
  mutation LoyaltyTagsAdd($id: ID!, $tags: [String!]!) {
    tagsAdd(id: $id, tags: $tags) { userErrors { message } }
  }`;
const TAGS_REMOVE = `#graphql
  mutation LoyaltyTagsRemove($id: ID!, $tags: [String!]!) {
    tagsRemove(id: $id, tags: $tags) { userErrors { message } }
  }`;
const SEGMENT_CREATE = `#graphql
  mutation LoyaltySegmentCreate($name: String!, $query: String!) {
    segmentCreate(name: $name, query: $query) {
      segment { id }
      userErrors { message }
    }
  }`;
const SEGMENT_DELETE = `#graphql
  mutation LoyaltySegmentDelete($id: ID!) {
    segmentDelete(id: $id) { userErrors { message } }
  }`;
const AUTO_BASIC_CREATE = `#graphql
  mutation LoyaltyAutoBasic($discount: DiscountAutomaticBasicInput!) {
    discountAutomaticBasicCreate(automaticBasicDiscount: $discount) {
      automaticDiscountNode { id }
      userErrors { message }
    }
  }`;
const AUTO_SHIPPING_CREATE = `#graphql
  mutation LoyaltyAutoShipping($discount: DiscountAutomaticFreeShippingInput!) {
    discountAutomaticFreeShippingCreate(freeShippingAutomaticDiscount: $discount) {
      automaticDiscountNode { id }
      userErrors { message }
    }
  }`;
const AUTO_DELETE = `#graphql
  mutation LoyaltyAutoDelete($id: ID!) {
    discountAutomaticDelete(id: $id) { userErrors { message } }
  }`;

/* ------------------------------------------------------------------ */
/* Étiquettes des membres                                              */
/* ------------------------------------------------------------------ */

/**
 * Pose sur le client Shopify l'étiquette de son niveau actuel (et retire l'ancienne).
 * Ne lève pas d'erreur : un échec est journalisé et sera rattrapé à la prochaine synchro.
 */
export async function syncMemberTag(
  admin: AdminGraphql,
  shop: string,
  memberId: string,
  tiers?: Tier[],
): Promise<boolean> {
  const member = await db.member.findFirst({ where: { id: memberId, shop } });
  if (!member) return false;
  const list = tiers ?? (await getTiers(shop));
  const desired = memberTier(list, member)?.tag ?? null;
  if (member.appliedTag === desired) return false;

  try {
    if (member.appliedTag) {
      await gql(admin, TAGS_REMOVE, { id: member.customerId, tags: [member.appliedTag] });
    }
    if (desired) {
      await gql(admin, TAGS_ADD, { id: member.customerId, tags: [desired] });
    }
    await db.member.update({ where: { id: member.id }, data: { appliedTag: desired } });
    return true;
  } catch (error) {
    console.error(`Étiquette du membre ${member.id} non synchronisée`, error);
    return false;
  }
}

/** Met à jour l'étiquette de tous les membres dont le niveau a changé. */
export async function syncAllMemberTags(admin: AdminGraphql, shop: string) {
  const tiers = await getTiers(shop);
  const members = await db.member.findMany({
    where: { shop },
    select: { id: true, lifetimePoints: true, manualTierId: true, appliedTag: true },
  });
  let updated = 0;
  for (const m of members) {
    if ((memberTier(tiers, m)?.tag ?? null) === m.appliedTag) continue;
    if (await syncMemberTag(admin, shop, m.id, tiers)) updated++;
  }
  return updated;
}

/* ------------------------------------------------------------------ */
/* Remises automatiques des niveaux                                    */
/* ------------------------------------------------------------------ */

export function tierHasDiscounts(tier: Tier) {
  return (tier.discountType !== "NONE" && tier.discountValue > 0) || tier.freeShipping;
}

async function deleteTierDiscounts(admin: AdminGraphql, tier: Tier) {
  for (const id of [tier.discountId, tier.shippingDiscountId]) {
    if (!id) continue;
    // Déjà supprimée à la main dans Shopify : on ignore l'erreur.
    await gql(admin, AUTO_DELETE, { id }).catch(() => {});
  }
}

/**
 * Crée (ou recrée) dans Shopify le segment et les remises automatiques d'un niveau.
 * L'éventuelle erreur est enregistrée sur le niveau pour être affichée au marchand.
 */
export async function syncTierDiscounts(admin: AdminGraphql, tierId: string) {
  let tier = await db.tier.findUniqueOrThrow({ where: { id: tierId } });

  try {
    await deleteTierDiscounts(admin, tier);
    tier = await db.tier.update({
      where: { id: tier.id },
      data: { discountId: null, shippingDiscountId: null },
    });

    if (!tierHasDiscounts(tier) || !tier.tag) {
      if (tier.segmentId) {
        await gql(admin, SEGMENT_DELETE, { id: tier.segmentId }).catch(() => {});
      }
      await db.tier.update({ where: { id: tier.id }, data: { segmentId: null, syncError: null } });
      return;
    }

    let segmentId = tier.segmentId;
    if (!segmentId) {
      const escaped = tier.tag.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
      const result = await gql(admin, SEGMENT_CREATE, {
        name: `Fidélité – niveau ${tier.name} (${tier.id.slice(-5)})`,
        query: `customer_tags CONTAINS '${escaped}'`,
      });
      segmentId = result.segment?.id as string;
      await db.tier.update({ where: { id: tier.id }, data: { segmentId } });
    }

    const common = {
      startsAt: new Date().toISOString(),
      context: { customerSegments: { add: [segmentId] } },
      combinesWith: { orderDiscounts: true, productDiscounts: true, shippingDiscounts: true },
    };
    const data: { discountId?: string; shippingDiscountId?: string } = {};

    if (tier.discountType !== "NONE" && tier.discountValue > 0) {
      const value =
        tier.discountType === "PERCENT"
          ? { percentage: Math.min(100, tier.discountValue) / 100 }
          : { discountAmount: { amount: String(tier.discountValue), appliesOnEachItem: false } };
      const label =
        tier.discountType === "PERCENT" ? `${tier.discountValue} %` : `${tier.discountValue} €`;
      const result = await gql(admin, AUTO_BASIC_CREATE, {
        discount: {
          ...common,
          title: `Niveau ${tier.name} : -${label}`,
          customerGets: { value, items: { all: true } },
          ...(tier.discountMinSubtotal
            ? { minimumRequirement: { subtotal: { greaterThanOrEqualToSubtotal: String(tier.discountMinSubtotal) } } }
            : {}),
        },
      });
      data.discountId = result.automaticDiscountNode?.id;
    }

    if (tier.freeShipping) {
      const result = await gql(admin, AUTO_SHIPPING_CREATE, {
        discount: {
          ...common,
          title: `Niveau ${tier.name} : livraison offerte`,
          destination: { all: true },
        },
      });
      data.shippingDiscountId = result.automaticDiscountNode?.id;
    }

    await db.tier.update({ where: { id: tier.id }, data: { ...data, syncError: null } });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`Niveau ${tier.id} non synchronisé`, message);
    await db.tier.update({ where: { id: tier.id }, data: { syncError: message } });
  }
}

/** Supprime un niveau et tout ce qui a été créé dans Shopify pour lui. */
export async function deleteTier(admin: AdminGraphql, shop: string, tierId: string) {
  const tier = await db.tier.findFirst({ where: { id: tierId, shop } });
  if (!tier) return;
  await deleteTierDiscounts(admin, tier);
  if (tier.segmentId) await gql(admin, SEGMENT_DELETE, { id: tier.segmentId }).catch(() => {});
  await db.tier.delete({ where: { id: tier.id } });
  // Les membres de ce niveau passent au niveau calculé selon leurs points.
  await syncAllMemberTags(admin, shop);
}
