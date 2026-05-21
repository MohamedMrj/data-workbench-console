import AzureADProvider from 'next-auth/providers/azure-ad';
import { getAuthSecret, isAuthRequired, isEmailAllowed } from './live-config';

function providerConfigReady() {
  return Boolean(
    process.env.MICROSOFT_ENTRA_CLIENT_ID
    && process.env.MICROSOFT_ENTRA_CLIENT_SECRET
    && process.env.MICROSOFT_ENTRA_TENANT_ID
  );
}

export const authOptions = {
  secret: getAuthSecret() || undefined,
  providers: providerConfigReady()
    ? [
        AzureADProvider({
          clientId: process.env.MICROSOFT_ENTRA_CLIENT_ID,
          clientSecret: process.env.MICROSOFT_ENTRA_CLIENT_SECRET,
          tenantId: process.env.MICROSOFT_ENTRA_TENANT_ID
        })
      ]
    : [],
  pages: {
    error: '/access-denied'
  },
  callbacks: {
    async signIn({ user }) {
      if (!isAuthRequired()) {
        return true;
      }
      return isEmailAllowed(user?.email) ? true : '/access-denied';
    },
    async jwt({ token, user }) {
      if (user?.email) {
        token.email = user.email;
        token.name = user.name || token.name || user.email;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.email = token.email || session.user.email || '';
        session.user.name = token.name || session.user.name || session.user.email || '';
      }
      return session;
    }
  }
};
