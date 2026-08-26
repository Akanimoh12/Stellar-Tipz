import { Router, type Request, type Response, type NextFunction } from "express";
import multer from "multer";
import { uploadImageController, getGatewayUrlController } from "./ipfs.controller.js";
import { MAX_IMAGE_SIZE_BYTES } from "./ipfs.service.js";
import { ipfsUploadRateLimiter } from '../../common/middleware/rateLimiter.js';

/**
 * Configure Multer in-memory storage with file size limits.
 */
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: MAX_IMAGE_SIZE_BYTES,
  },
});

type UploadedFile = {
  fieldname: string;
  originalname: string;
  encoding: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
};

/**
 * Custom wrapper middleware to support single file field named either 'file' or 'image'.
 */
function uploadImageMiddleware(req: Request, res: Response, next: NextFunction): void {
  const singleHandler = upload.fields([
    { name: "file", maxCount: 1 },
    { name: "image", maxCount: 1 },
  ]);

  singleHandler(req, res, (err) => {
    if (err) {
      return next(err);
    }
    // Standardize uploaded file to req.file
    if (req.files && typeof req.files === "object") {
      const filesObj = req.files as { [fieldname: string]: UploadedFile[] };
      const uploaded = (filesObj.file && filesObj.file[0]) || (filesObj.image && filesObj.image[0]);
      if (uploaded) {
        req.file = uploaded as Express.Multer.File;
      }
    }
    next();
  });
}

/**
 * IPFS module router.
 * Mounted at /api/v1/ipfs in app.ts
 */
export const ipfsRouter = Router();

/**
 * Image upload & pin endpoint.
 * Accepts multipart/form-data with field 'file' or 'image'.
 */
ipfsRouter.post("/upload", ipfsUploadRateLimiter, uploadImageMiddleware, uploadImageController);
ipfsRouter.post("/", ipfsUploadRateLimiter, uploadImageMiddleware, uploadImageController);

/**
 * Gateway URL builder endpoint.
 * Resolves a CID to a public gateway URL.
 */
ipfsRouter.get("/gateway/:cid", getGatewayUrlController);
ipfsRouter.get("/:cid", getGatewayUrlController);
