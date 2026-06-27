import { Keypair, StrKey } from "@stellar/stellar-sdk";
import { BadRequestError } from "../../common/errors/AppError.js";
import { z } from "zod";

/**
 * Schema for signature verification inputs.
 */
export const signatureVerificationSchema = z.object({
  publicKey: z.string().min(1, "Public key is required"),
  message: z.string().min(1, "Message is required"),
  signature: z.string().min(1, "Signature is required"),
});

export type SignatureVerificationInput = z.infer<
  typeof signatureVerificationSchema
>;

/**
 * Verifies an ed25519 signature against a message and Stellar public key.
 *
 * @param publicKey - Stellar public key (G... address)
 * @param message - The message that was signed (typically a challenge string)
 * @param signature - The signature in hex format
 * @returns true if the signature is valid
 * @throws BadRequestError if inputs are invalid or signature verification fails
 */
export function verifyEd25519Signature(
  publicKey: string,
  message: string,
  signature: string,
): boolean {
  // Validate inputs with Zod
  const validation = signatureVerificationSchema.safeParse({
    publicKey,
    message,
    signature,
  });

  if (!validation.success) {
    throw new BadRequestError(
      "Invalid signature verification inputs",
      validation.error.issues,
    );
  }

  // Validate Stellar address format
  if (!StrKey.isValidEd25519PublicKey(publicKey)) {
    throw new BadRequestError("Invalid Stellar public key format");
  }

  try {
    // Decode the Stellar address to get raw public key bytes
    const rawPublicKey = StrKey.decodeEd25519PublicKey(publicKey);

    // Convert signature from hex to Buffer
    const signatureBuffer = Buffer.from(signature, "hex");

    if (signatureBuffer.length !== 64) {
      throw new BadRequestError("Invalid signature length (expected 64 bytes)");
    }

    // Convert message to Buffer
    const messageBuffer = Buffer.from(message, "utf-8");

    // Create a keypair from the public key for verification
    const keypair = Keypair.fromPublicKey(
      Buffer.from(rawPublicKey).toString("base64"),
    );

    // Verify the signature
    return keypair.verify(messageBuffer, signatureBuffer);
  } catch (error) {
    if (error instanceof BadRequestError) {
      throw error;
    }
    throw new BadRequestError(
      `Signature verification failed: ${(error as Error).message}`,
    );
  }
}
