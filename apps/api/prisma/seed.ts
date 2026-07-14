import argon2 from 'argon2';
import { PrismaClient, UserRole } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const email = process.env.SEED_ADMIN_EMAIL;
  const password = process.env.SEED_ADMIN_PASSWORD;
  if (email === undefined || password === undefined) {
    throw new Error('SEED_ADMIN_EMAIL and SEED_ADMIN_PASSWORD must be provided through secrets');
  }
  await prisma.user.upsert({
    where: { email: email.toLowerCase() },
    update: {},
    create: {
      email: email.toLowerCase(),
      displayName: 'CADIR Administrator',
      passwordHash: await argon2.hash(password, { type: argon2.argon2id }),
      role: UserRole.ADMIN,
    },
  });
}

await main().finally(async () => prisma.$disconnect());
