import { estadoDoNumero, formatBrPhone, isCelularBr, normalizeBrPhone, onlyDigits } from "@/lib/br";

import { lerEnv } from "./env";

/**
 * Verificação de WhatsApp.
 *
 * Duas camadas, com rótulos honestos:
 *
 * 1. **Local** (sempre roda): valida DDD real, nono dígito, faixa de celular,
 *    UF do número e padrões claramente fictícios. Isso NÃO prova que existe uma
 *    conta WhatsApp — prova que o número é plausível.
 * 2. **Provedor** (opcional): se `WHATSAPP_VERIFY_URL` e `WHATSAPP_VERIFY_TOKEN`
 *    estiverem configurados, consulta um serviço que realmente confirma a conta
 *    (Meta Cloud API com WABA aprovada, ou verificador contratado).
 *
 * Sem provedor, o sistema nunca afirma "conta verificada" — ele diz o que sabe.
 */

export type StatusWhatsapp = "invalido" | "formato_valido" | "verificado" | "nao_verificado";

export const ROTULO_WHATSAPP: Record<StatusWhatsapp, string> = {
  invalido: "❌ Número inválido",
  formato_valido: "🟡 Formato válido (conta não confirmada)",
  verificado: "✅ Conta WhatsApp confirmada",
  nao_verificado: "⚪ Sem confirmação de conta",
};

export interface ResultadoVerificacao {
  readonly numero: string;
  readonly status: StatusWhatsapp;
  readonly fonte: "local" | "provedor";
  readonly detalhes: readonly string[];
  readonly verificadoEm: string;
}

const TIMEOUT_MS = 6_000;

const DDD_GRANDES_CAPITAIS = new Set(["11", "21", "31", "41", "51", "61", "71", "81", "85"]);

function padroesSuspeitos(local: string): string[] {
  const avisos: string[] = [];
  const assinante = local.slice(2);

  if (/^(\d)\1+$/.test(assinante)) {
    avisos.push("sequência repetida no número (padrão de número fictício)");
  }
  if (
    "0123456789".includes(assinante.slice(0, 4)) ||
    "9876543210".includes(assinante.slice(0, 4))
  ) {
    avisos.push("sequência numérica no início do assinante");
  }

  const distintos = new Set(assinante.split("")).size;
  if (distintos <= 3) {
    avisos.push("pouca variação de dígitos");
  }

  return avisos;
}

function avaliacaoLocal(numero: string | null): ResultadoVerificacao {
  const agora = new Date().toISOString();

  if (!numero) {
    return {
      numero: "",
      status: "invalido",
      fonte: "local",
      detalhes: [
        "Não é um telefone brasileiro válido (DDD inexistente, quantidade de dígitos errada ou nono dígito ausente em celular).",
      ],
      verificadoEm: agora,
    };
  }

  const local = onlyDigits(numero).replace(/^55/, "");
  const ddd = local.slice(0, 2);
  const uf = estadoDoNumero(numero);
  const detalhes: string[] = [
    `Número normalizado: ${formatBrPhone(numero)}`,
    uf ? `DDD ${ddd} — ${uf}` : `DDD ${ddd}`,
  ];

  if (!DDD_GRANDES_CAPITAIS.has(ddd)) {
    detalhes.push("DDD fora das grandes capitais");
  }

  if (!isCelularBr(numero)) {
    detalhes.push(
      "É um telefone fixo: WhatsApp só existe se for conta Business cadastrada nesse fixo.",
    );
    return {
      numero,
      status: "formato_valido",
      fonte: "local",
      detalhes,
      verificadoEm: agora,
    };
  }

  detalhes.push("Celular com nono dígito — formato aceito pelo WhatsApp.");
  const avisos = padroesSuspeitos(local);
  detalhes.push(...avisos);

  return {
    numero,
    status: "formato_valido",
    fonte: "local",
    detalhes,
    verificadoEm: agora,
  };
}

interface RespostaProvedor {
  readonly existe?: unknown;
  readonly exists?: unknown;
  readonly valido?: unknown;
  readonly detalhe?: unknown;
}

/** Consulta o provedor externo, quando configurado. Nunca lança. */
async function consultarProvedor(numero: string): Promise<ResultadoVerificacao | null> {
  const url = lerEnv("WHATSAPP_VERIFY_URL");
  const token = lerEnv("WHATSAPP_VERIFY_TOKEN");
  if (!url || !token) return null;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  const agora = new Date().toISOString();

  try {
    const resposta = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ numero, phone: numero, e164: `+${numero}` }),
      signal: controller.signal,
      cache: "no-store",
    });

    if (!resposta.ok) {
      return {
        numero,
        status: "nao_verificado",
        fonte: "provedor",
        detalhes: [`Provedor respondeu HTTP ${resposta.status}.`],
        verificadoEm: agora,
      };
    }

    const dados = (await resposta.json()) as RespostaProvedor;
    const existe = dados.existe ?? dados.exists ?? dados.valido;
    const detalhe = typeof dados.detalhe === "string" ? [dados.detalhe] : [];

    if (existe === true) {
      return {
        numero,
        status: "verificado",
        fonte: "provedor",
        detalhes: ["Provedor confirmou conta WhatsApp ativa para este número.", ...detalhe],
        verificadoEm: agora,
      };
    }
    if (existe === false) {
      return {
        numero,
        status: "nao_verificado",
        fonte: "provedor",
        detalhes: ["Provedor não encontrou conta WhatsApp neste número.", ...detalhe],
        verificadoEm: agora,
      };
    }
    return {
      numero,
      status: "nao_verificado",
      fonte: "provedor",
      detalhes: ["Provedor respondeu em formato inesperado.", ...detalhe],
      verificadoEm: agora,
    };
  } catch (erro) {
    return {
      numero,
      status: "nao_verificado",
      fonte: "provedor",
      detalhes: [
        erro instanceof Error && erro.name === "AbortError"
          ? "Provedor não respondeu no tempo limite."
          : "Falha de rede ao consultar o provedor.",
      ],
      verificadoEm: agora,
    };
  } finally {
    clearTimeout(timer);
  }
}

/** Executa a verificação completa (local + provedor, se houver). */
export async function verificarWhatsapp(entrada: string): Promise<ResultadoVerificacao> {
  const numero = normalizeBrPhone(entrada);
  const local = avaliacaoLocal(numero);

  if (local.status === "invalido") return local;

  const remoto = await consultarProvedor(numero as string);
  if (!remoto) return local;

  // O provedor é a fonte mais forte; a análise local vira detalhe complementar.
  return {
    ...remoto,
    detalhes: [...remoto.detalhes, ...local.detalhes],
  };
}
