-- Langue et devise de la boutique (traductions et formats monétaires)
ALTER TABLE "Program" ADD COLUMN "locale" TEXT NOT NULL DEFAULT 'en';
ALTER TABLE "Program" ADD COLUMN "currency" TEXT NOT NULL DEFAULT 'USD';
