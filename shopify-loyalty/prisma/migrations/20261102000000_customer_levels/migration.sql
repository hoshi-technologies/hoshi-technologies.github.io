-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Tier" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shop" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "mode" TEXT NOT NULL DEFAULT 'AUTO',
    "minPoints" INTEGER NOT NULL DEFAULT 0,
    "multiplier" REAL NOT NULL DEFAULT 1,
    "color" TEXT NOT NULL DEFAULT '#B08D57',
    "discountType" TEXT NOT NULL DEFAULT 'NONE',
    "discountValue" REAL NOT NULL DEFAULT 0,
    "discountMinSubtotal" REAL,
    "freeShipping" BOOLEAN NOT NULL DEFAULT false,
    "perks" TEXT,
    "tag" TEXT,
    "segmentId" TEXT,
    "discountId" TEXT,
    "shippingDiscountId" TEXT,
    "syncError" TEXT
);
INSERT INTO "new_Tier" ("color", "id", "minPoints", "multiplier", "name", "shop") SELECT "color", "id", "minPoints", "multiplier", "name", "shop" FROM "Tier";
DROP TABLE "Tier";
ALTER TABLE "new_Tier" RENAME TO "Tier";
CREATE INDEX "Tier_shop_idx" ON "Tier"("shop");
CREATE TABLE "new_Member" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shop" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "email" TEXT,
    "firstName" TEXT,
    "lastName" TEXT,
    "points" INTEGER NOT NULL DEFAULT 0,
    "lifetimePoints" INTEGER NOT NULL DEFAULT 0,
    "ordersCount" INTEGER NOT NULL DEFAULT 0,
    "manualTierId" TEXT,
    "appliedTag" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Member_manualTierId_fkey" FOREIGN KEY ("manualTierId") REFERENCES "Tier" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Member" ("createdAt", "customerId", "email", "firstName", "id", "lastName", "lifetimePoints", "ordersCount", "points", "shop", "updatedAt") SELECT "createdAt", "customerId", "email", "firstName", "id", "lastName", "lifetimePoints", "ordersCount", "points", "shop", "updatedAt" FROM "Member";
DROP TABLE "Member";
ALTER TABLE "new_Member" RENAME TO "Member";
CREATE INDEX "Member_shop_points_idx" ON "Member"("shop", "points");
CREATE UNIQUE INDEX "Member_shop_customerId_key" ON "Member"("shop", "customerId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

