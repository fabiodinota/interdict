/**
 * Signing Keys Service
 *
 * Business logic for Ed25519 signing key rotation and registry.
 * Generates keypairs, manages active/retired status, and provides
 * public key material for verification tools.
 *
 * Security: Private key bytes are written to a file path (shared volume),
 * NEVER returned over the network or stored in the database.
 */

// ed25519 keypair generation via Node/Bun crypto
import { createHash, generateKeyPairSync } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { desc, eq } from "drizzle-orm";
import { signingKeys } from "../../db/schema/auth";
import type { AppDb, AppTx } from "../../shared/types";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SigningKeyInfo {
  id: string;
  key_id: string;
  public_key_hex: string;
  is_active: boolean;
  activated_at: string | null;
  retired_at: string | null;
  created_at: string;
}

export interface RotateResult {
  key_id: string;
  public_key_hex: string;
  private_key_written_to: string | null;
}

type SigningKeyRow = typeof signingKeys.$inferSelect;

// ---------------------------------------------------------------------------
// Serializer
// ---------------------------------------------------------------------------

function serializeKey(k: SigningKeyRow): SigningKeyInfo {
  return {
    id: k.id,
    key_id: k.keyId,
    public_key_hex: k.publicKeyHex,
    is_active: k.isActive,
    activated_at: k.activatedAt ? k.activatedAt.toISOString() : null,
    retired_at: k.retiredAt ? k.retiredAt.toISOString() : null,
    created_at: k.createdAt.toISOString(),
  };
}

// ---------------------------------------------------------------------------
// Service Factory
// ---------------------------------------------------------------------------

export interface SigningKeysService {
  listKeys(): Promise<SigningKeyInfo[]>;
  getActiveKey(): Promise<SigningKeyInfo | null>;
  getAllPublicKeys(): Promise<Record<string, string>>;
  rotateKey(outputPath?: string): Promise<RotateResult>;
  registerExistingKey(keyId: string, publicKeyHex: string): Promise<SigningKeyInfo>;
}

export function createSigningKeysService(db: AppDb): SigningKeysService {
  return {
    /**
     * List all signing keys ordered by creation date (newest first).
     */
    async listKeys(): Promise<SigningKeyInfo[]> {
      const rows = await db.select().from(signingKeys).orderBy(desc(signingKeys.createdAt));
      return rows.map(serializeKey);
    },

    /**
     * Get the currently active signing key, or null if none.
     */
    async getActiveKey(): Promise<SigningKeyInfo | null> {
      const [row] = await db.select().from(signingKeys).where(eq(signingKeys.isActive, true));
      return row ? serializeKey(row) : null;
    },

    /**
     * Get all public keys as a map of key_id -> public_key_hex.
     * Matches the interdict-verify HashMap<String, Vec<u8>> format.
     */
    async getAllPublicKeys(): Promise<Record<string, string>> {
      const rows = await db.select().from(signingKeys);
      const result: Record<string, string> = {};
      for (const row of rows) {
        result[row.keyId] = row.publicKeyHex;
      }
      return result;
    },

    /**
     * Rotate the signing key:
     * 1. Generate new Ed25519 keypair
     * 2. Retire all existing active keys
     * 3. Insert new key as active
     * 4. Write private key to outputPath (shared volume)
     *
     * NEVER returns private key material over the network.
     */
    async rotateKey(outputPath?: string): Promise<RotateResult> {
      // Generate Ed25519 keypair
      const { publicKey, privateKey } = generateKeyPairSync("ed25519", {
        publicKeyEncoding: { type: "spki", format: "der" },
        privateKeyEncoding: { type: "pkcs8", format: "der" },
      });

      // Extract raw 32-byte public key from DER/SPKI envelope
      // Ed25519 SPKI DER is 44 bytes: 12-byte header + 32-byte key
      const rawPublicKey = publicKey.subarray(publicKey.length - 32);
      const publicKeyHex = Buffer.from(rawPublicKey).toString("hex");

      // Compute key_id as SHA-256(pubkey)[:16] hex (matches LocalSigningProvider pattern)
      const hash = createHash("sha256").update(rawPublicKey).digest();
      const keyId = hash.subarray(0, 16).toString("hex");

      // Extract raw 32-byte private key from DER/PKCS8 envelope
      // Ed25519 PKCS8 DER is 48 bytes: 16-byte header + 32-byte key
      const rawPrivateKey = privateKey.subarray(privateKey.length - 32);

      const now = new Date();
      let privateKeyWrittenTo: string | null = null;

      await db.transaction(async (tx: AppTx) => {
        // Retire all currently active keys
        await tx
          .update(signingKeys)
          .set({ isActive: false, retiredAt: now })
          .where(eq(signingKeys.isActive, true));

        // Insert new key as active
        await tx.insert(signingKeys).values({
          keyId,
          publicKeyHex,
          isActive: true,
          activatedAt: now,
        });
      });

      // Write private key to shared volume path if configured
      if (outputPath) {
        try {
          mkdirSync(dirname(outputPath), { recursive: true });
          writeFileSync(outputPath, rawPrivateKey, { mode: 0o600 });
          privateKeyWrittenTo = outputPath;
        } catch (err: unknown) {
          const message = err instanceof Error ? err.message : String(err);
          console.error(`[signing-keys] Failed to write private key to ${outputPath}: ${message}`);
          // Key is still registered in DB; operator can manually extract
        }
      }

      return {
        key_id: keyId,
        public_key_hex: publicKeyHex,
        private_key_written_to: privateKeyWrittenTo,
      };
    },

    /**
     * Register an externally generated key (e.g., dev-mode ephemeral key).
     * Only stores public key material.
     */
    async registerExistingKey(keyId: string, publicKeyHex: string): Promise<SigningKeyInfo> {
      const now = new Date();

      const [row] = await db
        .insert(signingKeys)
        .values({
          keyId,
          publicKeyHex,
          isActive: true,
          activatedAt: now,
        })
        .onConflictDoNothing()
        .returning();

      // If key already exists (conflict), fetch it
      if (!row) {
        const [existing] = await db.select().from(signingKeys).where(eq(signingKeys.keyId, keyId));
        return serializeKey(existing);
      }

      return serializeKey(row);
    },
  };
}
