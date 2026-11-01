import type { MetadataRoute } from 'next';
import { siteUrl } from '@/lib/site-url';
import { isStaging } from '@/lib/app-env';

const baseUrl = siteUrl();

// Évalué à chaque requête : `APP_ENV` n'existe qu'à l'exécution (image Docker
// construite une fois), un prérendu au build figerait le robots.txt de prod.
export const dynamic = 'force-dynamic';

export default function robots(): MetadataRoute.Robots {
  // Staging : rien à indexer.
  if (isStaging()) {
    return { rules: { userAgent: '*', disallow: '/' } };
  }
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      disallow: [
        '/dashboard/',
        '/login',
        '/carte/commande',
        '/commande/',
        '/mes-commandes',
      ],
    },
    sitemap: `${baseUrl}/sitemap.xml`,
  };
}
