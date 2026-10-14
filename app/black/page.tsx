import type { Metadata } from 'next';
import BlackExperience from './BlackExperience';
import { blackConfig as config } from './black-config';
export const metadata: Metadata = {
  metadataBase: new URL('https://focoemcanto.com'),
  title: `${config.campaignName} ${config.year} | ${config.brand}`,
  description: config.slogan.join(' '),
  alternates: { canonical: 'https://focoemcanto.com/black/' },
  openGraph: { title: `${config.campaignName} ${config.year}`, description: config.slogan.join(' '), images: ['/images/black/marcos-mono.webp'] },
};
export default function BlackPage() { return <BlackExperience />; }
