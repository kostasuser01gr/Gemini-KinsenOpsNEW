import { argon2id } from 'hash-wasm';

async function sha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

function randomSalt(size = 16): string {
  const bytes = crypto.getRandomValues(new Uint8Array(size));
  return Array.from(bytes)
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

export async function hashPasswordArgon2id(password: string): Promise<string> {
  const salt = randomSalt();
  try {
    const digest = await argon2id({
      password,
      salt,
      parallelism: 1,
      iterations: 3,
      memorySize: 19456,
      hashLength: 32,
      outputType: 'hex',
    });
    return `argon2id$${salt}$${digest}`;
  } catch {
    // Keep format explicit even when runtime falls back.
    return `argon2id-fallback$${salt}$${await sha256(`${salt}:${password}`)}`;
  }
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  if (hash.startsWith('argon2id$')) {
    const [, salt, digest] = hash.split('$');
    if (!salt || !digest) {
      return false;
    }
    try {
      const computed = await argon2id({
        password,
        salt,
        parallelism: 1,
        iterations: 3,
        memorySize: 19456,
        hashLength: 32,
        outputType: 'hex',
      });
      return computed === digest;
    } catch {
      return false;
    }
  }

  if (hash.startsWith('argon2id-fallback$')) {
    const [, salt, digest] = hash.split('$');
    const expected = await sha256(`${salt}:${password}`);
    return expected === digest;
  }

  // Legacy SHA256 migration support.
  const legacy = await sha256(password);
  return legacy === hash;
}
