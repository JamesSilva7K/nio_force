import {
  isValidCpf,
  isValidEmail,
  normalizeBrPhone,
  onlyDigits,
  sanitizeNome,
  sanitizeTexto,
  sanitizeUtm,
} from "@/lib/br";

import { novoUuid } from "./crypto";
import { getConfig } from "./env";
import { ErroNaoEncontrado, ErroValidacao } from "./errors";
import { cifrarPii, decifrarPii, hashBusca } from "./seguranca";
import { getStore } from "./store";
import type { Qualidade } from "./antifraude";
import {
  diaLocal,
  EVENTOS,
  type Etapa,
  type EventoNome,
  type Lead,
  type LeadArmazenado,
  type LeadEvento,
  type Pii,
  type SiteConfig,
} from "./store/types";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_EVENTOS = 40;
const MAX_CAMINHO = 200;
const MAX_REFERENCIA = 300;

export interface ContextoRastreamento {
  readonly ipHash: string;
  readonly userAgent: string;
  readonly dispositivo?: string;
  readonly navegador?: string;
  readonly sistema?: string;
  readonly pais?: string;
  readonly uf?: string;
  readonly cidade?: string;
  readonly risco?: number;
  readonly qualidade?: Qualidade;
}

/** Campos técnicos (não pessoais) copiados para o lead. */
function camposDeAcesso(fonte: {
  readonly dispositivo?: string;
  readonly navegador?: string;
  readonly sistema?: string;
  readonly pais?: string;
  readonly uf?: string;
  readonly cidade?: string;
  readonly risco?: number;
  readonly qualidade?: Qualidade;
}): Partial<LeadArmazenado> {
  return {
    ...(fonte.dispositivo ? { dispositivo: fonte.dispositivo } : {}),
    ...(fonte.navegador ? { navegador: fonte.navegador } : {}),
    ...(fonte.sistema ? { sistema: fonte.sistema } : {}),
    ...(fonte.pais ? { pais: fonte.pais } : {}),
    ...(fonte.uf ? { uf: fonte.uf } : {}),
    ...(fonte.cidade ? { cidade: fonte.cidade } : {}),
    ...(typeof fonte.risco === "number" ? { risco: fonte.risco } : {}),
    ...(fonte.qualidade ? { qualidade: fonte.qualidade } : {}),
  };
}

/** Payload cru recebido em POST /api/lead — tudo é validado aqui. */
export interface EntradaRastreamento {
  readonly id?: unknown;
  readonly evento?: unknown;
  readonly caminho?: unknown;
  readonly rotulo?: unknown;
  readonly utm?: unknown;
  readonly referencia?: unknown;
  readonly whatsapp?: unknown;
  readonly cpf?: unknown;
  readonly nome?: unknown;
  readonly email?: unknown;
}

export interface ResultadoRastreamento {
  readonly lead: Lead;
  readonly criado: boolean;
}

function lerEvento(valor: unknown): EventoNome | null {
  if (typeof valor !== "string") return null;
  return (EVENTOS as readonly string[]).includes(valor) ? (valor as EventoNome) : null;
}

function lerCaminho(valor: unknown): string | undefined {
  if (typeof valor !== "string") return undefined;
  const caminho = valor.trim();
  if (!caminho.startsWith("/") || caminho.length > MAX_CAMINHO) return undefined;
  return caminho;
}

function lerReferencia(valor: unknown): string | undefined {
  if (typeof valor !== "string" || valor.trim().length === 0) return undefined;
  return sanitizeTexto(valor, MAX_REFERENCIA);
}

function calcularEtapa(atual: Etapa, evento: EventoNome): Etapa {
  if (atual === "convertido" || atual === "perdido") return atual;

  switch (evento) {
    case "clique_whatsapp":
      return "whatsapp";
    case "clique_servico":
    case "clique_situacao":
      return atual === "whatsapp" ? "whatsapp" : "engajado";
    case "numero_atualizado":
      return atual === "entrada" ? "engajado" : atual;
    default:
      return atual;
  }
}

function montarLead(armazenado: LeadArmazenado, pii: Pii): Lead {
  return {
    id: armazenado.id,
    criadoEm: armazenado.criadoEm,
    atualizadoEm: armazenado.atualizadoEm,
    etapa: armazenado.etapa,
    visitas: armazenado.visitas,
    eventos: armazenado.eventos,
    utm: armazenado.utm,
    paginaEntrada: armazenado.paginaEntrada,
    notificacoes: armazenado.notificacoes,
    ...(armazenado.referencia ? { referencia: armazenado.referencia } : {}),
    ...(armazenado.userAgent ? { userAgent: armazenado.userAgent } : {}),
    ...(armazenado.ipHash ? { ipHash: armazenado.ipHash } : {}),
    ...(pii.whatsapp ? { whatsapp: pii.whatsapp } : {}),
    ...(pii.cpf ? { cpf: pii.cpf } : {}),
    ...(pii.nome ? { nome: pii.nome } : {}),
    ...(pii.email ? { email: pii.email } : {}),
    ...(pii.observacoes ? { observacoes: pii.observacoes } : {}),
    ...camposDeAcesso(armazenado),
  };
}

/** Normaliza os campos pessoais recebidos; ignora silenciosamente os inválidos. */
function extrairPii(entrada: EntradaRastreamento): Pii {
  const pii: Pii = {};

  if (typeof entrada.whatsapp === "string") {
    const numero = normalizeBrPhone(entrada.whatsapp);
    if (numero) pii.whatsapp = numero;
  }
  if (typeof entrada.cpf === "string") {
    const cpf = onlyDigits(entrada.cpf);
    if (isValidCpf(cpf)) pii.cpf = cpf;
  }
  if (typeof entrada.nome === "string") {
    const nome = sanitizeNome(entrada.nome);
    if (nome) pii.nome = nome;
  }
  if (typeof entrada.email === "string" && isValidEmail(entrada.email)) {
    pii.email = entrada.email.trim().toLowerCase();
  }
  return pii;
}

async function indexarPii(leadId: string, pii: Pii): Promise<void> {
  const store = getStore();
  if (pii.whatsapp) await store.indexar("tel", await hashBusca(pii.whatsapp), leadId);
  if (pii.cpf) await store.indexar("cpf", await hashBusca(pii.cpf), leadId);
}

/** Registra um evento de rastreamento e devolve o lead consolidado. */
export async function registrarEvento(
  entrada: EntradaRastreamento,
  contexto: ContextoRastreamento,
): Promise<ResultadoRastreamento> {
  const evento = lerEvento(entrada.evento);
  if (!evento) throw new ErroValidacao("Evento de rastreamento inválido.");

  const store = getStore();
  const idInformado =
    typeof entrada.id === "string" && UUID_RE.test(entrada.id) ? entrada.id.toLowerCase() : null;
  const id = idInformado ?? novoUuid();
  const agora = new Date().toISOString();

  const existente = await store.obterLead(id);
  const criado = existente === null;
  const piiAnterior = existente ? await decifrarPii(existente.pii) : {};
  const pii: Pii = { ...piiAnterior, ...extrairPii(entrada) };

  const rotulo = typeof entrada.rotulo === "string" ? sanitizeTexto(entrada.rotulo, 80) : undefined;
  const caminho = lerCaminho(entrada.caminho);
  const referencia = lerReferencia(entrada.referencia) ?? existente?.referencia;
  const novoEvento: LeadEvento = {
    nome: evento,
    em: agora,
    ...(rotulo ? { rotulo } : {}),
    ...(caminho ? { caminho } : {}),
  };

  const eventos = [...(existente?.eventos ?? []), novoEvento].slice(-MAX_EVENTOS);
  const etapaAnterior: Etapa = existente?.etapa ?? "entrada";
  const etapa = calcularEtapa(etapaAnterior, evento);
  const contaVisita = evento === "entrada" || evento === "visualizacao";
  const utm = sanitizeUtm(entrada.utm);

  const armazenado: LeadArmazenado = {
    // Dados de dispositivo/geo/risco: preserva os do primeiro acesso.
    ...camposDeAcesso(existente ?? contexto),
    id,
    criadoEm: existente?.criadoEm ?? agora,
    atualizadoEm: agora,
    etapa,
    visitas: (existente?.visitas ?? 0) + (contaVisita ? 1 : 0),
    eventos,
    // Mantém a atribuição de primeiro toque; só grava UTM nova quando não havia.
    utm: existente && Object.keys(existente.utm).length > 0 ? existente.utm : utm,
    paginaEntrada: existente?.paginaEntrada ?? caminho ?? "/",
    notificacoes: existente?.notificacoes ?? 0,
    ...(referencia ? { referencia } : {}),
    ...(contexto.userAgent ? { userAgent: contexto.userAgent.slice(0, 300) } : {}),
    ...(contexto.ipHash ? { ipHash: contexto.ipHash } : {}),
  };

  const envelope = Object.keys(pii).length > 0 ? await cifrarPii(pii) : null;
  const paraSalvar: LeadArmazenado = envelope ? { ...armazenado, pii: envelope } : armazenado;

  await store.salvarLead(paraSalvar);
  await indexarPii(id, pii);

  if (criado) {
    await store.incrementar(`dia:${diaLocal()}`);
    await store.incrementar(`qualidade:${contexto.qualidade ?? "confiavel"}`);
  }
  if (evento === "clique_whatsapp") {
    await store.incrementar("evento:clique_whatsapp");
  }
  if (
    etapa !== etapaAnterior &&
    (etapa === "whatsapp" || etapa === "convertido" || etapa === "perdido")
  ) {
    await store.incrementar(`etapa:${etapa}`);
  }

  return { lead: montarLead(paraSalvar, pii), criado };
}

export async function obterLead(id: string): Promise<Lead | null> {
  if (!UUID_RE.test(id)) return null;
  const armazenado = await getStore().obterLead(id.toLowerCase());
  if (!armazenado) return null;
  return montarLead(armazenado, await decifrarPii(armazenado.pii));
}

/** Busca por id (UUID), telefone ou CPF. */
export async function buscarLead(termo: string): Promise<Lead | null> {
  const valor = termo.trim();
  if (UUID_RE.test(valor)) return await obterLead(valor);

  const digitos = onlyDigits(valor);
  const store = getStore();

  if (digitos.length === 11) {
    const porCpf = await store.buscarPorIndice("cpf", await hashBusca(digitos));
    if (porCpf) return await obterLead(porCpf);
  }

  const telefone = normalizeBrPhone(valor);
  if (telefone) {
    const porTelefone = await store.buscarPorIndice("tel", await hashBusca(telefone));
    if (porTelefone) return await obterLead(porTelefone);
  }

  return null;
}

/** Verdadeiro quando o número já aparece em outro lead (índice cego). */
export async function telefoneJaRegistrado(numero: string): Promise<boolean> {
  const tel = normalizeBrPhone(numero);
  if (!tel) return false;
  const leadId = await getStore().buscarPorIndice("tel", await hashBusca(tel));
  return Boolean(leadId);
}

async function carregarParaEdicao(id: string): Promise<{ armazenado: LeadArmazenado; pii: Pii }> {
  if (!UUID_RE.test(id)) throw new ErroValidacao("Identificador de lead inválido.");
  const armazenado = await getStore().obterLead(id.toLowerCase());
  if (!armazenado) throw new ErroNaoEncontrado("Lead não encontrado.");
  return { armazenado, pii: await decifrarPii(armazenado.pii) };
}

async function persistirEdicao(
  armazenado: LeadArmazenado,
  pii: Pii,
  evento: LeadEvento,
  etapa: Etapa = armazenado.etapa,
  notificacoes = armazenado.notificacoes,
): Promise<Lead> {
  const envelope = Object.keys(pii).length > 0 ? await cifrarPii(pii) : null;
  const atualizado: LeadArmazenado = {
    ...armazenado,
    etapa,
    notificacoes,
    atualizadoEm: evento.em,
    eventos: [...armazenado.eventos, evento].slice(-MAX_EVENTOS),
    ...(envelope ? { pii: envelope } : {}),
  };

  const store = getStore();
  await store.salvarLead(atualizado);
  await indexarPii(atualizado.id, pii);
  return montarLead(atualizado, pii);
}

/** Atualiza o WhatsApp do lead (ação do painel do Telegram). */
export async function atualizarWhatsappLead(
  id: string,
  numero: string,
  autor: string,
): Promise<Lead> {
  const telefone = normalizeBrPhone(numero);
  if (!telefone) {
    throw new ErroValidacao("Número inválido. Envie DDD + número, por exemplo: 11 95386-6646.");
  }

  const { armazenado, pii } = await carregarParaEdicao(id);
  const evento: LeadEvento = {
    nome: "numero_atualizado",
    em: new Date().toISOString(),
    rotulo: `por ${sanitizeTexto(autor, 40)}`,
  };

  return await persistirEdicao(
    armazenado,
    { ...pii, whatsapp: telefone },
    evento,
    calcularEtapa(armazenado.etapa, "numero_atualizado"),
  );
}

export async function atualizarEtapaLead(id: string, etapa: Etapa, autor: string): Promise<Lead> {
  const { armazenado, pii } = await carregarParaEdicao(id);
  const anterior = armazenado.etapa;
  const evento: LeadEvento = {
    nome: "contato_manual",
    em: new Date().toISOString(),
    rotulo: `${anterior} → ${etapa} (${sanitizeTexto(autor, 30)})`,
  };

  if (anterior !== etapa) {
    await getStore().incrementar(`etapa:${etapa}`);
  }
  return await persistirEdicao(armazenado, pii, evento, etapa);
}

export async function definirObservacao(id: string, texto: string, autor: string): Promise<Lead> {
  const conteudo = sanitizeTexto(texto, 500);
  if (conteudo.length < 2) throw new ErroValidacao("Observação muito curta.");

  const { armazenado, pii } = await carregarParaEdicao(id);
  const evento: LeadEvento = {
    nome: "observacao",
    em: new Date().toISOString(),
    rotulo: sanitizeTexto(autor, 40),
  };
  return await persistirEdicao(armazenado, { ...pii, observacoes: conteudo }, evento);
}

export async function marcarLeadNotificado(id: string): Promise<void> {
  const armazenado = await getStore().obterLead(id);
  if (!armazenado) return;
  await getStore().salvarLead({
    ...armazenado,
    notificacoes: armazenado.notificacoes + 1,
  });
}

export async function listarLeadsRecentes(limite = 10): Promise<Lead[]> {
  const store = getStore();
  const ids = await store.listarIds(Math.min(Math.max(limite, 1), 50));
  const leads: Lead[] = [];
  for (const id of ids) {
    const lead = await obterLead(id);
    if (lead) leads.push(lead);
  }
  return leads;
}

export async function obterConfigSite(): Promise<SiteConfig> {
  const config = await getStore().obterConfig();
  if (config) return config;
  return {
    whatsapp: getConfig().defaultWhatsapp,
    atualizadoEm: new Date(0).toISOString(),
  };
}

export async function definirWhatsappSite(numero: string, autor: string): Promise<SiteConfig> {
  const telefone = normalizeBrPhone(numero);
  if (!telefone) {
    throw new ErroValidacao("Número inválido. Envie DDD + número, por exemplo: 11 95386-6646.");
  }
  const config: SiteConfig = {
    whatsapp: telefone,
    atualizadoEm: new Date().toISOString(),
    atualizadoPor: sanitizeTexto(autor, 40),
  };
  await getStore().salvarConfig(config);
  return config;
}

export interface Metricas {
  readonly total: number;
  readonly hoje: number;
  readonly cliquesWhatsapp: number;
  readonly noWhatsapp: number;
  readonly convertidos: number;
  readonly perdidos: number;
  readonly taxaWhatsapp: number;
}

export async function metricas(): Promise<Metricas> {
  const store = getStore();
  const [total, hoje, cliquesWhatsapp, noWhatsapp, convertidos, perdidos] = await Promise.all([
    store.contarLeads(),
    store.obterContador(`dia:${diaLocal()}`),
    store.obterContador("evento:clique_whatsapp"),
    store.obterContador("etapa:whatsapp"),
    store.obterContador("etapa:convertido"),
    store.obterContador("etapa:perdido"),
  ]);

  return {
    total,
    hoje,
    cliquesWhatsapp,
    noWhatsapp,
    convertidos,
    perdidos,
    taxaWhatsapp: total > 0 ? Math.round((noWhatsapp / total) * 100) : 0,
  };
}
