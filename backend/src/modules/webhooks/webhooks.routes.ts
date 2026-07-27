import { Router } from "express";
import { requireAuth } from "../auth/auth.middleware.js";
import {
  listDeliveriesController,
  getDeliveryController,
  createSubscriptionController,
  listSubscriptionsController,
  deleteSubscriptionController,
} from "./webhooks.controller.js";

export const webhooksRouter = Router();

webhooksRouter.post("/subscriptions", requireAuth, createSubscriptionController);
webhooksRouter.get("/subscriptions", requireAuth, listSubscriptionsController);
webhooksRouter.delete("/subscriptions/:id", requireAuth, deleteSubscriptionController);

webhooksRouter.get("/deliveries", requireAuth, listDeliveriesController);
webhooksRouter.get("/deliveries/:id", requireAuth, getDeliveryController);
