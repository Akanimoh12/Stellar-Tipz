import { describe, it, expect, vi, afterEach } from "vitest";
import request from "supertest";
import sharp from "sharp";
import { createApp } from "../../app.js";
import { config } from "../../config/index.js";
import { BadRequestError, BadGatewayError, ServiceUnavailableError } from "../../common/errors/AppError.js";
import { buildGatewayUrl, isValidCid } from "./ipfs.utils.js";
import {
  verifyAndSanitizeImage,
  pinImageToIpfs,
  MAX_IMAGE_SIZE_BYTES,
  MAX_IMAGE_DIMENSION_PX,
} from "./ipfs.service.js";

const VALID_CID_V0 = "QmXoypizjW3WknFiJnKLwHCnL72vedxjQkDDP1mXWo6uco";
const VALID_CID_V1 = "bafybeicn72vedxjQkDDP1mXWo6uco72vedxjQkDDP1mXWo6uco72vedxj";

const SVG_PAYLOAD = `<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>`;

async function makePng(width = 8, height = 8): Promise<Buffer> {
  return sharp({
    create: { width, height, channels: 3, background: { r: 10, g: 120, b: 200 } },
  })
    .png()
    .toBuffer();
}

async function makeJpegWithExif(): Promise<Buffer> {
  return sharp({
    create: { width: 8, height: 8, channels: 3, background: { r: 200, g: 50, b: 50 } },
  })
    .withMetadata({
      exif: {
        IFD0: { Copyright: "Jane Doe" },
        IFD3: { GPSLatitude: "40/1,26/1,4614/100", GPSLongitude: "79/1,58/1,5541/100" },
      },
    })
    .jpeg()
    .toBuffer();
}

describe("IPFS Module", () => {
  const app = createApp();

  describe("Gateway URL Builder Util (#983)", () => {
    it("should validate correct CIDv0 and CIDv1 formats", () => {
      expect(isValidCid(VALID_CID_V0)).toBe(true);
      expect(isValidCid(VALID_CID_V1)).toBe(true);
      expect(isValidCid("invalid-cid")).toBe(false);
      expect(isValidCid("")).toBe(false);
    });

    it("should build resolvable gateway URL from valid CID", () => {
      const url = buildGatewayUrl(VALID_CID_V0);
      expect(url).toBe(`https://ipfs.io/ipfs/${VALID_CID_V0}`);
    });

    it("should strip leading slashes and ipfs/ prefix from CID", () => {
      const url1 = buildGatewayUrl(`/${VALID_CID_V0}`);
      const url2 = buildGatewayUrl(`ipfs/${VALID_CID_V0}`);
      expect(url1).toBe(`https://ipfs.io/ipfs/${VALID_CID_V0}`);
      expect(url2).toBe(`https://ipfs.io/ipfs/${VALID_CID_V0}`);
    });

    it("should support custom gateway base URLs", () => {
      const customGateway = "https://gateway.pinata.cloud/ipfs/";
      const url = buildGatewayUrl(VALID_CID_V0, customGateway);
      expect(url).toBe(`https://gateway.pinata.cloud/ipfs/${VALID_CID_V0}`);
    });

    it("should normalize gateway base URLs missing trailing slash", () => {
      const customGateway = "https://gateway.pinata.cloud/ipfs";
      const url = buildGatewayUrl(VALID_CID_V0, customGateway);
      expect(url).toBe(`https://gateway.pinata.cloud/ipfs/${VALID_CID_V0}`);
    });

    it("should throw BadRequestError for invalid CID format", () => {
      expect(() => buildGatewayUrl("not-a-cid")).toThrow(BadRequestError);
      expect(() => buildGatewayUrl("")).toThrow(BadRequestError);
    });
  });

  describe("Image Upload Validation & Sanitization (#1232)", () => {
    it("should accept a valid image verified by its actual magic bytes", async () => {
      const buffer = await makePng();
      const result = await verifyAndSanitizeImage({ size: buffer.length, buffer });
      expect(result.format).toBe("png");
      expect(result.mimeType).toBe("image/png");
      expect(result.width).toBe(8);
      expect(result.height).toBe(8);
    });

    it("should throw BadRequestError for missing or empty file", async () => {
      await expect(verifyAndSanitizeImage(undefined)).rejects.toThrow(BadRequestError);
      await expect(
        verifyAndSanitizeImage({ size: 0, buffer: Buffer.alloc(0) })
      ).rejects.toThrow(BadRequestError);
    });

    it("should reject a file whose content-type/extension is spoofed (magic bytes don't match)", async () => {
      // A plain text/PDF-like buffer masquerading as a PNG via its declared
      // mimetype and filename — the client's claim is never trusted.
      const buffer = Buffer.from("%PDF-1.4 not actually an image");
      await expect(
        verifyAndSanitizeImage({ size: buffer.length, buffer })
      ).rejects.toThrow(BadRequestError);
    });

    it("should reject SVG files outright, even with a valid image mimetype claim", async () => {
      const buffer = Buffer.from(SVG_PAYLOAD);
      await expect(
        verifyAndSanitizeImage({ size: buffer.length, buffer })
      ).rejects.toThrow(BadRequestError);
    });

    it("should throw BadRequestError for files exceeding the maximum byte-size limit", async () => {
      const buffer = await makePng();
      await expect(
        verifyAndSanitizeImage({ size: MAX_IMAGE_SIZE_BYTES + 1, buffer })
      ).rejects.toThrow(BadRequestError);
    });

    it("should throw BadRequestError for images exceeding the maximum pixel dimensions", async () => {
      const buffer = await makePng(MAX_IMAGE_DIMENSION_PX + 1, 4);
      await expect(
        verifyAndSanitizeImage({ size: buffer.length, buffer })
      ).rejects.toThrow(BadRequestError);
    });

    it("should strip EXIF metadata, including GPS, from the sanitized output", async () => {
      const original = await makeJpegWithExif();
      const originalMeta = await sharp(original).metadata();
      expect(originalMeta.exif).toBeDefined();

      const result = await verifyAndSanitizeImage({ size: original.length, buffer: original });
      const sanitizedMeta = await sharp(result.buffer).metadata();
      expect(sanitizedMeta.exif).toBeUndefined();
    });
  });

  describe("IPFS Pinning Service & Error Handling Fallback (#981, #984)", () => {
    const originalFetch = globalThis.fetch;

    afterEach(() => {
      globalThis.fetch = originalFetch;
      vi.restoreAllMocks();
    });

    it("should successfully pin image when IPFS API returns valid hash", async () => {
      const mockCid = VALID_CID_V0;
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ Hash: mockCid }),
      } as unknown as globalThis.Response);

      const originalApiUrl = config.ipfs.apiUrl;
      (config.ipfs as { apiUrl?: string }).apiUrl = "http://localhost:5001";

      try {
        const buffer = await makePng();
        const file = {
          mimetype: "image/png",
          size: buffer.length,
          buffer,
          originalname: "test.png",
        };

        const result = await pinImageToIpfs(file);
        expect(result.cid).toBe(mockCid);
        expect(result.url).toBe(`https://ipfs.io/ipfs/${mockCid}`);
      } finally {
        (config.ipfs as { apiUrl?: string }).apiUrl = originalApiUrl;
      }
    });

    it("should generate deterministic fallback CID when IPFS_API_URL is unconfigured", async () => {
      const originalApiUrl = config.ipfs.apiUrl;
      (config.ipfs as { apiUrl?: string }).apiUrl = "";

      try {
        const buffer = await makePng();
        const file = {
          mimetype: "image/png",
          size: buffer.length,
          buffer,
        };

        const result = await pinImageToIpfs(file);
        expect(result.cid).toMatch(/^Qm/);
        expect(isValidCid(result.cid)).toBe(true);
        expect(result.url).toContain(result.cid);
      } finally {
        (config.ipfs as { apiUrl?: string }).apiUrl = originalApiUrl;
      }
    });

    it("should fall back gracefully in development/test when IPFS HTTP request returns error status", async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        statusText: "Internal Server Error",
        text: async () => "IPFS daemon error",
      } as unknown as globalThis.Response);

      const originalApiUrl = config.ipfs.apiUrl;
      (config.ipfs as { apiUrl?: string }).apiUrl = "http://localhost:5001";

      try {
        const buffer = await makePng();
        const file = {
          mimetype: "image/png",
          size: buffer.length,
          buffer,
        };

        const result = await pinImageToIpfs(file);
        expect(result.cid).toMatch(/^Qm/);
        expect(result.url).toContain(result.cid);
      } finally {
        (config.ipfs as { apiUrl?: string }).apiUrl = originalApiUrl;
      }
    });

    it("should throw BadGatewayError in production environment when IPFS pinning HTTP request fails", async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 502,
        statusText: "Bad Gateway",
        text: async () => "IPFS gateway error",
      } as unknown as globalThis.Response);

      const originalApiUrl = config.ipfs.apiUrl;
      const originalEnv = config.server.nodeEnv;

      (config.ipfs as { apiUrl?: string }).apiUrl = "http://localhost:5001";
      (config.server as { nodeEnv: string }).nodeEnv = "production";

      try {
        const buffer = await makePng();
        const file = {
          mimetype: "image/png",
          size: buffer.length,
          buffer,
        };

        await expect(pinImageToIpfs(file)).rejects.toThrow(BadGatewayError);
      } finally {
        (config.ipfs as { apiUrl?: string }).apiUrl = originalApiUrl;
        (config.server as { nodeEnv: string }).nodeEnv = originalEnv;
      }
    });

    it("should throw ServiceUnavailableError in production environment when network fetch fails completely", async () => {
      globalThis.fetch = vi.fn().mockRejectedValue(new Error("Network connection refused"));

      const originalApiUrl = config.ipfs.apiUrl;
      const originalEnv = config.server.nodeEnv;

      (config.ipfs as { apiUrl?: string }).apiUrl = "http://localhost:5001";
      (config.server as { nodeEnv: string }).nodeEnv = "production";

      try {
        const buffer = await makePng();
        const file = {
          mimetype: "image/png",
          size: buffer.length,
          buffer,
        };

        await expect(pinImageToIpfs(file)).rejects.toThrow(ServiceUnavailableError);
      } finally {
        (config.ipfs as { apiUrl?: string }).apiUrl = originalApiUrl;
        (config.server as { nodeEnv: string }).nodeEnv = originalEnv;
      }
    });
  });

  describe("HTTP Routes Integration (#981, #983, #985, #1232)", () => {
    it("POST /api/v1/ipfs/upload should successfully process valid image file", async () => {
      const buffer = await makePng();
      const response = await request(app)
        .post("/api/v1/ipfs/upload")
        .attach("file", buffer, {
          filename: "avatar.png",
          contentType: "image/png",
        });

      expect(response.status).toBe(201);
      expect(response.body.status).toBe("success");
      expect(response.body.data.cid).toBeDefined();
      expect(response.body.data.url).toContain(response.body.data.cid);
    });

    it("POST /api/v1/ipfs/upload should accept 'image' field name", async () => {
      const buffer = await makePng();
      const response = await request(app)
        .post("/api/v1/ipfs/upload")
        .attach("image", buffer, {
          filename: "profile.png",
          contentType: "image/png",
        });

      expect(response.status).toBe(201);
      expect(response.body.status).toBe("success");
      expect(response.body.data.cid).toBeDefined();
    });

    it("POST /api/v1/ipfs/upload should return 400 Bad Request when no file attached", async () => {
      const response = await request(app).post("/api/v1/ipfs/upload");

      expect(response.status).toBe(400);
      expect(response.body.error).toBeDefined();
    });

    it("POST /api/v1/ipfs/upload should return 400 Bad Request for unsupported file MIME type", async () => {
      const response = await request(app)
        .post("/api/v1/ipfs/upload")
        .attach("file", Buffer.from("document content"), {
          filename: "document.pdf",
          contentType: "application/pdf",
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toBeDefined();
    });

    it("POST /api/v1/ipfs/upload should return 400 Bad Request for a spoofed content-type (fake bytes claiming image/png)", async () => {
      const response = await request(app)
        .post("/api/v1/ipfs/upload")
        .attach("file", Buffer.from("this is not real image data"), {
          filename: "avatar.png",
          contentType: "image/png",
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toBeDefined();
    });

    it("POST /api/v1/ipfs/upload should return 400 Bad Request for SVG uploads", async () => {
      const response = await request(app)
        .post("/api/v1/ipfs/upload")
        .attach("file", Buffer.from(SVG_PAYLOAD), {
          filename: "logo.svg",
          contentType: "image/svg+xml",
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toBeDefined();
    });

    it("GET /api/v1/ipfs/gateway/:cid should return resolvable gateway URL for valid CID", async () => {
      const response = await request(app).get(`/api/v1/ipfs/gateway/${VALID_CID_V0}`);

      expect(response.status).toBe(200);
      expect(response.body.status).toBe("success");
      expect(response.body.data.cid).toBe(VALID_CID_V0);
      expect(response.body.data.url).toBe(`https://ipfs.io/ipfs/${VALID_CID_V0}`);
    });

    it("GET /api/v1/ipfs/gateway/:cid should return 400 Bad Request for invalid CID", async () => {
      const response = await request(app).get("/api/v1/ipfs/gateway/invalid-cid-format");

      expect(response.status).toBe(400);
      expect(response.body.error).toBeDefined();
    });
  });
});
