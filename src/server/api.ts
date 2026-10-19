import { getConfig, diagnosticarConfiguracao, lerEnv } from "./env";
import { hashIp, timingSafeEqual } from "./crypto";
import { ErroLimite } from "./errors";
import { erroResposta, ipDoCliente, jsonResposta, lerJson, textoResposta } from "./http";
import {
  obterConfigSite,
  registrarEvento,
  telefoneJaRegistrado,
  type EntradaRastreamento,
} from "./leads";
import { avaliarSinais, deveNotificar } from "./antifraude";
import {
  contextoDaRequisicao,
  obterMetricasDetalhadas,
  registrarAcesso,
  rotuloDispositivo,
} from "./metricas";
import { validarRota } from "./rotas-seguras";
import { getStore } from "./store";
import { configurarWebhook, type AtualizacaoTelegram } from "./telegram/api";
import { notificarAdministrador, processarUpdate } from "./telegram/handler";

export interface ContextoExecucao {
  readonly waitUntil?: (promessa: Promise<unknown>) => void;
}

const LIMITE_LEAD_MINUTO = 40;
const LIMITE_LEAD_HORA = 400;
const LIMITE_CONFIG_MINUTO = 120;
const LIMITE_WEBHOOK_MINUTO = 240;
const LIMITE_CORPO_LEAD = 2_048;
const LIMITE_CORPO_WEBHOOK = 128_000;

/** IDs de update já processados (proteção simples contra reentrega do Telegram). */
const vistos = new Set<number>();
const MAX_VISTOS = 500;

function jaProcessado(updateId: number): boolean {
  if (vistos.has(updateId)) return true;
  vistos.add(updateId);
  if (vistos.size > MAX_VISTOS) {
    const primeiro = vistos.values().next().value;
    if (typeof primeiro === "number") vistos.delete(primeiro);
  }
  return false;
}

async function aplicarLimite(
  request: Request,
  rota: string,
  limite: number,
  janelaSegundos: number,
): Promise<string> {
  const ip = ipDoCliente(request);
  const chave = `${rota}:${await hashIp(ip, getConfig().ipSalt || "nio")}:${janelaSegundos}`;
  const resultado = await getStore().limiteTaxa(chave, limite, janelaSegundos);
  if (!resultado.permitido) {
    throw new ErroLimite(resultado.reiniciaEm);
  }
  return ip;
}

async function tratarLead(request: Request, ctx: ContextoExecucao): Promise<Response> {
  if (request.method !== "POST") {
    return jsonResposta({ ok: false, erro: "Método não permitido." }, 405);
  }

  const ip = await aplicarLimite(request, "lead", LIMITE_LEAD_MINUTO, 60);
  await aplicarLimite(request, "lead-hora", LIMITE_LEAD_HORA, 3_600);

  const corpo = await lerJson<Record<string, unknown>>(request, LIMITE_CORPO_LEAD);

  // Honeypot: campo oculto que só robôs preenchem.
  if (typeof corpo["website"] === "string" && corpo["website"].length > 0) {
    return jsonResposta({ ok: true, id: null });
  }

  const config = getConfig();
  const contexto = contextoDaRequisicao(request);
  const numeroInformado = typeof corpo["whatsapp"] === "string" ? corpo["whatsapp"] : "";
  const emailInformado = typeof corpo["email"] === "string" ? corpo["email"] : undefined;
  const intervaloMs = typeof corpo["intervaloMs"] === "number" ? corpo["intervaloMs"] : undefined;

  const avaliacao = avaliarSinais({
    userAgent: request.headers.get("user-agent") ?? "",
    temClientHints: request.headers.has("sec-ch-ua"),
    pais: contexto.pais,
    ...(emailInformado ? { email: emailInformado } : {}),
    ...(typeof intervaloMs === "number" ? { intervaloMs } : {}),
    ...(numeroInformado ? { telefoneRepetido: await telefoneJaRegistrado(numeroInformado) } : {}),
  });

  const entrada: EntradaRastreamento = {
    id: corpo["id"],
    evento: corpo["evento"],
    caminho: corpo["caminho"],
    rotulo: corpo["rotulo"],
    utm: corpo["utm"],
    referencia: corpo["referencia"],
    whatsapp: corpo["whatsapp"],
    cpf: corpo["cpf"],
    nome: corpo["nome"],
    email: corpo["email"],
  };

  const { lead, criado } = await registrarEvento(entrada, {
    ipHash: await hashIp(ip, config.ipSalt || "nio"),
    userAgent: request.headers.get("user-agent") ?? "",
    dispositivo: rotuloDispositivo(contexto.tipo),
    navegador: contexto.navegador,
    sistema: contexto.sistema,
    pais: contexto.pais,
    uf: contexto.uf,
    cidade: contexto.cidade,
    risco: avaliacao.risco,
    qualidade: avaliacao.qualidade,
  });

  const nomeEvento = typeof corpo["evento"] === "string" ? corpo["evento"] : "";
  if (criado && (nomeEvento === "entrada" || nomeEvento === "visualizacao")) {
    await registrarAcesso(contexto);
  }

  const primeiroWhatsapp =
    lead.eventos.filter((evento) => evento.nome === "clique_whatsapp").length === 1;
  const deveAvisar = (criado || primeiroWhatsapp) && deveNotificar(avaliacao.qualidade);

  if (deveAvisar) {
    const promessa = notificarAdministrador(lead).catch((erro) => {
      console.error("[api] falha ao notificar administrador:", erro);
    });
    if (ctx.waitUntil) ctx.waitUntil(promessa);
    else await promessa;
  }

  return jsonResposta({
    ok: true,
    id: lead.id,
    etapa: lead.etapa,
    qualidade: avaliacao.qualidade,
  });
}

async function tratarConfig(request: Request): Promise<Response> {
  if (request.method !== "GET" && request.method !== "HEAD") {
    return jsonResposta({ ok: false, erro: "Método não permitido." }, 405);
  }
  await aplicarLimite(request, "config", LIMITE_CONFIG_MINUTO, 60);

  const config = await obterConfigSite();
  return jsonResposta(
    {
      whatsapp: config.whatsapp,
      titulo: config.titulo,
      favicon: config.favicon,
      atualizadoEm: config.atualizadoEm,
    },
    200,
    {
      "Cache-Control": "public, max-age=0, s-maxage=15, stale-while-revalidate=45",
    },
  );
}

async function tratarWebhook(request: Request, ctx: ContextoExecucao): Promise<Response> {
  if (request.method !== "POST") {
    return jsonResposta({ ok: false, erro: "Método não permitido." }, 405);
  }

  const config = getConfig();
  if (!config.telegram.webhookSecret) {
    console.error("[telegram] TELEGRAM_WEBHOOK_SECRET ausente: webhook recusado.");
    return jsonResposta({ ok: false, erro: "Webhook não configurado." }, 503);
  }

  const recebido = request.headers.get("x-telegram-bot-api-secret-token") ?? "";
  if (!timingSafeEqual(recebido, config.telegram.webhookSecret)) {
    return jsonResposta({ ok: false, erro: "Não autorizado." }, 401);
  }

  await aplicarLimite(request, "webhook", LIMITE_WEBHOOK_MINUTO, 60);

  const update = await lerJson<AtualizacaoTelegram>(request, LIMITE_CORPO_WEBHOOK);
  if (typeof update.update_id === "number" && jaProcessado(update.update_id)) {
    return jsonResposta({ ok: true, duplicado: true });
  }

  // O Telegram reenvia o update quando a resposta demora ou falha. Respondemos
  // 200 e tratamos o erro internamente para não gerar tempestade de retentativas.
  const promessa = processarUpdate(update).catch((erro) => {
    console.error("[telegram] falha ao processar update:", erro);
  });

  if (ctx.waitUntil) {
    ctx.waitUntil(promessa);
    return jsonResposta({ ok: true });
  }
  await promessa;
  return jsonResposta({ ok: true });
}

async function tratarSetup(request: Request): Promise<Response> {
  const config = getConfig();
  const tokenEsperado = lerEnv("ADMIN_API_TOKEN") ?? "";
  if (!tokenEsperado) {
    return jsonResposta({ ok: false, erro: "Rota desativada." }, 404);
  }
  const recebido = request.headers.get("x-admin-token") ?? "";
  if (!timingSafeEqual(recebido, tokenEsperado)) {
    return jsonResposta({ ok: false, erro: "Não autorizado." }, 401);
  }

  const base = config.siteUrl || "https://exemplo.vercel.app";
  const url = `${base.replace(/\/$/, "")}/api/telegram/webhook`;
  const ok = await configurarWebhook(url, config.telegram.webhookSecret);
  return jsonResposta({ ok, webhook: url });
}

/** Painel de métricas por rota assinada (link temporário gerado pelo bot). */
async function tratarAdminMetricas(request: Request): Promise<Response> {
  if (request.method !== "GET") {
    return jsonResposta({ ok: false, erro: "Método não permitido." }, 405);
  }

  const token = new URL(request.url).searchParams.get("t") ?? "";
  if (!(await validarRota("metricas", token))) {
    return jsonResposta({ ok: false, erro: "Link inválido ou expirado." }, 401);
  }

  return await obterMetricasDetalhadas().then((dados) => jsonResposta({ ok: true, ...dados }));
}

async function tratarSaude(): Promise<Response> {
  const diag = diagnosticarConfiguracao();
  return jsonResposta({
    ok: diag.ok,
    store: getStore().nome,
    faltando: diag.faltando,
    avisos: diag.avisos,
    horario: new Date().toISOString(),
  });
}

/** Roteador da API. Retorna `null` quando o caminho não é da API. */
export async function rotearApi(request: Request, ctx: ContextoExecucao): Promise<Response | null> {
  const { pathname } = new URL(request.url);
  if (!pathname.startsWith("/api/")) return null;

  try {
    switch (pathname) {
      case "/api/lead":
        return await tratarLead(request, ctx);
      case "/api/config":
        return await tratarConfig(request);
      case "/api/telegram/webhook":
        return await tratarWebhook(request, ctx);
      case "/api/telegram/setup":
        return await tratarSetup(request);
      case "/api/admin/metricas":
        return await tratarAdminMetricas(request);
      case "/api/health":
        return await tratarSaude();
      default:
        return textoResposta("Rota não encontrada.", 404);
    }
  } catch (erro) {
    return erroResposta(erro);
  }
}
