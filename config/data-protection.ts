// config/data-protection.ts
//
// Source UNIQUE des durées de conservation, des traitements et des
// sous-traitants. Lue par la politique de confidentialité, la purge
// (lib/data-retention.ts) et le dossier ARTCI (docs/conformite/) : ces trois
// documents ne doivent jamais diverger.
//
// Cadre : loi ivoirienne n°2013-450 du 19 juin 2013 (autorité : ARTCI), puis
// RGPD pour les visiteurs de l'UE. Les numéros d'articles ne figurent volontairement
// nulle part : ils sont à faire valider par un juriste avant publication.

const DAY_MS = 24 * 60 * 60 * 1000;

/** Durées de conservation (en jours, sauf mention contraire). */
export const RETENTION = {
  /** Commandes : identité du client anonymisée après ce délai (montants gardés). */
  orderYears: 3,
  /** Clients sans commande ni activité fidélité : anonymisés après ce délai. */
  inactiveCustomerYears: 3,
  /** IP / user-agent des votes de sondage. */
  pollVoteMetaDays: 90,
  /** Nom / téléphone des suggestions de sondage, depuis leur modération. */
  pollSuggestionMonths: 12,
  /** Conversations de l'assistant IA du dashboard. */
  assistantConversationDays: 90,
  /** Captures de preuve de paiement. */
  paymentProofMonths: 13,
  /** Abonnements push liés à une commande, après sa création. */
  orderPushDays: 30,
  /** Validité du choix cookies. */
  consentMonths: 13,
  /**
   * Historique des salaires : conservé 10 ans après la FIN DU CONTRAT (sortie
   * de l'employé), puis nom/poste/note anonymisés (montants agrégés conservés).
   * Durée fixée par le responsable du traitement ; à faire valider par un avis
   * juridique (cf. #409 / #415). Aucun numéro d'article de loi n'est cité.
   */
  salaryYearsAfterContract: 10,
} as const;

export const retentionCutoff = {
  days: (days: number, now = Date.now()) => new Date(now - days * DAY_MS),
  months: (months: number, now = Date.now()) => {
    const d = new Date(now);
    d.setMonth(d.getMonth() - months);
    return d;
  },
  years: (years: number, now = Date.now()) => {
    const d = new Date(now);
    d.setFullYear(d.getFullYear() - years);
    return d;
  },
};

export type ProcessingActivity = {
  id: string;
  label: string;
  purpose: string;
  basis: string;
  data: string;
  people: string;
  recipients: string;
  duration: string;
};

export const PROCESSING_ACTIVITIES: ProcessingActivity[] = [
  {
    id: 'commandes',
    label: 'Commandes et retrait',
    purpose:
      'Préparer, remettre et encaisser une commande ; vous prévenir de son avancement.',
    basis: 'Exécution de votre commande (contrat).',
    data: 'Prénom ou nom, téléphone, contenu de la commande, créneau de retrait, note libre, mode et statut de paiement, remboursement éventuel (montant, motif, numéro de remboursement).',
    people: 'Clients (site public et caisse).',
    recipients:
      'Personnel autorisé ; Jèko (paiement en ligne) ; Resend (e-mail de notification au commerce).',
    duration: `${RETENTION.orderYears} ans, puis anonymisation du nom, du téléphone, du numéro de remboursement et de la note (montants et dates conservés pour la comptabilité).`,
  },
  {
    id: 'fidelite',
    label: 'Carte de fidélité et fiche client',
    purpose:
      'Compter les tampons, attribuer les récompenses, reconnaître un client de confiance (ardoise).',
    basis:
      'Intérêt légitime du commerce et information du client ; opposition possible à tout moment.',
    data: 'Téléphone, nom, tampons et récompenses, mention « client de confiance ».',
    people: 'Clients ayant commandé.',
    recipients: 'Personnel autorisé (ADMIN, MANAGER).',
    duration: `${RETENTION.inactiveCustomerYears} ans après la dernière activité, puis anonymisation.`,
  },
  {
    id: 'sondages',
    label: 'Sondages et suggestions',
    purpose:
      'Recueillir l’avis de la communauté et éviter les votes en double ou abusifs.',
    basis:
      'Intérêt légitime (lutte contre l’abus) ; consentement pour les suggestions.',
    data: 'Choix de vote, téléphone, adresse IP (hachée), navigateur, nom et téléphone de l’auteur d’une suggestion.',
    people: 'Participants aux sondages.',
    recipients: 'Personnel autorisé.',
    duration: `Adresse IP et navigateur : ${RETENTION.pollVoteMetaDays} jours. Nom et téléphone d’une suggestion : ${RETENTION.pollSuggestionMonths} mois après modération.`,
  },
  {
    id: 'notifications',
    label: 'Notifications de suivi de commande',
    purpose: 'Vous avertir lorsque votre commande est prête.',
    basis: 'Votre consentement (autorisation du navigateur).',
    data: 'Identifiant technique de l’appareil (abonnement push).',
    people: 'Clients ayant activé les notifications.',
    recipients:
      'Services de notification du navigateur (Google, Mozilla, Apple).',
    duration:
      'Jusqu’à la fin de vie de la commande ou au retrait de l’autorisation.',
  },
  {
    id: 'audience',
    label: 'Mesure d’audience et publicité',
    purpose: 'Comprendre l’usage du site et mesurer nos publicités.',
    basis: 'Votre consentement (bandeau cookies), retirable à tout moment.',
    data: 'Identifiant de navigateur, pages vues, événements de commande (sans nom ni téléphone).',
    people: 'Visiteurs du site.',
    recipients: 'Google (Tag Manager, Analytics) ; Meta si le pixel est actif.',
    duration: `Cookies : 2 ans (Google), 3 mois (Meta). Votre choix est conservé ${RETENTION.consentMonths} mois.`,
  },
  {
    id: 'contact',
    label: 'Messages envoyés via le formulaire de contact',
    purpose: 'Répondre à votre demande, y compris l’exercice de vos droits.',
    basis: 'Votre demande.',
    data: 'Nom, e-mail, téléphone (facultatif), message.',
    people: 'Personnes qui nous écrivent.',
    recipients: 'Personnel autorisé ; Resend (acheminement du message).',
    duration: 'Le temps du traitement de la demande, puis 12 mois au plus.',
  },
  {
    id: 'personnel',
    label: 'Comptes du personnel',
    purpose: 'Authentifier le personnel et tracer l’accès au dashboard.',
    basis: 'Intérêt légitime (sécurité) et contrat de travail.',
    data: 'E-mail, nom, rôle, adresse IP et navigateur des sessions.',
    people: 'Personnel.',
    recipients:
      'Resend (code de connexion par e-mail) ; Sentry (journaux d’erreurs).',
    duration:
      'Sessions et codes expirés supprimés ; compte supprimé à la demande.',
  },
  {
    id: 'salaires',
    label: 'Gestion des salaires',
    purpose:
      'Calculer la paie due, enregistrer les versements (salaires, acomptes, avances) et suivre les avances des employés.',
    basis:
      'Exécution du contrat de travail ; obligation légale de tenue de la paie.',
    data: 'Nom, poste, date d’entrée et de sortie, taux mensuel et historique des montants, versements (date, montant, type, mode de paiement, note).',
    people: 'Employés et anciens employés.',
    recipients: 'Personnel autorisé (ADMIN) ; aucun sous-traitant externe.',
    duration: `${RETENTION.salaryYearsAfterContract} ans après la fin du contrat (sortie de l’employé), puis anonymisation du nom, du poste et de la note ; les montants agrégés sont conservés. Durée fixée par le responsable du traitement, à faire valider par un avis juridique — aucun numéro d’article de loi n’est cité.`,
  },
  {
    id: 'assistant',
    label: 'Assistant IA du dashboard',
    purpose: 'Aider le personnel à lire les chiffres et saisir des écritures.',
    basis: 'Intérêt légitime (gestion interne).',
    data: 'Historique des échanges ; numéros de téléphone des clients masqués avant envoi.',
    people: 'Personnel utilisant l’assistant.',
    recipients: 'OpenRouter et le fournisseur du modèle (hors Côte d’Ivoire).',
    duration: `${RETENTION.assistantConversationDays} jours.`,
  },
];

export type Processor = {
  name: string;
  role: string;
  country: string;
  trigger: 'toujours' | 'consentement' | 'au clic' | 'personnel';
};

/** Destinataires situés hors de Côte d'Ivoire (transferts à déclarer à l'ARTCI). */
export const PROCESSORS: Processor[] = [
  {
    name: 'Google (Tag Manager, Analytics)',
    role: 'Mesure d’audience',
    country: 'États-Unis',
    trigger: 'consentement',
  },
  {
    name: 'Meta (pixel)',
    role: 'Mesure des publicités',
    country: 'États-Unis / Irlande',
    trigger: 'consentement',
  },
  {
    name: 'Google Maps',
    role: 'Carte du lieu',
    country: 'États-Unis',
    trigger: 'au clic',
  },
  {
    name: 'TikTok',
    role: 'Vidéo intégrée',
    country: 'Singapour / États-Unis',
    trigger: 'au clic',
  },
  {
    name: 'Cloudinary',
    role: 'Hébergement des images',
    country: 'États-Unis',
    trigger: 'toujours',
  },
  {
    name: 'Jèko',
    role: 'Paiement en ligne',
    country: 'À confirmer',
    trigger: 'toujours',
  },
  {
    name: 'Resend',
    role: 'Envoi d’e-mails',
    country: 'États-Unis',
    trigger: 'personnel',
  },
  {
    name: 'Sentry',
    role: 'Suivi des erreurs',
    country: 'États-Unis / UE',
    trigger: 'toujours',
  },
  {
    name: 'OpenRouter',
    role: 'Assistant IA interne',
    country: 'États-Unis',
    trigger: 'personnel',
  },
];
