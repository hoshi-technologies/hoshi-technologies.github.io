/**
 * Tâches périodiques (anniversaires, expiration des points), lancées dans le
 * processus serveur toutes les heures. Elles sont idempotentes : plusieurs
 * instances ou exécutions le même jour ne créditent jamais deux fois.
 */
import db from "./db.server";
import { unauthenticated } from "./shopify.server";
import { awardBirthdays, expirePoints } from "./engagement.server";
import { syncMemberTag } from "./levels.server";

const HOUR = 3600 * 1000;

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

declare global {
  // eslint-disable-next-line no-var
  var loyaltyJobsStarted: boolean | undefined;
}

export function startJobs() {
  if (global.loyaltyJobsStarted || process.env.DISABLE_JOBS === "1") return;
  global.loyaltyJobsStarted = true;
  const run = () => runDailyJobs().catch((e) => console.error("Tâches quotidiennes", e));
  setTimeout(run, 60 * 1000);
  setInterval(run, HOUR).unref();
}
