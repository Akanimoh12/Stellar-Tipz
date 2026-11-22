import { PrismaClient } from '@prisma/client';
import { createHash } from 'node:crypto';
import { Keypair } from '@stellar/stellar-sdk';

const prisma = new PrismaClient();

// Stable, valid Stellar addresses for local sample accounts. These keys are
// derived only for the development seed and must never be used on public nets.
function sampleAddress(name: string): string {
  const seed = createHash('sha256').update(`stellar-tipz-local-seed:${name}`).digest();
  return Keypair.fromRawEd25519Seed(seed).publicKey();
}

async function main() {
  console.log('Seeding database...');

  const aliceAddress = sampleAddress('alice');
  const bobAddress = sampleAddress('bob');
  const carolAddress = sampleAddress('carol');
  const sampleTime = new Date('2026-09-01T12:00:00.000Z');

  const alice = await prisma.user.upsert({
    where: { stellarAddress: aliceAddress },
    update: {},
    create: {
      stellarAddress: aliceAddress,
      username: 'alice_dev',
      displayName: 'Alice Creator',
      bio: 'A sample creator profile for local development.',
    },
  });

  const bob = await prisma.user.upsert({
    where: { stellarAddress: bobAddress },
    update: {},
    create: {
      stellarAddress: bobAddress,
      username: 'bob_dev',
      displayName: 'Bob Builds',
      bio: 'Sharing projects and thanking supporters.',
    },
  });

  const carol = await prisma.user.upsert({
    where: { stellarAddress: carolAddress },
    update: {},
    create: {
      stellarAddress: carolAddress,
      username: 'carol_dev',
      displayName: 'Carol Design',
      bio: 'Design notes and community updates.',
    },
  });

  await prisma.tip.createMany({
    data: [
      {
        txHash: 'local-seed-tip-alice-bob-1',
        ledger: 1000,
        fromAddress: alice.stellarAddress,
        toAddress: bob.stellarAddress,
        senderId: alice.id,
        recipientId: bob.id,
        amountStroops: BigInt(100_000_000),
        message: 'Great content!',
        status: 'CONFIRMED',
        createdAt: sampleTime,
      },
      {
        txHash: 'local-seed-tip-bob-alice-1',
        ledger: 1005,
        fromAddress: bob.stellarAddress,
        toAddress: alice.stellarAddress,
        senderId: bob.id,
        recipientId: alice.id,
        amountStroops: BigInt(50_000_000),
        message: 'Thanks for the tip!',
        status: 'CONFIRMED',
        createdAt: sampleTime,
      },
      {
        txHash: 'local-seed-tip-carol-alice-1',
        ledger: 1010,
        fromAddress: carol.stellarAddress,
        toAddress: alice.stellarAddress,
        senderId: carol.id,
        recipientId: alice.id,
        amountStroops: BigInt(200_000_000),
        message: 'A small thank-you',
        status: 'CONFIRMED',
        createdAt: sampleTime,
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

  await prisma.leaderboardSnapshot.createMany({
    data: [
      {
        id: 'local-seed-leaderboard-alice',
        period: 'ALL_TIME',
        rank: 1,
        userId: alice.id,
        totalTips: BigInt(totalForAlice),
        createdAt: sampleTime,
      },
      {
        id: 'local-seed-leaderboard-bob',
        period: 'ALL_TIME',
        rank: 2,
        userId: bob.id,
        totalTips: BigInt(totalForBob),
        createdAt: sampleTime,
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
