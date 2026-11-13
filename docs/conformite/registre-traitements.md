<!-- Généré par scripts/gen-compliance-docs.ts depuis config/data-protection.ts — ne pas éditer à la main. -->

# Registre des traitements de données personnelles

Base du dossier de déclaration ou d'autorisation à l'ARTCI (loi n°2013-450 du
19 juin 2013). Un traitement par fiche.

## Commandes et retrait

- **Finalité** : Préparer, remettre et encaisser une commande ; vous prévenir de son avancement.
- **Base** : Exécution de votre commande (contrat).
- **Données** : Prénom ou nom, téléphone, contenu de la commande, créneau de retrait, note libre, mode et statut de paiement, remboursement éventuel (montant, motif, numéro de remboursement).
- **Personnes concernées** : Clients (site public et caisse).
- **Destinataires** : Personnel autorisé ; Jèko (paiement en ligne) ; Resend (e-mail de notification au commerce).
- **Durée de conservation** : 3 ans, puis anonymisation du nom, du téléphone, du numéro de remboursement et de la note (montants et dates conservés pour la comptabilité).

## Carte de fidélité et fiche client

- **Finalité** : Compter les tampons, attribuer les récompenses, reconnaître un client de confiance (ardoise).
- **Base** : Intérêt légitime du commerce et information du client ; opposition possible à tout moment.
- **Données** : Téléphone, nom, tampons et récompenses, mention « client de confiance ».
- **Personnes concernées** : Clients ayant commandé.
- **Destinataires** : Personnel autorisé (ADMIN, MANAGER).
- **Durée de conservation** : 3 ans après la dernière activité, puis anonymisation.

## Sondages et suggestions

- **Finalité** : Recueillir l’avis de la communauté et éviter les votes en double ou abusifs.
- **Base** : Intérêt légitime (lutte contre l’abus) ; consentement pour les suggestions.
- **Données** : Choix de vote, téléphone, adresse IP (hachée), navigateur, nom et téléphone de l’auteur d’une suggestion.
- **Personnes concernées** : Participants aux sondages.
- **Destinataires** : Personnel autorisé.
- **Durée de conservation** : Adresse IP et navigateur : 90 jours. Nom et téléphone d’une suggestion : 12 mois après modération.

## Notifications de suivi de commande

- **Finalité** : Vous avertir lorsque votre commande est prête.
- **Base** : Votre consentement (autorisation du navigateur).
- **Données** : Identifiant technique de l’appareil (abonnement push).
- **Personnes concernées** : Clients ayant activé les notifications.
- **Destinataires** : Services de notification du navigateur (Google, Mozilla, Apple).
- **Durée de conservation** : Jusqu’à la fin de vie de la commande ou au retrait de l’autorisation.

## Mesure d’audience et publicité

- **Finalité** : Comprendre l’usage du site et mesurer nos publicités.
- **Base** : Votre consentement (bandeau cookies), retirable à tout moment.
- **Données** : Identifiant de navigateur, pages vues, événements de commande (sans nom ni téléphone).
- **Personnes concernées** : Visiteurs du site.
- **Destinataires** : Google (Tag Manager, Analytics) ; Meta si le pixel est actif.
- **Durée de conservation** : Cookies : 2 ans (Google), 3 mois (Meta). Votre choix est conservé 13 mois.

## Messages envoyés via le formulaire de contact

- **Finalité** : Répondre à votre demande, y compris l’exercice de vos droits.
- **Base** : Votre demande.
- **Données** : Nom, e-mail, téléphone (facultatif), message.
- **Personnes concernées** : Personnes qui nous écrivent.
- **Destinataires** : Personnel autorisé ; Resend (acheminement du message).
- **Durée de conservation** : Le temps du traitement de la demande, puis 12 mois au plus.

## Comptes du personnel

- **Finalité** : Authentifier le personnel et tracer l’accès au dashboard.
- **Base** : Intérêt légitime (sécurité) et contrat de travail.
- **Données** : E-mail, nom, rôle, adresse IP et navigateur des sessions.
- **Personnes concernées** : Personnel.
- **Destinataires** : Resend (code de connexion par e-mail) ; Sentry (journaux d’erreurs).
- **Durée de conservation** : Sessions et codes expirés supprimés ; compte supprimé à la demande.

## Gestion des salaires

- **Finalité** : Calculer la paie due, enregistrer les versements (salaires, acomptes, avances) et suivre les avances des employés.
- **Base** : Exécution du contrat de travail ; obligation légale de tenue de la paie.
- **Données** : Nom, poste, date d’entrée et de sortie, taux mensuel et historique des montants, versements (date, montant, type, mode de paiement, note).
- **Personnes concernées** : Employés et anciens employés.
- **Destinataires** : Personnel autorisé (ADMIN) ; aucun sous-traitant externe.
- **Durée de conservation** : 10 ans après la fin du contrat (sortie de l’employé), puis anonymisation du nom, du poste et de la note ; les montants agrégés sont conservés. Durée fixée par le responsable du traitement, à faire valider par un avis juridique — aucun numéro d’article de loi n’est cité.

## Assistant IA du dashboard

- **Finalité** : Aider le personnel à lire les chiffres et saisir des écritures.
- **Base** : Intérêt légitime (gestion interne).
- **Données** : Historique des échanges ; numéros de téléphone des clients masqués avant envoi.
- **Personnes concernées** : Personnel utilisant l’assistant.
- **Destinataires** : OpenRouter et le fournisseur du modèle (hors Côte d’Ivoire).
- **Durée de conservation** : 90 jours.
