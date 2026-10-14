import type { Metadata } from 'next';
import BlackExperience from './BlackExperience';
export const metadata: Metadata = {
  metadataBase: new URL('https://focoemcanto.com'),
  title: 'BLACK FOCUS 2026 | Um universo. Uma nova possibilidade.',
  description: 'Voz, harmonia e aprendizado em um mesmo universo. Conheça a experiência Black Focus 2026, do ecossistema Foco em Canto.',
  alternates: { canonical: 'https://focoemcanto.com/black/' },
  openGraph: { title: 'BLACK FOCUS 2026', description: 'Vários produtos. Um ecossistema. Uma única oferta.', images: ['/images/black/marcos-mono.webp'] },
};
export default function BlackPage() { return <BlackExperience />; }
