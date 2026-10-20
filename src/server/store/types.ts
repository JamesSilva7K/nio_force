import type { UtmParams } from "@/lib/br";

import type { Qualidade } from "../antifraude";

/** Etapas do funil de atendimento. */
export const ETAPAS = ["entrada", "engajado", "whatsapp", "convertido", "perdido"] as const;
export type Etapa = (typeof ETAPAS)[number];

export const ETAPA_LABEL: Record<Etapa, string> = {
  entrada: "🟡 Entrada",
  engajado: "🟠 Engajado",
  whatsapp: "🟢 Foi para o WhatsApp",
  convertido: "✅ Convertido",
  perdido: "⚫ Perdido",
};

/** Eventos aceitos pela API de rastreamento. */
export const EVENTOS = [
  "entrada",
  "visualizacao",
  "clique_servico",
  "clique_situacao",
  "clique_whatsapp",
  "numero_atualizado",
  "contato_manual",
  "observacao",
  "saida",
] as const;
export type EventoNome = (typeof EVENTOS)[number];

export interface LeadEvento {
  readonly nome: EventoNome;
  readonly em: string;
  readonly rotulo?: string;
  readonly caminho?: string;
}

/** PII em claro — existe apenas em memória, nunca é persistida assim. */
export interface Pii {
  whatsapp?: string;
  cpf?: string;
  nome?: string;
  email?: string;
  observacoes?: string;
}

export interface Lead {
  readonly id: string;
  readonly criadoEm: string;
  readonly atualizadoEm: string;
  readonly etapa: Etapa;
  readonly visitas: number;
  readonly eventos: readonly LeadEvento[];
  readonly utm: UtmParams;
  readonly referencia?: string;
  readonly paginaEntrada: string;
  readonly userAgent?: string;
  readonly ipHash?: string;
  readonly notificacoes: number;
  readonly whatsapp?: string;
  readonly cpf?: string;
  readonly nome?: string;
  readonly email?: string;
  readonly observacoes?: string;
  readonly dispositivo?: string;
  readonly navegador?: string;
  readonly sistema?: string;
  readonly pais?: string;
  readonly uf?: string;
  readonly cidade?: string;
  readonly risco?: number;
  readonly qualidade?: Qualidade;
}

/** Formato persistido: PII vai cifrada no campo `pii`. */
export interface LeadArmazenado {
  readonly id: string;
  readonly criadoEm: string;
  readonly atualizadoEm: string;
  readonly etapa: Etapa;
  readonly visitas: number;
  readonly eventos: readonly LeadEvento[];
  readonly utm: UtmParams;
  readonly referencia?: string;
  readonly paginaEntrada: string;
  readonly userAgent?: string;
  readonly ipHash?: string;
  readonly notificacoes: number;
  readonly pii?: string;
  readonly dispositivo?: string;
  readonly navegador?: string;
  readonly sistema?: string;
  readonly pais?: string;
  readonly uf?: string;
  readonly cidade?: string;
  readonly risco?: number;
  readonly qualidade?: Qualidade;
}

export interface SiteConfig {
  readonly whatsapp: string;
  readonly titulo?: string;
  readonly favicon?: string;
  readonly atualizadoEm: string;
  readonly atualizadoPor?: string;
}

export type PendenteTipo = "numero_lead" | "numero_site" | "observacao" | "titulo_site" | "favicon_site";

export interface PendenteAdmin {
  readonly tipo: PendenteTipo;
  readonly leadId?: string;
  /** Mensagem do bot à qual o administrador precisa responder. */
  readonly mensagemId?: number;
  readonly expiraEm: number;
}

/**
 * Ações que precisam de confirmação do super-administrador antes de executar.
 * O admin regular solicita; o super-admin aprova (✅) ou rejeita (❌).
 */
export type AcaoSuperAdmin =
  | "mudar_numero_site"
  | "mudar_titulo_site"
  | "mudar_favicon_site"
  | "converter_lead"
  | "perder_lead"
  | "usar_numero_lead_no_site";

export interface AprovacaoPendente {
  readonly id: string;
  readonly acao: AcaoSuperAdmin;
  /** Chat ID de quem solicitou (admin regular). */
  readonly solicitanteChatId: number;
  readonly solicitanteNome: string;
  /** ID da mensagem enviada ao super-admin para aprovar/rejeitar. */
  readonly mensagemSuperAdminId?: number;
  /** Dados necessários para executar a ação após aprovação. */
  readonly payload: Record<string, string>;
  readonly criadaEm: number;
  readonly expiraEm: number;
}

export interface RateLimitResult {
  readonly permitido: boolean;
  readonly restante: number;
  readonly reiniciaEm: number;
}

export interface RankingItem {
  readonly item: string;
  readonly total: number;
}

export interface LeadStore {
  readonly nome: string;
  obterLead(id: string): Promise<LeadArmazenado | null>;
  salvarLead(lead: LeadArmazenado): Promise<void>;
  listarIds(limite: number): Promise<string[]>;
  contarLeads(): Promise<number>;
  incrementar(contador: string, por?: number): Promise<number>;
  obterContador(contador: string): Promise<number>;
  /** Ranking ordenado (cidade, dispositivo, navegador...). */
  incrementarRanking(ranking: string, item: string, por?: number): Promise<void>;
  topRanking(ranking: string, limite: number): Promise<RankingItem[]>;
  obterConfig(): Promise<SiteConfig | null>;
  salvarConfig(config: SiteConfig): Promise<void>;
  /** Índice cego (hash) para localizar lead por telefone/CPF sem varrer tudo. */
  indexar(tipo: "tel" | "cpf", hash: string, leadId: string): Promise<void>;
  buscarPorIndice(tipo: "tel" | "cpf", hash: string): Promise<string | null>;
  definirPendente(chatId: number, pendente: PendenteAdmin | null): Promise<void>;
  obterPendente(chatId: number): Promise<PendenteAdmin | null>;
  limiteTaxa(chave: string, limite: number, janelaSegundos: number): Promise<RateLimitResult>;
  /** Fila de aprovações aguardando o super-admin. */
  salvarAprovacao(aprovacao: AprovacaoPendente): Promise<void>;
  obterAprovacao(id: string): Promise<AprovacaoPendente | null>;
  removerAprovacao(id: string): Promise<void>;
}

/** Data local (America/Sao_Paulo) no formato AAAA-MM-DD, usada em contadores. */
export function diaLocal(data: Date = new Date()): string {
  const formato = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  return formato.format(data);
}
