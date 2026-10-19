import { classificarUserAgent } from "@/lib/ua";

/**
 * Motor antifraude.
 *
 * Regras determinísticas e auditáveis — nada de "caixa-preta". Cada regra soma
 * pontos de risco; o total define o status do lead. Nenhuma informação é usada
 * para servir conteúdo diferente: a página é idêntica para todos (o que também
 * mantém o site em conformidade com as políticas de anúncios).
 */

export const QUALIDADES = ["confiavel", "suspeito", "descartado"] as const;
export type Qualidade = (typeof QUALIDADES)[number];

export const ROTULO_QUALIDADE: Record<Qualidade, string> = {
  confiavel: "✅ Confiável",
  suspeito: "⚠️ Suspeito",
  descartado: "🚫 Descartado",
};

export interface SinaisAntifraude {
  readonly userAgent: string;
  /** `sec-ch-ua` presente indica navegador real (robôs raramente enviam). */
  readonly temClientHints?: boolean;
  readonly pais?: string;
  readonly email?: string;
  readonly honeypot?: boolean;
  /** Tempo entre a primeira entrada e o clique, em milissegundos. */
  readonly intervaloMs?: number;
  /** O telefone informado já apareceu em outro lead. */
  readonly telefoneRepetido?: boolean;
  /** Requisições do mesmo IP na janela recente. */
  readonly requisicoesRecentes?: number;
}

export interface Avaliacao {
  readonly risco: number;
  readonly qualidade: Qualidade;
  readonly motivos: readonly string[];
}

const LIMIAR_DESCARTE = 60;
const LIMIAR_SUSPEITA = 30;

const DOMINIOS_DESCARTAVEIS = new Set([
  "mailinator.com",
  "guerrillamail.com",
  "guerrillamail.net",
  "10minutemail.com",
  "10minutemail.net",
  "tempmail.com",
  "temp-mail.org",
  "yopmail.com",
  "sharklasers.com",
  "trashmail.com",
  "getnada.com",
  "dispostable.com",
  "maildrop.cc",
  "throwawaymail.com",
  "fakeinbox.com",
]);

function dominioDescartavel(email: string): boolean {
  const dominio = email.split("@")[1]?.toLowerCase().trim();
  return dominio ? DOMINIOS_DESCARTAVEIS.has(dominio) : false;
}

/** Avalia os sinais e devolve risco (0-100), qualidade e os motivos. */
export function avaliarSinais(sinais: SinaisAntifraude): Avaliacao {
  const ua = (sinais.userAgent ?? "").trim();
  const classificacao = classificarUserAgent(ua);
  let risco = 0;
  const motivos: string[] = [];

  if (sinais.honeypot) {
    return { risco: 100, qualidade: "descartado", motivos: ["campo-armadilha preenchido"] };
  }

  if (ua.length === 0) {
    risco += 30;
    motivos.push("user-agent ausente");
  } else if (classificacao.bot) {
    risco += classificacao.crawlerConhecido ? 35 : 70;
    motivos.push(
      classificacao.crawlerConhecido ? "crawler conhecido" : "automação/navegador headless",
    );
  }

  if (classificacao.bot && classificacao.navegador === "Automação") {
    risco += 10;
    motivos.push("user-agent de biblioteca HTTP");
  }

  // Chrome real envia Client Hints; UA "Chrome" sem hints costuma ser forjado.
  if (
    sinais.temClientHints === false &&
    /chrome\/|crios/.test(ua.toLowerCase()) &&
    !classificacao.bot
  ) {
    risco += 15;
    motivos.push("user-agent inconsistente (sem client hints)");
  }

  if (sinais.pais && sinais.pais !== "Não identificado" && sinais.pais !== "BR") {
    risco += 30;
    motivos.push(`acesso fora do Brasil (${sinais.pais})`);
  }

  if (sinais.email && dominioDescartavel(sinais.email)) {
    risco += 30;
    motivos.push("e-mail descartável");
  }

  if (sinais.telefoneRepetido) {
    risco += 25;
    motivos.push("telefone já usado em outro lead");
  }

  if (typeof sinais.intervaloMs === "number" && sinais.intervaloMs >= 0) {
    if (sinais.intervaloMs < 700) {
      risco += 15;
      motivos.push("clique rápido demais para um humano");
    } else if (sinais.intervaloMs > 3 * 60 * 60 * 1_000) {
      risco += 5;
      motivos.push("sessão muito antiga");
    }
  }

  if (typeof sinais.requisicoesRecentes === "number" && sinais.requisicoesRecentes > 20) {
    risco += 20;
    motivos.push("volume alto de requisições do mesmo IP");
  }

  const limitado = Math.min(100, risco);
  const qualidade: Qualidade =
    limitado >= LIMIAR_DESCARTE
      ? "descartado"
      : limitado >= LIMIAR_SUSPEITA
        ? "suspeito"
        : "confiavel";

  return { risco: limitado, qualidade, motivos };
}

/** Leads descartados não geram notificação no Telegram (evita spam). */
export function deveNotificar(qualidade: Qualidade): boolean {
  return qualidade !== "descartado";
}
