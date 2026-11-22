import { Request, Response, NextFunction } from "express";
import { z } from "zod";
import { BadRequestError } from "../../common/errors/AppError.js";
import type { AuthPayload } from "../auth/auth.types.js";
import {
  createApiKey,
  listApiKeys,
  getApiKeyById,
  rotateApiKey,
  deleteApiKey,
} from "./apiKeys.service.js";
import {
  createApiKeySchema,
  rotateApiKeySchema,
  apiKeyIdParamSchema,
} from "./apiKeys.schema.js";

export async function createApiKeyController(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const auth = req.auth as AuthPayload;
    const data = createApiKeySchema.parse(req.body);
    const result = await createApiKey(auth.userId, data);
    res.status(201).json({ data: result });
  } catch (error) {
    if (error instanceof z.ZodError) {
      next(new BadRequestError("Invalid API key data", error.issues));
    } else {
      next(error);
    }
  }
}

export async function listApiKeysController(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const auth = req.auth as AuthPayload;
    const result = await listApiKeys(auth.userId);
    res.json({ data: result });
  } catch (error) {
    next(error);
  }
}

export async function getApiKeyController(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const auth = req.auth as AuthPayload;
    const { id } = apiKeyIdParamSchema.parse(req.params);
    const result = await getApiKeyById(auth.userId, id);
    res.json({ data: result });
  } catch (error) {
    if (error instanceof z.ZodError) {
      next(new BadRequestError("Invalid API key ID", error.issues));
    } else {
      next(error);
    }
  }
}

export async function rotateApiKeyController(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const auth = req.auth as AuthPayload;
    const { id } = apiKeyIdParamSchema.parse(req.params);
    const data = rotateApiKeySchema.parse(req.body);
    const result = await rotateApiKey(auth.userId, id, data);
    res.json({ data: result });
  } catch (error) {
    if (error instanceof z.ZodError) {
      next(new BadRequestError("Invalid rotation data", error.issues));
    } else {
      next(error);
    }
  }
}

export async function deleteApiKeyController(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const auth = req.auth as AuthPayload;
    const { id } = apiKeyIdParamSchema.parse(req.params);
    await deleteApiKey(auth.userId, id);
    res.status(204).send();
  } catch (error) {
    if (error instanceof z.ZodError) {
      next(new BadRequestError("Invalid API key ID", error.issues));
    } else {
      next(error);
    }
  }
}
