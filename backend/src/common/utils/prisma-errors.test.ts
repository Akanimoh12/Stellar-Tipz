import { describe, expect, it } from 'vitest';
import { Prisma } from '@prisma/client';
import {
  isPrismaError,
  isUniqueConstraintViolation,
  handleUniqueConstraintViolation,
  getUniqueConstraintFields,
} from './prisma-errors.js';
import { ConflictError } from '../errors/AppError.js';

describe('prisma-errors utilities', () => {
  describe('isPrismaError', () => {
    it('returns true for Prisma known request errors', () => {
      const error = new Prisma.PrismaClientKnownRequestError('Test error', {
        code: 'P2002',
        clientVersion: '5.0.0',
      });
      expect(isPrismaError(error)).toBe(true);
    });

    it('returns false for regular errors', () => {
      const error = new Error('Regular error');
      expect(isPrismaError(error)).toBe(false);
    });

    it('returns false for null/undefined', () => {
      expect(isPrismaError(null)).toBe(false);
      expect(isPrismaError(undefined)).toBe(false);
    });
  });

  describe('isUniqueConstraintViolation', () => {
    it('returns true for P2002 errors', () => {
      const error = new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
        code: 'P2002',
        clientVersion: '5.0.0',
        meta: { target: ['tipId'] },
      });
      expect(isUniqueConstraintViolation(error)).toBe(true);
    });

    it('returns false for other Prisma error codes', () => {
      const error = new Prisma.PrismaClientKnownRequestError('Record not found', {
        code: 'P2025',
        clientVersion: '5.0.0',
      });
      expect(isUniqueConstraintViolation(error)).toBe(false);
    });

    it('returns false for non-Prisma errors', () => {
      const error = new Error('Regular error');
      expect(isUniqueConstraintViolation(error)).toBe(false);
    });
  });

  describe('handleUniqueConstraintViolation', () => {
    it('throws ConflictError for P2002 errors with custom message', () => {
      const error = new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
        code: 'P2002',
        clientVersion: '5.0.0',
        meta: { target: ['tipId'] },
      });

      expect(() => {
        handleUniqueConstraintViolation(error, 'Custom conflict message');
      }).toThrow(ConflictError);

      try {
        handleUniqueConstraintViolation(error, 'Custom conflict message');
      } catch (err) {
        expect(err).toBeInstanceOf(ConflictError);
        expect((err as ConflictError).message).toBe('Custom conflict message');
        expect((err as ConflictError).statusCode).toBe(409);
        expect((err as ConflictError).code).toBe('CONFLICT');
      }
    });

    it('throws ConflictError for P2002 errors with default message', () => {
      const error = new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
        code: 'P2002',
        clientVersion: '5.0.0',
      });

      try {
        handleUniqueConstraintViolation(error);
      } catch (err) {
        expect(err).toBeInstanceOf(ConflictError);
        expect((err as ConflictError).message).toBe('A record with these values already exists');
      }
    });

    it('rethrows non-P2002 errors unchanged', () => {
      const error = new Error('Some other error');

      expect(() => {
        handleUniqueConstraintViolation(error, 'This should not be used');
      }).toThrow('Some other error');

      try {
        handleUniqueConstraintViolation(error);
      } catch (err) {
        expect(err).toBe(error);
        expect(err).not.toBeInstanceOf(ConflictError);
      }
    });

    it('rethrows other Prisma errors unchanged', () => {
      const error = new Prisma.PrismaClientKnownRequestError('Record not found', {
        code: 'P2025',
        clientVersion: '5.0.0',
      });

      expect(() => {
        handleUniqueConstraintViolation(error);
      }).toThrow('Record not found');

      try {
        handleUniqueConstraintViolation(error);
      } catch (err) {
        expect(err).toBe(error);
        expect(err).not.toBeInstanceOf(ConflictError);
      }
    });
  });

  describe('getUniqueConstraintFields', () => {
    it('extracts target fields from P2002 errors', () => {
      const error = new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
        code: 'P2002',
        clientVersion: '5.0.0',
        meta: { target: ['tipId'] },
      });

      const fields = getUniqueConstraintFields(error);
      expect(fields).toEqual(['tipId']);
    });

    it('extracts multiple target fields', () => {
      const error = new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
        code: 'P2002',
        clientVersion: '5.0.0',
        meta: { target: ['txHash', 'topic', 'ledger'] },
      });

      const fields = getUniqueConstraintFields(error);
      expect(fields).toEqual(['txHash', 'topic', 'ledger']);
    });

    it('returns undefined for non-P2002 errors', () => {
      const error = new Prisma.PrismaClientKnownRequestError('Record not found', {
        code: 'P2025',
        clientVersion: '5.0.0',
      });

      const fields = getUniqueConstraintFields(error);
      expect(fields).toBeUndefined();
    });

    it('returns undefined for non-Prisma errors', () => {
      const error = new Error('Regular error');
      const fields = getUniqueConstraintFields(error);
      expect(fields).toBeUndefined();
    });

    it('returns undefined when meta has no target', () => {
      const error = new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
        code: 'P2002',
        clientVersion: '5.0.0',
        meta: {},
      });

      const fields = getUniqueConstraintFields(error);
      expect(fields).toBeUndefined();
    });
  });
});
