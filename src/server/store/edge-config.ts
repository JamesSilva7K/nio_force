/**
 * Adaptador de persistência usando Vercel Edge Config.
 *
 * O Edge Config é um armazenamento de chave-valor de baixíssima latência
 * disponível no plano gratuito da Vercel. Ele é ideal para guardar a
 * configuração do site (número WhatsApp, título, favicon) de forma que
 * sobreviva a cold starts sem precisar de Redis ou qualquer serviço pago.
 *
 * Limitações:
 *  - Edge Config é somente-leitura em runtime; escrita é feita via Vercel API.
 *  - Leads ficam em memória (comportamento padrão sem Redis).
 *  - Rate limits, pendentes e aprovações ficam em memória (aceitável para o
 *    volume de uma landing page — expiram em minutos).
 */

import type { SiteConfig } from "./types";

const EDGE_CONFIG_KEY = "nio_site_config";
const TIMEOUT_MS = 4_000;

/** Lê do Edge Config via fetch direto (sem depender do SDK no bundle de servidor). */
async function lerEdgeConfig(
  connectionString: string,
  chave: string,
): Promise<unknown> {
  const url = new URL(connectionString);
  // connectionString: https://edge-config.vercel.com/ecfg_xxx?token=yyy
  const apiUrl = `https://edge-config.vercel.com${url.pathname}/item/${encodeURIComponent(chave)}${url.search}`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const r = await fetch(apiUrl, {
      headers: { Accept: "application/json" },
      signal: controller.signal,
      cache: "no-store",
    });
    if (r.status === 404) return undefined;
    if (!r.ok) throw new Error(`Edge Config GET ${r.status}`);
    const dados = (await r.json()) as { value?: unknown };
    return dados.value ?? dados;
  } finally {
    clearTimeout(timer);
  }
}

/** Escreve no Edge Config via Vercel API (requer VERCEL_API_TOKEN + VERCEL_EDGE_CONFIG_ID). */
async function escreverEdgeConfig(
  apiToken: string,
  edgeConfigId: string,
  chave: string,
  valor: unknown,
): Promise<void> {
  const apiUrl = `https://api.vercel.com/v1/edge-config/${edgeConfigId}/items`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const r = await fetch(apiUrl, {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${apiToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        items: [{ operation: "upsert", key: chave, value: valor }],
      }),
      signal: controller.signal,
    });
    if (!r.ok) {
      const texto = await r.text().catch(() => "");
      throw new Error(`Vercel API PATCH ${r.status}: ${texto.slice(0, 200)}`);
    }
  } finally {
    clearTimeout(timer);
  }
}

export interface EdgeConfigCredenciais {
  /** EDGE_CONFIG (connection string completa) */
  readonly connectionString: string;
  /** VERCEL_API_TOKEN — token pessoal gerado em vercel.com/account/tokens */
  readonly apiToken: string;
  /** ID do Edge Config store, ex: ecfg_xxxxxxx */
  readonly edgeConfigId: string;
}

/**
 * Cache em memória para evitar chamadas repetidas ao Edge Config
 * dentro do mesmo ciclo de vida da instância serverless.
 */
let cacheConfig: { valor: SiteConfig; at: number } | null = null;
const CACHE_TTL_MS = 30_000; // 30 segundos

export async function lerConfigEdge(
  creds: EdgeConfigCredenciais,
): Promise<SiteConfig | null> {
  // Usa cache local se ainda válido
  if (cacheConfig && Date.now() - cacheConfig.at < CACHE_TTL_MS) {
    return cacheConfig.valor;
  }
  try {
    const valor = await lerEdgeConfig(creds.connectionString, EDGE_CONFIG_KEY);
    if (valor && typeof valor === "object") {
      const config = valor as SiteConfig;
      cacheConfig = { valor: config, at: Date.now() };
      return config;
    }
    return null;
  } catch (erro) {
    console.error("[edge-config] falha ao ler config:", erro);
    // Em caso de falha, usa cache antigo se existir
    return cacheConfig?.valor ?? null;
  }
}

export async function salvarConfigEdge(
  creds: EdgeConfigCredenciais,
  config: SiteConfig,
): Promise<void> {
  await escreverEdgeConfig(creds.apiToken, creds.edgeConfigId, EDGE_CONFIG_KEY, config);
  // Atualiza cache local imediatamente
  cacheConfig = { valor: config, at: Date.now() };
}

/** Invalida o cache local (útil após escrever). */
export function invalidarCacheEdge(): void {
  cacheConfig = null;
}
