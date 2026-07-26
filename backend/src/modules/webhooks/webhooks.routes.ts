import { Router } from "express";
import { requireAuth } from "../auth/auth.middleware.js";
import {
  listDeliveriesController,
  getDeliveryController,
} from "./webhooks.controller.js";

export const webhooksRouter = Router();

webhooksRouter.get("/deliveries", requireAuth, listDeliveriesController);
webhooksRouter.get("/deliveries/:id", requireAuth, getDeliveryController);
