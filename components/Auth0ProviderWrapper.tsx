'use client';

import { Auth0Provider } from '@auth0/auth0-react';
import { useRouter } from 'next/navigation';

export function Auth0ProviderWrapper({ children }: { children: React.ReactNode }) {
  const router = useRouter();

  return (
    <Auth0Provider
      domain={process.env.NEXT_PUBLIC_AUTH0_DOMAIN!}
      clientId={process.env.NEXT_PUBLIC_AUTH0_CLIENT_ID!}
      // Persist tokens across page loads; the default in-memory cache forces
      // a full redirect round-trip (and sometimes a login prompt) per reload
      cacheLocation="localstorage"
      authorizationParams={{
        // Must be a route that renders the Auth0Provider without dropping the
        // ?code&state query. /app is a server redirect('/') that strips it.
        redirect_uri: typeof window !== 'undefined' ? window.location.origin : '',
      }}
      onRedirectCallback={(appState) => {
        router.replace(appState?.returnTo || '/');
      }}
    >
      {children}
    </Auth0Provider>
  );
}
