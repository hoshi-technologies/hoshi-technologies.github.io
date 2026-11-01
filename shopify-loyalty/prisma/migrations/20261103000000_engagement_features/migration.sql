-- AlterTable
ALTER TABLE "Redemption" ADD COLUMN "orderId" TEXT;
ALTER TABLE "Redemption" ADD COLUMN "orderTotal" REAL;
ALTER TABLE "Redemption" ADD COLUMN "usedAt" DATETIME;

-- CreateTable
CREATE TABLE "Referral" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shop" TEXT NOT NULL,
    "referrerId" TEXT NOT NULL,
    "friendEmail" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "discountId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "orderId" TEXT,
    "orderTotal" REAL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" DATETIME,
    CONSTRAINT "Referral_referrerId_fkey" FOREIGN KEY ("referrerId") REFERENCES "Member" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Program" (
    "shop" TEXT NOT NULL PRIMARY KEY,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "pointsName" TEXT NOT NULL DEFAULT 'points',
    "pointsPerUnit" REAL NOT NULL DEFAULT 1,
    "signupPoints" INTEGER NOT NULL DEFAULT 100,
    "firstOrderPoints" INTEGER NOT NULL DEFAULT 0,
    "widgetTitle" TEXT NOT NULL DEFAULT 'Mes récompenses',
    "widgetColor" TEXT NOT NULL DEFAULT '#5C6AC4',
    "widgetPosition" TEXT NOT NULL DEFAULT 'right',
    "birthdayPoints" INTEGER NOT NULL DEFAULT 200,
    "referralEnabled" BOOLEAN NOT NULL DEFAULT true,
    "referrerPoints" INTEGER NOT NULL DEFAULT 500,
    "friendRewardType" TEXT NOT NULL DEFAULT 'AMOUNT',
    "friendRewardValue" REAL NOT NULL DEFAULT 10,
    "friendMinSubtotal" REAL,
    "socialPoints" INTEGER NOT NULL DEFAULT 50,
    "instagramUrl" TEXT,
    "facebookUrl" TEXT,
    "tiktokUrl" TEXT,
    "bonusMultiplier" REAL NOT NULL DEFAULT 1,
    "bonusStartsAt" DATETIME,
    "bonusEndsAt" DATETIME,
    "bonusLabel" TEXT,
    "expirationMonths" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_Program" ("createdAt", "enabled", "firstOrderPoints", "pointsName", "pointsPerUnit", "shop", "signupPoints", "updatedAt", "widgetColor", "widgetPosition", "widgetTitle") SELECT "createdAt", "enabled", "firstOrderPoints", "pointsName", "pointsPerUnit", "shop", "signupPoints", "updatedAt", "widgetColor", "widgetPosition", "widgetTitle" FROM "Program";
DROP TABLE "Program";
ALTER TABLE "new_Program" RENAME TO "Program";
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
    "birthday" TEXT,
    "birthdaySetAt" DATETIME,
    "referralCode" TEXT,
    "lastActivityAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Member_manualTierId_fkey" FOREIGN KEY ("manualTierId") REFERENCES "Tier" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Member" ("appliedTag", "createdAt", "customerId", "email", "firstName", "id", "lastName", "lifetimePoints", "manualTierId", "ordersCount", "points", "shop", "updatedAt") SELECT "appliedTag", "createdAt", "customerId", "email", "firstName", "id", "lastName", "lifetimePoints", "manualTierId", "ordersCount", "points", "shop", "updatedAt" FROM "Member";
DROP TABLE "Member";
ALTER TABLE "new_Member" RENAME TO "Member";
CREATE INDEX "Member_shop_points_idx" ON "Member"("shop", "points");
CREATE UNIQUE INDEX "Member_shop_customerId_key" ON "Member"("shop", "customerId");
CREATE UNIQUE INDEX "Member_shop_referralCode_key" ON "Member"("shop", "referralCode");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "Referral_referrerId_idx" ON "Referral"("referrerId");

-- CreateIndex
CREATE UNIQUE INDEX "Referral_shop_friendEmail_key" ON "Referral"("shop", "friendEmail");

-- CreateIndex
CREATE UNIQUE INDEX "Referral_shop_code_key" ON "Referral"("shop", "code");

-- CreateIndex
CREATE UNIQUE INDEX "Redemption_shop_code_key" ON "Redemption"("shop", "code");

