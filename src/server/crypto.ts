/**
 * Criptografia do sistema — Web Crypto API (portátil: Node 18+, Vercel, Workers).
 *
 * - PII (telefone, CPF, e-mail, nome, observações) é cifrada em repouso com
 *   AES-256-GCM, chave em `LEAD_ENCRYPTION_KEY` (32 bytes).
 * - `callback_data` do Telegram é assinado com HMAC-SHA-256 para impedir que
 *   terceiros forjem cliques em botões do painel administrativo.
 */

const ENCODADOR = new TextEncoder();
const DECODIFICADOR = new TextDecoder();

/** Converte bytes em base64url sem padding (seguro para URL e callback_data). */
export function toBase64Url(bytes: Uint8Array): string {
  return bytesToBase64(bytes).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function fromBase64Url(value: string): Uint8Array {
  const base64 = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = base64 + "=".repeat((4 - (base64.length % 4)) % 4);
  return base64ToBytes(padded);
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

function base64ToBytes(value: string): Uint8Array {
  const binary = atob(value);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
  return out;
}

/** Cópia em ArrayBuffer — evita conflitos de tipagem entre runtimes. */
function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const out = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(out).set(bytes);
  return out;
}

function textoToBytes(value: string): Uint8Array {
  return ENCODADOR.encode(value);
}

function bytesParaTexto(bytes: Uint8Array): string {
  return DECODIFICADOR.decode(bytes);
}

/** Comparação em tempo constante (evita vazamento por temporização). */
export function timingSafeEqual(a: string, b: string): boolean {
  const left = textoToBytes(a);
  const right = textoToBytes(b);
  let diff = left.length ^ right.length;
  const max = Math.max(left.length, right.length);
  for (let i = 0; i < max; i++) {
    diff |= (left[i] ?? 0) ^ (right[i] ?? 0);
  }
  return diff === 0;
}

export async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", toArrayBuffer(textoToBytes(value)));
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function hexToBytes(hex: string): Uint8Array {
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) {
    out[i] = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}

/**
 * Interpreta a chave mestra aceitando base64, base64url ou 64 caracteres hex.
 * @throws quando a chave não tiver exatamente 32 bytes.
 */
export function parseMasterKey(raw: string): Uint8Array {
  const value = raw.trim();
  let bytes: Uint8Array;
  if (/^[0-9a-f]{64}$/i.test(value)) {
    bytes = hexToBytes(value);
  } else {
    try {
      bytes = base64ToBytes(value);
    } catch {
      bytes = new Uint8Array(0);
    }
  }
  if (bytes.length !== 32) {
    throw new Error("LEAD_ENCRYPTION_KEY inválida: gere 32 bytes com `openssl rand -base64 32`.");
  }
  return bytes;
}

async function importAesKey(raw: string): Promise<CryptoKey> {
  return crypto.subtle.importKey("raw", toArrayBuffer(parseMasterKey(raw)), "AES-GCM", false, [
    "encrypt",
    "decrypt",
  ]);
}

const PREFIXO_CIFRA = "v1.";

/** Cifra um objeto JSON em uma string `v1.<iv>.<ciphertext>` (authenticated). */
export async function encryptJson(key: string, value: unknown): Promise<string> {
  const aes = await importAesKey(key);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const plaintext = textoToBytes(JSON.stringify(value));
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: toArrayBuffer(iv), tagLength: 128 },
    aes,
    toArrayBuffer(plaintext),
  );
  return `${PREFIXO_CIFRA}${toBase64Url(iv)}.${toBase64Url(new Uint8Array(ciphertext))}`;
}

/** Decifra o envelope gerado por {@link encryptJson}. Retorna `null` em qualquer falha. */
export async function decryptJson<T>(key: string, token: string): Promise<T | null> {
  if (!token.startsWith(PREFIXO_CIFRA)) return null;
  const [ivPart, ctPart] = token.slice(PREFIXO_CIFRA.length).split(".");
  if (!ivPart || !ctPart) return null;

  try {
    const aes = await importAesKey(key);
    const plaintext = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: toArrayBuffer(fromBase64Url(ivPart)), tagLength: 128 },
      aes,
      toArrayBuffer(fromBase64Url(ctPart)),
    );
    return JSON.parse(bytesParaTexto(new Uint8Array(plaintext))) as T;
  } catch {
    return null;
  }
}

/** Assinatura HMAC-SHA-256 truncada, em base64url (cabe em callback_data). */
export async function hmacSignature(secret: string, payload: string, bytes = 12): Promise<string> {
  const chave = await crypto.subtle.importKey(
    "raw",
    toArrayBuffer(textoToBytes(secret)),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const assinatura = await crypto.subtle.sign("HMAC", chave, toArrayBuffer(textoToBytes(payload)));
  return toBase64Url(new Uint8Array(assinatura).subarray(0, bytes));
}

/** Verifica a assinatura em tempo constante. */
export async function verificarAssinatura(
  secret: string,
  payload: string,
  assinatura: string,
  bytes = 12,
): Promise<boolean> {
  const esperada = await hmacSignature(secret, payload, bytes);
  return timingSafeEqual(esperada, assinatura);
}

/** Identificador público curto e imprevisível (12 caracteres base64url). */
export function novoId(bytes = 9): string {
  return toBase64Url(crypto.getRandomValues(new Uint8Array(bytes)));
}

/** UUID v4 — usado como id público do lead. */
export function novoUuid(): string {
  return crypto.randomUUID();
}

/** Hash anonimizador de IP (LGPD: não guardamos o IP em claro). */
export async function hashIp(ip: string, salt: string): Promise<string> {
  return (await sha256Hex(`${salt}:${ip}`)).slice(0, 32);
}
