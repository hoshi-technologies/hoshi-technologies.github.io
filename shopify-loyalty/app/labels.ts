/**
 * Libellés construits à partir des données (partagés client/serveur) :
 * récompenses, avantages des niveaux, cadeau de parrainage, historique des points.
 * Ils reçoivent la fonction de traduction et le format monétaire de la langue courante.
 */
import type { TFunction } from "./i18n/translate";

type Money = (n: number) => string;
const num = (n: number, locale?: string) => new Intl.NumberFormat(locale).format(n);

export function rewardLabel(reward: { type: string; value: number }, t: TFunction, money: Money) {
  switch (reward.type) {
    case "PERCENT":
      return t("labels.rewardPercent", { value: reward.value });
    case "FREE_SHIPPING":
      return t("labels.freeShipping");
    default:
      return t("labels.rewardAmount", { amount: money(reward.value) });
  }
}

export interface TierPerkFields {
  discountType: string;
  discountValue: number;
  discountMinSubtotal: number | null;
  freeShipping: boolean;
  multiplier: number;
  perks: string | null;
}

/** Liste lisible des avantages d'un niveau. */
export function tierPerks(tier: TierPerkFields, t: TFunction, money: Money, pointsName: string): string[] {
  const list: string[] = [];
  if (tier.discountType !== "NONE" && tier.discountValue > 0) {
    const discount =
      tier.discountType === "PERCENT"
        ? t("labels.percentOff", { value: tier.discountValue })
        : t("labels.amountOff", { amount: money(tier.discountValue) });
    list.push(
      tier.discountMinSubtotal
        ? t("labels.tierDiscountFrom", { discount, minimum: money(tier.discountMinSubtotal) })
        : t("labels.tierDiscount", { discount }),
    );
  }
  if (tier.freeShipping) list.push(t("labels.freeShipping"));
  if (tier.multiplier > 1) list.push(t("labels.pointsMultiplier", { pointsName, multiplier: tier.multiplier }));
  if (tier.perks?.trim()) list.push(...tier.perks.split("\n").map((p) => p.trim()).filter(Boolean));
  return list;
}

/** Cadeau offert à l'ami parrainé. */
export function friendRewardLabel(
  program: { friendRewardType: string; friendRewardValue: number; friendMinSubtotal: number | null },
  t: TFunction,
  money: Money,
) {
  const base = rewardLabel({ type: program.friendRewardType, value: program.friendRewardValue }, t, money);
  return program.friendMinSubtotal
    ? t("labels.withMinimum", { reward: base, minimum: money(program.friendMinSubtotal) })
    : base;
}

/** Détail d'une ligne d'historique (la description est stockée en JSON). */
export function describeTransaction(tx: { type: string; description: string }, t: TFunction, locale?: string) {
  let params: Record<string, string | number> = {};
  try {
    const parsed = JSON.parse(tx.description);
    if (parsed && typeof parsed === "object") params = parsed;
  } catch {
    // Ancien format texte libre : on l'affiche tel quel.
    return tx.description;
  }
  if (tx.type === "ORDER" && Number(params.bonus) > 1) {
    return t("tx.desc.ORDER_BONUS", { ...params, bonus: num(Number(params.bonus), locale) });
  }
  if (tx.type === "ADJUST") {
    return params.reason ? String(params.reason) : t(Number(params.points) > 0 ? "tx.desc.ADJUST_ADD" : "tx.desc.ADJUST_REMOVE");
  }
  return t(`tx.desc.${tx.type}`, params);
}

/** Titre affiché d'une récompense : celui du marchand, sinon un libellé traduit. */
export function rewardTitle(reward: { title: string; type: string; value: number }, t: TFunction, money: Money) {
  return reward.title.trim() || rewardLabel(reward, t, money);
}
