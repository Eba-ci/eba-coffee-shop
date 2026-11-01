-- Anonymise une copie de la prod. Usage : psql -v ON_ERROR_STOP=1 -1 -d eba_staging -f deploy/anonymize-staging.sql
-- Une seule transaction ; refuse de tourner hors d'une base dont le nom contient « staging ».

DO $$
BEGIN
  IF current_database() !~* 'staging' THEN
    RAISE EXCEPTION 'Refusé : % n''est pas une base de staging', current_database();
  END IF;
END $$;

CREATE TEMP TABLE phone_map ON COMMIT DROP AS
SELECT old, '+22500' || lpad(row_number() OVER (ORDER BY old)::text, 8, '0') AS new
FROM (
  SELECT phone AS old FROM customer
  UNION SELECT "customerPhone" FROM "order"
  UNION SELECT "driverPhone" FROM "order"
  UNION SELECT "destinationPhone" FROM refund
  UNION SELECT "voterPhone" FROM poll_vote
  UNION SELECT "submitterPhone" FROM poll_suggestion
) p
WHERE old IS NOT NULL AND old NOT LIKE '+22500%';

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM phone_map a JOIN phone_map b ON a.old = b.new) THEN
    RAISE EXCEPTION 'Un numéro réel coïncide avec un numéro généré';
  END IF;
END $$;

DELETE FROM session;
DELETE FROM verification;
DELETE FROM oauth_access_token;
DELETE FROM oauth_consent;
DELETE FROM oauth_application;
DELETE FROM push_subscription;
DELETE FROM assistant_conversation;
DELETE FROM purchase_draft;

UPDATE account SET
  "accountId" = "userId", "accessToken" = NULL, "refreshToken" = NULL,
  "idToken" = NULL, password = NULL, scope = NULL;

UPDATE "user" SET
  email = 'staff-' || left(id, 8) || '@staging.invalid',
  name = 'Staff ' || left(id, 4),
  image = NULL;

UPDATE customer c SET
  phone = m.new,
  name = CASE WHEN c.name IS NULL THEN NULL ELSE 'Client ' || right(c.id, 6) END,
  "dateOfBirth" = NULL,
  "trustedNote" = NULL
FROM phone_map m WHERE m.old = c.phone;

UPDATE "order" o SET
  "customerName" = CASE WHEN o."customerName" IS NULL THEN NULL ELSE 'Client' END,
  "customerPhone" = COALESCE((SELECT new FROM phone_map WHERE old = o."customerPhone"), o."customerPhone"),
  "driverName" = CASE WHEN o."driverName" IS NULL THEN NULL ELSE 'Livreur' END,
  "driverPhone" = COALESCE((SELECT new FROM phone_map WHERE old = o."driverPhone"), o."driverPhone"),
  note = NULL,
  "paymentProofUrl" = NULL,
  "paymentProofAnalysis" = NULL;

UPDATE refund r SET
  "destinationPhone" = COALESCE((SELECT new FROM phone_map WHERE old = r."destinationPhone"), r."destinationPhone"),
  "customerName" = CASE WHEN r."customerName" IS NULL THEN NULL ELSE 'Client' END,
  note = NULL,
  "failureMessage" = NULL;

UPDATE refund_event SET note = NULL;
UPDATE customer_credit_entry SET note = NULL;
UPDATE loyalty_ledger SET note = NULL;
UPDATE jeko_withdrawal SET note = NULL;

UPDATE poll_vote v SET
  "voterPhone" = COALESCE((SELECT new FROM phone_map WHERE old = v."voterPhone"), v."voterPhone"),
  "voterToken" = CASE WHEN v."voterToken" IS NULL THEN NULL ELSE md5(v.id) END,
  "ipAddress" = NULL,
  "userAgent" = NULL;

UPDATE poll_suggestion s SET
  "submitterPhone" = COALESCE((SELECT new FROM phone_map WHERE old = s."submitterPhone"), s."submitterPhone"),
  "submitterName" = CASE WHEN s."submitterName" IS NULL THEN NULL ELSE 'Visiteur' END;

UPDATE investment_source SET name = 'Source ' || right(id, 6);
UPDATE investment SET
  financier = CASE WHEN financier IS NULL THEN NULL ELSE 'Financeur' END,
  note = NULL,
  "documentUrl" = NULL;

DO $$
DECLARE bad text;
BEGIN
  SELECT concat_ws(', ',
    CASE WHEN EXISTS (SELECT 1 FROM "user" WHERE email NOT LIKE '%@staging.invalid') THEN 'user.email' END,
    CASE WHEN EXISTS (SELECT 1 FROM customer WHERE phone NOT LIKE '+22500%') THEN 'customer.phone' END,
    CASE WHEN EXISTS (SELECT 1 FROM "order" WHERE "customerPhone" NOT LIKE '+22500%') THEN 'order.customerPhone' END,
    CASE WHEN EXISTS (SELECT 1 FROM "order" WHERE "driverPhone" NOT LIKE '+22500%') THEN 'order.driverPhone' END,
    CASE WHEN EXISTS (SELECT 1 FROM refund WHERE "destinationPhone" NOT LIKE '+22500%') THEN 'refund.destinationPhone' END,
    CASE WHEN EXISTS (SELECT 1 FROM poll_vote WHERE "voterPhone" NOT LIKE '+22500%' OR "ipAddress" IS NOT NULL) THEN 'poll_vote' END,
    CASE WHEN EXISTS (SELECT 1 FROM poll_suggestion WHERE "submitterPhone" NOT LIKE '+22500%') THEN 'poll_suggestion.submitterPhone' END,
    CASE WHEN EXISTS (SELECT 1 FROM "order" WHERE note IS NOT NULL OR "paymentProofUrl" IS NOT NULL) THEN 'order.note/preuve' END,
    CASE WHEN EXISTS (SELECT 1 FROM session) THEN 'session' END,
    CASE WHEN EXISTS (SELECT 1 FROM account WHERE password IS NOT NULL OR "accessToken" IS NOT NULL) THEN 'account' END
  ) INTO bad;
  IF bad <> '' THEN
    RAISE EXCEPTION 'Anonymisation incomplète : %', bad;
  END IF;
END $$;
