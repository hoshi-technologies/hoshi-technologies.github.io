-- Migration initiale « Hoshi Fidélité » (générée depuis prisma/schema.prisma)
-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shop" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "isOnline" BOOLEAN NOT NULL DEFAULT false,
    "scope" TEXT,
    "expires" DATETIME,
    "accessToken" TEXT NOT NULL,
    "userId" BIGINT,
    "firstName" TEXT,
    "lastName" TEXT,
    "email" TEXT,
    "accountOwner" BOOLEAN NOT NULL DEFAULT false,
    "locale" TEXT,
    "collaborator" BOOLEAN DEFAULT false,
    "emailVerified" BOOLEAN DEFAULT false,
    "refreshToken" TEXT,
    "refreshTokenExpires" DATETIME
);

-- CreateTable
CREATE TABLE "Program" (
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

-- CreateTable
CREATE TABLE "Reward" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shop" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "value" REAL NOT NULL DEFAULT 0,
    "pointsCost" INTEGER NOT NULL,
    "minSubtotal" REAL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "Tier" (
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

-- CreateTable
CREATE TABLE "Member" (
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

-- CreateTable
CREATE TABLE "Transaction" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shop" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "points" INTEGER NOT NULL,
    "type" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "reference" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Transaction_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "Member" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Redemption" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shop" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "rewardId" TEXT,
    "title" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "discountId" TEXT,
    "pointsCost" INTEGER NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "usedAt" DATETIME,
    "orderId" TEXT,
    "orderTotal" REAL,
    CONSTRAINT "Redemption_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "Member" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Redemption_rewardId_fkey" FOREIGN KEY ("rewardId") REFERENCES "Reward" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

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

-- CreateIndex
CREATE INDEX "Reward_shop_idx" ON "Reward"("shop");

-- CreateIndex
CREATE INDEX "Tier_shop_idx" ON "Tier"("shop");

-- CreateIndex
CREATE INDEX "Member_shop_points_idx" ON "Member"("shop", "points");

-- CreateIndex
CREATE UNIQUE INDEX "Member_shop_customerId_key" ON "Member"("shop", "customerId");

-- CreateIndex
CREATE UNIQUE INDEX "Member_shop_referralCode_key" ON "Member"("shop", "referralCode");

-- CreateIndex
CREATE INDEX "Transaction_shop_createdAt_idx" ON "Transaction"("shop", "createdAt");

-- CreateIndex
CREATE INDEX "Transaction_memberId_createdAt_idx" ON "Transaction"("memberId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Transaction_shop_type_reference_key" ON "Transaction"("shop", "type", "reference");

-- CreateIndex
CREATE INDEX "Redemption_shop_createdAt_idx" ON "Redemption"("shop", "createdAt");

-- CreateIndex
CREATE INDEX "Redemption_memberId_idx" ON "Redemption"("memberId");

-- CreateIndex
CREATE UNIQUE INDEX "Redemption_shop_code_key" ON "Redemption"("shop", "code");

-- CreateIndex
CREATE INDEX "Referral_referrerId_idx" ON "Referral"("referrerId");

-- CreateIndex
CREATE UNIQUE INDEX "Referral_shop_friendEmail_key" ON "Referral"("shop", "friendEmail");

-- CreateIndex
CREATE UNIQUE INDEX "Referral_shop_code_key" ON "Referral"("shop", "code");

