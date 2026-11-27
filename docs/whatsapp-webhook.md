# Webhook WhatsApp (Meta Cloud API)

Socle du futur bot WhatsApp : la route `app/api/webhooks/whatsapp/route.ts` vérifie
l'abonnement et authentifie chaque notification. **Elle ne traite encore rien** : une
notification correctement signée reçoit un `200`.

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
