/**
 * Tâches périodiques (anniversaires, expiration des points), déclenchées toutes
 * les heures par le Cron Trigger Cloudflare (voir wrangler.jsonc et workers/app.ts).
 * Elles sont idempotentes : plusieurs exécutions le même jour ne créditent jamais deux fois.
 */
import db from "./db.server";
import { unauthenticated } from "./shopify.server";
import { awardBirthdays, expirePoints } from "./engagement.server";
import { syncMemberTag } from "./levels.server";

export async function runDailyJobs(now = new Date()) {
  const programs = await db.program.findMany({ where: { enabled: true }, select: { shop: true } });
  for (const { shop } of programs) {
    // Boutique désinstallée : plus de session, on ne fait rien.
    const hasSession = await db.session.findFirst({ where: { shop }, select: { id: true } });
    if (!hasSession) continue;
    try {
      const birthdays = await awardBirthdays(shop, now);
      await expirePoints(shop, now);
      if (birthdays.length) {
        // Les points d'anniversaire peuvent faire monter de niveau.
        const { admin } = await unauthenticated.admin(shop);
        for (const id of birthdays) await syncMemberTag(admin, shop, id);
      }
    } catch (error) {
      console.error(`Tâches quotidiennes en échec pour ${shop}`, error);
    }
  }
}
