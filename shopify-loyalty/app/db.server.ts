/**
 * Client Prisma branché sur la base Cloudflare D1 (liaison « DB »).
 * Attention : D1 n'exécute pas les transactions Prisma de façon atomique ;
 * le code métier utilise donc des mises à jour atomiques (increment, conditions).
 */
import { PrismaClient } from "./generated/prisma/client";
import { PrismaD1 } from "@prisma/adapter-d1";
import { env } from "cloudflare:workers";

const prisma = new PrismaClient({ adapter: new PrismaD1(env.DB) });

export default prisma;
