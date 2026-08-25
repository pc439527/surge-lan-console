import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createHmac,
  randomBytes,
  scrypt,
  timingSafeEqual,
} from "node:crypto";

const SCRYPT_N = 32_768;
const SCRYPT_R = 8;
const SCRYPT_P = 1;
const SCRYPT_MAXMEM = 64 * 1024 * 1024;
const PASSWORD_DOMAIN = "surge-lan-console:password-verifier:v1";
const VAULT_DOMAIN = "surge-lan-console:vault-kek:v1";

export interface PasswordRecord {
  version: 1;
  kdf: "scrypt";
  salt: string;
  verifier: string;
}

export interface VaultEnvelope {
  version: 1;
  algorithm: "aes-256-gcm";
  iv: string;
  authTag: string;
  ciphertext: string;
}

export interface EncryptedSecret {
  iv: string;
  authTag: string;
  ciphertext: string;
}

export interface PasswordMaterial {
  passwordRecord: PasswordRecord;
  vaultEnvelope: VaultEnvelope;
  vaultKey: Buffer;
}

function deriveMasterKey(password: string, salt: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(
      password,
      salt,
      32,
      { N: SCRYPT_N, r: SCRYPT_R, p: SCRYPT_P, maxmem: SCRYPT_MAXMEM },
      (error, derivedKey) => {
        if (error) reject(error);
        else resolve(Buffer.from(derivedKey));
      },
    );
  });
}

function domainKey(masterKey: Buffer, domain: string): Buffer {
  return createHmac("sha256", masterKey).update(domain).digest();
}

function passwordVerifier(masterKey: Buffer): Buffer {
  return domainKey(masterKey, PASSWORD_DOMAIN);
}

function vaultKek(masterKey: Buffer): Buffer {
  return domainKey(masterKey, VAULT_DOMAIN);
}

function encryptBytes(plaintext: Buffer, key: Buffer): EncryptedSecret {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return {
    iv: iv.toString("base64"),
    authTag: authTag.toString("base64"),
    ciphertext: ciphertext.toString("base64"),
  };
}

function decryptBytes(value: EncryptedSecret, key: Buffer): Buffer {
  const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(value.iv, "base64"));
  decipher.setAuthTag(Buffer.from(value.authTag, "base64"));
  return Buffer.concat([
    decipher.update(Buffer.from(value.ciphertext, "base64")),
    decipher.final(),
  ]);
}

export async function createPasswordMaterial(password: string): Promise<PasswordMaterial> {
  const salt = randomBytes(16);
  const masterKey = await deriveMasterKey(password, salt);
  const verifier = passwordVerifier(masterKey);
  const kek = vaultKek(masterKey);
  const vaultKey = randomBytes(32);
  const encryptedVaultKey = encryptBytes(vaultKey, kek);

  masterKey.fill(0);
  kek.fill(0);

  return {
    passwordRecord: {
      version: 1,
      kdf: "scrypt",
      salt: salt.toString("base64"),
      verifier: verifier.toString("base64"),
    },
    vaultEnvelope: {
      version: 1,
      algorithm: "aes-256-gcm",
      ...encryptedVaultKey,
    },
    vaultKey,
  };
}

export async function unlockVault(
  password: string,
  passwordRecord: PasswordRecord,
  vaultEnvelope: VaultEnvelope,
): Promise<Buffer | null> {
  if (passwordRecord.version !== 1 || passwordRecord.kdf !== "scrypt") return null;
  if (vaultEnvelope.version !== 1 || vaultEnvelope.algorithm !== "aes-256-gcm") return null;

  const masterKey = await deriveMasterKey(password, Buffer.from(passwordRecord.salt, "base64"));
  const actualVerifier = passwordVerifier(masterKey);
  const expectedVerifier = Buffer.from(passwordRecord.verifier, "base64");
  const matches =
    actualVerifier.length === expectedVerifier.length && timingSafeEqual(actualVerifier, expectedVerifier);

  if (!matches) {
    masterKey.fill(0);
    actualVerifier.fill(0);
    return null;
  }

  const kek = vaultKek(masterKey);
  try {
    return decryptBytes(vaultEnvelope, kek);
  } finally {
    masterKey.fill(0);
    actualVerifier.fill(0);
    kek.fill(0);
  }
}

export function encryptSecret(plaintext: string, vaultKey: Buffer): EncryptedSecret {
  return encryptBytes(Buffer.from(plaintext, "utf8"), vaultKey);
}

export function decryptSecret(value: EncryptedSecret, vaultKey: Buffer): string {
  return decryptBytes(value, vaultKey).toString("utf8");
}

export function hashSessionToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function newSessionToken(): string {
  return randomBytes(32).toString("base64url");
}
