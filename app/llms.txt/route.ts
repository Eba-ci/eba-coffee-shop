// `/llms.txt` — index de site destiné aux LLM et aux moteurs de recherche IA
// (spécification : https://llmstxt.org).
//
// Pourquoi une route et non un fichier statique dans `public/` : l'adresse,
// le téléphone et les horaires sont éditables depuis `/dashboard/parametres`
// et vivent en base. Un `public/llms.txt` figé recommencerait à mentir dès le
// premier changement d'horaire — exactement le problème que `sitemap.ts` et
// `robots.ts` évitent déjà en se générant côté serveur.
//
// Le format est un index *court* : identité, faits essentiels, puis des liens
// annotés. Le contenu détaillé n'est pas recopié ici — il est déjà exposé aux
// crawlers en JSON-LD (`CafeOrCoffeeShop` sur l'accueil, `Menu` sur `/carte`,
// cf. `lib/json-ld.ts`), et le dupliquer créerait une seconde source de
// vérité à maintenir.

import { getContactSettings } from '@/lib/contact-settings-db';
import { getPickupSettings } from '@/lib/pickup-settings-db';
import { summarizeWeeklyHours } from '@/lib/pickup-settings';
import { siteUrl as getSiteUrl } from '@/lib/site-url';
import { CONTACT_FORM_ENABLED } from '@/config/constants/contact';

const siteUrl = getSiteUrl();

// Même cadence que le sitemap : les coordonnées et horaires sont peu
// volatils, et les crawlers LLM repassent rarement.
export const revalidate = 3600;

/** `- [Libellé](url) : description` — une entrée de la liste de liens. */
function link(label: string, path: string, description: string): string {
  return `- [${label}](${siteUrl}${path}) : ${description}`;
}

export async function GET(): Promise<Response> {
  const [contact, pickup] = await Promise.all([
    getContactSettings(),
    getPickupSettings(),
  ]);
  const hours = summarizeWeeklyHours(pickup.weeklyHours);

  const body = `# EBA Coffee Shop

> Coffee shop et pâtisserie artisanale à Cocody, Abidjan (Côte d'Ivoire) :
> cafés de spécialité, pâtisseries maison, brunch et boissons signatures,
> à consommer sur place ou à commander en ligne pour un retrait en boutique.

Le site est en français et s'adresse au marché abidjanais. Les prix sont en
francs CFA (XOF). La commande en ligne se fait sans compte : le client choisit
un créneau de retrait, puis règle sur place ou par mobile money.

## Informations pratiques

- Adresse : ${contact.address}
- Quartier : ${contact.district} (${contact.landmark})
- Horaires : ${hours}
- Téléphone : ${contact.phone}
- WhatsApp : ${contact.whatsapp}
- Email : ${contact.email}
- Moyens de paiement : espèces, mobile money (Wave, Orange Money), carte bancaire
- Itinéraire : ${contact.mapsDirectionsUrl}

## Pages principales

${link('Accueil', '/', 'présentation du lieu, produits phares du moment et horaires')}
${link('La carte', '/carte', 'catalogue complet avec prix en francs CFA, et commande en ligne')}
${link('Le lieu', '/le-lieu', "description de l'espace, ambiance et accès")}
${link('À propos', '/a-propos', "histoire de l'enseigne, la pâtissière fondatrice et les engagements qualité")}
${link('Contact', '/contact', CONTACT_FORM_ENABLED ? 'formulaire, coordonnées et plan' : 'coordonnées et plan')}
${link('Sondages', '/sondages', 'votes ouverts au public sur les prochaines créations')}
${link('Mentions légales', '/mentions-legales', 'éditeur et hébergeur')}
${link('Politique de confidentialité', '/confidentialite', 'données personnelles et droits')}
${link('Conditions générales de vente', '/cgv', 'commande, paiement et retrait')}

## Réseaux sociaux

- Instagram : ${contact.instagramUrl} (${contact.instagramHandle})
- TikTok : ${contact.tiktokUrl} (${contact.tiktokHandle})

## Notes pour les robots d'exploration

- Données structurées : \`CafeOrCoffeeShop\` (accueil) et \`Menu\` (\`/carte\`) en JSON-LD.
- Plan du site : ${siteUrl}/sitemap.xml
- L'espace de gestion (\`/dashboard\`), la connexion et le suivi de commande
  sont privés et exclus de l'indexation — voir ${siteUrl}/robots.txt.
`;

  return new Response(body, {
    headers: {
      // `text/plain` plutôt que `text/markdown` : le fichier doit rester
      // lisible directement dans un navigateur, et tous les crawlers ne
      // gèrent pas le second type.
      'Content-Type': 'text/plain; charset=utf-8',
    },
  });
}
