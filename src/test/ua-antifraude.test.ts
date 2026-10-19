// @vitest-environment node
import { describe, expect, it } from "vitest";

import { classificarUserAgent } from "@/lib/ua";
import { avaliarSinais, deveNotificar } from "@/server/antifraude";

const IPHONE_SAFARI =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1";
const ANDROID_TABLET =
  "Mozilla/5.0 (Linux; Android 13; SM-X700) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36";
const CHROME_WINDOWS =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";
const GOOGLEBOT = "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)";
const CURL = "curl/8.4.0";

describe("classificarUserAgent", () => {
  it("reconhece celular, tablet e desktop", () => {
    expect(classificarUserAgent(IPHONE_SAFARI)).toMatchObject({
      tipo: "celular",
      sistema: "iOS",
      navegador: "Safari",
      bot: false,
    });
    expect(classificarUserAgent(ANDROID_TABLET)).toMatchObject({
      tipo: "tablet",
      sistema: "Android",
    });
    expect(classificarUserAgent(CHROME_WINDOWS)).toMatchObject({
      tipo: "desktop",
      sistema: "Windows",
      navegador: "Chrome",
    });
  });

  it("separa crawler conhecido de automação", () => {
    expect(classificarUserAgent(GOOGLEBOT)).toMatchObject({
      tipo: "bot",
      bot: true,
      crawlerConhecido: true,
    });
    expect(classificarUserAgent(CURL)).toMatchObject({ bot: true, crawlerConhecido: false });
  });

  it("trata user-agent vazio", () => {
    expect(classificarUserAgent("")).toMatchObject({ tipo: "desconhecido", bot: false });
    expect(classificarUserAgent(null)).toMatchObject({ tipo: "desconhecido" });
  });
});

describe("avaliarSinais", () => {
  it("mantém lead limpo como confiável", () => {
    const avaliacao = avaliarSinais({
      userAgent: CHROME_WINDOWS,
      temClientHints: true,
      pais: "BR",
    });
    expect(avaliacao).toMatchObject({ qualidade: "confiavel", risco: 0 });
    expect(avaliacao.motivos).toHaveLength(0);
  });

  it("descarta honeypot imediatamente", () => {
    expect(avaliarSinais({ userAgent: CHROME_WINDOWS, honeypot: true })).toMatchObject({
      qualidade: "descartado",
      risco: 100,
    });
  });

  it("descarta automação e penaliza crawler conhecido", () => {
    expect(avaliarSinais({ userAgent: CURL })).toMatchObject({ qualidade: "descartado" });
    expect(avaliarSinais({ userAgent: GOOGLEBOT }).qualidade).toBe("suspeito");
  });

  it("soma sinais de risco sem estourar 100", () => {
    const avaliacao = avaliarSinais({
      userAgent: "",
      pais: "US",
      email: "teste@mailinator.com",
      telefoneRepetido: true,
      intervaloMs: 120,
      requisicoesRecentes: 80,
    });
    expect(avaliacao.risco).toBeLessThanOrEqual(100);
    expect(avaliacao.qualidade).toBe("descartado");
    expect(avaliacao.motivos.length).toBeGreaterThanOrEqual(4);
  });

  it("marca suspeito em acesso fora do Brasil", () => {
    const avaliacao = avaliarSinais({
      userAgent: CHROME_WINDOWS,
      temClientHints: true,
      pais: "PT",
    });
    expect(avaliacao.qualidade).toBe("suspeito");
    expect(avaliacao.motivos.join(" ")).toContain("fora do Brasil");
  });

  it("nunca notifica lead descartado", () => {
    expect(deveNotificar("descartado")).toBe(false);
    expect(deveNotificar("suspeito")).toBe(true);
    expect(deveNotificar("confiavel")).toBe(true);
  });
});
