import { toBase64Url } from "./crypto";
import { sha256Hex } from "./crypto";
import { getConfig } from "./env";
import { decryptJson, encryptJson } from "./crypto";
import type { Pii } from "./store/types";

let chaveEfemera: string | null = null;
let avisou = false;

/**
 * Chave mestra para cifrar PII.
 * Em produção sem `LEAD_ENCRYPTION_KEY` retorna `null` — o sistema continua
 * funcionando, porém sem gravar dados pessoais (nunca grava em claro).
 */
export function chaveCripto(): string | null {
  const config = getConfig();
  if (config.encryptionKey) return config.encryptionKey;
  if (config.isProduction) return null;

  if (!chaveEfemera) {
    chaveEfemera = toBase64Url(crypto.getRandomValues(new Uint8Array(32)));
  }
  if (!avisou) {
    avisou = true;
    console.warn(
      "[nio] LEAD_ENCRYPTION_KEY ausente: usando chave efêmera de desenvolvimento (dados não persistem entre reinícios).",
    );
  }
  return chaveEfemera;
}

export async function cifrarPii(pii: Pii): Promise<string | null> {
  const chave = chaveCripto();
  if (!chave) return null;
  return await encryptJson(chave, pii);
}

export async function decifrarPii(envelope: string | undefined): Promise<Pii> {
  if (!envelope) return {};
  const chave = chaveCripto();
  if (!chave) return {};
  return (await decryptJson<Pii>(chave, envelope)) ?? {};
}

/** Índice cego: permite buscar por telefone/CPF sem guardar o valor em claro. */
export async function hashBusca(valor: string): Promise<string> {
  const sal = getConfig().ipSalt || "nio";
  return (await sha256Hex(`${sal}:busca:${valor}`)).slice(0, 40);
}
