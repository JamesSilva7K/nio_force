import { hmacSignature, verificarAssinatura } from "../crypto";
import { getConfig } from "../env";
import type { Lead } from "../store/types";
import type { BotaoInline, TecladoInline } from "./api";

/**
 * Ações do painel. Todas chegam por `callback_query` (clique em botão) — o bot
 * não depende de comandos digitados e responde no mesmo lugar, sem spammar.
 *
 * A: aprovar solicitação (super-admin)
 * R: rejeitar solicitação (super-admin)
 */
export const ACOES = [
  "m",
  "s",
  "g",
  "v",
  "q",
  "l",
  "d",
  "e",
  "n",
  "c",
  "p",
  "o",
  "w",
  "A",
  "R",
  "T",
  "F",
] as const;
export type Acao = (typeof ACOES)[number];

const VERSAO = "1";
const BYTES_ASSINATURA = 10;

function ehAcao(valor: string): valor is Acao {
  return (ACOES as readonly string[]).includes(valor);
}

function segredo(): string {
  const { telegram } = getConfig();
  const chave = telegram.callbackSecret || telegram.token;
  if (!chave) throw new Error("Segredo de assinatura do Telegram não configurado.");
  return chave;
}

/** `versao|acao|payload|assinatura` — a assinatura impede botões forjados. */
export async function assinarCallback(acao: Acao, payload: string): Promise<string> {
  const assinatura = await hmacSignature(segredo(), `${acao}|${payload}`, BYTES_ASSINATURA);
  return [VERSAO, acao, payload, assinatura].join("|");
}

export interface CallbackValidado {
  readonly acao: Acao;
  readonly payload: string;
}

export async function lerCallback(dados: string): Promise<CallbackValidado | null> {
  const partes = dados.split("|");
  if (partes.length !== 4) return null;

  const [versao, acao, payload, assinatura] = partes;
  if (versao !== VERSAO || !acao || !payload || !assinatura) return null;
  if (!ehAcao(acao)) return null;
  // UUID tem 36 chars; IDs de lead (UUID) também. 46 é o máximo seguro para ambos.
  if (payload.length > 46) return null;

  const valida = await verificarAssinatura(
    segredo(),
    `${acao}|${payload}`,
    assinatura,
    BYTES_ASSINATURA,
  );
  return valida ? { acao, payload } : null;
}

async function botao(texto: string, acao: Acao, payload: string): Promise<BotaoInline> {
  return { text: texto, callback_data: await assinarCallback(acao, payload) };
}

/** Menu principal. */
export async function tecladoMenu(): Promise<TecladoInline> {
  return {
    inline_keyboard: [
      [await botao("📊 Métricas", "s", "agora"), await botao("📍 Localidades", "g", "geo")],
      [await botao("📱 Dispositivos", "v", "dev"), await botao("🌱 Qualidade", "q", "qual")],
      [await botao("👥 Visitantes", "l", "0"), await botao("⚙️ Identidade do Site", "T", "ver")],
    ],
  };
}

/** Teclado de personalização do site (Título, Favicon, WhatsApp). */
export async function tecladoIdentidadeSite(): Promise<TecladoInline> {
  return {
    inline_keyboard: [
      [await botao("✏️ Alterar Título", "T", "mudar"), await botao("🖼️ Alterar Favicon", "F", "mudar")],
      [await botao("☎️ Nº do WhatsApp", "o", "site")],
      [await botao("🔄 Recarregar", "T", "ver"), await botao("🏠 Menu", "m", "home")],
    ],
  };
}

/** Telas de métricas: sempre um caminho de volta. */
export async function tecladoSecao(): Promise<TecladoInline> {
  return {
    inline_keyboard: [
      [await botao("🔄 Atualizar", "s", "agora"), await botao("📍 Localidades", "g", "geo")],
      [await botao("📱 Dispositivos", "v", "dev"), await botao("🌱 Qualidade", "q", "qual")],
      [await botao("👥 Leads", "l", "0"), await botao("🏠 Menu", "m", "home")],
    ],
  };
}

export async function tecladoVoltar(): Promise<TecladoInline> {
  return {
    inline_keyboard: [
      [await botao("📊 Métricas", "s", "agora"), await botao("📍 Localidades", "g", "geo")],
      [await botao("📱 Dispositivos", "v", "dev"), await botao("🌱 Qualidade", "q", "qual")],
      [await botao("🏠 Menu", "m", "home")],
    ],
  };
}

/** Ficha e ações da sessão do visitante. */
export async function tecladoLead(lead: Lead): Promise<TecladoInline> {
  const id = lead.id;
  return {
    inline_keyboard: [
      [await botao("🔄 Atualizar Sessão", "d", id)],
      [await botao("👥 Ver Outros Acessos", "l", "0"), await botao("🏠 Menu Principal", "m", "home")],
    ],
  };
}

/**
 * Teclado enviado ao super-admin para aprovar ou rejeitar uma solicitação.
 * O payload é o ID da AprovacaoPendente.
 */
export async function tecladoAprovacao(aprovacaoId: string): Promise<TecladoInline> {
  return {
    inline_keyboard: [
      [
        await botao("✅ Aprovar", "A", aprovacaoId),
        await botao("❌ Rejeitar", "R", aprovacaoId),
      ],
    ],
  };
}

export const POR_PAGINA = 5;

export interface PaginaLeads {
  readonly leads: readonly Lead[];
  readonly pagina: number;
  readonly totalPaginas: number;
}

export function paginar(leads: readonly Lead[], pagina: number): PaginaLeads {
  const totalPaginas = Math.max(1, Math.ceil(leads.length / POR_PAGINA));
  const atual = Math.min(Math.max(0, pagina), totalPaginas - 1);
  return {
    leads: leads.slice(atual * POR_PAGINA, atual * POR_PAGINA + POR_PAGINA),
    pagina: atual,
    totalPaginas,
  };
}

export async function tecladoLista(pagina: PaginaLeads): Promise<TecladoInline> {
  const linhas: BotaoInline[][] = [];

  for (const [indice, lead] of pagina.leads.entries()) {
    const nome = lead.nome ?? (lead.whatsapp ? `…${lead.whatsapp.slice(-4)}` : lead.id.slice(0, 8));
    linhas.push([await botao(`${pagina.pagina * POR_PAGINA + indice + 1}. ${nome}`, "d", lead.id)]);
  }

  if (pagina.totalPaginas > 1) {
    linhas.push([
      await botao("◀", "l", String(Math.max(0, pagina.pagina - 1))),
      { text: `${pagina.pagina + 1}/${pagina.totalPaginas}`, callback_data: "noop" },
      await botao("▶", "l", String(Math.min(pagina.totalPaginas - 1, pagina.pagina + 1))),
    ]);
  }

  linhas.push([
    await botao("🔄 Atualizar", "l", String(pagina.pagina)),
    await botao("🏠 Menu", "m", "home"),
  ]);

  return { inline_keyboard: linhas };
}
