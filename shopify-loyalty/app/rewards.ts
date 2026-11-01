/** Utilitaires partagés client/serveur pour les récompenses. */
export function rewardLabel(reward: { type: string; value: number }, currency = "€") {
  switch (reward.type) {
    case "PERCENT":
      return `${reward.value} % de réduction`;
    case "FREE_SHIPPING":
      return "Livraison offerte";
    default:
      return `${reward.value} ${currency} de réduction`;
  }
}
