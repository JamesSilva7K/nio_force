import { getConfig } from "../env";
import {
  invalidarCacheEdge,
  lerConfigEdge,
  salvarConfigEdge,
} from "./edge-config";
import { memoriaStore } from "./memory";
import { RedisStore } from "./redis";
import type { LeadStore, SiteConfig } from "./types";

let cache: { assinatura: string; store: LeadStore } | null = null;

/** Escolhe o store disponível: Redis quando configurado, senão memória. */
export function getStore(): LeadStore {
  const { redis } = getConfig();
  const assinatura = redis ? `${redis.url}|${redis.token.slice(0, 8)}` : "memoria";
  if (cache && cache.assinatura === assinatura) return cache.store;

  const store: LeadStore = redis ? new RedisStore(redis) : memoriaStore();
  cache = { assinatura, store };
  return store;
}

/** Usado nos testes para trocar de store entre casos. */
export function resetStoreCache(): void {
  cache = null;
}

/**
 * Lê a configuração do site com prioridade:
 * 1. Edge Config (Vercel free plan) — persiste entre cold starts sem custo
 * 2. Redis — persiste se configurado
 * 3. Memória — volátil, só para desenvolvimento
 */
export async function obterConfigPersistente(): Promise<SiteConfig | null> {
  const { edgeConfig } = getConfig();
  if (edgeConfig) {
    const config = await lerConfigEdge(edgeConfig);
    if (config) return config;
  }
  return getStore().obterConfig();
}

/**
 * Salva a configuração do site em todos os backends disponíveis:
 * Edge Config (se configurado) + Redis/Memória (redundância).
 */
export async function salvarConfigPersistente(config: SiteConfig): Promise<void> {
  const { edgeConfig } = getConfig();

  // Salva no store principal (Redis ou memória)
  await getStore().salvarConfig(config);

  // Salva também no Edge Config se disponível (persistência principal no free plan)
  if (edgeConfig) {
    try {
      await salvarConfigEdge(edgeConfig, config);
    } catch (erro) {
      console.error("[store] falha ao salvar no Edge Config (config salva no store principal):", erro);
    }
  }
}

/** Invalida o cache local do Edge Config. */
export function invalidarCache(): void {
  invalidarCacheEdge();
}

export * from "./types";
