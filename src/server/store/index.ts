import { getConfig } from "../env";
import { memoriaStore } from "./memory";
import { RedisStore } from "./redis";
import type { LeadStore } from "./types";

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

export * from "./types";
