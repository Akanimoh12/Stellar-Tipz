import type { Request, Response, NextFunction } from "express";
import { BadRequestError } from "../../common/errors/AppError.js";
import { cidParamSchema } from "./ipfs.schema.js";
import { buildGatewayUrl } from "./ipfs.utils.js";
import { pinImageToIpfs } from "./ipfs.service.js";

/**
 * Controller for uploading and pinning an image file to IPFS.
 * Expects multipart/form-data with a file field named `image` or `file`.
 */
export async function uploadImageController(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const file = req.file;

    if (!file) {
      throw new BadRequestError(
        "No image file provided. Upload multipart form data with field name 'file' or 'image'."
      );
    }

    const result = await pinImageToIpfs({
      buffer: file.buffer,
      mimetype: file.mimetype,
      size: file.size,
      originalname: file.originalname,
    });

    res.status(201).json({
      status: "success",
      data: result,
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Controller for building and returning a public IPFS gateway URL for a CID.
 */
export async function getGatewayUrlController(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { cid } = cidParamSchema.parse(req.params);
    const customGateway = typeof req.query.gateway === "string" ? req.query.gateway : undefined;

    const url = buildGatewayUrl(cid, customGateway);

    res.json({
      status: "success",
      data: {
        cid,
        url,
      },
    });
  } catch (error) {
    next(error);
  }
}
