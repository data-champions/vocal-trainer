import NextAuth, { type NextAuthOptions } from 'next-auth';
import CredentialsProvider from 'next-auth/providers/credentials';
import GoogleProvider from 'next-auth/providers/google';

const googleClientId = process.env.GOOGLE_CLIENT_ID;
const googleClientSecret = process.env.GOOGLE_CLIENT_SECRET;

if (!googleClientId || !googleClientSecret) {
  throw new Error('Missing Google OAuth environment variables.');
}

export const authOptions: NextAuthOptions = {
  secret: process.env.NEXTAUTH_SECRET,
  session: { strategy: 'jwt' },
  pages: {
    signIn: '/',
  },
  providers: [
    GoogleProvider({
      clientId: googleClientId,
      clientSecret: googleClientSecret,
    }),
    CredentialsProvider({
      name: 'Email',
      credentials: {
        email: { label: 'Email', type: 'text' },
      },
      authorize: async (credentials) => {
        const emailInput = credentials?.email;
        if (!emailInput || typeof emailInput !== 'string') {
          return null;
        }
        const email = emailInput.trim();
        if (!email) {
          return null;
        }
        const username = email.split('@')[0] || 'Account';
        const friendlyName =
          username.charAt(0).toUpperCase() + username.slice(1);
        return {
          id: email,
          name: friendlyName,
          email,
          provider: 'email',
        };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, account, user }) {
      if (account?.provider) {
        token.provider = account.provider;
      }
      if (user && typeof user === 'object' && 'provider' in user) {
        const maybeProvider = (user as { provider?: string }).provider;
        if (maybeProvider) {
          token.provider = maybeProvider;
        }
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.provider =
          typeof token.provider === 'string' ? token.provider : undefined;
      }
      return session;
    },
    async redirect({ url, baseUrl }) {
      if (url.startsWith('/')) {
        return `${baseUrl}${url}`;
      }
      try {
        const targetUrl = new URL(url);
        if (targetUrl.origin === baseUrl) {
          return url;
        }
      } catch (error) {
        console.error('Invalid redirect URL', error);
      }
      return baseUrl;
    },
  },
};

const handler = NextAuth(authOptions);

export { handler as GET, handler as POST };
