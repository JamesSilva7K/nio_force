// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { rotearApi } from "@/server/api";
import { toBase64Url } from "@/server/crypto";
import { definirWhatsappSite } from "@/server/leads";
import { memoriaStore } from "@/server/store/memory";
import { resetStoreCache } from "@/server/store";

const CHAVE = toBase64Url(new Uint8Array(32).fill(4));

function requisicao(
  caminho: string,
  init: { method?: string; body?: string; headers?: Record<string, string> } = {},
): Request {
  return new Request(`https://niofibra.com.br${caminho}`, {
    method: init.method ?? "GET",
    ...(init.body ? { body: init.body } : {}),
    ...(init.headers ? { headers: init.headers } : {}),
  });
}

function jsonRequest(
  caminho: string,
  corpo: unknown,
  headers: Record<string, string> = {},
): Request {
  return requisicao(caminho, {
    method: "POST",
    body: JSON.stringify(corpo),
    headers: { "content-type": "application/json", "x-forwarded-for": "203.0.113.10", ...headers },
  });
}

beforeEach(() => {
  vi.stubEnv("NODE_ENV", "test");
  vi.stubEnv("LEAD_ENCRYPTION_KEY", CHAVE);
  vi.stubEnv("DEFAULT_WHATSAPP", "5511953866646");
  vi.stubEnv("TELEGRAM_BOT_TOKEN", "123456:token");
  vi.stubEnv("TELEGRAM_ADMIN_ID", "42");
  vi.stubEnv("TELEGRAM_WEBHOOK_SECRET", "segredo-webhook");
  vi.stubEnv("UPSTASH_REDIS_REST_URL", "");
  vi.stubEnv("UPSTASH_REDIS_REST_TOKEN", "");

  memoriaStore().limpar();
  resetStoreCache();

  vi.stubGlobal(
    "fetch",
    vi.fn(
      async () =>
        new Response(JSON.stringify({ ok: true, result: { message_id: 1, chat: { id: 42 } } }), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
    ),
  );
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("roteador da API", () => {
  it("ignora caminhos que não são da API", async () => {
    await expect(rotearApi(requisicao("/"), {})).resolves.toBeNull();
    await expect(rotearApi(requisicao("/servicos"), {})).resolves.toBeNull();
  });

  it("responde 404 para rota desconhecida da API", async () => {
    const resposta = await rotearApi(requisicao("/api/inexistente"), {});
    expect(resposta?.status).toBe(404);
  });
});

describe("/api/health", () => {
  it("informa o estado da configuração sem vazar segredos", async () => {
    const resposta = await rotearApi(requisicao("/api/health"), {});
    const corpo = (await resposta?.json()) as { store: string; faltando: string[] };

    expect(resposta?.status).toBe(200);
    expect(corpo.store).toBe("memoria");
    expect(JSON.stringify(corpo)).not.toContain("token");
  });
});

describe("/api/config", () => {
  it("devolve o WhatsApp vigente", async () => {
    const resposta = await rotearApi(requisicao("/api/config"), {});
    const corpo = (await resposta?.json()) as { whatsapp: string };

    expect(resposta?.status).toBe(200);
    expect(corpo.whatsapp).toBe("5511953866646");
    expect(resposta?.headers.get("cache-control")).toContain("s-maxage");
  });

  it("recusa métodos de escrita", async () => {
    const resposta = await rotearApi(requisicao("/api/config", { method: "POST" }), {});
    expect(resposta?.status).toBe(405);
  });

  it("passa a devolver o novo número assim que o administrador troca", async () => {
    await definirWhatsappSite("21 98888-7777", "admin");

    const resposta = await rotearApi(requisicao("/api/config"), {});
    const corpo = (await resposta?.json()) as { whatsapp: string };

    expect(corpo.whatsapp).toBe("5521988887777");
  });
});

describe("/api/lead", () => {
  it("aceita um evento válido", async () => {
    const resposta = await rotearApi(
      jsonRequest("/api/lead", { evento: "entrada", caminho: "/", utm: { utm_source: "google" } }),
      {},
    );
    const corpo = (await resposta?.json()) as { ok: boolean; id: string; etapa: string };

    expect(resposta?.status).toBe(200);
    expect(corpo.ok).toBe(true);
    expect(corpo.etapa).toBe("entrada");
    expect(corpo.id).toMatch(/^[0-9a-f-]{36}$/);
  });

  it("rejeita evento desconhecido", async () => {
    const resposta = await rotearApi(jsonRequest("/api/lead", { evento: "x" }), {});
    expect(resposta?.status).toBe(400);
  });

  it("ignora silenciosamente o honeypot", async () => {
    const resposta = await rotearApi(
      jsonRequest("/api/lead", { evento: "entrada", website: "http://spam" }),
      {},
    );
    const corpo = (await resposta?.json()) as { ok: boolean; id: string | null };

    expect(resposta?.status).toBe(200);
    expect(corpo.id).toBeNull();
  });

  it("recusa corpo grande demais", async () => {
    const resposta = await rotearApi(
      jsonRequest("/api/lead", { evento: "entrada", lixo: "a".repeat(5_000) }),
      {},
    );
    expect(resposta?.status).toBe(400);
  });
});

describe("/api/telegram/webhook", () => {
  it("exige o token secreto do Telegram", async () => {
    const resposta = await rotearApi(jsonRequest("/api/telegram/webhook", { update_id: 1 }), {});
    expect(resposta?.status).toBe(401);
  });

  it("processa update autenticado", async () => {
    const resposta = await rotearApi(
      jsonRequest(
        "/api/telegram/webhook",
        {
          update_id: 7,
          message: { message_id: 1, chat: { id: 42 }, from: { id: 42 }, text: "/status" },
        },
        { "x-telegram-bot-api-secret-token": "segredo-webhook" },
      ),
      {},
    );

    expect(resposta?.status).toBe(200);
    expect(await resposta?.json()).toMatchObject({ ok: true });
  });

  it("não repete updates já processados", async () => {
    const update = { update_id: 8, message: { message_id: 1, chat: { id: 42 }, text: "/status" } };
    await rotearApi(
      jsonRequest("/api/telegram/webhook", update, {
        "x-telegram-bot-api-secret-token": "segredo-webhook",
      }),
      {},
    );
    const segunda = await rotearApi(
      jsonRequest("/api/telegram/webhook", update, {
        "x-telegram-bot-api-secret-token": "segredo-webhook",
      }),
      {},
    );

    expect(await segunda?.json()).toMatchObject({ duplicado: true });
  });
});
