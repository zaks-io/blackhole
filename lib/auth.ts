import { createRemoteJWKSet, jwtVerify } from 'jose';

const domain = process.env.NEXT_PUBLIC_AUTH0_DOMAIN!;
const JWKS = createRemoteJWKSet(new URL(`https://${domain}/.well-known/jwks.json`));

export async function verifyAuth(request: Request): Promise<{ sub: string } | null> {
  const authHeader = request.headers.get('authorization');
  if (!authHeader?.startsWith('Bearer ')) return null;

  const token = authHeader.slice(7);
  try {
    const { payload } = await jwtVerify(token, JWKS, {
      issuer: `https://${domain}/`,
      audience: process.env.NEXT_PUBLIC_AUTH0_CLIENT_ID,
    });
    return { sub: payload.sub as string };
  } catch (err) {
    console.error('Token verification failed:', err);
    return null;
  }
}
