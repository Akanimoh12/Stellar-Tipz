import { Router } from "express";
import { requireAuth } from "../auth/auth.middleware.js";
import {
  createApiKeyController,
  listApiKeysController,
  getApiKeyController,
  rotateApiKeyController,
  deleteApiKeyController,
} from "./apiKeys.controller.js";

export const apiKeysRouter = Router();

apiKeysRouter.use(requireAuth);

apiKeysRouter.post("/", createApiKeyController);
apiKeysRouter.get("/", listApiKeysController);
apiKeysRouter.get("/:id", getApiKeyController);
apiKeysRouter.post("/:id/rotate", rotateApiKeyController);
apiKeysRouter.delete("/:id", deleteApiKeyController);
