import { z } from "zod";

/**
 * Regex matching standard IPFS Content Identifiers (CIDv0 and CIDv1).
 * CIDv0 starts with Qm (46 chars base58).
 * CIDv1 starts with bafy, bafk, etc. (typically 40 to 128 alphanumeric chars).
 */
export const cidRegex = /^(Qm[1-9A-HJ-NP-Za-km-z]{44}|bafy[a-z0-9]{55,}|bafk[a-z0-9]{55,}|[a-zA-Z0-9]{46,128})$/;

/**
 * Zod schema for validating IPFS CID parameters.
 */
export const cidParamSchema = z.object({
  cid: z
    .string({
      required_error: "CID parameter is required",
    })
    .trim()
    .min(1, "CID cannot be empty")
    .regex(cidRegex, "Invalid IPFS CID format"),
}).strict();

/**
 * Zod schema for gateway query parameters.
 */
export const gatewayQuerySchema = z.object({
  gateway: z.string().url("Invalid gateway URL format").optional(),
}).strict();

export type CidParamInput = z.infer<typeof cidParamSchema>;
export type GatewayQueryInput = z.infer<typeof gatewayQuerySchema>;
