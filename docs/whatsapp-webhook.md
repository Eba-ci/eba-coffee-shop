# Webhook WhatsApp (Meta Cloud API)

Socle du futur bot WhatsApp : la route `app/api/webhooks/whatsapp/route.ts` vérifie
l'abonnement, authentifie chaque notification et **enregistre** les messages et statuts
reçus. **L'agent ne répond pas encore** : les messages sont seulement conservés.

## Ce que la route enregistre

Tables `whatsapp_conversation` et `whatsapp_message` (migration
`20261128090000_add_whatsapp_conversation`, additive).

- **Une conversation par expéditeur.** Meta peut l'identifier par un identifiant propre
  au commerce (BSUID, `userId`) et ne plus donner son numéro (`waId`, chiffres avec
  l'indicatif, sans `+`) s'il a adopté un nom d'utilisateur : les deux sont facultatifs
  et uniques. On retrouve la conversation par l'un ou l'autre.
- **Idempotent.** Meta rejoue ses envois jusqu'à 7 jours et peut grouper jusqu'à 1 000
  mises à jour par `POST` : `wamid` est unique, un message déjà vu est ignoré sans
  toucher au compteur. Une erreur de base répond `500` pour que Meta rejoue.
- **Versions.** Chaque nouveau message augmente `inboundVersion` de la conversation et en
  garde le numéro (`WhatsAppMessage.version`). `processedVersion` sera la dernière
  version à laquelle l'agent aura répondu : les messages à traiter sont ceux de
  `version > processedVersion`.
- **Lien client.** Si le numéro de l'expéditeur (authentifié par WhatsApp) est celui d'une
  fiche client, la conversation y est rattachée (`linkSource = PHONE_MATCH`). Les numéros
  étrangers n'en trouvent pas : la caisse n'enregistre que des numéros ivoiriens.
- **Numéros cités.** Le numéro donné dans un message (ivoirien ou étranger) reçoit un
  repère `NUMÉRO_n` dans `contactRefs` de la conversation ; le corps reste brut. Le futur
  agent ne verra que le repère (`lib/whatsapp/mask-phone.ts`). Migration
  `20261128100000_whatsapp_contact_refs`, additive.
- **Médias.** Seul l'identifiant du média est gardé (`payload.mediaId`), pas le fichier.
- **Statuts.** Livré, lu ou échoué mettent à jour nos envois (aucun envoi n'existe encore),
  sans jamais reculer d'un statut avancé à un moins avancé.
- **Aucun contenu dans les journaux** : une erreur n'est journalisée que par son code.

**Conservation : 90 jours** (`RETENTION.whatsappMessageDays`). La purge quotidienne
supprime les messages plus anciens, puis les conversations qui n'en ont plus. Le
client exporté (`exportCustomerData`) inclut ses conversations ; son anonymisation les
supprime. Meta est déclaré dans les sous-traitants et le registre des traitements
(`docs/conformite/`).

## Variables d'environnement

Les deux sont optionnelles. Tant qu'une variable manque, la méthode concernée répond
`404` (route inerte).

| Variable                | Sert à                                                       | Où la trouver                                                                     |
| ----------------------- | ------------------------------------------------------------ | --------------------------------------------------------------------------------- |
| `WHATSAPP_VERIFY_TOKEN` | Répondre au `GET` de vérification de Meta                    | Tu l'inventes : `openssl rand -hex 32`, puis tu le saisis à l'identique dans Meta |
| `WHATSAPP_APP_SECRET`   | Vérifier la signature `X-Hub-Signature-256` de chaque `POST` | Meta for Developers > ton app > Paramètres de l'app > De base > Clé secrète       |

Ce sont deux valeurs différentes. Ne jamais les coller dans une conversation, un ticket
ou un dépôt.

## Configurer Meta

1. WhatsApp > Configuration > Webhooks.
2. **URL de rappel** : `https://<ton-domaine>/api/webhooks/whatsapp` (HTTPS public, sans
   redirection : ni `www`, ni slash final qui redirige).
3. **Vérifier le token** : la valeur de `WHATSAPP_VERIFY_TOKEN`.
4. Laisser le certificat client désactivé, puis « Vérifier et enregistrer ».
5. Abonner le champ **`messages`** : sans lui, aucun message n'arrive.

La route doit être **déployée avant** de cliquer : Meta envoie aussitôt un `GET` à l'URL.

## L'en-tête `X-Hub-Signature-256`

Ce n'est pas un réglage du tableau de bord : c'est un en-tête HTTP que Meta ajoute à
chaque `POST`. Sa valeur est `sha256=` suivi du HMAC-SHA256 du corps brut, calculé avec la
clé secrète de l'app (`lib/whatsapp/webhook-auth.ts`). Il ne s'affiche donc nulle part
dans Meta : on le voit dans les requêtes reçues, ou on le recalcule pour tester.

## Tester à la main

Vérification :

```bash
curl "https://<ton-domaine>/api/webhooks/whatsapp?hub.mode=subscribe&hub.verify_token=$WHATSAPP_VERIFY_TOKEN&hub.challenge=1234"
# → 1234
```

Notification signée :

```bash
BODY='{"object":"whatsapp_business_account","entry":[]}'
SIG=$(printf '%s' "$BODY" | openssl dgst -sha256 -hmac "$WHATSAPP_APP_SECRET" -hex | sed 's/^.* //')
curl -X POST "https://<ton-domaine>/api/webhooks/whatsapp" \
  -H "X-Hub-Signature-256: sha256=$SIG" -d "$BODY"
# → {"ok":true}
```

## Si la vérification échoue

- **404** : la route n'est pas déployée, ou `WHATSAPP_VERIFY_TOKEN` n'est pas renseignée
  sur le serveur.
- **401 / page de connexion** : le **staging** est derrière une authentification Basic
  (nginx), que Meta ne peut pas passer. Utiliser l'URL de production, ou exclure
  `/api/webhooks/whatsapp` de l'authentification dans nginx (le jeton et la signature
  protègent déjà la route).
- **403** : jeton différent de celui du serveur (faute de frappe, espace en trop).
- **Redirection** : Meta ne la suit pas toujours.
