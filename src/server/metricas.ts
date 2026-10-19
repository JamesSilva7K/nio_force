import { classificarUserAgent, type ClassificacaoUA, type TipoDispositivo } from "@/lib/ua";

import { getStore } from "./store";
import { diaLocal, type RankingItem } from "./store/types";

/** Contexto de acesso extraído da requisição (headers da Vercel/Cloudflare). */
export interface ContextoAcesso extends ClassificacaoUA {
  readonly pais: string;
  readonly uf: string;
  readonly cidade: string;
}

const NAO_IDENTIFICADO = "Não identificado";

function decodificar(valor: string | null): string {
  if (!valor) return "";
  try {
    return decodeURIComponent(valor).trim();
  } catch {
    return valor.trim();
  }
}

/** Lê geolocalização e dispositivo a partir da requisição. */
export function contextoDaRequisicao(request: Request): ContextoAcesso {
  const ua = classificarUserAgent(request.headers.get("user-agent"));

  const pais = (
    request.headers.get("x-vercel-ip-country") ??
    request.headers.get("cf-ipcountry") ??
    ""
  )
    .trim()
    .toUpperCase();

  const uf = (
    request.headers.get("x-vercel-ip-country-region") ??
    request.headers.get("x-vercel-ip-region") ??
    ""
  ).trim();

  const cidade = decodificar(request.headers.get("x-vercel-ip-city"));

  return {
    ...ua,
    pais: pais.length === 2 ? pais : NAO_IDENTIFICADO,
    uf: uf.length > 0 ? uf.slice(0, 40) : NAO_IDENTIFICADO,
    cidade: cidade.length > 0 ? cidade.slice(0, 80) : NAO_IDENTIFICADO,
  };
}

/** Registra um acesso nas métricas (chamado uma vez por sessão de lead). */
export async function registrarAcesso(contexto: ContextoAcesso): Promise<void> {
  const store = getStore();
  const hoje = diaLocal();

  await store.incrementar("acessos:total");
  await store.incrementar(`acessos:dia:${hoje}`);

  await store.incrementarRanking("dispositivo", rotuloDispositivo(contexto.tipo));
  await store.incrementarRanking("navegador", contexto.navegador);
  await store.incrementarRanking("sistema", contexto.sistema);
  await store.incrementarRanking("pais", contexto.pais);
  await store.incrementarRanking("uf", contexto.uf);
  if (contexto.cidade !== NAO_IDENTIFICADO) {
    await store.incrementarRanking("cidade", contexto.cidade);
  }
}

export function rotuloDispositivo(tipo: TipoDispositivo): string {
  switch (tipo) {
    case "celular":
      return "Celular";
    case "tablet":
      return "Tablet";
    case "desktop":
      return "Desktop";
    case "bot":
      return "Robô";
    default:
      return "Desconhecido";
  }
}

export interface MetricasDetalhadas {
  readonly atualizadoEm: string;
  readonly totalLeads: number;
  readonly leadsHoje: number;
  readonly acessos: number;
  readonly acessosHoje: number;
  readonly cliquesWhatsapp: number;
  readonly noWhatsapp: number;
  readonly convertidos: number;
  readonly perdidos: number;
  readonly confiaveis: number;
  readonly suspeitos: number;
  readonly descartados: number;
  readonly taxaWhatsapp: number;
  readonly dispositivos: readonly RankingItem[];
  readonly navegadores: readonly RankingItem[];
  readonly sistemas: readonly RankingItem[];
  readonly paises: readonly RankingItem[];
  readonly ufs: readonly RankingItem[];
  readonly cidades: readonly RankingItem[];
}

/**
 * Métricas sempre calculadas na hora — nada é cacheado, então o painel nunca
 * mostra número velho.
 */
export async function obterMetricasDetalhadas(): Promise<MetricasDetalhadas> {
  const store = getStore();
  const hoje = diaLocal();

  const [
    totalLeads,
    leadsHoje,
    acessos,
    acessosHoje,
    cliquesWhatsapp,
    noWhatsapp,
    convertidos,
    perdidos,
    confiaveis,
    suspeitos,
    descartados,
    dispositivos,
    navegadores,
    sistemas,
    paises,
    ufs,
    cidades,
  ] = await Promise.all([
    store.contarLeads(),
    store.obterContador(`dia:${hoje}`),
    store.obterContador("acessos:total"),
    store.obterContador(`acessos:dia:${hoje}`),
    store.obterContador("evento:clique_whatsapp"),
    store.obterContador("etapa:whatsapp"),
    store.obterContador("etapa:convertido"),
    store.obterContador("etapa:perdido"),
    store.obterContador("qualidade:confiavel"),
    store.obterContador("qualidade:suspeito"),
    store.obterContador("qualidade:descartado"),
    store.topRanking("dispositivo", 10),
    store.topRanking("navegador", 6),
    store.topRanking("sistema", 6),
    store.topRanking("pais", 8),
    store.topRanking("uf", 10),
    store.topRanking("cidade", 10),
  ]);

  return {
    atualizadoEm: new Date().toISOString(),
    totalLeads,
    leadsHoje,
    acessos,
    acessosHoje,
    cliquesWhatsapp,
    noWhatsapp,
    convertidos,
    perdidos,
    confiaveis,
    suspeitos,
    descartados,
    taxaWhatsapp: totalLeads > 0 ? Math.round((noWhatsapp / totalLeads) * 100) : 0,
    dispositivos,
    navegadores,
    sistemas,
    paises,
    ufs,
    cidades,
  };
}
