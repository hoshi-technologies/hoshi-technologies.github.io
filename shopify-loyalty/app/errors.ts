/**
 * Erreur métier traduisible : le code correspond à la clé « errors.<code> »
 * des dictionnaires, les paramètres sont injectés dans le texte traduit.
 */
export class LoyaltyError extends Error {
  constructor(
    public code: string,
    public params: Record<string, string | number> = {},
  ) {
    super(code);
    this.name = "LoyaltyError";
  }
}

/** Erreur prête à être renvoyée à l'interface (clé + paramètres). */
export function errorPayload(error: unknown) {
  if (error instanceof LoyaltyError) return { key: `errors.${error.code}`, params: error.params };
  const details = error instanceof Error ? error.message : String(error);
  return { key: "errors.unexpected", params: { details } };
}
