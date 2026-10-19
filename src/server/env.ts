/**
 * Configuração do servidor, lida de variáveis de ambiente.
 *
 * Nenhum segredo é exposto ao cliente: este módulo só é importado por código
 * que roda no servidor (`src/server.ts` e módulos `src/server/**`). Variáveis
 * com prefixo `VITE_` são as únicas visíveis no bundle do navegador — e não são
 * usadas aqui.
 */

export interface TelegramConfig {
  readonly token: string;
  readonly adminIds: readonly number[];
  /** IDs com poderes de super-admin: aprovam ações sensíveis. Se vazio, qualquer admin pode executar tudo. */
  readonly superAdminIds: readonly number[];
  readonly webhookSecret: string;
  readonly callbackSecret: string;
}

export interface RedisConfig {
  readonly url: string;
  readonly token: string;
  readonly prefix: string;
}

export interface AppConfig {
  readonly isProduction: boolean;
  readonly telegram: TelegramConfig;
  readonly encryptionKey: string;
  readonly ipSalt: string;
  readonly defaultWhatsapp: string;
  readonly allowedHosts: readonly string[];
  readonly redis: RedisConfig | null;
  readonly siteUrl: string;
  readonly nodeEnv: string;
}

/**
 * Objeto de ambiente injetado pela plataforma (Vercel/Workers). Em Node ele é
 * `process.env`; em runtimes de borda, o objeto recebido em `fetch(request, env)`.
 */
let runtimeEnv: Record<string, string | undefined> = {};

export function setRuntimeEnv(env: unknown): void {
  if (env && typeof env === "object") {
    runtimeEnv = env as Record<string, string | undefined>;
  }
}

function read(name: string): string | undefined {
  const fromProcess = typeof process !== "undefined" && process.env ? process.env[name] : undefined;
  const value = fromProcess ?? runtimeEnv[name];
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

/** Lê uma variável de ambiente opcional (nunca exposta ao cliente). */
export function lerEnv(nome: string): string | undefined {
  return read(nome);
}

function readList(name: string): string[] {
  const raw = read(name);
  if (!raw) return [];
  return raw
    .split(/[,\s]+/)
    .map((item) => item.trim().toLowerCase())
    .filter((item) => item.length > 0);
}

function readAdminIds(): number[] {
  const raw = read("TELEGRAM_ADMIN_ID") ?? read("TELEGRAM_ADMIN_CHAT_ID");
  if (!raw) return [];
  return raw
    .split(/[,\s]+/)
    .map((item) => Number.parseInt(item.trim(), 10))
    .filter((value) => Number.isSafeInteger(value) && value !== 0);
}

function readSuperAdminIds(): number[] {
  const raw = read("TELEGRAM_SUPERADMIN_ID");
  if (!raw) return [];
  return raw
    .split(/[,\s]+/)
    .map((item) => Number.parseInt(item.trim(), 10))
    .filter((value) => Number.isSafeInteger(value) && value !== 0);
}

const FALLBACK_WHATSAPP = "5511953866646";

export function getConfig(): AppConfig {
  const isProduction =
    read("NODE_ENV") === "production" || read("VERCEL") === "1" || Boolean(read("VERCEL_ENV"));

  const token = read("TELEGRAM_BOT_TOKEN") ?? "";
  const encryptionKey = read("LEAD_ENCRYPTION_KEY") ?? "";
  const webhookSecret = read("TELEGRAM_WEBHOOK_SECRET") ?? "";

  const redisUrl =
    read("UPSTASH_REDIS_REST_URL") ?? read("KV_REST_API_URL") ?? read("REDIS_REST_URL") ?? "";
  const redisToken =
    read("UPSTASH_REDIS_REST_TOKEN") ?? read("KV_REST_API_TOKEN") ?? read("REDIS_REST_TOKEN") ?? "";

  const defaultWhatsapp = read("DEFAULT_WHATSAPP") ?? FALLBACK_WHATSAPP;

  return {
    isProduction,
    nodeEnv: read("NODE_ENV") ?? (isProduction ? "production" : "development"),
    telegram: {
      token,
      adminIds: readAdminIds(),
      superAdminIds: readSuperAdminIds(),
      webhookSecret,
      // Assinatura dos botões: usa segredo dedicado quando existir, senão deriva
      // do token do bot (que nunca sai do servidor).
      callbackSecret: read("TELEGRAM_CALLBACK_SECRET") || webhookSecret || token,
    },
    encryptionKey,
    ipSalt: read("IP_HASH_SALT") ?? encryptionKey,
    defaultWhatsapp,
    allowedHosts: readList("ALLOWED_HOSTS"),
    siteUrl: read("SITE_URL") ?? "",
    redis:
      redisUrl.length > 0 && redisToken.length > 0
        ? {
            url: redisUrl.replace(/\/$/, ""),
            token: redisToken,
            prefix: read("REDIS_PREFIX") ?? "nio",
          }
        : null,
  };
}

/** Recursos mínimos para o sistema completo funcionar. */
export function diagnosticarConfiguracao(config: AppConfig = getConfig()): {
  ok: boolean;
  faltando: string[];
  avisos: string[];
} {
  const faltando: string[] = [];
  const avisos: string[] = [];

  if (!config.telegram.token) faltando.push("TELEGRAM_BOT_TOKEN");
  if (config.telegram.adminIds.length === 0) faltando.push("TELEGRAM_ADMIN_ID");
  if (!config.telegram.webhookSecret) faltando.push("TELEGRAM_WEBHOOK_SECRET");
  if (!config.encryptionKey) faltando.push("LEAD_ENCRYPTION_KEY");
  if (!config.redis) {
    avisos.push(
      "Sem UPSTASH_REDIS_REST_URL/TOKEN os leads ficam apenas em memória e são perdidos a cada cold start.",
    );
  }
  if (config.allowedHosts.length === 0) {
    avisos.push("ALLOWED_HOSTS vazio: a checagem anti-clonagem por domínio está desativada.");
  }

  return { ok: faltando.length === 0, faltando, avisos };
}
