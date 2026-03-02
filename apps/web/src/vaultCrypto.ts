// vaultCrypto.ts - E2EE helpers for the frontend

export async function deriveKey(passphrase: string, salt: Uint8Array, iterations: number = 100000): Promise<CryptoKey> {
  const encoder = new TextEncoder();
  const baseKey = await crypto.subtle.importKey(
    'raw',
    encoder.encode(passphrase),
    'PBKDF2',
    false,
    ['deriveKey']
  );

  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt,
      iterations,
      hash: 'SHA-256'
    },
    baseKey,
    { name: 'AES-GCM', length: 256 },
    true,
    ['encrypt', 'decrypt', 'wrapKey', 'unwrapKey']
  );
}

export async function encryptField(key: CryptoKey, plaintext: string): Promise<{ ciphertext: string, iv: string }> {
  const encoder = new TextEncoder();
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    encoder.encode(plaintext)
  );

  return {
    ciphertext: btoa(String.fromCharCode(...new Uint8Array(ciphertext))),
    iv: btoa(String.fromCharCode(...iv))
  };
}

export async function decryptField(key: CryptoKey, ciphertext: string, iv: string): Promise<string> {
  const decoder = new TextDecoder();
  const data = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: Uint8Array.from(atob(iv), c => c.charCodeAt(0)) },
    key,
    Uint8Array.from(atob(ciphertext), c => c.charCodeAt(0))
  );

  return decoder.decode(data);
}

export async function generateDEK(): Promise<CryptoKey> {
  return crypto.subtle.generateKey(
    { name: 'AES-GCM', length: 256 },
    true,
    ['encrypt', 'decrypt']
  );
}

export async function wrapDEK(dek: CryptoKey, kek: CryptoKey): Promise<string> {
  const wrapped = await crypto.subtle.wrapKey(
    'raw',
    dek,
    kek,
    'AES-GCM'
  );
  return btoa(String.fromCharCode(...new Uint8Array(wrapped)));
}

export async function unwrapDEK(wrappedDek: string, kek: CryptoKey): Promise<CryptoKey> {
  const data = Uint8Array.from(atob(wrappedDek), c => c.charCodeAt(0));
  return crypto.subtle.unwrapKey(
    'raw',
    data,
    kek,
    'AES-GCM',
    { name: 'AES-GCM', length: 256 },
    true,
    ['encrypt', 'decrypt']
  );
}
