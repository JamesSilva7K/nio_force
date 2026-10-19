// @vitest-environment node
import { describe, expect, it } from "vitest";

import {
  decryptJson,
  encryptJson,
  hmacSignature,
  parseMasterKey,
  timingSafeEqual,
  toBase64Url,
  verificarAssinatura,
} from "@/server/crypto";

const CHAVE = toBase64Url(new Uint8Array(32).fill(7));
const OUTRA_CHAVE = toBase64Url(new Uint8Array(32).fill(9));

describe("AES-256-GCM", () => {
  it("cifra e decifra mantendo o conteúdo", async () => {
    const original = { whatsapp: "5511953866646", cpf: "52998224725" };
    const envelope = await encryptJson(CHAVE, original);

    expect(envelope.startsWith("v1.")).toBe(true);
    expect(envelope).not.toContain("5511953866646");
    await expect(decryptJson(CHAVE, envelope)).resolves.toEqual(original);
  });

  it("gera ciphertext diferente a cada chamada (IV aleatório)", async () => {
    const a = await encryptJson(CHAVE, { ok: true });
    const b = await encryptJson(CHAVE, { ok: true });
    expect(a).not.toBe(b);
  });

  it("recusa chave errada e envelope adulterado", async () => {
    const envelope = await encryptJson(CHAVE, { segredo: "x" });
    await expect(decryptJson(OUTRA_CHAVE, envelope)).resolves.toBeNull();

    const partes = envelope.split(".");
    const adulterado = `${partes[0]}.${partes[1]}.${(partes[2] ?? "").slice(0, -2)}AA`;
    await expect(decryptJson(CHAVE, adulterado)).resolves.toBeNull();
  });

  it("valida o tamanho da chave mestra", () => {
    expect(() => parseMasterKey("curta")).toThrow(/32 bytes/);
    expect(() => parseMasterKey("a".repeat(64))).not.toThrow();
  });
});

describe("HMAC dos botões do Telegram", () => {
  const segredo = "segredo-de-teste-123";

  it("assina e verifica", async () => {
    const assinatura = await hmacSignature(segredo, "e:abc");
    await expect(verificarAssinatura(segredo, "e:abc", assinatura)).resolves.toBe(true);
  });

  it("recusa payload ou segredo diferente", async () => {
    const assinatura = await hmacSignature(segredo, "e:abc");
    await expect(verificarAssinatura(segredo, "e:xyz", assinatura)).resolves.toBe(false);
    await expect(verificarAssinatura("outro", "e:abc", assinatura)).resolves.toBe(false);
  });

  it("compara em tempo constante", () => {
    expect(timingSafeEqual("abc", "abc")).toBe(true);
    expect(timingSafeEqual("abc", "abd")).toBe(false);
    expect(timingSafeEqual("abc", "abcd")).toBe(false);
  });
});
