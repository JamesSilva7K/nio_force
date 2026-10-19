import { hmacSignature, timingSafeEqual } from "./crypto";
import { getConfig } from "./env";

/**
 * Rotas assinadas (links administrativos).
 *
 * Um link administrativo só existe se carregar um token `expira.assinatura`
 * gerado com HMAC-SHA-256 pela chave do servidor. Sem o token, a rota não
 * revela nada. Isso não "criptografa a URL" (URL não é criptografável de forma
 * útil), mas garante que ninguém adivinhe ou forje o endereço.
 */

function segredo(): string {
  const config = getConfig();
  const chave =
    config.telegram.callbackSecret || config.telegram.token || config.encryptionKey || "";
  if (!chave) throw new Error("Nenhum segredo configurado para assinar rotas.");
  return chave;
}

/** Gera um token válido por `ttlSegundos`. */
export async function assinarRota(escopo: string, ttlSegundos = 600): Promise<string> {
  const expira = Math.floor(Date.now() / 1_000) + Math.max(30, ttlSegundos);
  const assinatura = await hmacSignature(segredo(), `${escopo}:${expira}`, 12);
  return `${expira}.${assinatura}`;
}

/** Valida expiração e assinatura em tempo constante. */
export async function validarRota(escopo: string, token: string): Promise<boolean> {
  const partes = token.split(".");
  if (partes.length !== 2) return false;

  const [expiraTexto, assinatura] = partes;
  if (!expiraTexto || !assinatura) return false;

  const expira = Number.parseInt(expiraTexto, 10);
  if (!Number.isSafeInteger(expira)) return false;
  if (expira * 1_000 < Date.now()) return false;

  const esperada = await hmacSignature(segredo(), `${escopo}:${expira}`, 12);
  return timingSafeEqual(esperada, assinatura);
}

/** Monta a URL completa de uma rota assinada. */
export async function urlAssinada(
  caminho: string,
  escopo: string,
  ttlSegundos = 600,
): Promise<string | null> {
  const base = getConfig().siteUrl;
  if (!base) return null;
  const token = await assinarRota(escopo, ttlSegundos);
  const separador = caminho.includes("?") ? "&" : "?";
  return `${base.replace(/\/$/, "")}${caminho}${separador}t=${encodeURIComponent(token)}`;
}
