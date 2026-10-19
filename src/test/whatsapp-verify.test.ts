// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { verificarWhatsapp } from "@/server/whatsapp-verify";

beforeEach(() => {
  vi.stubEnv("WHATSAPP_VERIFY_URL", "");
  vi.stubEnv("WHATSAPP_VERIFY_TOKEN", "");
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("verificação local", () => {
  it("recusa número fora do padrão brasileiro", async () => {
    const resultado = await verificarWhatsapp("1234");
    expect(resultado.status).toBe("invalido");
    expect(resultado.fonte).toBe("local");
  });

  it("aceita celular válido e informa o estado", async () => {
    const resultado = await verificarWhatsapp("(11) 95386-6646");
    expect(resultado.status).toBe("formato_valido");
    expect(resultado.numero).toBe("5511953866646");
    expect(resultado.detalhes.join(" ")).toContain("SP");
    expect(resultado.detalhes.join(" ")).toContain("nono dígito");
  });

  it("avisa quando é telefone fixo", async () => {
    const resultado = await verificarWhatsapp("11 3865-1234");
    expect(resultado.status).toBe("formato_valido");
    expect(resultado.detalhes.join(" ")).toContain("fixo");
  });

  it("sinaliza padrão repetitivo", async () => {
    const resultado = await verificarWhatsapp("11 99999-9999");
    expect(resultado.detalhes.join(" ")).toContain("repetida");
  });

  it("nunca promete conta verificada sem provedor", async () => {
    const resultado = await verificarWhatsapp("11 95386-6646");
    expect(resultado.status).not.toBe("verificado");
  });
});

describe("verificação com provedor", () => {
  function mockFetch(resposta: unknown, status = 200) {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify(resposta), { status })),
    );
  }

  it("marca verificado quando o provedor confirma", async () => {
    vi.stubEnv("WHATSAPP_VERIFY_URL", "https://provedor.test/check");
    vi.stubEnv("WHATSAPP_VERIFY_TOKEN", "segredo");
    mockFetch({ existe: true });

    const resultado = await verificarWhatsapp("11 95386-6646");
    expect(resultado.status).toBe("verificado");
    expect(resultado.fonte).toBe("provedor");
  });

  it("marca não verificado quando o provedor nega", async () => {
    vi.stubEnv("WHATSAPP_VERIFY_URL", "https://provedor.test/check");
    vi.stubEnv("WHATSAPP_VERIFY_TOKEN", "segredo");
    mockFetch({ exists: false });

    const resultado = await verificarWhatsapp("11 95386-6646");
    expect(resultado.status).toBe("nao_verificado");
  });

  it("resiste a falha do provedor", async () => {
    vi.stubEnv("WHATSAPP_VERIFY_URL", "https://provedor.test/check");
    vi.stubEnv("WHATSAPP_VERIFY_TOKEN", "segredo");
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("rede caiu");
      }),
    );

    const resultado = await verificarWhatsapp("11 95386-6646");
    expect(resultado.status).toBe("nao_verificado");
    expect(resultado.detalhes.join(" ")).toContain("rede");
  });

  it("trata resposta HTTP de erro", async () => {
    vi.stubEnv("WHATSAPP_VERIFY_URL", "https://provedor.test/check");
    vi.stubEnv("WHATSAPP_VERIFY_TOKEN", "segredo");
    mockFetch({ erro: true }, 500);

    const resultado = await verificarWhatsapp("11 95386-6646");
    expect(resultado.status).toBe("nao_verificado");
    expect(resultado.detalhes.join(" ")).toContain("500");
  });
});
