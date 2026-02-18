import HomePageClient from './HomePageClient';

export default function HomePage(): JSX.Element {
  const showDevLinks =
    process.env.NODE_ENV === 'development' && process.env.IS_DEV === 'true';

  return <HomePageClient showDevLinks={showDevLinks} />;
}
