import { describe, it, expect, vi, afterEach } from "vitest";
import request from "supertest";
import { createApp } from "../../app.js";
import { config } from "../../config/index.js";
import { BadRequestError, BadGatewayError, ServiceUnavailableError } from "../../common/errors/AppError.js";
import { buildGatewayUrl, isValidCid } from "./ipfs.utils.js";
import { validateImageFile, pinImageToIpfs, MAX_IMAGE_SIZE_BYTES } from "./ipfs.service.js";

const VALID_CID_V0 = "QmXoypizjW3WknFiJnKLwHCnL72vedxjQkDDP1mXWo6uco";
const VALID_CID_V1 = "bafybeicn72vedxjQkDDP1mXWo6uco72vedxjQkDDP1mXWo6uco72vedxj";

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

  describe("Image Upload Validation (#981)", () => {
    it("should accept valid image MIME types", () => {
      const validTypes = ["image/png", "image/jpeg", "image/gif", "image/webp", "image/svg+xml"];
      for (const mimetype of validTypes) {
        expect(() =>
          validateImageFile({
            mimetype,
            size: 1024,
            buffer: Buffer.from("fake-image-bytes"),
          })
        ).not.toThrow();
      }
    });

    it("should throw BadRequestError for missing or empty file", () => {
      expect(() => validateImageFile(undefined)).toThrow(BadRequestError);
      expect(() =>
        validateImageFile({
          mimetype: "image/png",
          size: 0,
          buffer: Buffer.alloc(0),
        })
      ).toThrow(BadRequestError);
    });

    it("should throw BadRequestError for unsupported file types", () => {
      expect(() =>
        validateImageFile({
          mimetype: "application/pdf",
          size: 1024,
          buffer: Buffer.from("pdf-bytes"),
        })
      ).toThrow(BadRequestError);

      expect(() =>
        validateImageFile({
          mimetype: "text/plain",
          size: 1024,
          buffer: Buffer.from("text-bytes"),
        })
      ).toThrow(BadRequestError);
    });

    it("should throw BadRequestError for files exceeding maximum size limit", () => {
      expect(() =>
        validateImageFile({
          mimetype: "image/png",
          size: MAX_IMAGE_SIZE_BYTES + 1,
          buffer: Buffer.alloc(MAX_IMAGE_SIZE_BYTES + 1),
        })
      ).toThrow(BadRequestError);
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
        const file = {
          mimetype: "image/png",
          size: 500,
          buffer: Buffer.from("sample-image-content"),
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
        const buffer = Buffer.from("test-fallback-data");
        const file = {
          mimetype: "image/jpeg",
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
        const file = {
          mimetype: "image/png",
          size: 100,
          buffer: Buffer.from("test-data"),
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
        const file = {
          mimetype: "image/png",
          size: 100,
          buffer: Buffer.from("test-prod-data"),
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
        const file = {
          mimetype: "image/png",
          size: 100,
          buffer: Buffer.from("test-net-err"),
        };

        await expect(pinImageToIpfs(file)).rejects.toThrow(ServiceUnavailableError);
      } finally {
        (config.ipfs as { apiUrl?: string }).apiUrl = originalApiUrl;
        (config.server as { nodeEnv: string }).nodeEnv = originalEnv;
      }
    });
  });

  describe("HTTP Routes Integration (#981, #983, #985)", () => {
    it("POST /api/v1/ipfs/upload should successfully process valid image file", async () => {
      const response = await request(app)
        .post("/api/v1/ipfs/upload")
        .attach("file", Buffer.from("fake-png-data"), {
          filename: "avatar.png",
          contentType: "image/png",
        });

      expect(response.status).toBe(201);
      expect(response.body.status).toBe("success");
      expect(response.body.data.cid).toBeDefined();
      expect(response.body.data.url).toContain(response.body.data.cid);
    });

    it("POST /api/v1/ipfs/upload should accept 'image' field name", async () => {
      const response = await request(app)
        .post("/api/v1/ipfs/upload")
        .attach("image", Buffer.from("fake-jpeg-data"), {
          filename: "profile.jpeg",
          contentType: "image/jpeg",
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
