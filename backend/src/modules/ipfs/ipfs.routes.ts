import { Router, type Request, type Response, type NextFunction } from "express";
import multer from "multer";
import { uploadImageController, getGatewayUrlController } from "./ipfs.controller.js";
import { MAX_IMAGE_SIZE_BYTES } from "./ipfs.service.js";

/**
 * Configure Multer in-memory storage with explicit limits (issue #077).
 * - fileSize: 5 MB (MAX_IMAGE_SIZE_BYTES) — documented, tight
 * - files: 1  — single image per request, disk-exhaustion guard (multer default is unlimited)
 * - fields: 10 — generous for form metadata but bounded
 * - file count enforced via fields([{maxCount:1}]) ; overall files limit is secondary guard
 * Oversized payloads surface as MulterError LIMIT_FILE_SIZE/COUNT and are mapped to 413 PAYLOAD_TOO_LARGE.
 */
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: MAX_IMAGE_SIZE_BYTES,
    files: 1,
    fields: 10,
    fieldSize: 1024 * 1024, // 1 MB field size to avoid large non-file fields
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
ipfsRouter.post("/upload", uploadImageMiddleware, uploadImageController);
ipfsRouter.post("/", uploadImageMiddleware, uploadImageController);

/**
 * Gateway URL builder endpoint.
 * Resolves a CID to a public gateway URL.
 */
ipfsRouter.get("/gateway/:cid", getGatewayUrlController);
ipfsRouter.get("/:cid", getGatewayUrlController);
