# Serveur MCP — Administration EBA

Serveur [MCP](https://modelcontextprotocol.io) distant qui expose
l'**administration de l'app** (menu, stats, dépenses, caisse, clients,
fidélité, inventaire, sondages…) à un client compatible comme Claude, en
langage naturel.

- **Endpoint** : `POST https://<votre-domaine>/api/mcp`
- **Transport** : Streamable HTTP (JSON-RPC 2.0), sans état

## Deux façons de s'authentifier

| Mode                           | Pour qui / quoi                             | Multi-utilisateurs ?                           |
| ------------------------------ | ------------------------------------------- | ---------------------------------------------- |
| **OAuth 2.0** (recommandé)     | Claude **web / mobile / desktop**           | ✅ par compte ADMIN/MANAGER/COMPTABLE/ANALYSTE |
| **Clé statique** `MCP_API_KEY` | Clients « machine » : Claude Code CLI, curl | ❌ secret partagé                              |

Le serveur tente d'abord la clé statique (si `MCP_API_KEY` est fournie en
`Authorization: Bearer …`) ; sinon il bascule sur OAuth. **Toute requête sans
identifiant valide reçoit 401** ; un compte sans rôle **ADMIN**, **MANAGER**,
**COMPTABLE** ou **ANALYSTE** reçoit **403**. `ADMIN`/`MANAGER` ont accès à
tous les outils ; `COMPTABLE` est restreint aux outils finance (dépenses,
investissements, régularisations, clôture de caisse, inventaire, statistiques) ;
`ANALYSTE` est restreint aux outils en **lecture seule**, tous domaines
confondus (aucun droit d'écriture).

---

## 1. OAuth 2.0 — Claude web / mobile (+ desktop)

C'est le **seul** mode utilisable sur claude.ai (web) et l'app mobile Claude :
ces clients ne permettent pas de coller un en-tête Bearer, ils exigent un flux
OAuth. Chaque collaborateur autorisé (ADMIN, MANAGER, COMPTABLE ou ANALYSTE)
se connecte avec **son propre compte** (OTP email / Google) — pas de secret à
partager, accès traçable et révocable individuellement.

Le provider OAuth est fourni par le plugin MCP de Better Auth (`lib/auth.ts`).
Les endpoints OAuth (authorize / token / **enregistrement dynamique de client**
RFC 7591) vivent sous `https://<votre-domaine>/api/auth/mcp/*` ; aucun client
n'est pré-enregistré, chaque client MCP (claude.ai, Claude Desktop, ChatGPT…)
s'auto-enregistre via `POST /api/auth/mcp/register` avec son propre
`redirect_uri`.

La découverte (RFC 8414 / 9728) est servie à **toutes** les URLs que les
différents clients essaient — GET **et** OPTIONS (préflight CORS ; le SDK MCP
envoie l'en-tête `MCP-Protocol-Version`, qui déclenche un préflight depuis un
contexte navigateur) :

| Document                          | URLs                                                                                                                                                                                     |
| --------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Serveur d'autorisation (RFC 8414) | `/.well-known/oauth-authorization-server` · `/.well-known/oauth-authorization-server/api/mcp` · `/api/auth/.well-known/oauth-authorization-server`                                       |
| OIDC Discovery (même métadonnée)  | `/.well-known/openid-configuration` · `/.well-known/openid-configuration/api/mcp`                                                                                                        |
| Ressource protégée (RFC 9728)     | `/.well-known/oauth-protected-resource` · `/.well-known/oauth-protected-resource/api/mcp` · `/api/auth/.well-known/oauth-protected-resource` (annoncée par le `WWW-Authenticate` du 401) |

> **Reverse proxy** : nginx doit **proxifier `/.well-known/`** vers Next comme
> le reste du site. Une `location /.well-known/` statique (souvent ajoutée pour
> certbot) avalerait ces documents → seuls `/.well-known/acme-challenge/`
> doivent rester statiques, sinon ChatGPT / Claude Desktop ne trouvent pas la
> découverte alors que claude.ai (qui suit l'URL `/api/auth/…` du header)
> fonctionne.

### Pré-requis

- L'app est **déployée publiquement en HTTPS** et `BETTER_AUTH_URL`
  (= `NEXT_PUBLIC_SITE_URL`) pointe vers ce domaine — l'OAuth `issuer` en dépend.
- Les tables OAuth existent en base : après déploiement, lancer
  `pnpm db:push` (puis `pnpm db:generate`). Modèles `OauthApplication`,
  `OauthAccessToken`, `OauthConsent` dans `prisma/schema.prisma`.
- Chaque utilisateur autorisé a le rôle **ADMIN**, **MANAGER**, **COMPTABLE**
  ou **ANALYSTE** (voir « Donner accès à un collaborateur » plus bas).
- Côté Claude : un plan **Pro / Max / Team / Enterprise** (les connecteurs
  personnalisés y sont disponibles).

### Ajouter le connecteur (claude.ai / mobile)

1. **Paramètres → Connecteurs → Ajouter un connecteur personnalisé**.
2. Coller **uniquement l'URL** : `https://<votre-domaine>/api/mcp` (aucun en-tête
   à saisir).
3. Claude découvre l'OAuth et ouvre la page de connexion EBA (`/login`). Se
   connecter avec un email **ADMIN**, **MANAGER**, **COMPTABLE** ou
   **ANALYSTE** → le flux revient automatiquement vers Claude, qui obtient un
   jeton.

### Donner accès à un collaborateur

1. Le collaborateur se connecte une première fois sur `https://<votre-domaine>/login`
   (il reçoit un code OTP par email) — cela crée son compte (rôle `USER`).
2. Un administrateur lui attribue le rôle **ADMIN**, **MANAGER** (accès
   complet, comme ADMIN), **COMPTABLE** (accès MCP restreint aux outils
   finance) ou **ANALYSTE** (accès MCP en lecture seule, tous domaines) via
   **Dashboard → Utilisateurs** (`/dashboard/utilisateurs`).
3. Il peut alors ajouter le connecteur (étape ci-dessus). Pour **révoquer**
   l'accès : repasser son rôle à `USER` (ou le supprimer).

---

## 2. Clé statique — Claude Code (CLI) / clients machine

Pratique pour un usage « propriétaire » en ligne de commande. **Optionnelle** :
si `MCP_API_KEY` n'est pas définie, ce mode est simplement désactivé (OAuth reste
disponible).

1. Générer un jeton fort :

   ```bash
   openssl rand -hex 32
   ```

2. Le déclarer dans l'environnement (voir `.env.schema`) :

   ```
   MCP_API_KEY=<le-jeton-généré>
   ```

### Claude Code (CLI)

```bash
claude mcp add --transport http eba-menu https://<votre-domaine>/api/mcp \
  --header "Authorization: Bearer <MCP_API_KEY>"
```

### Claude Desktop (`claude_desktop_config.json`)

```json
{
  "mcpServers": {
    "eba-menu": {
      "type": "http",
      "url": "https://<votre-domaine>/api/mcp",
      "headers": { "Authorization": "Bearer <MCP_API_KEY>" }
    }
  }
}
```

> Claude Desktop sait aussi faire de l'OAuth : tu peux y ajouter le serveur
> **sans** en-tête (comme sur le web) pour utiliser ton compte ADMIN, MANAGER,
> COMPTABLE ou ANALYSTE.

---

## 3. Restreindre à un domaine (`?toolset=`)

Par défaut, un client voit tous les outils autorisés par son rôle (ou tous les
outils avec la clé statique). Pour limiter un connecteur à un ou plusieurs
domaines fonctionnels — utile pour un agent dédié à une tâche précise, qui n'a
pas besoin de voir les ~130 outils du serveur — ajoute `?toolset=` à l'URL du
connecteur, avec un ou plusieurs domaines séparés par des virgules :

| Domaine      | Couvre                                                                   |
| ------------ | ------------------------------------------------------------------------ |
| `menu`       | Menu, catégories, produits, stock/pause, extras globaux                  |
| `stats`      | Statistiques (lecture seule)                                             |
| `finance`    | Dépenses, investissements, régularisations de recette, clôture de caisse |
| `commandes`  | Commandes (création, statut, encaissement, remise)                       |
| `crm`        | Clients, ardoise, fidélité                                               |
| `contact`    | Coordonnées du commerce (adresse, horaires, téléphone…)                  |
| `inventaire` | Matières premières & consommables                                        |
| `sondages`   | Sondages communauté                                                      |
| `tiktok`     | Vidéos TikTok embarquées (section "Suivez l'aventure")                   |

Exemples :

- `https://<votre-domaine>/api/mcp?toolset=finance` — un agent dédié à la
  comptabilité.
- `https://<votre-domaine>/api/mcp?toolset=finance,inventaire` — un agent
  achats/réapprovisionnement.
- `https://<votre-domaine>/api/mcp?toolset=sondages` — un agent qui ne gère
  que les sondages communauté.

Un domaine inconnu renvoie `400` (code JSON-RPC `-32602`).

**Ce filtre se compose par INTERSECTION avec la restriction de rôle, jamais
un remplacement** : un COMPTABLE avec `?toolset=inventaire` ne voit que les
outils inventaire déjà couverts par `FINANCE_TOOL_NAMES` ; un ANALYSTE avec
`?toolset=finance` reste borné à ses outils en lecture seule, intersectés
avec le domaine finance — le résultat peut légitimement être une liste
réduite, voire vide, ce n'est pas une erreur.

## Outils exposés

| Outil                            | Domaine    | Type     | Description                                                                                  |
| -------------------------------- | ---------- | -------- | -------------------------------------------------------------------------------------------- |
| `get_menu`                       | menu       | lecture  | Menu compact (`id`, nom, prix, stock) ; `search`, `categoryId`, `productId`, `detail:"full"` |
| `search_products`                | menu       | lecture  | Recherche compacte de produits par nom (tolère accents/fautes) — préférer à `get_menu`       |
| `get_daily_stats`                | stats      | lecture  | Stats agrégées de la journée en cours                                                        |
| `get_range_stats`                | stats      | lecture  | KPIs sur une plage (`from`/`to`, `YYYY-MM-DD`)                                               |
| `get_daily_series`               | stats      | lecture  | Série jour par jour (commandes + CA) sur plage                                               |
| `get_top_products`               | stats      | lecture  | Top produits vendus sur une plage (`limit?`)                                                 |
| `get_product_stats`              | stats      | lecture  | Ventes d’un produit : unités, CA, marge, rang, série, suppléments                            |
| `get_stats_comparison`           | stats      | lecture  | KPIs de la plage vs période précédente de même durée                                         |
| `get_hourly_stats`               | stats      | lecture  | Heures de pointe : commandes + CA par heure (0–23)                                           |
| `get_kitchen_performance`        | stats      | lecture  | Temps de préparation / d’attente (moyenne, médiane, série)                                   |
| `get_customer_stats`             | stats      | lecture  | Clients & fidélité : nouveaux, actifs, top clients, tampons                                  |
| `list_expense_categories`        | finance    | lecture  | Catégories de dépense (+ nombre de dépenses)                                                 |
| `create_expense_category`        | finance    | écriture | Créer une catégorie de dépense                                                               |
| `update_expense_category`        | finance    | écriture | Renommer une catégorie de dépense                                                            |
| `delete_expense_category`        | finance    | écriture | Supprimer une catégorie (soft delete, conserve les dépenses)                                 |
| `list_expenses`                  | finance    | lecture  | Lister les dépenses (filtres date/catégorie)                                                 |
| `get_expense_summary`            | finance    | lecture  | Total + ventilation des dépenses par catégorie                                               |
| `create_expense`                 | finance    | écriture | Enregistrer une dépense (⚠️ déprécié pour les achats fournisseur)                            |
| `update_expense`                 | finance    | écriture | Modifier une dépense (mise à jour **partielle**)                                             |
| `delete_expense`                 | finance    | écriture | Supprimer une dépense                                                                        |
| `set_expense_receipt`            | finance    | écriture | Joindre un justificatif (base64 ou URL)                                                      |
| `prepare_purchase`               | finance    | écriture | Préparer un achat détaillé (brouillon + récapitulatif)                                       |
| `confirm_purchase`               | finance    | écriture | Confirmer un brouillon d’achat → dépense                                                     |
| `prepare_other_expense`          | finance    | écriture | Préparer une dépense simple (brouillon + récapitulatif)                                      |
| `confirm_other_expense`          | finance    | écriture | Confirmer un brouillon de dépense simple → dépense                                           |
| `search_article`                 | finance    | lecture  | Rapprocher un libellé avec le référentiel d’articles                                         |
| `detect_article`                 | finance    | lecture  | Idem, formaté pour la décision d’une IA (matched/candidates/none)                            |
| `get_purchase_frequency`         | finance    | lecture  | Fréquence d’achat par article (compte, PU moyen, cadence)                                    |
| `list_expense_articles`          | finance    | lecture  | Lister les articles de dépense (référentiel)                                                 |
| `get_expense_article_history`    | finance    | lecture  | Historique détaillé des achats d’un article                                                  |
| `get_expense_monthly_series`     | finance    | lecture  | Série mensuelle des dépenses (fixes/variables)                                               |
| `get_expense_settings`           | finance    | lecture  | Lire la config du module dépenses (fréquence, seuils…)                                       |
| `relink_expense_item`            | finance    | écriture | Re-lier une ligne au bon article (apprend un alias)                                          |
| `merge_articles`                 | finance    | écriture | Fusionner deux articles en doublon                                                           |
| `rename_expense_article`         | finance    | écriture | Renommer un article de dépense                                                               |
| `set_expense_article_settings`   | finance    | écriture | Régler un article (unité, stock, emplacement, prix réf.)                                     |
| `update_expense_settings`        | finance    | écriture | Modifier la config du module dépenses                                                        |
| `rematch_expense_items`          | finance    | écriture | Entretien : rapprocher les lignes non liées (`dryRun`)                                       |
| `backfill_expense_items`         | finance    | écriture | Entretien : régénérer le détail lié aux réappros (`dryRun`)                                  |
| `list_investment_sources`        | finance    | lecture  | Sources de financement (+ nombre d’apports)                                                  |
| `create_investment_source`       | finance    | écriture | Créer une source de financement                                                              |
| `update_investment_source`       | finance    | écriture | Renommer une source de financement                                                           |
| `delete_investment_source`       | finance    | écriture | Supprimer une source (soft delete, conserve les apports)                                     |
| `list_investments`               | finance    | lecture  | Lister les apports (filtres date/source/rembt)                                               |
| `get_investment_summary`         | finance    | lecture  | Total + ventilation par source + restant dû                                                  |
| `create_investment`              | finance    | écriture | Enregistrer un apport / financement                                                          |
| `update_investment`              | finance    | écriture | Modifier un apport (mise à jour **partielle**)                                               |
| `delete_investment`              | finance    | écriture | Supprimer un apport                                                                          |
| `set_investment_document`        | finance    | écriture | Joindre un justificatif (base64 ou URL)                                                      |
| `list_revenue_adjustments`       | finance    | lecture  | Lister les régularisations de recette (+ total)                                              |
| `get_revenue_adjustment_summary` | finance    | lecture  | Total net + ventilation par mode de paiement                                                 |
| `create_revenue_adjustment`      | finance    | écriture | Ajuster le CA sans commande (montant signé)                                                  |
| `update_revenue_adjustment`      | finance    | écriture | Modifier une régularisation (partiel)                                                        |
| `delete_revenue_adjustment`      | finance    | écriture | Supprimer une régularisation                                                                 |
| `list_refunds`                   | finance    | lecture  | Lister les remboursements (statut, canal, commande, plage de demande)                        |
| `get_refund`                     | finance    | lecture  | Détail d'un remboursement (lignes, journal, commande)                                        |
| `get_refund_summary`             | finance    | lecture  | Stats : montant, taux du CA, motifs, canaux, échecs Jèko, délai de validation                |
| `create_refund`                  | finance    | écriture | DEMANDER un remboursement (à valider par un admin dans l'application, rien ne part avant)    |
| `get_cash_position`              | finance    | lecture  | Chiffres espèces d’un jour + clôture éventuelle                                              |
| `get_cash_closing`               | finance    | lecture  | Lire la clôture d’un jour                                                                    |
| `list_cash_closings`             | finance    | lecture  | Historique des clôtures sur une plage                                                        |
| `save_cash_closing`              | finance    | écriture | Créer / mettre à jour la clôture d’un jour                                                   |
| `create_order`                   | commandes  | écriture | Enregistrer une commande (antidatage ou retrait différé possible)                            |
| `list_orders`                    | commandes  | lecture  | Lister les commandes (filtres statut/date/texte)                                             |
| `set_order_status`               | commandes  | écriture | Changer le statut (récupérée, annulée, …)                                                    |
| `mark_order_paid`                | commandes  | écriture | Encaisser une commande (CASH/WAVE/ORANGE_MONEY/OTHER)                                        |
| `update_order`                   | commandes  | écriture | Modifier détails (paiement, type, créneau, note)                                             |
| `apply_order_discount`           | commandes  | écriture | Appliquer une remise de ligne (FCFA)                                                         |
| `extend_today_closing`           | commandes  | écriture | Repousser la fermeture du jour de N minutes (garde la carte accessible)                      |
| `list_customers`                 | crm        | lecture  | Lister / rechercher des clients (+ stats)                                                    |
| `get_customer`                   | crm        | lecture  | Détail d’un client (par `id` ou `phone`)                                                     |
| `get_ardoise`                    | crm        | lecture  | Ardoise : récupérées non payées par client + anomalies à vérifier                            |
| `get_loyalty_card`               | crm        | lecture  | Carte à tampons d’un client + récompenses dispo                                              |
| `adjust_loyalty_stamps`          | crm        | écriture | Ajuster les tampons d’un client (correction)                                                 |
| `get_loyalty_settings`           | crm        | lecture  | Lire la config de la carte à tampons                                                         |
| `update_loyalty_settings`        | crm        | écriture | Modifier la config de la carte à tampons                                                     |
| `get_contact_settings`           | contact    | lecture  | Lire les coordonnées du commerce (adresse, tél., WhatsApp, email…)                           |
| `update_contact_settings`        | contact    | écriture | Modifier les coordonnées du commerce                                                         |
| `create_category`                | menu       | écriture | Créer une catégorie                                                                          |
| `update_category`                | menu       | écriture | Renommer une catégorie                                                                       |
| `delete_category`                | menu       | écriture | Supprimer une catégorie (soft delete, cascade produits)                                      |
| `toggle_category_availability`   | menu       | écriture | Afficher / masquer une catégorie                                                             |
| `move_category`                  | menu       | écriture | Réordonner une catégorie (`up` / `down`)                                                     |
| `create_product`                 | menu       | écriture | Créer un produit                                                                             |
| `update_product`                 | menu       | écriture | Modifier un produit (mise à jour **partielle**)                                              |
| `bulk_update_products`           | menu       | écriture | Modifier jusqu'à 100 produits en une requête atomique (`dryRun` possible)                    |
| `set_product_image`              | menu       | écriture | Téléverser (base64) ou rattacher une image                                                   |
| `move_product`                   | menu       | écriture | Réordonner un produit (`up` / `down`)                                                        |
| `delete_product`                 | menu       | écriture | Supprimer un produit (soft delete)                                                           |
| `toggle_product_availability`    | menu       | écriture | Inverser la visibilité d'un produit (non idempotent)                                         |
| `set_product_availability`       | menu       | écriture | Masquer (`available: false`) / afficher un produit — idempotent                              |
| `toggle_product_featured`        | menu       | écriture | Mettre en avant / retirer un produit                                                         |
| `set_product_stock`              | menu       | écriture | Définir (absolu) le stock d’un produit                                                       |
| `bulk_set_product_stock`         | menu       | écriture | Définir (absolu) le stock de jusqu'à 100 produits en une requête atomique                    |
| `list_stock_movements`           | menu       | lecture  | Historique du stock (produits et goûts) : delta, avant → après, motif, commande, personne    |
| `get_stock_history_summary`      | menu       | lecture  | Sorties et entrées de stock cumulées par motif (« où est passé le stock ? »)                 |
| `get_stock_audit`                | menu       | lecture  | Angles morts : écarts avec le journal, stocks sans relevé, négatifs, réservations orphelines |
| `set_option_stock`               | menu       | écriture | Définir (absolu) le stock d’une option                                                       |
| `restock_product`                | menu       | écriture | Ajouter une fournée (delta) au stock d’un produit                                            |
| `restock_option`                 | menu       | écriture | Ajouter une fournée (delta) au stock d’une option                                            |
| `pause_product`                  | menu       | écriture | Mettre un produit en pause jusqu’à une date-heure                                            |
| `resume_product`                 | menu       | écriture | Lever la pause d’un produit avant son terme                                                  |
| `list_product_schedules`         | menu       | lecture  | Lister les plannings récurrents (jours + produits/catégories liés)                           |
| `create_product_schedule`        | menu       | écriture | Créer un planning récurrent nommé                                                            |
| `update_product_schedule`        | menu       | écriture | Modifier un planning récurrent (mise à jour **partielle**)                                   |
| `delete_product_schedule`        | menu       | écriture | Supprimer un planning (désassigne, sans rien supprimer d’autre)                              |
| `list_product_weekly_specials`   | menu       | lecture  | Historique « spécialité de la semaine » (par produit ou global)                              |
| `create_product_weekly_special`  | menu       | écriture | Programmer une fenêtre « spécialité de la semaine »                                          |
| `update_product_weekly_special`  | menu       | écriture | Corriger une fenêtre existante (mise à jour **partielle**)                                   |
| `delete_product_weekly_special`  | menu       | écriture | Retirer une fenêtre de l’historique                                                          |
| `get_pending_demand`             | menu       | lecture  | Quantité restant à produire (option. par jour de retrait)                                    |
| `list_global_extras`             | menu       | lecture  | Lister les extras globaux                                                                    |
| `create_global_extra_group`      | menu       | écriture | Créer un groupe d’extras global                                                              |
| `update_global_extra_group`      | menu       | écriture | Modifier un groupe d’extras global                                                           |
| `delete_global_extra_group`      | menu       | écriture | Supprimer un groupe d’extras global                                                          |
| `create_global_extra_option`     | menu       | écriture | Ajouter une option à un groupe d’extras global                                               |
| `update_global_extra_option`     | menu       | écriture | Modifier une option d’extra global                                                           |
| `delete_global_extra_option`     | menu       | écriture | Supprimer une option d’extra global                                                          |
| `list_inventory_items`           | inventaire | lecture  | Lister les références (filtres + stock/PMP)                                                  |
| `get_inventory_item`             | inventaire | lecture  | Détail d’une référence (+ achats / comptages)                                                |
| `get_inventory_summary`          | inventaire | lecture  | KPIs inventaire (sous seuil, valeur stock…)                                                  |
| `list_low_stock_items`           | inventaire | lecture  | Références sous le seuil (à réapprovisionner)                                                |
| `list_inventory_purchases`       | inventaire | lecture  | Lister les achats/réappro (filtres date/réf.)                                                |
| `list_inventory_counts`          | inventaire | lecture  | Historique des comptages périodiques                                                         |
| `get_inventory_count`            | inventaire | lecture  | Rapport d’un comptage (entrées/sorties, PMP)                                                 |
| `create_inventory_item`          | inventaire | écriture | Créer une référence (+ stock d’ouverture)                                                    |
| `update_inventory_item`          | inventaire | écriture | Modifier une référence (mise à jour **partielle**)                                           |
| `archive_inventory_item`         | inventaire | écriture | Archiver une référence (suppression douce)                                                   |
| `record_inventory_purchases`     | inventaire | écriture | Réappro par lot (entrées + PMP, dépense liée)                                                |
| `cancel_restock_batch`           | inventaire | écriture | Annuler un lot (restaure stock + PMP)                                                        |
| `record_inventory_count`         | inventaire | écriture | Enregistrer un comptage (déduit la conso)                                                    |
| `get_inventory_settings`         | inventaire | lecture  | Lire la config du module d’inventaire                                                        |
| `update_inventory_settings`      | inventaire | écriture | Modifier la config du module d’inventaire                                                    |
| `list_polls`                     | sondages   | lecture  | Lister les sondages (options, votes, suggestions en attente)                                 |
| `get_poll`                       | sondages   | lecture  | Détail d’un sondage (options + décompte des votes)                                           |
| `get_poll_results`               | sondages   | lecture  | Décompte des votes par option (nombre + %)                                                   |
| `create_poll`                    | sondages   | écriture | Créer un sondage générique avec ses options                                                  |
| `update_poll`                    | sondages   | écriture | Modifier un sondage (mise à jour **partielle**)                                              |
| `set_poll_status`                | sondages   | écriture | Ouvrir / clôturer un sondage (DRAFT/OPEN/CLOSED)                                             |
| `delete_poll`                    | sondages   | écriture | Supprimer un sondage (DRAFT sans vote uniquement)                                            |
| `set_poll_image`                 | sondages   | écriture | Illustrer un sondage (image de couverture, base64 ou URL)                                    |
| `create_poll_option`             | sondages   | écriture | Ajouter une option de vote à un sondage                                                      |
| `update_poll_option`             | sondages   | écriture | Modifier une option (mise à jour **partielle**)                                              |
| `move_poll_option`               | sondages   | écriture | Réordonner une option (`up` / `down`)                                                        |
| `delete_poll_option`             | sondages   | écriture | Retirer une option (soft delete, conserve les votes)                                         |
| `set_poll_option_image`          | sondages   | écriture | Illustrer une option (base64 ou URL)                                                         |
| `list_poll_suggestions`          | sondages   | lecture  | Lister les suggestions de la communauté                                                      |
| `get_poll_suggestion`            | sondages   | lecture  | Détail d’une suggestion                                                                      |
| `moderate_poll_suggestion`       | sondages   | écriture | Approuver (→ option) ou rejeter une suggestion                                               |
| `list_tiktok_videos`             | tiktok     | lecture  | Lister les vidéos TikTok embarquées                                                          |
| `get_tiktok_video`               | tiktok     | lecture  | Détail d’une vidéo TikTok embarquée                                                          |
| `create_tiktok_video`            | tiktok     | écriture | Ajouter une vidéo TikTok (URL, videoId + légende/auteur/miniature auto via oEmbed)           |
| `update_tiktok_video`            | tiktok     | écriture | Modifier une vidéo TikTok (mise à jour **partielle**)                                        |
| `move_tiktok_video`              | tiktok     | écriture | Réordonner une vidéo TikTok (`up` / `down`)                                                  |
| `delete_tiktok_video`            | tiktok     | écriture | Retirer une vidéo TikTok (soft delete)                                                       |

Les prix et coûts (`coutMatiere`, `coutEmballage`) sont exprimés en **francs
CFA** (nombres entiers) et `get_menu` les renvoie. Commence toujours par
`get_menu` pour récupérer les `id` avant toute modification.

Les outils statistiques sont en **lecture seule**. Les plages `from`/`to` sont
au format `YYYY-MM-DD`, interprétées en **jour civil Abidjan** (bornes incluses),
et les montants (CA, panier moyen…) sont en francs CFA entiers.

Les outils **dépenses** couvrent l'administration complète (catégories +
dépenses, lecture **et** écriture) : on peut tout gérer sans ouvrir l'app.
`amount` est en francs CFA entiers, `date` au format `YYYY-MM-DD`, `categoryId`
provient de `list_expense_categories`, et `paymentMethod` ∈
`CASH`/`WAVE`/`BANK`/`OTHER`. Le justificatif photo se joint via
`set_expense_receipt` (base64 ou URL). Chaque dépense reçoit à la création un
**numéro de reçu** `receiptNo` (`DEP-YYYY-MM-NNNN`, séquence remise à zéro chaque
mois civil) ; ce numéro est **immuable** (il ne change pas si la `date` est
modifiée ensuite).

`create_expense`/`update_expense` acceptent un détail `items[]` optionnel (une
dépense reste **globale**, sans détail, par défaut) : chaque ligne porte un
`rawLabel` (libellé brut saisi), un `articleId` existant ou un `articleName`
libre (rapproche/crée l'article correspondant), un format d'achat
(`formatQty`/`formatSize`/`unit`) et un `unitPrice` — le `amount` de la ligne
est dérivé de `formatQty × formatSize × unitPrice` s'il est omis, et la somme
des lignes doit égaler le montant total de la dépense. `update_expense` avec
`items: null` retire tout le détail existant.

### Référentiel d'articles, rapprochement et entretien

Les lignes de dépense (`items[]`) se rattachent à un **référentiel d'articles**
(`ExpenseArticle`) dédupliqué par nom normalisé (insensible à la casse et aux
accents), avec un mécanisme d'**alias** appris au fil de l'eau (scopé
fournisseur ou global) : la même faute de frappe ou variante de libellé finit
par se rapprocher automatiquement du bon article.

- `search_article` / `detect_article` — recherchent/rapprochent un libellé
  (`q`, `supplierId` optionnel) SANS jamais créer d'article : `matched` (une
  correspondance certaine, par alias ou nom exact), `candidates` (plusieurs
  approchants, à départager) ou `none`. `detect_article` est le même moteur,
  pensé pour qu'une IA décide avant `create_expense` (créer un nouvel article
  via `articleName`, ou réutiliser un `articleId` existant).
- `list_expense_articles` (filtre `search`) et `get_expense_article_history`
  (drill-down des achats d'un article, plage `from`/`to` optionnelle) lisent le
  référentiel.
- `get_purchase_frequency` calcule, par article (`articleId` optionnel) sur une
  période (défaut : mois civil en cours), un nombre d'achats **toujours
  recalculé** (jamais un compteur stocké), le montant cumulé, le prix unitaire
  moyen pondéré, l'intervalle moyen entre achats et la cadence mensuelle.
  `get_expense_monthly_series` fait de même mois par mois, tous articles
  confondus (total + fixes/variables).
- `rename_expense_article`, `set_expense_article_settings` (unité de base,
  suivi de stock, emplacement, prix de référence grossiste, lien vers une
  référence d'inventaire) et `merge_articles` (fusion d'un doublon `sourceId`
  → `targetId`, ré-attache lignes et alias, archive la source) gèrent le
  référentiel.
- `relink_expense_item` corrige le rapprochement d'une ligne existante
  (`itemId` → `articleId`) et **apprend l'alias** correspondant.
- `get_expense_settings` / `update_expense_settings` configurent le module
  (fenêtre et seuil de fréquence, montant cumulé minimal, facteur de prix
  aberrant, durée de vie d'un brouillon, seuil de suggestion de récurrence).

Deux outils d'**entretien**, à réserver à une maintenance ponctuelle (toujours
tester avec `dryRun: true` d'abord) :

- `rematch_expense_items` reprend les lignes non rapprochées (`articleId`
  manquant) et les relie automatiquement en cas de correspondance unique
  (laisse de côté les cas ambigus ou sans correspondance) ; `supplierKey`
  force la clé fournisseur.
- `backfill_expense_items` régénère le détail (`items[]`) des dépenses liées à
  des réapprovisionnements d'inventaire (`record_inventory_purchases`) qui
  n'en ont pas encore — idempotent, ne modifie jamais le montant de la
  dépense.

### Achats : brouillon → confirmation (draft→confirm)

Aucun outil n'enregistre un achat fournisseur **en un seul appel** : le flux
passe systématiquement par un **brouillon persisté** (`PurchaseDraft`, durée de
vie = `ExpenseSettings.draftTtlMinutes`, lisible/réglable via
`get_expense_settings`/`update_expense_settings`) que l'utilisateur doit
valider explicitement avant écriture définitive. `create_expense` reste
disponible mais est **déprécié pour les achats fournisseur** — préférez ce
flux en deux temps ; il reste approprié pour une dépense simple déjà décidée
ou pour la compatibilité.

1. **`prepare_purchase`** — reçoit un ou plusieurs lignes d'achat
   (`lines[]`, chacune avec `rawLabel` et, au choix, `articleId` connu ou
   `articleName` à rapprocher, plus `formatQty`/`formatSize`/`unit`/
   `unitPrice`/`amount`), `categoryId`, `supplier`, `date` (`YYYY-MM-DD`,
   défaut aujourd'hui) et `paymentMethod`. Rapproche chaque ligne au
   référentiel d'articles (même moteur que `search_article`/`detect_article`,
   **sans jamais créer d'article** à ce stade), calcule les montants
   dérivables et renvoie `{ draftId, expiresAt, summary, warnings }`. N'écrit
   RIEN de définitif.
2. **L'agent DOIT présenter `summary` et `warnings` à l'utilisateur et
   attendre sa confirmation explicite** avant d'appeler `confirm_purchase` —
   ce n'est pas optionnel, c'est le seul garde-fou avant écriture.
3. **`confirm_purchase`** — reçoit `draftId` et, en option, `resolutions`
   (par **index** de ligne, celui du tableau `lines` fourni à
   `prepare_purchase`) pour trancher les cas laissés en suspens :
   `articleId`/`articleName` (choisir l'article d'une ligne ambiguë ou non
   rapprochée), `excluded: true` (retirer une ligne, ex. doublon confirmé),
   ou corriger `formatQty`/`formatSize`/`unitPrice`/`amount`. Construit les
   `items[]` et délègue à `createExpense` (même chemin que `create_expense`,
   y compris la création d'un nouvel article si aucun n'a été rapproché).
   Échoue si le brouillon est **inexistant, expiré ou déjà confirmé** (claim
   atomique — un brouillon ne peut être confirmé qu'une seule fois).

Le même contrat (prepare → présenter → confirm) s'applique aux dépenses
**simples** (sans détail par article) via `prepare_other_expense` /
`confirm_other_expense` — sans rapprochement ni `resolutions`, juste la
validation des champs (`amount`, `categoryId`, `date`, `paymentMethod`,
`supplier`, `note`) puis confirmation.

Codes d'avertissement (`warnings[].code`) renvoyés par `prepare_purchase` :

| Code                  | Signification                                                                                                 |
| --------------------- | ------------------------------------------------------------------------------------------------------------- |
| `UNMATCHED_LINE`      | Aucun article rapproché : un nouvel article sera créé à la confirmation (sauf résolution explicite).          |
| `AMBIGUOUS_LINE`      | Plusieurs articles candidats (`candidates` dans `summary.lines[]`) : préciser `articleId` dans `resolutions`. |
| `PRICE_ABERRANT`      | Prix unitaire très supérieur au prix moyen récent du même article.                                            |
| `SUM_MISMATCH`        | La somme des lignes ne correspond pas au `totalAmount` indiqué.                                               |
| `DUPLICATE_SUSPECTED` | Une dépense similaire (même fournisseur, même montant, même jour) existe déjà.                                |
| `BULK_RECHUTE`        | L'article est habituellement acheté en gros : vérifier qu'un réappro est nécessaire.                          |
| `RECURRENCE_SUGGEST`  | Un libellé libre non rapproché revient souvent ce mois-ci : envisager de créer une référence dédiée.          |

Les brouillons non confirmés expirent (`expiresAt`) et sont purgés
périodiquement (`purgeExpiredDrafts`, hors périmètre des outils MCP).

Les outils **investissements** (apports / financements injectés dans l'affaire :
capital, prêt, apport d'associé, subvention…) couvrent l'administration complète
(sources + apports, lecture **et** écriture). Distincts des dépenses
d'exploitation, ils n'entrent pas dans la marge nette. `amount` est en francs CFA
entiers, `date` au format `YYYY-MM-DD`, `sourceId` provient de
`list_investment_sources`, et `paymentMethod` ∈ `CASH`/`WAVE`/`BANK`/`OTHER` (canal
d'entrée des fonds). Pour un apport remboursable, `reimbursable: true` avec
éventuellement `amountRepaid` (≤ `amount`) et `dueDate` ; le restant dû est
calculé. Le justificatif se joint via `set_investment_document` (base64 ou URL).

Les outils **remboursements** ne font que lire et **demander** : la validation,
le refus, le renvoi d'un transfert et le règlement « fait à la main » exigent un
admin identifié et se font dans l'application (`/dashboard/remboursements`) — un
outil MCP n'a pas d'utilisateur nommé, et l'argent ne doit jamais partir sans
validation. `get_daily_stats` / `get_range_stats` / `get_daily_series` renvoient
désormais un `revenue` **net** (régularisations ajoutées, remboursements déduits),
avec `grossRevenue` et `refunds` à côté.

Les outils **régularisation de recette** permettent d'ajuster le CA **sans créer
de commande** (ventes non saisies en temps réel, anciennes commandes perdues…).
`amount` est en francs CFA entiers **signés** (positif = recette ajoutée, négatif
= retirée), `date` au format `YYYY-MM-DD`, `paymentMode` ∈
`CASH`/`WAVE`/`ORANGE_MONEY`/`OTHER` (défaut CASH). L'ajustement est injecté
dans `lib/stats.ts` : il remonte dans les
statistiques, la série journalière et — pour le mode espèces — la **clôture de
caisse** (qui dérive de `getDailyStats`). Il n'affecte ni le nombre de commandes
ni le panier moyen.

Les outils **clôture de caisse** (espèces, une clôture par jour civil) :
`get_cash_position` prépare une clôture (ventes/dépenses espèces du jour),
`save_cash_closing` l'enregistre (la caisse théorique et l'écart sont
recalculés : fond + ventes espèces − dépenses espèces ; écart = comptées −
théorique).

L'outil **commande** `create_order` enregistre une commande, y compris
**ancienne** : `orderDate` (`YYYY-MM-DD`, jour civil Abidjan) antidate la
commande (le `createdAt` est aligné sur ce jour pour un tri chronologique
correct) ; omis = jour en cours. Les `items` référencent les produits par
`productId` (issu de `get_menu`) + `quantity` ; prix, coûts et prix des
suppléments (désignés par `groupName` + `optionName`, avec une `quantity`
optionnelle pour les groupes type « quantity ») sont résolus depuis le
menu — inutile de les fournir. Le total est calculé côté serveur (net après
remises). `orderType` ∈ `DELIVERY`/`DINE_IN`/`TAKEAWAY` (défaut `TAKEAWAY`) ;
`customerName`, `customerPhone` (normalisé, rattache la fidélité) et `note`
sont optionnels.

`pickupTime` (ISO 8601) fixe le **créneau de retrait**. S'il tombe un **jour
civil ultérieur**, la commande est **différée** : elle ne décompte pas le stock
d'aujourd'hui, son encaissement reste purement financier, et elle n'entre en
cuisine que sur le geste « Lancer la préparation », le jour venu. C'est ce qui
permet de vendre pour demain un produit épuisé ce soir. Antidatage et retrait
différé sont **incompatibles** (une commande ne peut pas être enregistrée sur un
jour passé et retirée un autre jour).

Le **suivi des commandes** : `list_orders` retrouve les commandes (filtres
statut / plage de jours / recherche, 20 par page) et renvoie leur `id` ;
`set_order_status` change le statut (NEW → PREPARING → READY → COMPLETED, ou
CANCELLED — « récupérée » = `COMPLETED`, transitions invalides refusées) ;
`mark_order_paid` encaisse (`CASH`/`WAVE`/`ORANGE_MONEY`/`OTHER`), et pousse automatiquement en
cuisine une commande encore `NEW`. `update_order` modifie de façon **partielle**
les métadonnées d'une commande (moyen de paiement, type de commande, créneau de
retrait `pickupTime`, note) sans toucher au statut ni à l'encaissement — côté
dashboard cette édition est **réservée à l'ADMIN**.
`apply_order_discount` applique une **remise**
(montant fixe FCFA, plafonnée) à une ou plusieurs lignes ciblées par leur
`cartId` (visible dans les `items` de `list_orders`) et recalcule le total
(0 pour retirer une remise ; refusé sur une commande terminée/annulée).
`extend_today_closing` repousse l'heure de fermeture **d'aujourd'hui** de
`minutes` minutes (plafonné à 23:59), pour garder la carte accessible côté
client (popup « fermé » et créneaux de retrait) sans attendre le lendemain :
il étend le dernier créneau du jour (exception de date déjà en place,
sinon horaires hebdomadaires) via une exception de date ponctuelle — refusé
si le magasin est marqué fermé aujourd'hui, et sans effet sur les jours
suivants qui reprennent automatiquement les horaires normaux.

Les outils **clients** (CRM, lecture seule) exposent les clients identifiés par
**téléphone** (clé normalisée) avec leurs stats (nb de commandes, total dépensé,
dernière commande). `get_customer` accepte un `phone` saisi librement (normalisé
automatiquement) ou un `id`.

`get_ardoise` répond à « qui me doit de l’argent ? ». Une dette naît quand la
**marchandise est partie sans l’argent** : seules les commandes **récupérées**
(`COMPLETED`) et **non payées** comptent, regroupées par client et triées par
dette la plus ancienne (total dû, nb de commandes, ancienneté, détail).
**Aucune borne de date** — contrairement à la file caisse, cadrée sur la
journée : la dette d’hier reste visible, et une commande récupérée impayée du
jour même apparaît tout de suite. Une commande encore `NEW`/`PREPARING`/`READY`
n’est **pas** une ardoise : le client n’a rien emporté.

Le champ `toCheck` liste à part les impayées **d’avant aujourd’hui** encore
`NEW`/`PREPARING`/`READY` : soit le « c’est récupéré » a été oublié (dette
réelle qui disparaîtrait en silence), soit la commande aurait dû être annulée.
Elles sont visibles mais **jamais comptées dans `totalOwed`** (`toCheckCount` /
`toCheckTotal` sont indicatifs) ; la correction passe par `set_order_status`.

`onlyOnAccount` restreint **la dette** à l’ardoise consentie
(`Order.isOnAccount`), par opposition aux impayés oubliés — sans effet sur
`toCheck`, une anomalie restant une anomalie qu’elle ait été consentie ou non.
Lecture seule : le règlement passe par `mark_order_paid`.

Les outils **fidélité** (carte à tampons) : `get_loyalty_card` (avancement +
récompenses dispo), `adjust_loyalty_stamps` (correction tracée),
`get_loyalty_settings` / `update_loyalty_settings` (config : montant min,
taille de carte, paliers, plafonds, règle 1/jour). Les tampons se gagnent
automatiquement à la création de commande (≥ montant min, 1/jour/numéro).

Les outils **inventaire** (matières premières & consommables) couvrent la gestion
périodique des stocks, lecture **et** écriture : `list_inventory_items` /
`get_inventory_item` / `get_inventory_summary` / `list_low_stock_items` (état du
stock, valorisé au **PMP** — prix moyen pondéré), `list_inventory_purchases` et
`record_inventory_purchases` (réapprovisionnement par lot : entrées avec
fournisseur et coût unitaire, mise à jour du PMP, option de création d'une dépense
liée du total), `cancel_restock_batch` (annule un lot et restaure stock + PMP,
refusé si un comptage postérieur existe), `list_inventory_counts` /
`get_inventory_count` / `record_inventory_count` (comptages périodiques : le stock
final compté déduit la consommation = stock initial + achats − stock final),
`create_inventory_item` / `update_inventory_item` (partiel) /
`archive_inventory_item` (suppression douce) pour les références, et
`get_inventory_settings` / `update_inventory_settings` pour la configuration. Les
quantités sont **décimales** ; les montants en francs CFA.

### Images produit

`set_product_image` permet à un client comme Claude de **donner une image à un
produit** sans passer par le dashboard. Deux modes :

- **URL distante** (le plus simple depuis un chat) : `imageUrl` = une URL
  http(s) publique. Le serveur **télécharge** le fichier, le valide, le
  **redimensionne** (≤ 2200 px) et le **ré-encode en WebP**, puis l'enregistre
  localement (`/uploads/products/<uuid>.webp`) et le rattache au produit. Un
  chemin déjà local (`/uploads/...`) est conservé tel quel.
- **Téléversement direct** : `imageBase64` (contenu encodé base64 ou data URI
  `data:image/png;base64,...`) + `mimeType` — même traitement.

> ⚠️ Une URL externe **doit être rapatriée** (c'est ce que fait l'outil) : elle
> ne peut pas être stockée telle quelle, car un hôte tiers n'est ni dans la CSP
> `img-src` ni dans `images.remotePatterns` (`next.config.ts`) — l'image ne
> s'afficherait pas. Après rapatriement, elle est servie en same-origin.

Formats d'entrée acceptés : JPEG/PNG/WebP/AVIF/HEIC (max 25 MB). Le même
mécanisme s'applique à `set_expense_receipt` et `set_investment_document`.

`update_product` est **partiel** : ne fournis que les champs à changer. ⚠️ Si tu
passes `supplementGroups`, la liste entière est remplacée (par upsert apparié
sur `name` — un groupe/option dont le nom est conservé garde son `id` ; un
renommage est traité comme suppression + création) ; omets-la pour conserver
les suppléments existants.

Chaque groupe de suppléments a un `type` : `single` (un choix), `multiple`
(cases à cocher) ou `quantity` (répartition d'une quantité totale entre les
options, ex. 3 parts à répartir sur 3 goûts — la même option peut être choisie
plusieurs fois). `minSelect`/`maxSelect` bornent respectivement le nombre
d'options cochées (`multiple`) ou la quantité totale répartie (`quantity`) ;
`null`/absent = pas de borne, et pour une quantité exacte (ex. toujours 3),
poser `minSelect = maxSelect`. Ignorés pour `single`.

Chaque groupe de suppléments et chaque option (« goût ») porte un drapeau
`available` (défaut `true`). Mis à `false`, l'élément reste configuré mais
disparaît du menu public (et de la caisse) — utile pour masquer temporairement
un parfum en rupture sans le supprimer.

**Soft delete** : `delete_category` et `delete_product` ne suppriment plus
réellement les lignes. Elles posent un `deletedAt` (la catégorie entraîne ses
produits) : les éléments sont masqués partout (y compris de `get_menu`) mais
conservés en base. Idem côté référentiels comptables — `delete_expense_category`
et `delete_investment_source` masquent sans casser les écritures rattachées, qui
gardent leur libellé ; recréer un libellé identique « ressuscite » la version
supprimée.

### Stock & pause (produits/options)

Trois mécanismes de disponibilité, distincts et complémentaires : **illimité**
(`stockQuantity: null`, défaut — aucun suivi, jamais bloqué), **stock suivi**
(quantité vendable, au niveau produit ET option) et **pause programmée**
(fenêtre d'indisponibilité, sans masquer le produit). `get_menu` renvoie
`stockQuantity`/`unavailableUntil` pour les produits et `stockQuantity`
(+ `id`, désormais exposé) pour chaque option de supplément — indispensable
pour cibler une option précise, les noms pouvant être dupliqués entre produits.

Le stock est **décrémenté à l'entrée en cuisine** (passage `NEW → PREPARING` :
encaissement d'une commande du jour, envoi manuel ou ardoise), jamais à la
simple création d'une commande. Le verrou d'idempotence est
`Order.stockReservedAt` : une commande ne peut décompter qu'une seule fois,
quel que soit le chemin emprunté.

**Commande différée** (retrait un _jour civil ultérieur_) : elle ne touche
**pas** au stock d'aujourd'hui. Sa marchandise sera produite le jour du
retrait, donc ni la création ni l'encaissement ne décomptent quoi que ce soit —
l'encaissement d'une commande différée est purement financier et la laisse
« Programmée ». Le décompte a lieu le jour J, quand le staff la lance en
cuisine. C'est ce qui permet de vendre pour demain un produit épuisé ce soir.

Deux gestes distincts par cible (produit/option) :

- **Définir (absolu)** — `set_product_stock` / `set_option_stock` : pose la
  quantité restante du jour. `quantity: null` (ou absent) repasse la cible en
  stock illimité ; `0` = épuisé.
- **Réapprovisionner (delta)** — `restock_product` / `restock_option` :
  ajoute `delta` (peut être négatif pour corriger) au stock courant, sans
  écraser la valeur — le geste « + nouvelle fournée » en cours de journée.
  Refusé si la cible est actuellement en stock illimité.

**Pause programmée** : `pause_product` (`until`, datetime ISO 8601) rend un
produit non commandable jusqu'à cette date-heure tout en le laissant visible
sur la carte publique avec un tag « Indisponible — retour {heure} » ; la
reprise est **automatique** (calculée à la lecture, sans cron). `resume_product`
lève la pause manuellement avant son terme. Différent de
`toggle_product_availability`, qui masque complètement le produit.

### Modifications en lot (`bulk_*`)

`bulk_update_products` et `bulk_set_product_stock` évitent N appels unitaires
(`lib/menu/mutations/bulk.ts`, plafond `BULK_PRODUCTS_MAX` = 100).

- **Atomique** : tout est validé avant d'écrire (produits, catégorie et
  planning cibles). Un id inconnu ou supprimé → erreur qui les liste, **rien
  n'est modifié**.
- **`dryRun: true`** : renvoie l'avant/après (`results[].changes`) sans écrire.
  À faire avant un lot important.
- **Valeurs absolues uniquement** (rejouable). Pas de bascule, pas de delta :
  `restock_*` et `toggle_*` restent unitaires. Les produits déjà conformes sont
  ignorés (`changed` ≤ `matched`).
- `bulk_update_products` : soit `target` (`ids` **ou** `categoryId` = toute la
  catégorie) + `patch` commun, soit `items: [{ id, ...champs }]` pour des
  valeurs différentes par produit. Champs : `available`, `preorderable`,
  `featured`, `price`, `categoryId` (le produit passe en fin de catégorie),
  `scheduleId` / `advanceOrderDays` / `unavailableUntil` (`null` = retirer),
  `requiresDeposit`. Les suppléments ne sont pas modifiables en lot
  (`update_product`). `warnings` signale « précommande refusée » + délai posé
  (le délai l'emporte).
- `bulk_set_product_stock` : `items: [{ id, quantity }]`, `quantity` entier ≥ 0
  ou `null` (illimité), comme `set_product_stock`.

### Plannings récurrents (« à la cal.com »)

Un `ProductSchedule` est **nommé et réutilisable** (ex. « Jour du chocolat » =
mercredi uniquement) : créé une fois via `create_product_schedule` (`name`,
`days` — 0=dimanche…6=samedi, au moins un jour), il s'assigne ensuite via
`scheduleId` sur **plusieurs produits ET catégories à la fois**
(`create_product`/`update_product`, `create_category`/`update_category`) —
modifier le planning (`update_product_schedule`) met à jour tout ce qui
l'utilise. `scheduleId: null` désassigne (redevient disponible tous les
jours) ; `delete_product_schedule` désassigne tout ce qui l'utilisait sans
rien supprimer d'autre.

Le jour effectif d'un produit est l'**intersection** de son propre planning et
de celui de sa catégorie s'il en a un (ex. produit « mercredi » dans une
catégorie « week-end » ⇒ jamais disponible — configuration incohérente
signalée honnêtement plutôt qu'ignorée). `get_menu` renvoie `availableDays`
(tableau de jours effectif) pour chaque produit ET chaque catégorie ; côté
carte publique, un produit/catégorie hors planning reste **visible** avec un
message de retour, mais son **prix ne s'affiche plus** tant qu'il n'est pas
dans sa fenêtre.

### Spécialité de la semaine

`ProductWeeklySpecial` trace un **historique structuré** de fenêtres de
disponibilité datées (`startDate`/`endDate`, format YYYY-MM-DD) pour un
produit — utile pour un article inédit disponible une semaine, qui peut
revenir plus tard sans perdre la trace des passages précédents.
`create_product_weekly_special` programme une fenêtre ; dès qu'**au moins
une** existe pour un produit, il n'est commandable **que** dans une fenêtre
active (comportement additif à `available`/`unavailableUntil`, pas un
remplacement). `list_product_weekly_specials` (avec ou sans `productId`)
renvoie l'historique complet — les fenêtres passées y restent, purement
consultatives, sans effet sur la disponibilité courante.
`update_product_weekly_special` corrige une fenêtre sans créer de nouvelle
ligne ; `delete_product_weekly_special` retire un passage (si c'était le
dernier, le produit redevient commandable normalement).

## Architecture

- `app/api/mcp/route.ts` — transport HTTP : auth (clé statique à temps constant
  **puis** OAuth via `withMcpAuth` + garde-fou rôle
  ADMIN/MANAGER/COMPTABLE/ANALYSTE, COMPTABLE restreint aux outils finance via
  `FINANCE_TOOL_NAMES` et ANALYSTE restreint aux outils en lecture seule via
  `READ_ONLY_TOOL_NAMES`), filtrage optionnel par domaine via `?toolset=`
  (intersecté avec la restriction de rôle, cf. `TOOLSET_TOOL_NAMES`), parsing
  JSON-RPC, CORS, invalidation du cache menu après écriture.
- `lib/auth.ts` — provider OAuth : plugin `mcp({ loginPage: '/login' })` de
  Better Auth + `baseURL` (issuer).
- `app/.well-known/{oauth-authorization-server,openid-configuration,oauth-protected-resource}/route.ts`
  (+ variantes `…/api/mcp/route.ts` avec le chemin de la ressource inséré) —
  découverte OAuth à la racine de l'origine (déléguée au plugin via
  `oAuthDiscoveryMetadata` / `oAuthProtectedResourceMetadata`), GET + OPTIONS.
- `lib/mcp/cors.ts` — CORS partagé (reflet des en-têtes demandés + préflight)
  entre `/api/mcp`, les documents de découverte et le catch-all
  `app/api/auth/[...all]/route.ts` (qui l'applique aux chemins
  `/api/auth/.well-known/*` et `/api/auth/mcp/*`).
- `app/(public)/login/page.tsx` — sait **reprendre** le flux OAuth après
  connexion (renvoie vers `/api/auth/mcp/authorize` avec les paramètres repris).
- `lib/mcp/handler.ts` — dispatcher JSON-RPC (`initialize`, `tools/list`,
  `tools/call`, `ping`), agnostique du framework.
- `lib/mcp/tools.ts` — barrel qui ré-exporte l'API publique du registre.
  `lib/mcp/tools/registry.ts` assemble un module `McpTool[]` par domaine
  (`lib/mcp/tools/*.ts`) : un nouveau domaine = un module **plus** son spread
  dans `registry.ts`. Chaque outil **branche** la logique
  existante (`lib/menu.ts`, `lib/menu-mutations.ts`) et réutilise les schémas Zod
  centralisés : aucune logique métier dupliquée. `toolset` (`TOOLSET_NAMES`)
  classe chaque outil dans un domaine fonctionnel — orthogonal à `scope`, qui
  gate l'accès par rôle — et `TOOLSET_TOOL_NAMES` en dérive la partition
  utilisée par le filtrage `?toolset=`.

## Test rapide (curl)

```bash
TOKEN=<MCP_API_KEY>
URL=https://<votre-domaine>/api/mcp

# Lister les outils
curl -s -X POST "$URL" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}' | jq

# Lire le menu
curl -s -X POST "$URL" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"get_menu","arguments":{}}}' | jq
```
