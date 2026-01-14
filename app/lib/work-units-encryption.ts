/**
 * Work Units Encryption Utilities
 * Implements AES-256-GCM encryption and Shamir Secret Sharing for secure work units storage
 */

import crypto from 'crypto'
import bcrypt from 'bcryptjs'

// Lazy import for secrets.js-grempe to avoid build-time initialization issues
let secretsLib: typeof import('secrets.js-grempe') | null = null
function getSecretsLib() {
  if (!secretsLib) {
    secretsLib = require('secrets.js-grempe')
  }
  return secretsLib
}

// Constants
const MASTER_KEY_LENGTH = 32 // 256 bits for AES-256
const IV_LENGTH = 12 // 96 bits for GCM
const AUTH_TAG_LENGTH = 16 // 128 bits for GCM authentication tag
const CODE_LENGTH = 8 // 8-character random codes
const SALT_ROUNDS = 10 // For bcrypt hashing

/**
 * Get the master key from environment variable
 * CRITICAL: This key must be set and consistent across all deployments
 * The key persists across database resets to ensure all encrypted data can be decrypted
 * 
 * @throws Error if WORK_UNITS_MASTER_KEY is not set in environment
 */
export function getMasterKey(): Buffer {
  const masterKeyEnv = process.env.WORK_UNITS_MASTER_KEY
  
  if (!masterKeyEnv) {
    throw new Error(
      'CRITICAL: WORK_UNITS_MASTER_KEY environment variable is not set. ' +
      'This key is required for work unit encryption/decryption. ' +
      'Generate a 64-character hex string using: node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"'
    )
  }
  
  // Validate key format (should be 64 hex characters = 32 bytes)
  if (!/^[0-9a-fA-F]{64}$/.test(masterKeyEnv)) {
    throw new Error(
      'CRITICAL: WORK_UNITS_MASTER_KEY must be exactly 64 hexadecimal characters (256-bit key). ' +
      'Current length: ' + masterKeyEnv.length + ' characters. ' +
      'Generate a valid key using: node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"'
    )
  }
  
  return Buffer.from(masterKeyEnv, 'hex')
}

/**
 * Generate a random 32-byte master key for AES-256
 * @deprecated Use getMasterKey() instead to get the persistent key from environment
 */
export function generateMasterKey(): Buffer {
  return crypto.randomBytes(MASTER_KEY_LENGTH)
}

/**
 * Generate a random 8-character alphanumeric code
 */
export function generateRandomCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789' // Exclude confusing chars like 0, O, I, 1
  let code = ''
  for (let i = 0; i < CODE_LENGTH; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length))
  }
  return code
}

/**
 * Encrypt work units value using AES-256-GCM
 * Returns base64-encoded string: IV + AuthTag + EncryptedData
 */
export function encryptWorkUnits(workUnits: number, masterKey: Buffer): string {
  const iv = crypto.randomBytes(IV_LENGTH)
  const cipher = crypto.createCipheriv('aes-256-gcm', masterKey, iv)
  
  // Convert number to string and encrypt
  const plaintext = workUnits.toString()
  let encrypted = cipher.update(plaintext, 'utf8', 'base64')
  encrypted += cipher.final('base64')
  
  // Get authentication tag
  const authTag = cipher.getAuthTag()
  
  // Combine IV + AuthTag + EncryptedData
  const combined = Buffer.concat([
    iv,
    authTag,
    Buffer.from(encrypted, 'base64')
  ])
  
  return combined.toString('base64')
}

/**
 * Decrypt work units value using AES-256-GCM
 * Expects base64-encoded string: IV + AuthTag + EncryptedData
 */
export function decryptWorkUnits(encrypted: string, masterKey: Buffer): number {
  const combined = Buffer.from(encrypted, 'base64')
  
  // Extract components
  const iv = combined.subarray(0, IV_LENGTH)
  const authTag = combined.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH)
  const encryptedData = combined.subarray(IV_LENGTH + AUTH_TAG_LENGTH)
  
  // Decrypt
  const decipher = crypto.createDecipheriv('aes-256-gcm', masterKey, iv)
  decipher.setAuthTag(authTag)
  
  let decrypted = decipher.update(encryptedData, undefined, 'utf8')
  decrypted += decipher.final('utf8')
  
  // Convert back to number
  return parseInt(decrypted, 10)
}

/**
 * Split a secret using Shamir Secret Sharing (n-of-n scheme)
 * Returns array of shares as hex strings
 */
export function splitSecret(secret: Buffer, n: number): string[] {
  if (n < 2) {
    throw new Error('At least 2 shares required for Shamir Secret Sharing')
  }
  
  // Convert secret to hex
  const secretHex = secret.toString('hex')
  
  // Split into n shares (n-of-n scheme)
  const secrets = getSecretsLib()
  if (!secrets) {
    throw new Error('secrets.js-grempe library not available')
  }
  const shares = secrets.share(secretHex, n, n)
  
  return shares
}

/**
 * Combine shares to reconstruct the original secret
 * Returns the reconstructed secret as a Buffer
 */
export function combineShares(shares: string[]): Buffer {
  if (shares.length < 2) {
    throw new Error('At least 2 shares required to reconstruct secret')
  }
  
  // Combine shares
  const secrets = getSecretsLib()
  if (!secrets) {
    throw new Error('secrets.js-grempe library not available')
  }
  const secretHex = secrets.combine(shares)
  
  // Convert back to Buffer
  return Buffer.from(secretHex, 'hex')
}

/**
 * Encrypt a share with a reviewer's code
 * Uses AES-256-CBC for share encryption
 */
export function encryptShare(share: string, code: string): string {
  // Derive key from code using PBKDF2
  const salt = crypto.randomBytes(16)
  const key = crypto.pbkdf2Sync(code, salt, 100000, 32, 'sha256')
  
  // Encrypt share
  const iv = crypto.randomBytes(16) // 128 bits for CBC
  const cipher = crypto.createCipheriv('aes-256-cbc', key, iv)
  
  let encrypted = cipher.update(share, 'utf8', 'base64')
  encrypted += cipher.final('base64')
  
  // Combine salt + IV + encrypted data
  const combined = Buffer.concat([
    salt,
    iv,
    Buffer.from(encrypted, 'base64')
  ])
  
  return combined.toString('base64')
}

/**
 * Decrypt a share using reviewer's code
 */
export function decryptShare(encryptedShare: string, code: string): string {
  const combined = Buffer.from(encryptedShare, 'base64')
  
  // Extract components
  const salt = combined.subarray(0, 16)
  const iv = combined.subarray(16, 32)
  const encryptedData = combined.subarray(32)
  
  // Derive key from code
  const key = crypto.pbkdf2Sync(code, salt, 100000, 32, 'sha256')
  
  // Decrypt
  const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv)
  
  let decrypted = decipher.update(encryptedData, undefined, 'utf8')
  decrypted += decipher.final('utf8')
  
  return decrypted
}

/**
 * Hash a code using bcrypt for storage
 */
export async function hashCode(code: string): Promise<string> {
  return bcrypt.hash(code, SALT_ROUNDS)
}

/**
 * Verify a code against a hash
 */
export async function verifyCode(code: string, hash: string): Promise<boolean> {
  return bcrypt.compare(code, hash)
}

/**
 * Generate a session token for decryption sessions
 */
export function generateSessionToken(): string {
  return crypto.randomBytes(32).toString('hex')
}
