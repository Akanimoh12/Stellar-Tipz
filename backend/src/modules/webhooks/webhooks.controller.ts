import { Request, Response, NextFunction } from "express";
import { z } from "zod";
import { BadRequestError } from "../../common/errors/AppError.js";
import type { AuthPayload } from "../auth/auth.types.js";
import {
  listDeliveries,
  getDelivery,
  createSubscription,
  listSubscriptions,
  deleteSubscription,
} from "./webhooks.service.js";
import {
  deliveryQuerySchema,
  deliveryIdParamSchema,
  createWebhookSubscriptionSchema,
  listWebhookSubscriptionsQuerySchema,
  webhookSubscriptionIdParamSchema,
} from "./webhooks.schema.js";

/** POST /webhooks/subscriptions — registers a new webhook subscription. */
export async function createSubscriptionController(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const auth = req.auth as AuthPayload;
    const data = createWebhookSubscriptionSchema.parse(req.body);
    const result = await createSubscription(auth.userId, data);
    res.status(201).json({ data: result });
  } catch (error) {
    if (error instanceof z.ZodError) {
      next(new BadRequestError("Invalid webhook subscription data", error.issues));
    } else {
      next(error);
    }
  }
}

/** GET /webhooks/subscriptions — lists the authenticated user's webhook subscriptions. */
export async function listSubscriptionsController(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const auth = req.auth as AuthPayload;
    const query = listWebhookSubscriptionsQuerySchema.parse(req.query);
    const result = await listSubscriptions(auth.userId, query.page, query.limit);
    res.json({ data: result });
  } catch (error) {
    if (error instanceof z.ZodError) {
      next(new BadRequestError("Invalid query parameters", error.issues));
    } else {
      next(error);
    }
  }
}

/** DELETE /webhooks/subscriptions/:id — removes a webhook subscription (owner only). */
export async function deleteSubscriptionController(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const auth = req.auth as AuthPayload;
    const { id } = webhookSubscriptionIdParamSchema.parse(req.params);
    await deleteSubscription(auth.userId, id);
    res.status(204).send();
  } catch (error) {
    if (error instanceof z.ZodError) {
      next(new BadRequestError("Invalid webhook subscription ID", error.issues));
    } else {
      next(error);
    }
  }
}

export async function listDeliveriesController(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const query = deliveryQuerySchema.parse(req.query);
    const result = await listDeliveries(
      query.page,
      query.limit,
      query.subscriptionId,
      query.status,
    );
    res.json({ data: result });
  } catch (error) {
    if (error instanceof z.ZodError) {
      next(new BadRequestError("Invalid query parameters", error.issues));
    } else {
      next(error);
    }
  }
}

export async function getDeliveryController(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const { id } = deliveryIdParamSchema.parse(req.params);
    const result = await getDelivery(id);
    res.json({ data: result });
  } catch (error) {
    if (error instanceof z.ZodError) {
      next(new BadRequestError("Invalid delivery ID", error.issues));
    } else {
      next(error);
    }
  }
}
