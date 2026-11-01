import type { Metadata, Viewport } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';
import './globals.css';
import Providers from '@/components/providers';
import { buildHomeJsonLd } from '@/lib/json-ld';
import { siteUrl } from '@/lib/site-url';
import { getContactSettings } from '@/lib/contact-settings-db';
import { getPickupSettings } from '@/lib/pickup-settings-db';
import { xHandleFromUrl } from '@/lib/social-links';
import { OG_IMAGE } from '@/config/constants';

export const revalidate = 3600;

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin', 'latin-ext'],
});

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin', 'latin-ext'],
});

// `generateMetadata` plutôt qu'un objet statique : le pseudo X (`twitter:site`)
// vient des réglages de contact en base, comme les liens du pied de page — un
// seul endroit à renseigner pour que la carte X soit attribuée au compte. La
// lecture est mutualisée avec celle du layout ci-dessous (`cache()` de React),
// donc pas de requête supplémentaire.
export async function generateMetadata(): Promise<Metadata> {
  const contact = await getContactSettings();
  const xHandle = xHandleFromUrl(contact.xUrl);
  if (!xHandle) return baseMetadata;
  return {
    ...baseMetadata,
    twitter: { ...twitterMetadata, site: xHandle, creator: xHandle },
  };
}

const twitterMetadata = {
  card: 'summary_large_image',
  title: 'EBA Coffee Shop à Abidjan',
  description:
    'Café, brunch, boissons signatures et ambiance cosy chez EBA Coffee Shop.',
  images: [OG_IMAGE.url],
} satisfies Metadata['twitter'];

const baseMetadata: Metadata = {
  metadataBase: new URL(siteUrl()),
  title: {
    default: 'EBA Coffee shop à Abidjan | Café, brunch et douceurs',
    template: '%s | EBA Coffee Shop',
  },
  description:
    'Découvrez EBA Coffee Shop à Abidjan : cafés, boissons signatures, pâtisseries, brunch et ambiance chaleureuse pour vos pauses gourmandes.',
  alternates: {
    canonical: '/',
  },
  openGraph: {
    type: 'website',
    siteName: 'EBA Coffee Shop',
    locale: 'fr_FR',
    title: 'EBA Coffee Shop à Abidjan',
    description:
      'Un coffee shop chaleureux à Abidjan pour savourer café, brunch, pâtisseries et moments de détente.',
    url: '/',
    images: [OG_IMAGE],
  },
  twitter: twitterMetadata,
  manifest: '/manifest.json',
  icons: {
    icon: [
      { url: '/favicon.ico' },
      { url: '/icon1.png', type: 'image/png' },
      { url: '/icon0.svg', type: 'image/svg+xml' },
    ],
    apple: '/apple-icon.png',
  },
  appleWebApp: {
    capable: true,
    title: 'EBA',
    statusBarStyle: 'default',
  },
};

export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#6c3077' },
    { media: '(prefers-color-scheme: dark)', color: '#1a1218' },
  ],
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const [contact, pickup] = await Promise.all([
    getContactSettings(),
    getPickupSettings(),
  ]);
  return (
    <html lang="fr">
      <head>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify(
              buildHomeJsonLd(contact, pickup.weeklyHours)
            ),
          }}
        />
      </head>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
