/** Lit le corps JSON d'une requête (objet vide si absent ou invalide). */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function readJson(request: Request): Promise<Record<string, any>> {
  try {
    const data = await request.json();
    return data && typeof data === "object" ? (data as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}
