import { randomBytes, createHash } from "crypto";
import { prisma } from "../../db/prisma.js";
import { logger } from "../../common/utils/logger.js";
import {
  UnauthorizedError,
  ForbiddenError,
  NotFoundError,
} from "../../common/errors/AppError.js";
import type {
  ApiKeyResponse,
  CreateApiKeyResponse,
  RotateApiKeyResponse,
} from "./apiKeys.types.js";
import type { CreateApiKeyInput, RotateApiKeyInput } from "./apiKeys.schema.js";

function hashApiKeySecret(secret: string): string {
  return createHash("sha256").update(secret).digest("hex");
}

function generateApiKeySecret(): string {
  return randomBytes(32).toString("hex");
}

type ApiKeyRow = {
  id: string;
  scopes: string[];
  expiresAt?: Date | null;
  lastUsedAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

export { hashApiKeySecret };

export async function createApiKey(
  userId: string,
  input: CreateApiKeyInput,
): Promise<CreateApiKeyResponse> {
  logger.info({ userId, scopes: input.scopes }, "Creating API key");

  const secret = generateApiKeySecret();
  const hashedKey = hashApiKeySecret(secret);

  const expiresAt = input.expiresAt ? new Date(input.expiresAt) : undefined;

  const apiKey = await prisma.apiKey.create({
    data: {
      hashedKey,
      scopes: input.scopes,
      expiresAt,
      createdById: userId,
    },
  });

  logger.info({ apiKeyId: apiKey.id, userId }, "API key created");

  return {
    id: apiKey.id,
    scopes: apiKey.scopes,
    expiresAt: apiKey.expiresAt?.toISOString(),
    lastUsedAt: apiKey.lastUsedAt?.toISOString(),
    createdAt: apiKey.createdAt.toISOString(),
    updatedAt: apiKey.updatedAt.toISOString(),
    secret,
  };
}

export async function listApiKeys(userId: string): Promise<ApiKeyResponse[]> {
  logger.info({ userId }, "Listing API keys");

  const apiKeys = await prisma.apiKey.findMany({
    where: { createdById: userId, deletedAt: null },
    orderBy: { createdAt: "desc" },
  });

  return apiKeys.map((key: ApiKeyRow) => ({
    id: key.id,
    scopes: key.scopes,
    expiresAt: key.expiresAt?.toISOString(),
    lastUsedAt: key.lastUsedAt?.toISOString(),
    createdAt: key.createdAt.toISOString(),
    updatedAt: key.updatedAt.toISOString(),
  }));
}

export async function getApiKeyById(
  userId: string,
  id: string,
): Promise<ApiKeyResponse> {
  const apiKey = await prisma.apiKey.findUnique({ where: { id } });

  if (!apiKey || apiKey.deletedAt) {
    throw new NotFoundError("API key not found");
  }

  if (apiKey.createdById !== userId) {
    throw new ForbiddenError("You can only access your own API keys");
  }

  return {
    id: apiKey.id,
    scopes: apiKey.scopes,
    expiresAt: apiKey.expiresAt?.toISOString(),
    lastUsedAt: apiKey.lastUsedAt?.toISOString(),
    createdAt: apiKey.createdAt.toISOString(),
    updatedAt: apiKey.updatedAt.toISOString(),
  };
}

export async function rotateApiKey(
  userId: string,
  id: string,
  input: RotateApiKeyInput,
): Promise<RotateApiKeyResponse> {
  logger.info({ userId, apiKeyId: id }, "Rotating API key");

  const existing = await prisma.apiKey.findUnique({ where: { id } });

  if (!existing || existing.deletedAt) {
    throw new NotFoundError("API key not found");
  }

  if (existing.createdById !== userId) {
    throw new ForbiddenError("You can only rotate your own API keys");
  }

  const gracePeriodMinutes = input.gracePeriodMinutes ?? 60;
  const graceExpiresAt = new Date(
    Date.now() + gracePeriodMinutes * 60 * 1000,
  );

  const newSecret = generateApiKeySecret();
  const newHashedKey = hashApiKeySecret(newSecret);

  const rotated = await prisma.apiKey.update({
    where: { id },
    data: {
      hashedKey: newHashedKey,
      previousHashedKey: existing.hashedKey,
      previousGraceExpiresAt: graceExpiresAt,
    },
  });

  logger.info(
    { apiKeyId: id, userId, graceExpiresAt },
    "API key rotated",
  );

  return {
    id: rotated.id,
    scopes: rotated.scopes,
    secret: newSecret,
    graceExpiresAt: graceExpiresAt.toISOString(),
    createdAt: rotated.createdAt.toISOString(),
  };
}

export async function deleteApiKey(userId: string, id: string): Promise<void> {
  const existing = await prisma.apiKey.findUnique({ where: { id } });

  if (!existing || existing.deletedAt) {
    throw new NotFoundError("API key not found");
  }

  if (existing.createdById !== userId) {
    throw new ForbiddenError("You can only delete your own API keys");
  }

  await prisma.apiKey.update({
    where: { id },
    data: { deletedAt: new Date() },
  });

  logger.info({ apiKeyId: id, userId }, "API key deleted");
}

export async function verifyApiKey(secret: string): Promise<ApiKeyResponse> {
  const hashedSecret = hashApiKeySecret(secret);
  const now = new Date();

  let apiKey = await prisma.apiKey.findFirst({
    where: {
      hashedKey: hashedSecret,
      deletedAt: null,
      OR: [
        { expiresAt: null },
        { expiresAt: { gt: now } },
      ],
    },
    orderBy: { createdAt: "desc" },
  });

  if (!apiKey) {
    apiKey = await prisma.apiKey.findFirst({
      where: {
        previousHashedKey: hashedSecret,
        previousGraceExpiresAt: { gt: now },
        deletedAt: null,
        OR: [
          { expiresAt: null },
          { expiresAt: { gt: now } },
        ],
      },
      orderBy: { createdAt: "desc" },
    });
  }

  if (!apiKey) {
    throw new UnauthorizedError("Invalid API key");
  }

  await prisma.apiKey.update({
    where: { id: apiKey.id },
    data: { lastUsedAt: now },
  });

  return {
    id: apiKey.id,
    scopes: apiKey.scopes,
    expiresAt: apiKey.expiresAt?.toISOString(),
    lastUsedAt: now.toISOString(),
    createdAt: apiKey.createdAt.toISOString(),
    updatedAt: apiKey.updatedAt.toISOString(),
  };
}
