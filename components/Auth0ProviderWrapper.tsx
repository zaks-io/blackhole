'use client';

import { Auth0Provider } from '@auth0/auth0-react';
import { useRouter } from 'next/navigation';

export function Auth0ProviderWrapper({ children }: { children: React.ReactNode }) {
  const router = useRouter();

  return (
    <Auth0Provider
      domain={process.env.NEXT_PUBLIC_AUTH0_DOMAIN!}
      clientId={process.env.NEXT_PUBLIC_AUTH0_CLIENT_ID!}
      cacheLocation="memory"
      authorizationParams={{
        redirect_uri: typeof window !== 'undefined' ? `${window.location.origin}/app` : '',
      }}
      onRedirectCallback={(appState) => {
        router.replace(appState?.returnTo || '/');
      }}
    >
      {children}
    </Auth0Provider>
  );
}
