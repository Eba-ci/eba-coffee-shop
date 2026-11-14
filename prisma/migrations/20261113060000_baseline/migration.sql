-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateExtension
CREATE EXTENSION IF NOT EXISTS "citext";

-- CreateExtension
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- CreateExtension
CREATE EXTENSION IF NOT EXISTS "unaccent";

-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('USER', 'ADMIN', 'CASHIER', 'KITCHEN', 'MANAGER', 'COMPTABLE', 'ASSISTANT_MANAGER', 'ANALYSTE');

-- CreateEnum
CREATE TYPE "OrderStatus" AS ENUM ('NEW', 'PREPARING', 'READY', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "OrderType" AS ENUM ('DELIVERY', 'DINE_IN', 'TAKEAWAY');

-- CreateEnum
CREATE TYPE "PaymentMode" AS ENUM ('CASH', 'WAVE', 'ORANGE_MONEY', 'MTN_MONEY', 'MOOV_MONEY', 'DJAMO', 'OTHER', 'AVOIR');

-- CreateEnum
CREATE TYPE "OrderSource" AS ENUM ('ONLINE', 'CASHIER', 'MCP');

-- CreateEnum
CREATE TYPE "PaymentProofVerdict" AS ENUM ('MATCH', 'MISMATCH', 'UNREADABLE', 'PENDING');

-- CreateEnum
CREATE TYPE "LoyaltyRewardStatus" AS ENUM ('AVAILABLE', 'USED');

-- CreateEnum
CREATE TYPE "LoyaltyEventType" AS ENUM ('STAMP_EARNED', 'REWARD_EARNED', 'REWARD_USED', 'ADJUSTMENT');

-- CreateEnum
CREATE TYPE "CreditEntryKind" AS ENUM ('ISSUED', 'SPENT', 'RESTORED', 'CONVERTED', 'ADJUSTED');

-- CreateEnum
CREATE TYPE "PollStatus" AS ENUM ('DRAFT', 'OPEN', 'CLOSED');

-- CreateEnum
CREATE TYPE "PollResultsVisibility" AS ENUM ('LIVE', 'AFTER_CLOSE');

-- CreateEnum
CREATE TYPE "PollSuggestionStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "ExpensePaymentMethod" AS ENUM ('CASH', 'WAVE', 'BANK', 'OTHER');

-- CreateEnum
CREATE TYPE "ExpenseNature" AS ENUM ('FIXED', 'VARIABLE');

-- CreateEnum
CREATE TYPE "FixedCostPeriodicity" AS ENUM ('DAILY', 'WEEKLY', 'MONTHLY', 'QUARTERLY', 'YEARLY');

-- CreateEnum
CREATE TYPE "SalaryPaymentType" AS ENUM ('SALAIRE', 'ACOMPTE', 'AVANCE');

-- CreateEnum
CREATE TYPE "RefundStatus" AS ENUM ('REQUESTED', 'APPROVED', 'PROCESSING', 'UNCERTAIN', 'FAILED', 'PAID', 'REJECTED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "RefundDelivery" AS ENUM ('JEKO_TRANSFER', 'MANUAL', 'STORE_CREDIT');

-- CreateEnum
CREATE TYPE "RefundReason" AS ENUM ('PRODUCT_UNAVAILABLE', 'QUALITY', 'PRICE_ERROR', 'DOUBLE_PAYMENT', 'CUSTOMER_CHANGED_MIND', 'LATE_PAYMENT', 'COMMERCIAL_GESTURE', 'OTHER');

-- CreateEnum
CREATE TYPE "RefundSource" AS ENUM ('STAFF', 'AUTO_LATE');

-- CreateEnum
CREATE TYPE "RefundLineKind" AS ENUM ('PRODUCT', 'SUPPLEMENT');

-- CreateEnum
CREATE TYPE "StockHoldKind" AS ENUM ('PRODUCT', 'OPTION');

-- CreateEnum
CREATE TYPE "StockMovementSource" AS ENUM ('STAFF', 'MCP', 'SYSTEM');

-- CreateEnum
CREATE TYPE "StockMovementReason" AS ENUM ('BASELINE', 'ORDER_KITCHEN', 'HOLD_RESERVE', 'HOLD_RELEASE', 'ORDER_EDIT_ADD', 'ORDER_EDIT_REMOVE', 'SHORTAGE_COVER', 'REFUND_RESTOCK', 'EXPIRY_RELEASE', 'MANUAL_RESTOCK', 'MANUAL_SET', 'BULK_SET', 'FORM_EDIT', 'CREATED', 'OPTION_REMOVED', 'ANOMALY');

-- CreateEnum
CREATE TYPE "InvestmentPaymentMethod" AS ENUM ('CASH', 'WAVE', 'BANK', 'OTHER');

-- CreateEnum
CREATE TYPE "InventoryUnit" AS ENUM ('UNIT', 'KG', 'G', 'L', 'ML', 'BOX');

-- CreateEnum
CREATE TYPE "InventoryBatchSource" AS ENUM ('MANUAL', 'IMPORT');

-- CreateTable
CREATE TABLE "user" (
    "id" TEXT NOT NULL,
    "email" CITEXT NOT NULL,
    "name" TEXT,
    "role" "UserRole" NOT NULL DEFAULT 'USER',
    "disabledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "emailVerified" BOOLEAN NOT NULL DEFAULT false,
    "image" TEXT,

    CONSTRAINT "user_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "session" (
    "id" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "token" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "userId" TEXT NOT NULL,

    CONSTRAINT "session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "account" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "accessToken" TEXT,
    "refreshToken" TEXT,
    "idToken" TEXT,
    "accessTokenExpiresAt" TIMESTAMP(3),
    "refreshTokenExpiresAt" TIMESTAMP(3),
    "scope" TEXT,
    "password" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "account_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "verification" (
    "id" TEXT NOT NULL,
    "identifier" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "verification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "oauth_application" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "icon" TEXT,
    "metadata" TEXT,
    "clientId" TEXT NOT NULL,
    "clientSecret" TEXT,
    "redirectUrls" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "disabled" BOOLEAN NOT NULL DEFAULT false,
    "userId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "oauth_application_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "oauth_access_token" (
    "id" TEXT NOT NULL,
    "accessToken" TEXT NOT NULL,
    "refreshToken" TEXT NOT NULL,
    "accessTokenExpiresAt" TIMESTAMP(3) NOT NULL,
    "refreshTokenExpiresAt" TIMESTAMP(3) NOT NULL,
    "clientId" TEXT NOT NULL,
    "userId" TEXT,
    "scopes" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "oauth_access_token_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "oauth_consent" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "scopes" TEXT NOT NULL,
    "consentGiven" BOOLEAN NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "oauth_consent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "order" (
    "id" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "dailyDate" DATE NOT NULL,
    "dailyNumber" INTEGER NOT NULL,
    "customerName" TEXT,
    "customerPhone" TEXT,
    "pickupTime" TIMESTAMP(3),
    "orderType" "OrderType" NOT NULL DEFAULT 'TAKEAWAY',
    "items" JSONB NOT NULL,
    "total" INTEGER NOT NULL,
    "status" "OrderStatus" NOT NULL DEFAULT 'NEW',
    "note" TEXT,
    "isPaid" BOOLEAN NOT NULL DEFAULT false,
    "paymentMode" "PaymentMode",
    "paidAt" TIMESTAMP(3),
    "depositRequired" INTEGER,
    "depositPaid" INTEGER DEFAULT 0,
    "depositPaidAt" TIMESTAMP(3),
    "paymentAutoValidatedByAi" BOOLEAN NOT NULL DEFAULT false,
    "preparingStartedAt" TIMESTAMP(3),
    "readyAt" TIMESTAMP(3),
    "stockReservedAt" TIMESTAMP(3),
    "isOnAccount" BOOLEAN NOT NULL DEFAULT false,
    "driverRequested" BOOLEAN NOT NULL DEFAULT false,
    "driverRequestedAt" TIMESTAMP(3),
    "driverName" TEXT,
    "driverPhone" TEXT,
    "paymentProofUrl" TEXT,
    "paymentProofVerdict" "PaymentProofVerdict",
    "paymentProofAnalysis" JSONB,
    "paymentProofAnalyzedAt" TIMESTAMP(3),
    "source" "OrderSource" NOT NULL DEFAULT 'CASHIER',
    "loyaltyRewardId" TEXT,
    "loyaltyDiscount" INTEGER,
    "creditApplied" INTEGER NOT NULL DEFAULT 0,
    "onlineFee" INTEGER,
    "gatewayFee" INTEGER,
    "paymentRequestId" TEXT,
    "paymentExpiresAt" TIMESTAMP(3),
    "paymentAttempts" INTEGER NOT NULL DEFAULT 0,
    "paymentAmountDue" INTEGER,
    "paymentCreditPart" INTEGER NOT NULL DEFAULT 0,
    "paymentTransactionId" TEXT,
    "jekoAccount" TEXT NOT NULL DEFAULT 'A',
    "refundTransferId" TEXT,
    "refundedAt" TIMESTAMP(3),
    "refundAmount" INTEGER,
    "refundFee" INTEGER,
    "createdById" TEXT,
    "customerId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "order_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "order_payment" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "mode" "PaymentMode" NOT NULL,
    "amount" INTEGER NOT NULL,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "order_payment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "customer" (
    "id" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "name" TEXT,
    "dateOfBirth" DATE,
    "stampCount" INTEGER NOT NULL DEFAULT 0,
    "lastStampDate" DATE,
    "creditBalance" INTEGER NOT NULL DEFAULT 0,
    "isTrusted" BOOLEAN NOT NULL DEFAULT false,
    "trustedSince" TIMESTAMP(3),
    "trustedNote" TEXT,
    "anonymizedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "customer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "loyalty_reward" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "tier" INTEGER NOT NULL,
    "capAmount" INTEGER NOT NULL,
    "status" "LoyaltyRewardStatus" NOT NULL DEFAULT 'AVAILABLE',
    "earnedOrderId" TEXT,
    "usedOrderId" TEXT,
    "earnedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "usedAt" TIMESTAMP(3),
    "redeemedAsGift" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "loyalty_reward_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "loyalty_ledger" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "type" "LoyaltyEventType" NOT NULL,
    "stamps" INTEGER NOT NULL DEFAULT 0,
    "orderId" TEXT,
    "actorId" TEXT,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "loyalty_ledger_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "customer_credit_entry" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "kind" "CreditEntryKind" NOT NULL,
    "delta" INTEGER NOT NULL,
    "balanceAfter" INTEGER NOT NULL,
    "orderId" TEXT,
    "refundId" TEXT,
    "note" TEXT,
    "actorId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "customer_credit_entry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "credit_settings" (
    "id" TEXT NOT NULL DEFAULT 'singleton',
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "minRemaining" INTEGER NOT NULL DEFAULT 1500,
    "maxPercent" INTEGER NOT NULL DEFAULT 70,
    "onlineEnabled" BOOLEAN NOT NULL DEFAULT false,
    "onlineDailyCap" INTEGER NOT NULL DEFAULT 5000,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "credit_settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "loyalty_settings" (
    "id" TEXT NOT NULL DEFAULT 'singleton',
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "minOrderAmount" INTEGER NOT NULL DEFAULT 1000,
    "stampsPerCard" INTEGER NOT NULL DEFAULT 10,
    "tier1Stamps" INTEGER NOT NULL DEFAULT 5,
    "tier1RewardCap" INTEGER NOT NULL DEFAULT 1000,
    "tier2RewardCap" INTEGER NOT NULL DEFAULT 2500,
    "oneStampPerDay" BOOLEAN NOT NULL DEFAULT true,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "loyalty_settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "contact_settings" (
    "id" TEXT NOT NULL DEFAULT 'singleton',
    "address" TEXT NOT NULL,
    "district" TEXT NOT NULL,
    "landmark" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "whatsapp" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "mapsDirectionsUrl" TEXT NOT NULL,
    "mapsEmbedUrl" TEXT NOT NULL,
    "yangoLandmark" TEXT NOT NULL DEFAULT 'Odyssée du vin',
    "wavePaymentNumber" TEXT NOT NULL DEFAULT '+225 07 00 00 00 00',
    "orangeMoneyPaymentNumber" TEXT NOT NULL DEFAULT '+225 07 00 00 00 00',
    "instagramHandle" TEXT NOT NULL,
    "instagramUrl" TEXT NOT NULL,
    "tiktokHandle" TEXT NOT NULL,
    "tiktokUrl" TEXT NOT NULL,
    "facebookUrl" TEXT NOT NULL DEFAULT '',
    "xUrl" TEXT NOT NULL DEFAULT '',
    "linkedinUrl" TEXT NOT NULL DEFAULT '',
    "youtubeUrl" TEXT NOT NULL DEFAULT '',
    "hashtagLabel" TEXT NOT NULL,
    "hashtagUrl" TEXT NOT NULL,
    "legalName" TEXT NOT NULL DEFAULT '',
    "legalForm" TEXT NOT NULL DEFAULT '',
    "rccm" TEXT NOT NULL DEFAULT '',
    "ncc" TEXT NOT NULL DEFAULT '',
    "publicationDirector" TEXT NOT NULL DEFAULT '',
    "hostName" TEXT NOT NULL DEFAULT '',
    "artciReference" TEXT NOT NULL DEFAULT '',
    "privacyEmail" TEXT NOT NULL DEFAULT '',
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "contact_settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "poll" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "imageUrl" TEXT,
    "status" "PollStatus" NOT NULL DEFAULT 'DRAFT',
    "allowSuggestions" BOOLEAN NOT NULL DEFAULT false,
    "resultsVisibility" "PollResultsVisibility" NOT NULL DEFAULT 'AFTER_CLOSE',
    "opensAt" TIMESTAMP(3),
    "closesAt" TIMESTAMP(3),
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "poll_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "poll_option" (
    "id" TEXT NOT NULL,
    "pollId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "description" TEXT,
    "imageUrl" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "deletedAt" TIMESTAMP(3),
    "sourceSuggestionId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "poll_option_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tiktok_video" (
    "id" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "videoId" TEXT NOT NULL,
    "caption" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "oembedTitle" TEXT,
    "authorName" TEXT,
    "thumbnailUrl" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "tiktok_video_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "poll_vote" (
    "id" TEXT NOT NULL,
    "pollId" TEXT NOT NULL,
    "optionId" TEXT NOT NULL,
    "voterPhone" TEXT,
    "customerId" TEXT,
    "voterToken" TEXT,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "poll_vote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "poll_suggestion" (
    "id" TEXT NOT NULL,
    "pollId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "description" TEXT,
    "imageUrl" TEXT,
    "status" "PollSuggestionStatus" NOT NULL DEFAULT 'PENDING',
    "submitterPhone" TEXT,
    "submitterName" TEXT,
    "moderatedById" TEXT,
    "moderatedAt" TIMESTAMP(3),
    "rejectionReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "poll_suggestion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "menu_category" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "available" BOOLEAN NOT NULL DEFAULT true,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "scheduleId" TEXT,
    "advanceOrderDays" INTEGER,

    CONSTRAINT "menu_category_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "product" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "price" INTEGER NOT NULL,
    "coutMatiere" INTEGER NOT NULL DEFAULT 0,
    "coutEmballage" INTEGER NOT NULL DEFAULT 0,
    "imageUrl" TEXT,
    "available" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "featured" BOOLEAN NOT NULL DEFAULT false,
    "featuredOrder" INTEGER NOT NULL DEFAULT 0,
    "featuredBadge" TEXT,
    "stockQuantity" INTEGER,
    "unavailableUntil" TIMESTAMP(3),
    "deletedAt" TIMESTAMP(3),
    "categoryId" TEXT NOT NULL,
    "scheduleId" TEXT,
    "advanceOrderDays" INTEGER,
    "requiresDeposit" BOOLEAN NOT NULL DEFAULT false,
    "preorderable" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "product_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "product_schedule" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "days" INTEGER[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "product_schedule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "product_weekly_special" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "startDate" DATE NOT NULL,
    "endDate" DATE NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "product_weekly_special_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "restock_alert" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "groupName" TEXT,
    "optionName" TEXT,
    "targetKey" TEXT NOT NULL,
    "endpoint" TEXT NOT NULL,
    "p256dh" TEXT NOT NULL,
    "auth" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "restock_alert_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "supplement_group" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'extra',
    "required" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "available" BOOLEAN NOT NULL DEFAULT true,
    "minSelect" INTEGER,
    "maxSelect" INTEGER,
    "productId" TEXT,
    "isGlobal" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "supplement_group_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "supplement_option" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "price" INTEGER NOT NULL,
    "available" BOOLEAN NOT NULL DEFAULT true,
    "stockQuantity" INTEGER,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "groupId" TEXT NOT NULL,

    CONSTRAINT "supplement_option_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pickup_settings" (
    "id" TEXT NOT NULL DEFAULT 'singleton',
    "slotIntervalMin" INTEGER NOT NULL DEFAULT 15,
    "leadTimeMin" INTEGER NOT NULL DEFAULT 30,
    "visibleDays" INTEGER NOT NULL DEFAULT 7,
    "capacityPerSlot" INTEGER,
    "weeklyHours" JSONB NOT NULL DEFAULT '{}',
    "dateOverrides" JSONB NOT NULL DEFAULT '[]',
    "pickupAddress" TEXT,
    "pickupMapsUrl" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pickup_settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "menu_settings" (
    "id" TEXT NOT NULL DEFAULT 'singleton',
    "menuPdfUrl" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "menu_settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "expense_settings" (
    "id" TEXT NOT NULL DEFAULT 'singleton',
    "freqWindowDays" INTEGER NOT NULL DEFAULT 30,
    "freqMinCount" INTEGER NOT NULL DEFAULT 3,
    "cumulativeMinAmount" INTEGER NOT NULL DEFAULT 20000,
    "priceAberrantFactor" INTEGER NOT NULL DEFAULT 3,
    "draftTtlMinutes" INTEGER NOT NULL DEFAULT 10,
    "recurrenceSuggestMinHits" INTEGER NOT NULL DEFAULT 3,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "expense_settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "expense_category" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "deletedAt" TIMESTAMP(3),
    "nature" "ExpenseNature" NOT NULL DEFAULT 'VARIABLE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "expense_category_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fixed_cost" (
    "id" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "periodicity" "FixedCostPeriodicity" NOT NULL DEFAULT 'MONTHLY',
    "startDate" DATE NOT NULL,
    "endDate" DATE,
    "categoryId" TEXT NOT NULL,
    "importedCategoryId" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "note" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "fixed_cost_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fixed_cost_installment" (
    "id" TEXT NOT NULL,
    "fixedCostId" TEXT NOT NULL,
    "monthOffset" INTEGER NOT NULL DEFAULT 0,
    "day" INTEGER NOT NULL,
    "amount" INTEGER NOT NULL,

    CONSTRAINT "fixed_cost_installment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "employee" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "position" TEXT,
    "startDate" DATE NOT NULL,
    "endDate" DATE,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "employee_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "salary_rate" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "monthlyAmount" INTEGER NOT NULL,
    "startDate" DATE NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "salary_rate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "salary_payment" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "month" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "type" "SalaryPaymentType" NOT NULL,
    "paymentMethod" "ExpensePaymentMethod" NOT NULL DEFAULT 'WAVE',
    "recoveryMonths" INTEGER NOT NULL DEFAULT 1,
    "note" TEXT,
    "idempotencyKey" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "salary_payment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "expense" (
    "id" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "amount" INTEGER NOT NULL,
    "paymentMethod" "ExpensePaymentMethod" NOT NULL DEFAULT 'CASH',
    "supplier" TEXT,
    "note" TEXT,
    "receiptUrl" TEXT,
    "receiptNo" TEXT,
    "receiptPeriod" TEXT,
    "receiptSeq" INTEGER,
    "fixedCostId" TEXT,
    "dueDate" DATE,
    "idempotencyKey" TEXT,
    "salaryPaymentId" TEXT,
    "categoryId" TEXT NOT NULL,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "expense_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "expense_article" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "normalizedName" TEXT NOT NULL,
    "baseUnit" TEXT,
    "trackInventory" BOOLEAN NOT NULL DEFAULT false,
    "inventoryItemId" TEXT,
    "location" TEXT,
    "bulkPurchase" BOOLEAN NOT NULL DEFAULT false,
    "bulkPurchaseAt" TIMESTAMP(3),
    "wholesaleRefPrice" INTEGER,
    "archivedAt" TIMESTAMP(3),
    "mergedIntoId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "expense_article_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "article_alias" (
    "id" TEXT NOT NULL,
    "alias" TEXT NOT NULL,
    "supplierKey" TEXT,
    "articleId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "article_alias_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "expense_item" (
    "id" TEXT NOT NULL,
    "expenseId" TEXT NOT NULL,
    "articleId" TEXT,
    "rawLabel" TEXT NOT NULL,
    "label" TEXT,
    "qtyBase" DECIMAL(12,3),
    "formatQty" DECIMAL(12,3),
    "formatSize" DECIMAL(12,3),
    "unit" TEXT,
    "unitPrice" INTEGER,
    "amount" INTEGER NOT NULL,
    "pendingQuantity" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "expense_item_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "purchase_draft" (
    "id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "confirmedAt" TIMESTAMP(3),
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "purchase_draft_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cash_closing" (
    "id" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "openingFloat" INTEGER NOT NULL DEFAULT 0,
    "countedCash" INTEGER NOT NULL DEFAULT 0,
    "cashSales" INTEGER NOT NULL DEFAULT 0,
    "cashExpenses" INTEGER NOT NULL DEFAULT 0,
    "cashRefunds" INTEGER NOT NULL DEFAULT 0,
    "expectedCash" INTEGER NOT NULL DEFAULT 0,
    "difference" INTEGER NOT NULL DEFAULT 0,
    "note" TEXT,
    "closedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "cash_closing_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "order_stock_hold" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "kind" "StockHoldKind" NOT NULL,
    "resourceId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "order_stock_hold_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stock_movement" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "kind" "StockHoldKind" NOT NULL,
    "resourceId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "reason" "StockMovementReason" NOT NULL,
    "source" "StockMovementSource" NOT NULL DEFAULT 'STAFF',
    "delta" INTEGER,
    "before" INTEGER,
    "after" INTEGER,
    "orderId" TEXT,
    "refundId" TEXT,
    "actorId" TEXT,
    "note" TEXT,

    CONSTRAINT "stock_movement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "refund" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "reason" "RefundReason" NOT NULL,
    "note" TEXT,
    "source" "RefundSource" NOT NULL DEFAULT 'STAFF',
    "status" "RefundStatus" NOT NULL DEFAULT 'REQUESTED',
    "delivery" "RefundDelivery" NOT NULL,
    "channel" "PaymentMode" NOT NULL,
    "destinationPhone" TEXT,
    "customerId" TEXT,
    "customerName" TEXT,
    "requestedById" TEXT,
    "approvedById" TEXT,
    "approvedAt" TIMESTAMP(3),
    "paidAt" TIMESTAMP(3),
    "payoutDate" DATE,
    "attempt" INTEGER NOT NULL DEFAULT 0,
    "jekoTransferId" TEXT,
    "feeFcfa" INTEGER NOT NULL DEFAULT 0,
    "failureCode" TEXT,
    "failureMessage" TEXT,
    "creditSourceId" TEXT,
    "restockItems" BOOLEAN NOT NULL DEFAULT false,
    "stockRestoredAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "refund_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "refund_line" (
    "id" TEXT NOT NULL,
    "refundId" TEXT NOT NULL,
    "cartId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "kind" "RefundLineKind" NOT NULL,
    "groupName" TEXT,
    "optionName" TEXT,
    "quantity" INTEGER NOT NULL,
    "amount" INTEGER NOT NULL,

    CONSTRAINT "refund_line_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "refund_event" (
    "id" TEXT NOT NULL,
    "refundId" TEXT NOT NULL,
    "actorId" TEXT,
    "fromStatus" "RefundStatus",
    "toStatus" "RefundStatus" NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "refund_event_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "investment_source" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "investment_source_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "investment" (
    "id" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "amount" INTEGER NOT NULL,
    "paymentMethod" "InvestmentPaymentMethod" NOT NULL DEFAULT 'CASH',
    "financier" TEXT,
    "note" TEXT,
    "documentUrl" TEXT,
    "reimbursable" BOOLEAN NOT NULL DEFAULT false,
    "amountRepaid" INTEGER NOT NULL DEFAULT 0,
    "dueDate" DATE,
    "sourceId" TEXT NOT NULL,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "investment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "revenue_adjustment" (
    "id" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "amount" INTEGER NOT NULL,
    "paymentMode" "PaymentMode" NOT NULL DEFAULT 'CASH',
    "note" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "revenue_adjustment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "jeko_withdrawal" (
    "id" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "fee" INTEGER NOT NULL,
    "note" TEXT,
    "jekoAccount" TEXT NOT NULL DEFAULT 'A',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "jeko_withdrawal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "jeko_settings" (
    "id" TEXT NOT NULL DEFAULT 'singleton',
    "activeAccount" TEXT NOT NULL DEFAULT 'A',
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "jeko_settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inventory_item" (
    "id" TEXT NOT NULL,
    "sku" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT,
    "unit" "InventoryUnit" NOT NULL DEFAULT 'UNIT',
    "currentQuantity" DECIMAL(12,3) NOT NULL DEFAULT 0,
    "avgUnitCost" INTEGER NOT NULL DEFAULT 0,
    "safetyStock" DECIMAL(12,3) NOT NULL DEFAULT 0,
    "reorderPoint" DECIMAL(12,3),
    "supplier" TEXT,
    "notes" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "lastCountedAt" DATE,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "inventory_item_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inventory_restock_batch" (
    "id" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "supplier" TEXT,
    "note" TEXT,
    "source" "InventoryBatchSource" NOT NULL DEFAULT 'MANUAL',
    "expenseId" TEXT,
    "createdById" TEXT,
    "canceledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "inventory_restock_batch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inventory_purchase" (
    "id" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "quantity" DECIMAL(12,3) NOT NULL,
    "unitCost" INTEGER NOT NULL,
    "totalCost" INTEGER NOT NULL,
    "supplier" TEXT,
    "note" TEXT,
    "batchId" TEXT,
    "expenseId" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "inventory_purchase_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inventory_count" (
    "id" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "label" TEXT,
    "note" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "inventory_count_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inventory_count_line" (
    "id" TEXT NOT NULL,
    "countId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "openingQuantity" DECIMAL(12,3) NOT NULL,
    "purchasesQuantity" DECIMAL(12,3) NOT NULL,
    "countedQuantity" DECIMAL(12,3) NOT NULL,
    "consumption" DECIMAL(12,3) NOT NULL,
    "unitCostSnapshot" INTEGER NOT NULL,

    CONSTRAINT "inventory_count_line_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inventory_settings" (
    "id" TEXT NOT NULL DEFAULT 'singleton',
    "reminderDays" INTEGER NOT NULL DEFAULT 7,
    "reminderEnabled" BOOLEAN NOT NULL DEFAULT true,
    "lastReminderSentAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "inventory_settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "push_subscription" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "orderId" TEXT,
    "endpoint" TEXT NOT NULL,
    "p256dh" TEXT NOT NULL,
    "auth" TEXT NOT NULL,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "push_subscription_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "assistant_conversation" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "messages" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "assistant_conversation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "user_email_key" ON "user"("email");

-- CreateIndex
CREATE UNIQUE INDEX "session_token_key" ON "session"("token");

-- CreateIndex
CREATE UNIQUE INDEX "oauth_application_clientId_key" ON "oauth_application"("clientId");

-- CreateIndex
CREATE INDEX "oauth_application_userId_idx" ON "oauth_application"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "oauth_access_token_accessToken_key" ON "oauth_access_token"("accessToken");

-- CreateIndex
CREATE UNIQUE INDEX "oauth_access_token_refreshToken_key" ON "oauth_access_token"("refreshToken");

-- CreateIndex
CREATE INDEX "oauth_access_token_clientId_idx" ON "oauth_access_token"("clientId");

-- CreateIndex
CREATE INDEX "oauth_access_token_userId_idx" ON "oauth_access_token"("userId");

-- CreateIndex
CREATE INDEX "oauth_consent_clientId_idx" ON "oauth_consent"("clientId");

-- CreateIndex
CREATE INDEX "oauth_consent_userId_idx" ON "oauth_consent"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "order_reference_key" ON "order"("reference");

-- CreateIndex
CREATE INDEX "order_status_isPaid_idx" ON "order"("status", "isPaid");

-- CreateIndex
CREATE INDEX "order_isPaid_status_idx" ON "order"("isPaid", "status");

-- CreateIndex
CREATE INDEX "order_createdAt_idx" ON "order"("createdAt" DESC);

-- CreateIndex
CREATE INDEX "order_customerId_idx" ON "order"("customerId");

-- CreateIndex
CREATE INDEX "order_source_idx" ON "order"("source");

-- CreateIndex
CREATE UNIQUE INDEX "order_dailyDate_dailyNumber_key" ON "order"("dailyDate", "dailyNumber");

-- CreateIndex
CREATE INDEX "order_payment_orderId_idx" ON "order_payment"("orderId");

-- CreateIndex
CREATE INDEX "order_payment_mode_idx" ON "order_payment"("mode");

-- CreateIndex
CREATE UNIQUE INDEX "customer_phone_key" ON "customer"("phone");

-- CreateIndex
CREATE INDEX "loyalty_reward_customerId_status_idx" ON "loyalty_reward"("customerId", "status");

-- CreateIndex
CREATE INDEX "loyalty_ledger_customerId_idx" ON "loyalty_ledger"("customerId");

-- CreateIndex
CREATE INDEX "customer_credit_entry_customerId_createdAt_idx" ON "customer_credit_entry"("customerId", "createdAt");

-- CreateIndex
CREATE INDEX "customer_credit_entry_orderId_idx" ON "customer_credit_entry"("orderId");

-- CreateIndex
CREATE INDEX "customer_credit_entry_refundId_idx" ON "customer_credit_entry"("refundId");

-- CreateIndex
CREATE INDEX "poll_status_idx" ON "poll"("status");

-- CreateIndex
CREATE UNIQUE INDEX "poll_option_sourceSuggestionId_key" ON "poll_option"("sourceSuggestionId");

-- CreateIndex
CREATE INDEX "poll_option_pollId_deletedAt_idx" ON "poll_option"("pollId", "deletedAt");

-- CreateIndex
CREATE INDEX "tiktok_video_isActive_sortOrder_idx" ON "tiktok_video"("isActive", "sortOrder");

-- CreateIndex
CREATE INDEX "poll_vote_pollId_optionId_idx" ON "poll_vote"("pollId", "optionId");

-- CreateIndex
CREATE INDEX "poll_vote_customerId_idx" ON "poll_vote"("customerId");

-- CreateIndex
CREATE UNIQUE INDEX "poll_vote_pollId_voterPhone_key" ON "poll_vote"("pollId", "voterPhone");

-- CreateIndex
CREATE UNIQUE INDEX "poll_vote_pollId_voterToken_key" ON "poll_vote"("pollId", "voterToken");

-- CreateIndex
CREATE INDEX "poll_suggestion_pollId_status_idx" ON "poll_suggestion"("pollId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "menu_category_slug_key" ON "menu_category"("slug");

-- CreateIndex
CREATE INDEX "menu_category_deletedAt_idx" ON "menu_category"("deletedAt");

-- CreateIndex
CREATE INDEX "product_featured_featuredOrder_idx" ON "product"("featured", "featuredOrder");

-- CreateIndex
CREATE INDEX "product_deletedAt_idx" ON "product"("deletedAt");

-- CreateIndex
CREATE INDEX "product_weekly_special_productId_idx" ON "product_weekly_special"("productId");

-- CreateIndex
CREATE INDEX "restock_alert_productId_idx" ON "restock_alert"("productId");

-- CreateIndex
CREATE INDEX "restock_alert_createdAt_idx" ON "restock_alert"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "restock_alert_endpoint_targetKey_key" ON "restock_alert"("endpoint", "targetKey");

-- CreateIndex
CREATE INDEX "supplement_group_isGlobal_idx" ON "supplement_group"("isGlobal");

-- CreateIndex
CREATE UNIQUE INDEX "expense_category_name_key" ON "expense_category"("name");

-- CreateIndex
CREATE INDEX "expense_category_deletedAt_idx" ON "expense_category"("deletedAt");

-- CreateIndex
CREATE UNIQUE INDEX "fixed_cost_importedCategoryId_key" ON "fixed_cost"("importedCategoryId");

-- CreateIndex
CREATE INDEX "fixed_cost_categoryId_idx" ON "fixed_cost"("categoryId");

-- CreateIndex
CREATE INDEX "fixed_cost_active_idx" ON "fixed_cost"("active");

-- CreateIndex
CREATE UNIQUE INDEX "fixed_cost_installment_fixedCostId_monthOffset_day_key" ON "fixed_cost_installment"("fixedCostId", "monthOffset", "day");

-- CreateIndex
CREATE INDEX "employee_active_idx" ON "employee"("active");

-- CreateIndex
CREATE UNIQUE INDEX "salary_rate_employeeId_startDate_key" ON "salary_rate"("employeeId", "startDate");

-- CreateIndex
CREATE UNIQUE INDEX "salary_payment_idempotencyKey_key" ON "salary_payment"("idempotencyKey");

-- CreateIndex
CREATE INDEX "salary_payment_employeeId_month_idx" ON "salary_payment"("employeeId", "month");

-- CreateIndex
CREATE INDEX "salary_payment_month_idx" ON "salary_payment"("month");

-- CreateIndex
CREATE INDEX "salary_payment_date_idx" ON "salary_payment"("date");

-- CreateIndex
CREATE UNIQUE INDEX "expense_receiptNo_key" ON "expense"("receiptNo");

-- CreateIndex
CREATE UNIQUE INDEX "expense_idempotencyKey_key" ON "expense"("idempotencyKey");

-- CreateIndex
CREATE UNIQUE INDEX "expense_salaryPaymentId_key" ON "expense"("salaryPaymentId");

-- CreateIndex
CREATE INDEX "expense_date_idx" ON "expense"("date" DESC);

-- CreateIndex
CREATE INDEX "expense_categoryId_idx" ON "expense"("categoryId");

-- CreateIndex
CREATE INDEX "expense_fixedCostId_dueDate_idx" ON "expense"("fixedCostId", "dueDate");

-- CreateIndex
CREATE UNIQUE INDEX "expense_receiptPeriod_receiptSeq_key" ON "expense"("receiptPeriod", "receiptSeq");

-- CreateIndex
CREATE UNIQUE INDEX "expense_article_normalizedName_key" ON "expense_article"("normalizedName");

-- CreateIndex
CREATE UNIQUE INDEX "expense_article_inventoryItemId_key" ON "expense_article"("inventoryItemId");

-- CreateIndex
CREATE INDEX "expense_article_archivedAt_idx" ON "expense_article"("archivedAt");

-- CreateIndex
CREATE INDEX "expense_article_bulkPurchase_idx" ON "expense_article"("bulkPurchase");

-- CreateIndex
CREATE INDEX "article_alias_articleId_idx" ON "article_alias"("articleId");

-- CreateIndex
CREATE UNIQUE INDEX "article_alias_alias_supplierKey_key" ON "article_alias"("alias", "supplierKey");

-- CreateIndex
CREATE INDEX "expense_item_expenseId_idx" ON "expense_item"("expenseId");

-- CreateIndex
CREATE INDEX "expense_item_articleId_idx" ON "expense_item"("articleId");

-- CreateIndex
CREATE INDEX "purchase_draft_expiresAt_idx" ON "purchase_draft"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "cash_closing_date_key" ON "cash_closing"("date");

-- CreateIndex
CREATE INDEX "cash_closing_date_idx" ON "cash_closing"("date" DESC);

-- CreateIndex
CREATE INDEX "order_stock_hold_resourceId_idx" ON "order_stock_hold"("resourceId");

-- CreateIndex
CREATE UNIQUE INDEX "order_stock_hold_orderId_kind_resourceId_key" ON "order_stock_hold"("orderId", "kind", "resourceId");

-- CreateIndex
CREATE INDEX "stock_movement_resourceId_createdAt_idx" ON "stock_movement"("resourceId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "stock_movement_orderId_idx" ON "stock_movement"("orderId");

-- CreateIndex
CREATE INDEX "stock_movement_createdAt_idx" ON "stock_movement"("createdAt" DESC);

-- CreateIndex
CREATE INDEX "stock_movement_reason_createdAt_idx" ON "stock_movement"("reason", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "refund_orderId_idx" ON "refund"("orderId");

-- CreateIndex
CREATE INDEX "refund_status_idx" ON "refund"("status");

-- CreateIndex
CREATE INDEX "refund_payoutDate_idx" ON "refund"("payoutDate");

-- CreateIndex
CREATE INDEX "refund_creditSourceId_idx" ON "refund"("creditSourceId");

-- CreateIndex
CREATE INDEX "refund_line_refundId_idx" ON "refund_line"("refundId");

-- CreateIndex
CREATE INDEX "refund_event_refundId_idx" ON "refund_event"("refundId");

-- CreateIndex
CREATE UNIQUE INDEX "investment_source_name_key" ON "investment_source"("name");

-- CreateIndex
CREATE INDEX "investment_source_deletedAt_idx" ON "investment_source"("deletedAt");

-- CreateIndex
CREATE INDEX "investment_date_idx" ON "investment"("date" DESC);

-- CreateIndex
CREATE INDEX "investment_sourceId_idx" ON "investment"("sourceId");

-- CreateIndex
CREATE INDEX "revenue_adjustment_date_idx" ON "revenue_adjustment"("date" DESC);

-- CreateIndex
CREATE INDEX "jeko_withdrawal_createdAt_idx" ON "jeko_withdrawal"("createdAt" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "inventory_item_sku_key" ON "inventory_item"("sku");

-- CreateIndex
CREATE INDEX "inventory_item_active_category_idx" ON "inventory_item"("active", "category");

-- CreateIndex
CREATE INDEX "inventory_item_name_idx" ON "inventory_item"("name");

-- CreateIndex
CREATE INDEX "inventory_restock_batch_date_idx" ON "inventory_restock_batch"("date" DESC);

-- CreateIndex
CREATE INDEX "inventory_purchase_itemId_date_idx" ON "inventory_purchase"("itemId", "date" DESC);

-- CreateIndex
CREATE INDEX "inventory_purchase_date_idx" ON "inventory_purchase"("date" DESC);

-- CreateIndex
CREATE INDEX "inventory_purchase_batchId_idx" ON "inventory_purchase"("batchId");

-- CreateIndex
CREATE INDEX "inventory_purchase_expenseId_idx" ON "inventory_purchase"("expenseId");

-- CreateIndex
CREATE INDEX "inventory_count_date_idx" ON "inventory_count"("date" DESC);

-- CreateIndex
CREATE INDEX "inventory_count_line_itemId_idx" ON "inventory_count_line"("itemId");

-- CreateIndex
CREATE UNIQUE INDEX "inventory_count_line_countId_itemId_key" ON "inventory_count_line"("countId", "itemId");

-- CreateIndex
CREATE UNIQUE INDEX "push_subscription_endpoint_key" ON "push_subscription"("endpoint");

-- CreateIndex
CREATE INDEX "push_subscription_userId_idx" ON "push_subscription"("userId");

-- CreateIndex
CREATE INDEX "push_subscription_orderId_idx" ON "push_subscription"("orderId");

-- CreateIndex
CREATE INDEX "assistant_conversation_userId_updatedAt_idx" ON "assistant_conversation"("userId", "updatedAt");

-- AddForeignKey
ALTER TABLE "session" ADD CONSTRAINT "session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "account" ADD CONSTRAINT "account_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order" ADD CONSTRAINT "order_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order" ADD CONSTRAINT "order_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_payment" ADD CONSTRAINT "order_payment_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_payment" ADD CONSTRAINT "order_payment_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "loyalty_reward" ADD CONSTRAINT "loyalty_reward_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "loyalty_ledger" ADD CONSTRAINT "loyalty_ledger_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_credit_entry" ADD CONSTRAINT "customer_credit_entry_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "poll" ADD CONSTRAINT "poll_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "poll_option" ADD CONSTRAINT "poll_option_pollId_fkey" FOREIGN KEY ("pollId") REFERENCES "poll"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "poll_option" ADD CONSTRAINT "poll_option_sourceSuggestionId_fkey" FOREIGN KEY ("sourceSuggestionId") REFERENCES "poll_suggestion"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tiktok_video" ADD CONSTRAINT "tiktok_video_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "poll_vote" ADD CONSTRAINT "poll_vote_pollId_fkey" FOREIGN KEY ("pollId") REFERENCES "poll"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "poll_vote" ADD CONSTRAINT "poll_vote_optionId_fkey" FOREIGN KEY ("optionId") REFERENCES "poll_option"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "poll_vote" ADD CONSTRAINT "poll_vote_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "poll_suggestion" ADD CONSTRAINT "poll_suggestion_pollId_fkey" FOREIGN KEY ("pollId") REFERENCES "poll"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "poll_suggestion" ADD CONSTRAINT "poll_suggestion_moderatedById_fkey" FOREIGN KEY ("moderatedById") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "menu_category" ADD CONSTRAINT "menu_category_scheduleId_fkey" FOREIGN KEY ("scheduleId") REFERENCES "product_schedule"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product" ADD CONSTRAINT "product_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "menu_category"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product" ADD CONSTRAINT "product_scheduleId_fkey" FOREIGN KEY ("scheduleId") REFERENCES "product_schedule"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_weekly_special" ADD CONSTRAINT "product_weekly_special_productId_fkey" FOREIGN KEY ("productId") REFERENCES "product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "restock_alert" ADD CONSTRAINT "restock_alert_productId_fkey" FOREIGN KEY ("productId") REFERENCES "product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supplement_group" ADD CONSTRAINT "supplement_group_productId_fkey" FOREIGN KEY ("productId") REFERENCES "product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supplement_option" ADD CONSTRAINT "supplement_option_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "supplement_group"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fixed_cost" ADD CONSTRAINT "fixed_cost_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "expense_category"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fixed_cost_installment" ADD CONSTRAINT "fixed_cost_installment_fixedCostId_fkey" FOREIGN KEY ("fixedCostId") REFERENCES "fixed_cost"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "salary_rate" ADD CONSTRAINT "salary_rate_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "salary_payment" ADD CONSTRAINT "salary_payment_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "salary_payment" ADD CONSTRAINT "salary_payment_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "expense" ADD CONSTRAINT "expense_fixedCostId_fkey" FOREIGN KEY ("fixedCostId") REFERENCES "fixed_cost"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "expense" ADD CONSTRAINT "expense_salaryPaymentId_fkey" FOREIGN KEY ("salaryPaymentId") REFERENCES "salary_payment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "expense" ADD CONSTRAINT "expense_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "expense_category"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "expense" ADD CONSTRAINT "expense_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "expense_article" ADD CONSTRAINT "expense_article_inventoryItemId_fkey" FOREIGN KEY ("inventoryItemId") REFERENCES "inventory_item"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "expense_article" ADD CONSTRAINT "expense_article_mergedIntoId_fkey" FOREIGN KEY ("mergedIntoId") REFERENCES "expense_article"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "article_alias" ADD CONSTRAINT "article_alias_articleId_fkey" FOREIGN KEY ("articleId") REFERENCES "expense_article"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "expense_item" ADD CONSTRAINT "expense_item_expenseId_fkey" FOREIGN KEY ("expenseId") REFERENCES "expense"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "expense_item" ADD CONSTRAINT "expense_item_articleId_fkey" FOREIGN KEY ("articleId") REFERENCES "expense_article"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_draft" ADD CONSTRAINT "purchase_draft_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cash_closing" ADD CONSTRAINT "cash_closing_closedById_fkey" FOREIGN KEY ("closedById") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_stock_hold" ADD CONSTRAINT "order_stock_hold_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refund" ADD CONSTRAINT "refund_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refund" ADD CONSTRAINT "refund_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refund" ADD CONSTRAINT "refund_requestedById_fkey" FOREIGN KEY ("requestedById") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refund" ADD CONSTRAINT "refund_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refund_line" ADD CONSTRAINT "refund_line_refundId_fkey" FOREIGN KEY ("refundId") REFERENCES "refund"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refund_event" ADD CONSTRAINT "refund_event_refundId_fkey" FOREIGN KEY ("refundId") REFERENCES "refund"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refund_event" ADD CONSTRAINT "refund_event_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "investment" ADD CONSTRAINT "investment_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "investment_source"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "investment" ADD CONSTRAINT "investment_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "revenue_adjustment" ADD CONSTRAINT "revenue_adjustment_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_restock_batch" ADD CONSTRAINT "inventory_restock_batch_expenseId_fkey" FOREIGN KEY ("expenseId") REFERENCES "expense"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_restock_batch" ADD CONSTRAINT "inventory_restock_batch_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_purchase" ADD CONSTRAINT "inventory_purchase_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "inventory_item"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_purchase" ADD CONSTRAINT "inventory_purchase_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "inventory_restock_batch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_purchase" ADD CONSTRAINT "inventory_purchase_expenseId_fkey" FOREIGN KEY ("expenseId") REFERENCES "expense"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_purchase" ADD CONSTRAINT "inventory_purchase_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_count" ADD CONSTRAINT "inventory_count_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_count_line" ADD CONSTRAINT "inventory_count_line_countId_fkey" FOREIGN KEY ("countId") REFERENCES "inventory_count"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_count_line" ADD CONSTRAINT "inventory_count_line_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "inventory_item"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "push_subscription" ADD CONSTRAINT "push_subscription_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "push_subscription" ADD CONSTRAINT "push_subscription_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assistant_conversation" ADD CONSTRAINT "assistant_conversation_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

