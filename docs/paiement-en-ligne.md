# Paiement en ligne (Jèko)

Le client paie sa commande en ligne via **Jèko Checkout** (Wave, Orange Money, MTN
Money, Moov Money, Djamo), puis revient sur le site. Il paie **1 %** de frais ; Jèko
prélève **1,5 %**, EBA absorbe l'écart.

## Le parcours

1. Le checkout envoie le panier **et** le moyen choisi à `POST /api/commandes`.
2. Le serveur **ne croit rien du navigateur** : prix, suppléments et total sont
   revérifiés contre le menu (`lib/orders/cart-verification.ts`). Un total falsifié
   est refusé (`409 CART_CHANGED`) et ne crée aucune commande.
3. La commande est créée **en attente** et reste **invisible du staff** (caisse,
   cuisine, stats) tant qu'elle n'est pas payée (`lib/orders/visibility.ts`). Pour un
   retrait **aujourd'hui** (non différé), le stock des articles est **réservé tout
   de suite** (`reserveStockOnce`, lib/order-mutations.ts) — pas seulement vérifié :
   personne d'autre ne peut vendre ces articles pendant que ce client paie. Une
   pénurie refuse la création elle-même (`409`), avant toute redirection vers Jèko.
4. Le client est redirigé vers Jèko, paie, puis revient sur `/commande/[id]`.
5. Le **webhook** (`POST /api/webhooks/jeko`) règle la commande : elle passe en
   cuisine, le staff est prévenu. Au retour du client, `…/paiement/verifier` fait la
   même chose sans attendre le webhook (Jèko peut mettre 5 min à réconcilier).
6. Sans paiement, la commande **expire après 3 min** (`PAYMENT_EXPIRY_MINUTES`) —
   délibérément court : la fenêtre immobilise du stock réel, voir point 3.

## Variables d'environnement

Toutes optionnelles : tant que les quatre premières ne sont pas toutes renseignées,
le paiement en ligne reste **inerte** : les commandes sont créées comme avant et se règlent
au comptoir (la capture d'écran + IA n'existe plus, cf. « À savoir »).

| Variable              | Rôle                                         | Où la trouver                                                                                                                          |
| --------------------- | -------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| `JEKO_API_KEY`        | Clé API (`X-API-KEY`)                        | Dashboard Business › Paramètres › API & Webhooks                                                                                       |
| `JEKO_API_KEY_ID`     | Identifiant de la clé (`X-API-KEY-ID`)       | Même écran                                                                                                                             |
| `JEKO_STORE_ID`       | UUID du magasin qui encaisse                 | `GET https://api.jeko.africa/partner_api/stores` avec les deux en-têtes `X-API-KEY` / `X-API-KEY-ID` : renvoie la liste `{ id, name }` |
| `JEKO_WEBHOOK_SECRET` | Signe les webhooks (HMAC-SHA256)             | Même écran, après avoir saisi l'URL du webhook                                                                                         |
| `JEKO_API_BASE_URL`   | Racine de l'API ; absente = production       | Seulement pour viser le serveur factice                                                                                                |
| `ONLINE_FEE_PERCENT`  | Frais facturés au client, en % ; absente = 1 | —                                                                                                                                      |

**Dans le Dashboard Jèko**, un seul champ à remplir : l'URL du webhook
`https://<ton-domaine>/api/webhooks/jeko` (HTTPS public, **une seule URL par
magasin**). Les URLs de retour ne se configurent pas : le code les envoie à chaque
paiement.

## Deux comptes Jèko (A et B)

Un compte Jèko est plafonné (2 000 000 F). Le second compte se configure avec les
mêmes variables préfixées `JEKO_B_` : `JEKO_B_API_KEY`, `JEKO_B_API_KEY_ID`,
`JEKO_B_STORE_ID`, `JEKO_B_WEBHOOK_SECRET` (les quatre, sinon le compte est
inactif). `JEKO_*` reste le compte **A**.

- **Basculer** : `/dashboard/jeko` (admin), boutons « Compte A / Compte B ». Le
  compte actif ne sert qu'à **créer** de nouveaux paiements ou à relancer un
  paiement en attente.
- **Une commande reste sur son compte** (`Order.jekoAccount`) : vérification,
  expiration, règlement tardif et remboursements utilisent les clés du compte qui
  a encaissé, jamais le compte actif. Sans ça, une demande du compte A relue avec
  les clés de B répondrait 404 et la commande serait annulée alors qu'elle est
  peut-être payée.
- **Webhook** : la même URL `https://<ton-domaine>/api/webhooks/jeko` se saisit
  sur chacun des deux comptes. Chaque compte a son secret : la signature qui
  valide dit lequel a encaissé.
- **Soldes** : un bloc par compte (encaissements, remboursements, retraits propres
  au compte). Le solde attendu est comparé au **solde réel** lu chez Jèko
  (`GET /partner_api/stores/{storeId}/balance`, `lib/jeko/balance.ts`) ; si la
  réponse n'a pas la forme attendue, la page affiche le JSON brut.
- **Frais de retrait** : choisis au moment d'enregistrer un retrait — 1,5 % (par défaut), gratuit, ou 1 000 F fixes. Le montant débité et le « retirable au maximum » suivent le tarif choisi ; la carte du bloc compte avec le tarif par défaut (1,5 %).
- **Plafond MENSUEL** (`JEKO_MONTHLY_LIMIT_FCFA`) : c'est un flux, pas un plafond de
  solde — un retrait ne libère rien. La page compte ce que le compte a encaissé
  dans le mois civil en cours (`paidAt`) et alerte à 90 %.
- **Remboursements** : le transfert part du compte qui a encaissé la commande ;
  son solde Jèko doit le couvrir et sa clé avoir le droit Pay-out.
- Après déploiement : `pnpm db:push` (migration `20261023090000_add_jeko_accounts`,
  les commandes et retraits existants passent sur le compte A).

## Tester en local (sans argent réel)

Jèko n'a pas de sandbox. Le projet fournit donc un **serveur Jèko factice**
(`scripts/jeko-mock/`) qui imite le contrat documenté et envoie de vrais webhooks
signés.

```bash
cp .env.example .env            # puis décommenter le bloc « Paiement en ligne (Jèko) »
docker compose up -d            # PostgreSQL sur le port 5433
pnpm db:push && pnpm db:trigger && pnpm db:seed
pnpm dev                        # terminal 1 — http://localhost:3000
pnpm jeko:mock                  # terminal 2 — http://127.0.0.1:4010
```

Passe une commande sur le site : tu arrives sur une page « Jèko (factice) » avec
quatre gestes.

| Bouton                | Ce que ça simule                | À vérifier                                                    |
| --------------------- | ------------------------------- | ------------------------------------------------------------- |
| ✅ Payer              | Paiement réussi + webhook signé | La commande passe en cuisine, le staff est prévenu            |
| ✅ Payer sans webhook | Succès sans webhook             | La page de suivi règle la commande au retour (réconciliation) |
| ❌ Échouer            | Solde insuffisant               | Message d'échec, bouton « Réessayer » avec un autre moyen     |
| 🚪 Quitter sans payer | Abandon                         | Compte à rebours, puis expiration à 3 min — stock restitué    |

Autres vérifications utiles : arrêter `pnpm jeko:mock` pendant une commande (la
commande existe, « Réessayer » reste proposé), et forcer une expiration avec
`update "order" set "paymentExpiresAt" = now() - interval '5 minutes' where id = '…'`
(le nettoyage part au prochain passage — dashboard, caisse, cuisine, webhook —, au
plus une fois par minute).

La limitation anti-abus de `POST /api/commandes` (5 commandes / 10 min / IP) s'applique
aussi en local ; en test, changer l'en-tête `x-forwarded-for` suffit.

## Tester contre le vrai Jèko

1. Utiliser un **magasin dédié aux tests** (pas de sandbox).
2. Exposer l'application en HTTPS public (tunnel `cloudflared`/`ngrok`) : Jèko ne
   joint pas `localhost` pour le webhook, et **refuse les URLs de retour en
   `localhost` (422, vérifié)**. Mettre l'URL du tunnel dans `NEXT_PUBLIC_SITE_URL`,
   puis saisir `https://<tunnel>/api/webhooks/jeko` dans le dashboard. Next.js en
   dev demande aussi l'hôte du tunnel dans `allowedDevOrigins`.
3. Faire un **premier paiement de 100 centimes (1 FCFA)** : `amountCents` est censé
   valoir FCFA × 100 d'après la doc, ce test lève le doute avant tout vrai client.

## Mise en production

- Renseigner `JEKO_API_KEY`, `JEKO_API_KEY_ID`, `JEKO_STORE_ID`, `JEKO_WEBHOOK_SECRET`.
  **Ne pas** définir `JEKO_API_BASE_URL`.
- Lancer `pnpm db:push` (nouvelles colonnes de `Order` et nouveaux modes de paiement).
- Saisir l'URL du webhook dans le Dashboard Business.
- **Surveiller les livraisons** : Jèko désactive un webhook en silence après 15 échecs
  consécutifs. Le filet de sécurité est la réconciliation (retour du client et
  expiration), mais un webhook mort retarde le règlement.

## À savoir

- **Paiement tardif** : si Jèko confirme un paiement après l'expiration ou
  l'annulation, il est encaissé (`isPaid`) mais la commande n'est **pas** remise en
  cuisine ; le staff est alerté et la rétablit (ou rembourse) par le flux habituel.
- **Rupture de stock** : pour un retrait aujourd'hui, le stock est déjà réservé
  depuis la création (voir « Le parcours », point 3) — `startJekoPayment` revérifie
  (`out_of_stock`) par sécurité, mais c'est devenu un filet, pas la protection
  principale. Reste utile pour une commande **différée** (pas de réservation à la
  création, voir `CLAUDE.md`) : si son stock manque malgré tout au règlement, le
  paiement est **enregistré sans entrée en cuisine** (`setOrderPayment(...,
{ skipKitchen: true })`) — la commande reste `NEW`, payée, avec une alerte ; le
  staff la lance en confirmant la production (`coverShortage`).
- **Frais** : `onlineFee − gatewayFee` donne la marge par commande (environ −0,5 %).
  Les frais ne sont jamais comptés dans le chiffre d'affaires.
- **Capture d'écran + analyse IA : supprimées.** Les routes `…/preuve-paiement` et
  tout `lib/ai/` ont disparu. Les colonnes `paymentProof*` restent en base : l'écran
  caisse relit encore les captures des anciennes commandes.
- **Wave n'a pas disparu de la caisse** : `NEXT_PUBLIC_WAVE_MERCHANT_ID` sert au
  message de récap WhatsApp que le staff envoie à la main.
- **Double paiement** : si une relance a créé une seconde demande et que le client paie
  les deux, la seconde transaction est détectée (`Order.paymentTransactionId`) et le
  staff est alerté pour rembourser depuis le Dashboard Jèko. Même alerte quand la
  commande a été encaissée en caisse (ou par le MCP) avant l'arrivée du paiement en
  ligne : `paymentTransactionId` est écrit AVEC `isPaid` (`setOrderPayment`, option
  `online`), donc une commande payée sans identifiant l'a été hors Jèko.
- **Commandes en attente de paiement (caisse)** : icône horloge de l'en-tête de la
  caisse (`pending-payment-sheet.tsx`, route `GET /api/caisse/orders/pending`). Le
  caissier peut appeler, relancer par WhatsApp (lien de suivi, où le client relance
  lui-même), annuler, ou **prendre en caisse** (`POST /api/caisse/orders/:id/release`) :
  la commande sort de l'attente (`paymentExpiresAt = null`) et s'encaisse par les moyens
  habituels, sans Jèko ni frais. Un lien Jèko déjà ouvert peut encore être payé : il
  déclenche l'alerte de double paiement.
- **Expiration sans configuration Jèko** : si les variables `JEKO_*` manquent, aucune
  commande ayant une demande de paiement n'est expirée (elle a pu être payée).
- **Montant figé** : `Order.paymentAmountDue` garde ce qui a été demandé à Jèko. Le
  règlement compare à cette valeur, pas à `total + frais` recalculé.
- **Le client ne modifie ni n'annule sa commande** : plus de libre-service sur la page
  de suivi (remplacer un article, changer de créneau, annuler). Tout passe par le
  comptoir ; seule la relance du paiement reste possible côté client.
- **Pas de remboursement automatique** : aucune API de remboursement n'a été repérée,
  il se fait à la main depuis le Dashboard Jèko.

### Fidélité

Pour une commande payée en ligne, le tampon n'est plus accordé à la création mais au
paiement validé (`awardLoyaltyOnPayment`, `lib/jeko/loyalty-on-paid.ts`), y compris après un
paiement tardif validé. Conséquence : pas de récompense auto-appliquée à la commande en ligne
en cours (le tampon compte pour la suivante). La caisse garde le tampon à la création.

Cas limites : une commande en ligne annulée par une personne puis payée n'a jamais eu de
tampon ; à sa reprise par le staff, `restoreLoyaltyForOrder` lui en accorde un (commande
payée en ligne uniquement). L'attribution est retentée 3 fois ; si tout échoue, le webhook répond quand même 200, une
ligne d'ajustement à 0 tampon est écrite dans le journal du client (trace durable, visible sur
sa fiche) et une alerte staff demande l'ajustement manuel.

### Registre Jèko et paiements en écart

Le registre (`lib/jeko/ledger.ts`, page `/dashboard/jeko`) ne compte que les commandes
dont `paymentTransactionId` est renseigné. Or `settleJekoTransaction` ne l'écrit qu'**avec**
`isPaid`, donc **pas** pour un paiement `amount_mismatch` : la commande n'est qu'« sortie
de l'attente » (`paymentExpiresAt` nul) et rien ne mémorise le montant réellement reçu.
Les compter exigerait une nouvelle colonne (montant reçu) et une règle de rapprochement :
nous avons choisi de **ne pas** le faire, au risque d'inventer des chiffres.

Conséquence : un paiement en écart (et un paiement tardif remboursé, déjà déduit à part)
n'apparaît pas dans le solde affiché, alors que l'argent est chez Jèko. Le staff est alerté
(« Montant reçu X F au lieu de Y F ») et tranche : **vérifier le solde réel dans le Dashboard
Jèko** (`lib/jeko/balance.ts` lit le solde réel du compte) avant tout retrait.

## Retour arrière d'urgence

Le déploiement exécute `pnpm db:push` (`.github/workflows/cd.yml`). Le schéma de cette
fonctionnalité est **additif** (colonnes de `Order`, valeurs d'enum, table
`jeko_withdrawal`) : on le **garde** en cas de retour arrière, sinon `db:push`
voudrait supprimer des colonnes contenant des données et le déploiement échouerait.
Garder le schéma évite aussi une erreur de lecture Prisma sur les lignes en
`MTN_MONEY`/`MOOV_MONEY`/`DJAMO`.

**Niveau 1 — couper Jèko sans toucher au code (1 minute).** Vider une des variables
`JEKO_*` et redémarrer : le paiement en ligne redevient inerte, les commandes se
règlent au comptoir. Avant : regarder dans le Dashboard Jèko les paiements des
15 dernières minutes. Webhook coupé = un paiement en vol ne sera plus réglé, et
l'expiration annulerait la commande (`isPaid` faux) : la régler à la main.

**Niveau 2 — revenir au code d'avant (merge commit `<MERGE_SHA>`).**

```bash
git checkout master && git pull
git revert -m 1 <MERGE_SHA> --no-commit
git checkout <MERGE_SHA> -- prisma/schema.prisma   # garder le schéma additif
git commit -m "revert: paiement en ligne Jèko (schéma conservé)"
git push        # ou via une PR si master est protégée
```

Puis, **avant** que le staff rouvre la caisse : le code d'avant ne connaît pas les
commandes « en attente de paiement » et les afficherait comme des commandes normales.
Après vérification dans le Dashboard Jèko qu'elles ne sont pas payées :

```sql
update "order" set status = 'CANCELLED'
where "paymentExpiresAt" is not null and "isPaid" = false and status = 'NEW';
```

Désactiver aussi le webhook dans le Dashboard Jèko (l'URL répondra 404). Les commandes
déjà payées via Jèko restent valides (`isPaid`) ; un remboursement se fait depuis le
Dashboard Jèko. Ne **pas** supprimer les colonnes ni la table.

**Remettre la fonctionnalité** : `git revert <SHA_DU_REVERT>`.
