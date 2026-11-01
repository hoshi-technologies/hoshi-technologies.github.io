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
    "minPoints" INTEGER NOT NULL,
    "multiplier" REAL NOT NULL DEFAULT 1,
    "color" TEXT NOT NULL DEFAULT '#B08D57'
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
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
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
    CONSTRAINT "Redemption_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "Member" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Redemption_rewardId_fkey" FOREIGN KEY ("rewardId") REFERENCES "Reward" ("id") ON DELETE SET NULL ON UPDATE CASCADE
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
CREATE INDEX "Transaction_shop_createdAt_idx" ON "Transaction"("shop", "createdAt");

-- CreateIndex
CREATE INDEX "Transaction_memberId_createdAt_idx" ON "Transaction"("memberId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Transaction_shop_type_reference_key" ON "Transaction"("shop", "type", "reference");

-- CreateIndex
CREATE INDEX "Redemption_shop_createdAt_idx" ON "Redemption"("shop", "createdAt");

-- CreateIndex
CREATE INDEX "Redemption_memberId_idx" ON "Redemption"("memberId");

