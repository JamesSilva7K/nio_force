/**
 * Classificação de user-agent: dispositivo, navegador, sistema e bots.
 *
 * Puro e determinístico — sem rede, sem dependências. Usado no servidor para
 * métricas e pontuação antifraude. Não é fingerprint: só o cabeçalho padrão
 * que todo navegador envia.
 */

export type TipoDispositivo = "celular" | "tablet" | "desktop" | "bot" | "desconhecido";

export interface ClassificacaoUA {
  readonly tipo: TipoDispositivo;
  readonly navegador: string;
  readonly sistema: string;
  readonly bot: boolean;
  /** Robô de mecanismo de busca ou pré-visualização social (não é ameaça). */
  readonly crawlerConhecido: boolean;
}

/** Bots legítimos de busca, de anúncios e de pré-visualização de link. */
const CRAWLERS_CONHECIDOS = [
  "googlebot",
  "google-inspectiontool",
  "adsbot-google",
  "mediapartners-google",
  "bingbot",
  "duckduckbot",
  "yandexbot",
  "baiduspider",
  "applebot",
  "facebookexternalhit",
  "facebookcatalog",
  "facebot",
  "twitterbot",
  "linkedinbot",
  "pinterestbot",
  "whatsapp",
  "telegrambot",
  "slackbot",
  "discordbot",
  "embedly",
  "google-ads",
];

/** Sinais de automação: navegador controlado, HTTP client, biblioteca. */
const SINAIS_AUTOMACAO = [
  "headlesschrome",
  "headlessfirefox",
  "puppeteer",
  "playwright",
  "phantomjs",
  "selenium",
  "webdriver",
  "curl/",
  "wget/",
  "python-requests",
  "python-urllib",
  "aiohttp",
  "go-http-client",
  "java/",
  "okhttp",
  "axios/",
  "node-fetch",
  "undici",
  "guzzle",
  "httpclient",
  "libwww-perl",
  "scrapy",
  "ahrefsbot",
  "semrushbot",
  "mj12bot",
  "dotbot",
  "petalbot",
  "bytespider",
  "gptbot",
  "chatgpt-user",
  "ccbot",
  "claude-web",
  "perplexitybot",
  "amazonbot",
];

function contem(texto: string, trechos: readonly string[]): boolean {
  return trechos.some((trecho) => texto.includes(trecho));
}

function detectarNavegador(ua: string): string {
  if (ua.includes("edg/") || ua.includes("edge/")) return "Edge";
  if (ua.includes("opr/") || ua.includes("opera")) return "Opera";
  if (ua.includes("samsungbrowser")) return "Samsung Internet";
  if (ua.includes("firefox/") || ua.includes("fxios")) return "Firefox";
  if (ua.includes("chrome/") || ua.includes("crios")) return "Chrome";
  if (ua.includes("safari/")) return "Safari";
  if (ua.includes("msie") || ua.includes("trident")) return "Internet Explorer";
  return "Outro";
}

function detectarSistema(ua: string): string {
  if (ua.includes("android")) return "Android";
  if (ua.includes("iphone") || ua.includes("ipad") || ua.includes("ipod")) return "iOS";
  if (ua.includes("windows")) return "Windows";
  if (ua.includes("mac os x") || ua.includes("macintosh")) return "macOS";
  if (ua.includes("cros")) return "ChromeOS";
  if (ua.includes("linux") || ua.includes("x11")) return "Linux";
  return "Outro";
}

function detectarTipo(ua: string): TipoDispositivo {
  if (!ua) return "desconhecido";
  const tablet =
    ua.includes("ipad") ||
    (ua.includes("android") && !ua.includes("mobile")) ||
    ua.includes("tablet") ||
    ua.includes("kindle") ||
    ua.includes("silk/");
  if (tablet) return "tablet";

  const celular =
    ua.includes("mobile") ||
    ua.includes("iphone") ||
    ua.includes("ipod") ||
    ua.includes("android") ||
    ua.includes("windows phone") ||
    ua.includes("opera mini");
  if (celular) return "celular";

  if (
    ua.includes("windows") ||
    ua.includes("macintosh") ||
    ua.includes("linux") ||
    ua.includes("x11") ||
    ua.includes("cros")
  ) {
    return "desktop";
  }

  return "desconhecido";
}

export function classificarUserAgent(userAgent: string | null | undefined): ClassificacaoUA {
  const ua = (userAgent ?? "").toLowerCase().trim();
  if (ua.length === 0) {
    return {
      tipo: "desconhecido",
      navegador: "Desconhecido",
      sistema: "Desconhecido",
      bot: false,
      crawlerConhecido: false,
    };
  }

  const crawlerConhecido = contem(ua, CRAWLERS_CONHECIDOS);
  const automacao = contem(ua, SINAIS_AUTOMACAO);

  if (crawlerConhecido || automacao) {
    return {
      tipo: "bot",
      navegador: crawlerConhecido ? "Crawler" : "Automação",
      sistema: detectarSistema(ua),
      bot: true,
      crawlerConhecido,
    };
  }

  return {
    tipo: detectarTipo(ua),
    navegador: detectarNavegador(ua),
    sistema: detectarSistema(ua),
    bot: false,
    crawlerConhecido: false,
  };
}

/** Rótulo curto para menus do Telegram. */
export const ROTULO_DISPOSITIVO: Record<TipoDispositivo, string> = {
  celular: "📱 Celular",
  tablet: "📲 Tablet",
  desktop: "💻 Desktop",
  bot: "🤖 Robô",
  desconhecido: "❓ Desconhecido",
};
