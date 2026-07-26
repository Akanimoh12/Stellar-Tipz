import { Request, Response, NextFunction } from "express";
import { z } from "zod";
import { BadRequestError } from "../../common/errors/AppError.js";
import { listDeliveries, getDelivery } from "./webhooks.service.js";
import { deliveryQuerySchema, deliveryIdParamSchema } from "./webhooks.schema.js";

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
