import { sanitizeUtm, type UtmParams } from "./br";

/**
 * Rastreamento de leads no navegador.
 *
 * - Sem cookies de terceiros: apenas um identificador aleatório em
 *   `localStorage` para reconhecer visitas do mesmo aparelho.
 * - Nenhum dado pessoal é coletado aqui: telefone/CPF só existem quando o
 *   próprio visitante (ou o administrador) informa.
 */

const CHAVE_SESSAO = "nio.lead.v1";
const INTERVALO_MINIMO_MS = 600;

export interface SessaoLead {
  readonly id: string;
  readonly primeiraVisita: string;
  visitas: number;
  readonly utm: UtmParams;
  readonly referencia?: string;
  readonly entrada: string;
}

let sessao: SessaoLead | null = null;
let iniciado = false;
let ultimoEnvio = 0;

function ehNavegador(): boolean {
  return typeof window !== "undefined" && typeof document !== "undefined";
}

function novoId(): string {
  if (typeof crypto.randomUUID === "function") return crypto.randomUUID();
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

function lerSessao(): SessaoLead | null {
  try {
    const bruto = window.localStorage.getItem(CHAVE_SESSAO);
    if (!bruto) return null;
    const dados = JSON.parse(bruto) as Partial<SessaoLead>;
    if (typeof dados.id !== "string" || !/^[0-9a-f-]{36}$/i.test(dados.id)) return null;
    return {
      id: dados.id,
      primeiraVisita:
        typeof dados.primeiraVisita === "string" ? dados.primeiraVisita : new Date().toISOString(),
      visitas: typeof dados.visitas === "number" ? dados.visitas : 0,
      utm: sanitizeUtm(dados.utm ?? {}),
      ...(typeof dados.referencia === "string" ? { referencia: dados.referencia } : {}),
      entrada: typeof dados.entrada === "string" ? dados.entrada : "/",
    };
  } catch {
    return null;
  }
}

function salvarSessao(valor: SessaoLead): void {
  try {
    window.localStorage.setItem(CHAVE_SESSAO, JSON.stringify(valor));
  } catch {
    /* modo privado / cota cheia: o rastreamento segue sem persistir */
  }
}

interface CorpoEvento {
  id: string;
  evento: string;
  caminho: string;
  rotulo?: string;
  utm?: UtmParams;
  referencia?: string;
  website?: string;
  intervaloMs?: number;
}

function enviar(corpo: CorpoEvento): void {
  if (!ehNavegador()) return;
  const agora = Date.now();
  if (corpo.evento !== "saida" && agora - ultimoEnvio < INTERVALO_MINIMO_MS) return;
  ultimoEnvio = agora;

  const dados = JSON.stringify({ ...corpo, website: "" });

  try {
    const blob = new Blob([dados], { type: "application/json" });
    if (navigator.sendBeacon?.("/api/lead", blob)) return;
  } catch {
    /* sendBeacon indisponível: cai no fetch */
  }

  void fetch("/api/lead", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: dados,
    keepalive: true,
    credentials: "same-origin",
  }).catch(() => undefined);
}

function corpoBase(): CorpoEvento | null {
  if (!sessao) return null;
  return {
    id: sessao.id,
    evento: "visualizacao",
    caminho: window.location.pathname,
    ...(Object.keys(sessao.utm).length > 0 ? { utm: sessao.utm } : {}),
    ...(sessao.referencia ? { referencia: sessao.referencia } : {}),
  };
}

/** Registra o clique e o destino do WhatsApp antes de o navegador sair. */
function rastrearClique(alvo: Element, rotulo?: string): void {
  const base = corpoBase();
  if (!base) return;

  // Tempo desde a primeira visita: sinal antifraude (clique humano não é imediato).
  const inicio = sessao ? Date.parse(sessao.primeiraVisita) : Number.NaN;
  const intervaloMs = Number.isFinite(inicio) ? Math.max(0, Date.now() - inicio) : undefined;

  const linkWhatsapp = alvo.closest('a[href*="wa.me"], a[href*="api.whatsapp.com"]');
  if (linkWhatsapp) {
    enviar({
      ...base,
      evento: "clique_whatsapp",
      ...(rotulo ? { rotulo } : {}),
      ...(typeof intervaloMs === "number" ? { intervaloMs } : {}),
    });
    return;
  }

  if (rotulo?.startsWith("situacao")) {
    enviar({ ...base, evento: "clique_situacao", rotulo });
    return;
  }
  if (rotulo?.startsWith("servico")) {
    enviar({ ...base, evento: "clique_servico", rotulo });
  }
}

/** Inicializa o rastreamento uma única vez por carregamento de página. */
export function iniciarRastreamento(): void {
  if (!ehNavegador() || iniciado) return;
  iniciado = true;

  const existente = lerSessao();
  const parametros = new URLSearchParams(window.location.search);
  const utm: UtmParams = sanitizeUtm(Object.fromEntries(parametros.entries()));

  sessao = existente
    ? { ...existente, visitas: existente.visitas + 1 }
    : {
        id: novoId(),
        primeiraVisita: new Date().toISOString(),
        visitas: 1,
        utm,
        ...(document.referrer ? { referencia: document.referrer.slice(0, 300) } : {}),
        entrada: window.location.pathname,
      };

  salvarSessao(sessao);

  const base = corpoBase();
  if (base) {
    enviar({ ...base, evento: existente ? "visualizacao" : "entrada" });
  }

  document.addEventListener(
    "click",
    (evento) => {
      const alvo = evento.target instanceof Element ? evento.target : null;
      if (!alvo) return;
      const marcado = alvo.closest("[data-nio]");
      const rotulo = marcado instanceof HTMLElement ? marcado.dataset["nio"] : undefined;
      rastrearClique(alvo, rotulo);
    },
    { capture: true, passive: true },
  );

  let saidaRegistrada = false;
  const registrarSaida = () => {
    if (saidaRegistrada) return;
    saidaRegistrada = true;
    const base = corpoBase();
    if (!base) return;
    const inicio = sessao ? Date.parse(sessao.primeiraVisita) : Number.NaN;
    const segundos = Number.isFinite(inicio)
      ? Math.max(1, Math.round((Date.now() - inicio) / 1000))
      : undefined;
    enviar({
      ...base,
      evento: "saida",
      ...(typeof segundos === "number" ? { rotulo: `${segundos}s no site` } : {}),
    });
  };

  window.addEventListener("pagehide", registrarSaida, { capture: true, passive: true });
}

/** Exposto para o painel administrativo e para testes. */
export function leadAtual(): Readonly<SessaoLead> | null {
  return sessao;
}
