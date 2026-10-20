import request from 'supertest';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { createApp } from '../src/app.js';
import { prisma } from '../src/db/prisma.js';

vi.mock('../src/db/prisma.js', () => ({
  prisma: {
    user: {
      findUnique: vi.fn(),
    },
    tip: {
      create: vi.fn(),
      findUnique: vi.fn(),
      findMany: vi.fn(),
      count: vi.fn(),
    },
  },
}));

describe('Tips Flow', () => {
  const app = createApp();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  const fromAddress = 'GBRPYH6YCQ3Y7B7V76YZV6A6IS2T6AM27QJ2632CS67ME65OF55JBNX7';
  const toAddress = 'GD7R76WR4RHYR6N4P25K2Q2ZYZ22C3Y72P5Y7Z66YZV6A6IS2T6AM27Q';
  const txHash = '1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef';

  describe('POST /api/v1/tips', () => {
    it('creates a public tip and associates users if they exist', async () => {
      const mockSender = { id: 'sender_id', stellarAddress: fromAddress, username: 'sender', displayName: 'Sender', imageUrl: null };
      const mockRecipient = { id: 'recipient_id', stellarAddress: toAddress, username: 'recipient', displayName: 'Recipient', imageUrl: null };

      vi.mocked(prisma.user.findUnique)
        .mockResolvedValueOnce(mockSender as any)
        .mockResolvedValueOnce(mockRecipient as any);

      const mockTip = {
        id: 'tip_id_1',
        txHash,
        ledger: 100,
        fromAddress,
        toAddress,
        amountStroops: BigInt(5000000),
        networkFee: BigInt(100),
        tokenCode: 'XLM',
        isAnonymous: false,
        status: 'CONFIRMED',
        message: 'Hello',
        createdAt: new Date('2024-01-01T00:00:00Z'),
        senderId: 'sender_id',
        recipientId: 'recipient_id',
        sender: mockSender,
        recipient: mockRecipient,
      };

      vi.mocked(prisma.tip.create).mockResolvedValueOnce(mockTip as any);

      const res = await request(app)
        .post('/api/v1/tips')
        .send({
          txHash,
          ledger: 100,
          fromAddress,
          toAddress,
          amountStroops: '5000000',
          networkFee: '100',
          message: 'Hello',
          isAnonymous: false,
        });

      expect(res.status).toBe(201);
      expect(res.body).toHaveProperty('id', 'tip_id_1');
      expect(res.body.fromAddress).toBe(fromAddress);
      expect(res.body.senderId).toBe('sender_id');
      expect(res.body.sender).toHaveProperty('id', 'sender_id');
    });

    it('creates an anonymous tip and hides sender details in the response', async () => {
      const mockSender = { id: 'sender_id', stellarAddress: fromAddress, username: 'sender', displayName: 'Sender', imageUrl: null };
      const mockRecipient = { id: 'recipient_id', stellarAddress: toAddress, username: 'recipient', displayName: 'Recipient', imageUrl: null };

      vi.mocked(prisma.user.findUnique)
        .mockResolvedValueOnce(mockSender as any)
        .mockResolvedValueOnce(mockRecipient as any);

      const mockTip = {
        id: 'tip_id_2',
        txHash,
        ledger: 101,
        fromAddress,
        toAddress,
        amountStroops: BigInt(10000000),
        networkFee: BigInt(100),
        tokenCode: 'XLM',
        isAnonymous: true,
        status: 'CONFIRMED',
        message: 'Secret Tip',
        createdAt: new Date('2024-01-01T00:00:00Z'),
        senderId: 'sender_id',
        recipientId: 'recipient_id',
        sender: mockSender,
        recipient: mockRecipient,
      };

      vi.mocked(prisma.tip.create).mockResolvedValueOnce(mockTip as any);

      const res = await request(app)
        .post('/api/v1/tips')
        .send({
          txHash,
          ledger: 101,
          fromAddress,
          toAddress,
          amountStroops: '10000000',
          isAnonymous: true,
          message: 'Secret Tip',
        });

      expect(res.status).toBe(201);
      expect(res.body.isAnonymous).toBe(true);
      expect(res.body.fromAddress).toBeNull();
      expect(res.body.senderId).toBeNull();
      expect(res.body.sender).toBeNull();
      expect(res.body.recipient).toHaveProperty('id', 'recipient_id');
    });
  });

  describe('GET /api/v1/tips/:id', () => {
    it('returns public tip details', async () => {
      const mockTip = {
        id: 'tip_id_1',
        txHash,
        ledger: 100,
        fromAddress,
        toAddress,
        amountStroops: BigInt(5000000),
        networkFee: BigInt(100),
        tokenCode: 'XLM',
        isAnonymous: false,
        status: 'CONFIRMED',
        message: 'Hello',
        createdAt: new Date('2024-01-01T00:00:00Z'),
        senderId: 'sender_id',
        recipientId: 'recipient_id',
        sender: { id: 'sender_id', stellarAddress: fromAddress, username: 'sender', displayName: 'Alice', imageUrl: null },
        recipient: { id: 'recipient_id', stellarAddress: toAddress, username: 'recipient', displayName: 'Bob', imageUrl: null },
      };

      vi.mocked(prisma.tip.findUnique).mockResolvedValueOnce(mockTip as any);

      const res = await request(app).get('/api/v1/tips/tip_id_1');

      expect(res.status).toBe(200);
      expect(res.body.fromAddress).toBe(fromAddress);
      expect(res.body.sender).toHaveProperty('displayName', 'Alice');
    });

    it('redacts sender info for an anonymous tip', async () => {
      const mockTip = {
        id: 'tip_id_2',
        txHash,
        ledger: 101,
        fromAddress,
        toAddress,
        amountStroops: BigInt(10000000),
        networkFee: BigInt(100),
        tokenCode: 'XLM',
        isAnonymous: true,
        status: 'CONFIRMED',
        message: 'Secret Tip',
        createdAt: new Date('2024-01-01T00:00:00Z'),
        senderId: 'sender_id',
        recipientId: 'recipient_id',
        sender: { id: 'sender_id', stellarAddress: fromAddress, username: 'sender', displayName: 'Alice', imageUrl: null },
        recipient: { id: 'recipient_id', stellarAddress: toAddress, username: 'recipient', displayName: 'Bob', imageUrl: null },
      };

      vi.mocked(prisma.tip.findUnique).mockResolvedValueOnce(mockTip as any);

      const res = await request(app).get('/api/v1/tips/tip_id_2');

      expect(res.status).toBe(200);
      expect(res.body.fromAddress).toBeNull();
      expect(res.body.senderId).toBeNull();
      expect(res.body.sender).toBeNull();
    });
  });
});
