import { useEffect, useState } from "react";

/**
 * Número de WhatsApp exibido no site.
 *
 * O valor oficial fica no servidor e pode ser alterado pelo administrador pelo
 * Telegram. A página abre com o número padrão e, ao carregar, busca a versão
 * vigente em `/api/config` — assim a troca aparece sem mudar o layout.
 */

export const WHATSAPP_PADRAO = "5511953866646";

const VALIDADE_CACHE_MS = 60_000;

let cache: { valor: string; em: number } | null = null;
let emVoo: Promise<string> | null = null;

function cacheValido(): boolean {
  return cache !== null && Date.now() - cache.em < VALIDADE_CACHE_MS;
}

export function whatsappEmCache(): string {
  return cache?.valor ?? WHATSAPP_PADRAO;
}

async function buscarWhatsapp(): Promise<string> {
  if (cacheValido() && cache) return cache.valor;
  if (emVoo) return emVoo;

  emVoo = (async () => {
    try {
      const resposta = await fetch("/api/config", {
        headers: { Accept: "application/json" },
        credentials: "same-origin",
      });
      if (!resposta.ok) return whatsappEmCache();
      const dados = (await resposta.json()) as { whatsapp?: unknown };
      const numero = typeof dados.whatsapp === "string" ? dados.whatsapp : "";
      if (!/^\d{12,13}$/.test(numero)) return whatsappEmCache();
      cache = { valor: numero, em: Date.now() };
      return numero;
    } catch {
      return whatsappEmCache();
    } finally {
      emVoo = null;
    }
  })();

  return emVoo;
}

/**
 * Hook: devolve o número oficial.
 * `inicial` vem do servidor (SSR) e é a fonte da verdade — evita qualquer troca
 * visível na hidratação e nunca é sobrescrito por um cache antigo do cliente.
 */
export const TITULO_PADRAO = "NIO | Internet Fibra e Central de Atendimento";
export const FAVICON_PADRAO = "/favicon.png";

export interface DadosConfigSite {
  readonly whatsapp: string;
  readonly titulo: string;
  readonly favicon: string;
}

let configCache: { valor: DadosConfigSite; em: number } | null = null;
let configEmVoo: Promise<DadosConfigSite> | null = null;

function configCacheValido(): boolean {
  return configCache !== null && Date.now() - configCache.em < VALIDADE_CACHE_MS;
}

export function configEmCache(): DadosConfigSite {
  return (
    configCache?.valor ?? {
      whatsapp: WHATSAPP_PADRAO,
      titulo: TITULO_PADRAO,
      favicon: FAVICON_PADRAO,
    }
  );
}

export async function buscarConfigSite(): Promise<DadosConfigSite> {
  if (configCacheValido() && configCache) return configCache.valor;
  if (configEmVoo) return configEmVoo;

  configEmVoo = (async () => {
    try {
      const resposta = await fetch("/api/config", {
        headers: { Accept: "application/json" },
        credentials: "same-origin",
      });
      if (!resposta.ok) return configEmCache();
      const dados = (await resposta.json()) as {
        whatsapp?: unknown;
        titulo?: unknown;
        favicon?: unknown;
      };
      const resultado: DadosConfigSite = {
        whatsapp:
          typeof dados.whatsapp === "string" && /^\d{12,13}$/.test(dados.whatsapp)
            ? dados.whatsapp
            : WHATSAPP_PADRAO,
        titulo: typeof dados.titulo === "string" && dados.titulo.length >= 3 ? dados.titulo : TITULO_PADRAO,
        favicon: typeof dados.favicon === "string" && dados.favicon.length > 0 ? dados.favicon : FAVICON_PADRAO,
      };
      configCache = { valor: resultado, em: Date.now() };
      return resultado;
    } catch {
      return configEmCache();
    } finally {
      configEmVoo = null;
    }
  })();

  return configEmVoo;
}

/**
 * Hook: devolve a configuração do site (WhatsApp, Título, Favicon).
 */
export function useSiteConfig(inicial?: Partial<DadosConfigSite>): DadosConfigSite {
  const [config, setConfig] = useState<DadosConfigSite>(() => ({
    whatsapp: inicial?.whatsapp ?? whatsappEmCache(),
    titulo: inicial?.titulo ?? TITULO_PADRAO,
    favicon: inicial?.favicon ?? FAVICON_PADRAO,
  }));

  useEffect(() => {
    if (inicial?.whatsapp && inicial?.titulo && inicial?.favicon) {
      configCache = {
        valor: {
          whatsapp: inicial.whatsapp,
          titulo: inicial.titulo,
          favicon: inicial.favicon,
        },
        em: Date.now(),
      };
      return;
    }

    let ativo = true;
    void buscarConfigSite().then((novo) => {
      if (ativo) {
        setConfig(novo);
        if (typeof document !== "undefined") {
          document.title = novo.titulo;
          const link = document.querySelector<HTMLLinkElement>("link[rel*='icon']");
          if (link) link.href = novo.favicon;
        }
      }
    });

    return () => {
      ativo = false;
    };
  }, [inicial?.whatsapp, inicial?.titulo, inicial?.favicon]);

  return config;
}
