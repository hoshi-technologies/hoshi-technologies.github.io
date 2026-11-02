/**
 * Stockage des sessions Shopify dans D1 (table « Session »), via notre client Prisma.
 * Reprend le format de @shopify/shopify-app-session-storage-prisma, sans dépendre
 * de l'ancien client Prisma (incompatible avec Cloudflare Workers).
 */
import { Session } from "@shopify/shopify-api";
import type { SessionStorage } from "@shopify/shopify-app-session-storage";
import type { Session as SessionRow } from "./generated/prisma/client";
import db from "./db.server";

function sessionToRow(session: Session) {
  const params = session.toObject();
  const user = params.onlineAccessInfo?.associated_user;
  return {
    id: session.id,
    shop: session.shop,
    state: session.state,
    isOnline: session.isOnline,
    scope: session.scope || null,
    expires: session.expires || null,
    accessToken: session.accessToken || "",
    userId: user?.id ? BigInt(user.id) : null,
    firstName: user?.first_name || null,
    lastName: user?.last_name || null,
    email: user?.email || null,
    accountOwner: user?.account_owner || false,
    locale: user?.locale || null,
    collaborator: user?.collaborator || false,
    emailVerified: user?.email_verified || false,
    refreshToken: params.refreshToken || null,
    refreshTokenExpires: params.refreshTokenExpires ? new Date(params.refreshTokenExpires) : null,
  };
}

function rowToSession(row: SessionRow): Session {
  const params: Record<string, string | number | boolean> = {
    id: row.id,
    shop: row.shop,
    state: row.state,
    isOnline: row.isOnline,
    userId: String(row.userId),
    firstName: String(row.firstName),
    lastName: String(row.lastName),
    email: String(row.email),
    locale: String(row.locale),
    accountOwner: row.accountOwner,
  };
  if (row.collaborator !== null) params.collaborator = row.collaborator;
  if (row.emailVerified !== null) params.emailVerified = row.emailVerified;
  if (row.expires) params.expires = row.expires.getTime();
  if (row.scope) params.scope = row.scope;
  if (row.accessToken) params.accessToken = row.accessToken;
  if (row.refreshToken) params.refreshToken = row.refreshToken;
  if (row.refreshTokenExpires) params.refreshTokenExpires = row.refreshTokenExpires.getTime();
  return Session.fromPropertyArray(Object.entries(params), true);
}

export class D1SessionStorage implements SessionStorage {
  async storeSession(session: Session): Promise<boolean> {
    const data = sessionToRow(session);
    await db.session.upsert({ where: { id: session.id }, update: data, create: data });
    return true;
  }

  async loadSession(id: string): Promise<Session | undefined> {
    const row = await db.session.findUnique({ where: { id } });
    return row ? rowToSession(row) : undefined;
  }

  async deleteSession(id: string): Promise<boolean> {
    await db.session.deleteMany({ where: { id } });
    return true;
  }

  async deleteSessions(ids: string[]): Promise<boolean> {
    await db.session.deleteMany({ where: { id: { in: ids } } });
    return true;
  }

  async findSessionsByShop(shop: string): Promise<Session[]> {
    const rows = await db.session.findMany({ where: { shop }, take: 25, orderBy: [{ expires: "desc" }] });
    return rows.map(rowToSession);
  }
}
