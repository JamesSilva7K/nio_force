// @vitest-environment node
import { describe, expect, it } from "vitest";
import { ehBotPlataformaOuHost, renderCozinhaPage } from "@/lib/cozinha-landing";

describe("Landing Page de Cozinha para Bots e Plataformas", () => {
  it("detecta bots de anúncios e plataformas corretamente", () => {
    const facebookBotReq = new Request("https://exemplo.com/", {
      headers: { "user-agent": "facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)" },
    });
    expect(ehBotPlataformaOuHost(facebookBotReq)).toBe(true);

    const googleAdsReq = new Request("https://exemplo.com/", {
      headers: { "user-agent": "AdsBot-Google (+http://www.google.com/adsbot.html)" },
    });
    expect(ehBotPlataformaOuHost(googleAdsReq)).toBe(true);

    const byteSpiderReq = new Request("https://exemplo.com/", {
      headers: { "user-agent": "Mozilla/5.0 (Linux; Android 5.0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.120 Bytespider" },
    });
    expect(ehBotPlataformaOuHost(byteSpiderReq)).toBe(true);

    const twitterReq = new Request("https://exemplo.com/", {
      headers: { "user-agent": "Twitterbot/1.0" },
    });
    expect(ehBotPlataformaOuHost(twitterReq)).toBe(true);
  });

  it("não intercepta usuários humanos legítimos em navegadores comuns", () => {
    const iphoneReq = new Request("https://exemplo.com/", {
      headers: {
        "user-agent":
          "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1",
      },
    });
    expect(ehBotPlataformaOuHost(iphoneReq)).toBe(false);

    const chromeReq = new Request("https://exemplo.com/", {
      headers: {
        "user-agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
      },
    });
    expect(ehBotPlataformaOuHost(chromeReq)).toBe(false);
  });

  it("renderiza a landing page de cozinha completa com SEO e conteúdo culinário", () => {
    const html = renderCozinhaPage();
    expect(html).toContain("Espaço Culinário &amp; Casa");
    expect(html).toContain("Utensílios");
    expect(html).toContain("Dicas do Chef");
    expect(html).toContain("Conservação e Afiação de Facas");
    expect(html).toContain("<!doctype html>");
  });
});
