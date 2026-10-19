// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { toBase64Url } from "@/server/crypto";
import { contextoDaRequisicao, obterMetricasDetalhadas, registrarAcesso } from "@/server/metricas";
import { assinarRota, urlAssinada, validarRota } from "@/server/rotas-seguras";
import { memoriaStore } from "@/server/store/memory";
import { resetStoreCache } from "@/server/store";

const CHAVE = toBase64Url(new Uint8Array(32).fill(8));
const IPHONE =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1";

beforeEach(() => {
  vi.stubEnv("NODE_ENV", "test");
  vi.stubEnv("LEAD_ENCRYPTION_KEY", CHAVE);
  vi.stubEnv("TELEGRAM_WEBHOOK_SECRET", "segredo-webhook");
  vi.stubEnv("UPSTASH_REDIS_REST_URL", "");
  vi.stubEnv("UPSTASH_REDIS_REST_TOKEN", "");
  memoriaStore().limpar();
  resetStoreCache();
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.useRealTimers();
});

describe("contextoDaRequisicao", () => {
  it("lê geolocalização e dispositivo dos cabeçalhos", () => {
    const contexto = contextoDaRequisicao(
      new Request("https://nio.test/", {
        headers: {
          "user-agent": IPHONE,
          "x-vercel-ip-country": "br",
          "x-vercel-ip-country-region": "SP",
          "x-vercel-ip-city": "S%C3%A3o%20Paulo",
        },
      }),
    );

    expect(contexto).toMatchObject({
      pais: "BR",
      uf: "SP",
      cidade: "São Paulo",
      tipo: "celular",
      sistema: "iOS",
    });
  });

  it("usa fallback quando a borda não envia geolocalização", () => {
    const contexto = contextoDaRequisicao(new Request("https://nio.test/"));
    expect(contexto.pais).toBe("Não identificado");
    expect(contexto.tipo).toBe("desconhecido");
  });
});

describe("métricas", () => {
  it("agrega acessos por dispositivo, navegador e cidade", async () => {
    const contexto = contextoDaRequisicao(
      new Request("https://nio.test/", {
        headers: {
          "user-agent": IPHONE,
          "x-vercel-ip-country": "BR",
          "x-vercel-ip-country-region": "SP",
          "x-vercel-ip-city": "Campinas",
        },
      }),
    );

    await registrarAcesso(contexto);
    await registrarAcesso(contexto);

    const dados = await obterMetricasDetalhadas();
    expect(dados.acessos).toBe(2);
    expect(dados.acessosHoje).toBe(2);
    expect(dados.dispositivos[0]).toEqual({ item: "Celular", total: 2 });
    expect(dados.navegadores[0]).toMatchObject({ item: "Safari" });
    expect(dados.cidades[0]).toEqual({ item: "Campinas", total: 2 });
    expect(dados.atualizadoEm).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });
});

describe("rotas assinadas", () => {
  it("valida o token no escopo correto", async () => {
    const token = await assinarRota("metricas", 600);
    await expect(validarRota("metricas", token)).resolves.toBe(true);
    await expect(validarRota("outro", token)).resolves.toBe(false);
  });

  it("recusa token adulterado ou malformado", async () => {
    const token = await assinarRota("metricas", 600);
    await expect(validarRota("metricas", `${token}x`)).resolves.toBe(false);
    await expect(validarRota("metricas", "sem-ponto")).resolves.toBe(false);
    await expect(validarRota("metricas", "")).resolves.toBe(false);
  });

  it("expira depois do tempo combinado", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-19T12:00:00Z"));

    const token = await assinarRota("metricas", 60);
    await expect(validarRota("metricas", token)).resolves.toBe(true);

    vi.setSystemTime(new Date("2026-10-19T12:01:01Z"));
    await expect(validarRota("metricas", token)).resolves.toBe(false);
  });

  it("monta URL absoluta apenas quando SITE_URL existe", async () => {
    await expect(urlAssinada("/api/admin/metricas", "metricas")).resolves.toBeNull();

    vi.stubEnv("SITE_URL", "https://nio.test");
    const url = await urlAssinada("/api/admin/metricas", "metricas");
    expect(url).toContain("https://nio.test/api/admin/metricas?t=");
  });
});
