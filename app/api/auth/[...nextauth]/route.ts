import NextAuth, { type NextAuthOptions } from 'next-auth';
import EmailProvider from 'next-auth/providers/email';
import GoogleProvider from 'next-auth/providers/google';
import { MongoDBAdapter } from '@next-auth/mongodb-adapter';
import clientPromise from '../../../../lib/mongodb';
import { ObjectId } from 'mongodb';
import { DEFAULT_VOCAL_RANGE } from '../../../../lib/constants';

const googleClientId = process.env.GOOGLE_CLIENT_ID;
const googleClientSecret = process.env.GOOGLE_CLIENT_SECRET;

if (!googleClientId || !googleClientSecret) {
  throw new Error('Missing Google OAuth environment variables.');
}

const authOptions: NextAuthOptions = {
  adapter: MongoDBAdapter(clientPromise),
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
    EmailProvider({
      server: process.env.EMAIL_SERVER,
      from: process.env.EMAIL_FROM,
    }),
  ],
  callbacks: {
    async jwt({ token, account, user }) {
      if (account?.provider) {
        token.provider = account.provider;
      }
      if (user && typeof user === 'object' && 'isTeacher' in user) {
        token.isTeacher = (user as { isTeacher?: boolean }).isTeacher ?? true;
      }
      if (token.sub) {
        if (!ObjectId.isValid(token.sub)) {
          token.isTeacher = true;
        } else {
          const client = await clientPromise;
          const db = client.db();
          const userId = new ObjectId(token.sub);
          const userRecord = await db
            .collection('users')
            .findOne({ _id: userId }, { projection: { isTeacher: 1 } });
          if (userRecord && typeof userRecord.isTeacher === 'boolean') {
            token.isTeacher = userRecord.isTeacher;
          } else {
            await db.collection('users').updateOne(
              { _id: userId },
              { $set: { isTeacher: true } }
            );
            token.isTeacher = true;
          }
        }
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
        session.user.isTeacher =
          typeof token.isTeacher === 'boolean' ? token.isTeacher : undefined;
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
  events: {
    async createUser({ user }) {
      if (!user.id) {
        return;
      }
      const client = await clientPromise;
      const db = client.db();
      await db.collection('users').updateOne(
        { _id: new ObjectId(user.id) },
        { $setOnInsert: { isTeacher: true, vocalRange: DEFAULT_VOCAL_RANGE } }
      );
    },
  },
};

const handler = NextAuth(authOptions);

export { handler as GET, handler as POST };
