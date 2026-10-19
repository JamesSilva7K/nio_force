import { formatBrPhone } from "@/lib/br";

import type { MetricasDetalhadas } from "../metricas";
import type { Lead, RankingItem, SiteConfig } from "../store/types";
import { ETAPA_LABEL, type EventoNome } from "../store/types";
import type { ResultadoVerificacao } from "../whatsapp-verify";
import { ROTULO_QUALIDADE, type Qualidade } from "../antifraude";
import { POR_PAGINA } from "./keyboard";

const FUSO = "America/Sao_Paulo";

const ROTULO_EVENTO: Record<EventoNome, string> = {
  entrada: "Entrou no site",
  visualizacao: "Nova visita",
  clique_servico: "Clicou em serviço",
  clique_situacao: "Clicou em situação",
  clique_whatsapp: "Abriu o WhatsApp",
  numero_atualizado: "Número atualizado",
  contato_manual: "Contato manual",
  observacao: "Observação",
};

/** Escapa texto para o parse_mode HTML do Telegram. */
export function esc(valor: unknown): string {
  return String(valor ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

export function formatarDataHora(iso: string): string {
  const data = new Date(iso);
  if (Number.isNaN(data.getTime())) return "—";
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: FUSO,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(data);
}

export function formatarHora(iso: string): string {
  const data = new Date(iso);
  if (Number.isNaN(data.getTime())) return "—";
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: FUSO,
    hour: "2-digit",
    minute: "2-digit",
  }).format(data);
}

function pct(parte: number, total: number): string {
  if (total <= 0) return "0%";
  return `${Math.round((parte / total) * 100)}%`;
}

function barra(fracao: number): string {
  const cheios = Math.max(0, Math.min(6, Math.round(fracao * 6)));
  return `${"▰".repeat(cheios)}${"▱".repeat(6 - cheios)}`;
}

function ranking(itens: readonly RankingItem[], limite = 8): string {
  if (itens.length === 0) return "  <i>sem dados ainda</i>";
  const maximo = Math.max(...itens.map((item) => item.total), 1);
  return itens
    .slice(0, limite)
    .map((item) => `  ${barra(item.total / maximo)} <b>${esc(item.item)}</b> — ${item.total}`)
    .join("\n");
}

function linha(rotulo: string, valor: string | undefined, vazio = "—"): string {
  return `${rotulo}: <b>${valor && valor.length > 0 ? esc(valor) : vazio}</b>`;
}

function origem(lead: Lead): string {
  const { utm } = lead;
  const partes = [utm.utm_source, utm.utm_medium, utm.utm_campaign].filter(
    (valor): valor is string => typeof valor === "string" && valor.length > 0,
  );
  if (partes.length > 0) return partes.join(" / ");
  if (lead.referencia) return lead.referencia;
  return "direto";
}

function localDoLead(lead: Lead): string {
  const partes = [lead.cidade, lead.uf, lead.pais].filter(
    (valor): valor is string => typeof valor === "string" && valor.length > 0,
  );
  return partes.length > 0 ? partes.join(" · ") : "não identificado";
}

function ultimosEventos(lead: Lead, limite = 5): string {
  if (lead.eventos.length === 0) return "  • sem eventos";
  return lead.eventos
    .slice(-limite)
    .map((evento) => {
      const extra = evento.rotulo ? ` — ${esc(evento.rotulo)}` : "";
      return `  • ${formatarHora(evento.em)} ${ROTULO_EVENTO[evento.nome]}${extra}`;
    })
    .join("\n");
}

/** Tela inicial / menu. */
export function mensagemPainel(dados: MetricasDetalhadas): string {
  return [
    "🥔 <b>Painel Nio</b>",
    "━━━━━━━━━━━━━━━━━━",
    `👣 Acessos: <b>${dados.acessos}</b> (hoje: ${dados.acessosHoje})`,
    `👥 Leads: <b>${dados.totalLeads}</b> (hoje: ${dados.leadsHoje})`,
    `🟢 No WhatsApp: <b>${dados.noWhatsapp}</b> · ${dados.taxaWhatsapp}% dos leads`,
    `✅ Convertidos: <b>${dados.convertidos}</b> · ⚫ Perdidos: <b>${dados.perdidos}</b>`,
    "",
    `🌱 Confiáveis: <b>${dados.confiaveis}</b> · ⚠️ Suspeitos: <b>${dados.suspeitos}</b> · 🚫 Descartados: <b>${dados.descartados}</b>`,
    "",
    `<i>Dados lidos agora: ${formatarDataHora(dados.atualizadoEm)}</i>`,
    "",
    "Escolha uma seção:",
  ].join("\n");
}

export function mensagemMetricas(dados: MetricasDetalhadas): string {
  return [
    "📊 <b>Métricas ao vivo</b>",
    "━━━━━━━━━━━━━━━━━━",
    `👣 Acessos totais: <b>${dados.acessos}</b>`,
    `📅 Acessos hoje: <b>${dados.acessosHoje}</b>`,
    `👥 Leads totais: <b>${dados.totalLeads}</b>`,
    `🆕 Leads hoje: <b>${dados.leadsHoje}</b>`,
    `📲 Cliques no WhatsApp: <b>${dados.cliquesWhatsapp}</b>`,
    `🟢 Chegaram ao WhatsApp: <b>${dados.noWhatsapp}</b> (${dados.taxaWhatsapp}%)`,
    `✅ Convertidos: <b>${dados.convertidos}</b>`,
    `⚫ Perdidos: <b>${dados.perdidos}</b>`,
    "",
    "<b>Dispositivos</b>",
    ranking(dados.dispositivos, 4),
    "",
    `<i>Atualizado em ${formatarDataHora(dados.atualizadoEm)}</i>`,
  ].join("\n");
}

export function mensagemGeo(dados: MetricasDetalhadas): string {
  return [
    "📍 <b>Localidades dos acessos</b>",
    "━━━━━━━━━━━━━━━━━━",
    "<b>Países</b>",
    ranking(dados.paises, 6),
    "",
    "<b>Estados (UF)</b>",
    ranking(dados.ufs, 8),
    "",
    "<b>Cidades</b>",
    ranking(dados.cidades, 8),
    "",
    "<i>Geolocalização por IP fornecida pela borda da hospedagem (Vercel/Cloudflare). Sem esse cabeçalho, o acesso conta como “Não identificado”.</i>",
    "",
    `<i>Atualizado em ${formatarDataHora(dados.atualizadoEm)}</i>`,
  ].join("\n");
}

export function mensagemDispositivos(dados: MetricasDetalhadas): string {
  const total = dados.dispositivos.reduce((soma, item) => soma + item.total, 0);
  const linhas = dados.dispositivos
    .slice(0, 5)
    .map((item) => `  • <b>${esc(item.item)}</b> — ${item.total} (${pct(item.total, total)})`)
    .join("\n");

  return [
    "📱 <b>Desktop × Celular</b>",
    "━━━━━━━━━━━━━━━━━━",
    linhas || "  <i>sem dados ainda</i>",
    "",
    "<b>Navegadores</b>",
    ranking(dados.navegadores, 6),
    "",
    "<b>Sistemas</b>",
    ranking(dados.sistemas, 6),
    "",
    `<i>Total classificado: ${total} acessos</i>`,
    `<i>Atualizado em ${formatarDataHora(dados.atualizadoEm)}</i>`,
  ].join("\n");
}

export function mensagemQualidade(dados: MetricasDetalhadas): string {
  const total = dados.confiaveis + dados.suspeitos + dados.descartados;
  return [
    "🌱 <b>Qualidade dos leads</b>",
    "━━━━━━━━━━━━━━━━━━",
    `✅ Confiáveis: <b>${dados.confiaveis}</b> (${pct(dados.confiaveis, total)})`,
    `⚠️ Suspeitos: <b>${dados.suspeitos}</b> (${pct(dados.suspeitos, total)})`,
    `🚫 Descartados: <b>${dados.descartados}</b> (${pct(dados.descartados, total)})`,
    "",
    "<i>Pontuação antifraude: user-agent, client hints, país, e-mail descartável, telefone repetido, tempo de clique e volume por IP. Leads descartados não geram notificação.</i>",
    "",
    `<i>Atualizado em ${formatarDataHora(dados.atualizadoEm)}</i>`,
  ].join("\n");
}

export function mensagemLista(
  leads: readonly Lead[],
  pagina: number,
  totalPaginas: number,
  total: number,
): string {
  if (leads.length === 0) {
    return "👥 <b>Leads</b>\n\nNenhum lead registrado ainda.";
  }

  const linhas = leads.map((lead, indice) => {
    const nome = lead.nome ?? (lead.whatsapp ? formatBrPhone(lead.whatsapp) : "sem nome");
    const qualidade = lead.qualidade ? ROTULO_QUALIDADE[lead.qualidade] : "—";
    return `${pagina * POR_PAGINA + indice + 1}. <b>${esc(nome)}</b>\n     ${ETAPA_LABEL[lead.etapa]} · ${qualidade} · ${formatarHora(lead.criadoEm)}`;
  });

  return [
    `👥 <b>Leads</b> — ${total} no total`,
    `Página ${pagina + 1}/${totalPaginas}`,
    "━━━━━━━━━━━━━━━━━━",
    linhas.join("\n"),
  ].join("\n");
}

/** Ficha completa do lead. */
export function mensagemLead(lead: Lead, config?: SiteConfig): string {
  const linhas = [
    `${ETAPA_LABEL[lead.etapa]} · <code>#${lead.id.slice(0, 8)}</code>`,
    "━━━━━━━━━━━━━━━━━━",
    linha("👤 Nome", lead.nome),
    linha("📱 WhatsApp", lead.whatsapp ? formatBrPhone(lead.whatsapp) : undefined, "não informado"),
    linha("🆔 CPF", lead.cpf, "não informado"),
    linha("📧 E-mail", lead.email),
    "",
    linha("🕒 Entrada", formatarDataHora(lead.criadoEm)),
    linha("👣 Visitas", String(lead.visitas)),
    linha("🔗 Origem", origem(lead)),
    linha("🌐 Página", lead.paginaEntrada),
    linha("📍 Local", localDoLead(lead)),
    linha(
      "💻 Dispositivo",
      [lead.dispositivo, lead.sistema, lead.navegador].filter(Boolean).join(" · ") || undefined,
    ),
    linha(
      "🌱 Qualidade",
      lead.qualidade ? `${ROTULO_QUALIDADE[lead.qualidade]} (risco ${lead.risco ?? 0})` : undefined,
    ),
    "",
    "<b>Últimos eventos</b>",
    ultimosEventos(lead),
  ];

  if (lead.observacoes) {
    linhas.push("", `<b>📝 Observação</b>\n${esc(lead.observacoes)}`);
  }

  if (config) {
    linhas.push("", `☎️ <i>Número no site: ${esc(formatBrPhone(config.whatsapp))}</i>`);
  }

  linhas.push(
    "",
    `<i>ID interno:</i> <code>${lead.id}</code>`,
    lead.whatsapp
      ? `🔗 wa.me/${lead.whatsapp.replace(/\D+/g, "")}`
      : "🔗 sem número de WhatsApp registrado",
  );

  return linhas.join("\n");
}

/** Notificação de novo lead / transição para o WhatsApp. */
export function mensagemAlerta(lead: Lead): string {
  const titulo =
    lead.etapa === "whatsapp"
      ? "🟢 <b>Lead foi para o WhatsApp</b>"
      : "🆕 <b>Novo lead no site</b>";

  return [
    titulo,
    "",
    linha("👤 Nome", lead.nome, "não informado"),
    linha("📱 WhatsApp", lead.whatsapp ? formatBrPhone(lead.whatsapp) : undefined, "não informado"),
    linha("📍 Local", localDoLead(lead)),
    linha(
      "💻 Dispositivo",
      [lead.dispositivo, lead.sistema, lead.navegador].filter(Boolean).join(" · ") || undefined,
    ),
    linha("🔗 Origem", origem(lead)),
    linha("🕒", formatarDataHora(lead.criadoEm)),
    ...(lead.qualidade
      ? ["", `🌱 ${ROTULO_QUALIDADE[lead.qualidade]} (risco ${lead.risco ?? 0})`]
      : []),
    "",
    `<code>#${lead.id.slice(0, 8)}</code>`,
  ].join("\n");
}

const ROTULO_RESULTADO: Record<ResultadoVerificacao["status"], string> = {
  invalido: "❌ Número inválido",
  formato_valido: "🟡 Formato válido (conta NÃO confirmada)",
  verificado: "✅ Conta WhatsApp confirmada",
  nao_verificado: "⚪ Sem confirmação de conta",
};

export function mensagemVerificacao(lead: Lead, resultado: ResultadoVerificacao): string {
  const aviso =
    resultado.status === "formato_valido"
      ? "<i>O formato é válido, mas nenhum sistema prova que existe conta WhatsApp ativa sem consultar um provedor autorizado. Configure WHATSAPP_VERIFY_URL para confirmar de verdade.</i>"
      : "";

  return [
    "🔎 <b>Verificação de WhatsApp</b>",
    "━━━━━━━━━━━━━━━━━━",
    `Lead: <code>#${lead.id.slice(0, 8)}</code>`,
    `Número: <b>${resultado.numero ? esc(formatBrPhone(resultado.numero)) : "—"}</b>`,
    `Resultado: <b>${ROTULO_RESULTADO[resultado.status]}</b>`,
    `Fonte: <b>${resultado.fonte === "provedor" ? "provedor externo" : "análise local"}</b>`,
    "",
    ...resultado.detalhes.map((detalhe) => `• ${esc(detalhe)}`),
    "",
    ...(aviso ? [aviso, ""] : []),
    `<i>Verificado em ${formatarDataHora(resultado.verificadoEm)}</i>`,
  ].join("\n");
}

export function mensagemPromptNumero(lead: Lead): string {
  return [
    "✏️ <b>Novo WhatsApp do lead</b>",
    "",
    `Lead: <code>#${lead.id.slice(0, 8)}</code>`,
    `Atual: <b>${lead.whatsapp ? esc(formatBrPhone(lead.whatsapp)) : "não informado"}</b>`,
    "",
    "Responda <b>esta mensagem</b> com o número (DDD + número).",
    "Exemplo: <code>11 95386-6646</code>",
  ].join("\n");
}

export function mensagemPromptNota(lead: Lead): string {
  return [
    "📝 <b>Observação do lead</b>",
    "",
    `Lead: <code>#${lead.id.slice(0, 8)}</code>`,
    "",
    "Responda <b>esta mensagem</b> com o texto da observação.",
  ].join("\n");
}

export function mensagemInicio(admin: boolean, superAdmin = false): string {
  if (!admin) {
    return ["🔒 <b>Acesso restrito</b>", "", "Este bot é privado."].join("\n");
  }

  const papel = superAdmin
    ? "👑 <b>Super-Administrador</b> — você pode aprovar ações sensíveis de outros admins."
    : "👤 <b>Administrador</b> — ações sensíveis precisam de aprovação do super-admin.";

  return [
    "🥔 <b>Painel Nio</b>",
    "",
    papel,
    "",
    "Tudo por botões — nenhum comando para decorar.",
    "As respostas editam a própria mensagem, sem encher o chat.",
    "",
    "Toque em <b>📊 Métricas</b> para começar.",
  ].join("\n");
}

/** Compatibilidade com telas antigas. */
export function mensagemAjuda(admin: boolean, superAdmin = false): string {
  return mensagemInicio(admin, superAdmin);
}

export function rotuloQualidade(qualidade: Qualidade | undefined): string {
  return qualidade ? ROTULO_QUALIDADE[qualidade] : "—";
}
