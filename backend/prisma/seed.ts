import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('Seeding database...');

  const alice = await prisma.user.upsert({
    where: { stellarAddress: 'GB...alice...dev' },
    update: {},
    create: {
      stellarAddress: 'GB...alice...dev',
      username: 'alice_dev',
    },
  });

  const bob = await prisma.user.upsert({
    where: { stellarAddress: 'GB...bob...dev' },
    update: {},
    create: {
      stellarAddress: 'GB...bob...dev',
      username: 'bob_dev',
    },
  });

  const carol = await prisma.user.upsert({
    where: { stellarAddress: 'GB...carol...dev' },
    update: {},
    create: {
      stellarAddress: 'GB...carol...dev',
      username: 'carol_dev',
    },
  });

  await prisma.tip.createMany({
    data: [
      {
        txHash: `dev-tx-${Date.now()}-1`,
        ledger: 1000,
        fromAddress: alice.stellarAddress,
        toAddress: bob.stellarAddress,
        amountStroops: BigInt(100_000_000),
        message: 'Great content!',
      },
      {
        txHash: `dev-tx-${Date.now()}-2`,
        ledger: 1005,
        fromAddress: bob.stellarAddress,
        toAddress: alice.stellarAddress,
        amountStroops: BigInt(50_000_000),
        message: 'Thanks for the tip!',
      },
      {
        txHash: `dev-tx-${Date.now()}-3`,
        ledger: 1010,
        fromAddress: carol.stellarAddress,
        toAddress: alice.stellarAddress,
        amountStroops: BigInt(200_000_000),
      },
    ],
    skipDuplicates: true,
  });

  const tips = await prisma.tip.findMany();
  const totalForAlice = tips
    .filter((t) => t.toAddress === alice.stellarAddress)
    .reduce((sum, t) => sum + Number(t.amountStroops), 0);
  const totalForBob = tips
    .filter((t) => t.toAddress === bob.stellarAddress)
    .reduce((sum, t) => sum + Number(t.amountStroops), 0);

  const now = new Date();
  await prisma.leaderboardSnapshot.createMany({
    data: [
      {
        period: 'ALL_TIME',
        rank: 1,
        userId: alice.id,
        totalTips: BigInt(totalForAlice),
        createdAt: now,
      },
      {
        period: 'ALL_TIME',
        rank: 2,
        userId: bob.id,
        totalTips: BigInt(totalForBob),
        createdAt: now,
      },
    ],
    skipDuplicates: true,
  });

  console.log('Seed complete.');
}

main()
  .catch((e) => {
    console.error('Seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
