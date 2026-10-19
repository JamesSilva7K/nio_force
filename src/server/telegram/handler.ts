import { getConfig } from "../env";
import {
  atualizarEtapaLead,
  atualizarWhatsappLead,
  definirFaviconSite,
  definirObservacao,
  definirTituloSite,
  definirWhatsappSite,
  listarLeadsRecentes,
  obterConfigSite,
  obterLead,
} from "../leads";
import { obterMetricasDetalhadas } from "../metricas";
import { novoUuid } from "../crypto";
import { getStore, type Lead, type PendenteAdmin, type AprovacaoPendente } from "../store";
import { verificarWhatsapp } from "../whatsapp-verify";
import {
  editarMensagem,
  enviarComForca,
  enviarMensagem,
  responderCallback,
  type AtualizacaoTelegram,
  type CallbackQuery,
  type TecladoInline,
} from "./api";
import {
  esc,
  mensagemAlerta,
  mensagemDispositivos,
  mensagemGeo,
  mensagemIdentidadeSite,
  mensagemInicio,
  mensagemLead,
  mensagemLista,
  mensagemMetricas,
  mensagemPainel,
  mensagemPromptNota,
  mensagemPromptNumero,
  mensagemQualidade,
  mensagemVerificacao,
} from "./format";
import {
  lerCallback,
  paginar,
  tecladoAprovacao,
  tecladoIdentidadeSite,
  tecladoLead,
  tecladoLista,
  tecladoMenu,
  tecladoSecao,
  tecladoVoltar,
} from "./keyboard";

const DURACAO_PENDENTE_MS = 10 * 60 * 1_000;
const DURACAO_APROVACAO_MS = 30 * 60 * 1_000;

// ---------------------------------------------------------------------------
// Funções de papel (role)
// ---------------------------------------------------------------------------

function ehAdmin(chatId: number): boolean {
  const { adminIds } = getConfig().telegram;
  if (adminIds.length === 0) {
    console.error("[telegram] TELEGRAM_ADMIN_ID não configurado: nenhum acesso liberado.");
    return false;
  }
  return adminIds.includes(chatId);
}

/**
 * Super-admin tem poderes para aprovar ações sensíveis.
 * Se TELEGRAM_SUPERADMIN_ID não estiver configurado, qualquer admin é tratado
 * como super-admin — comportamento retrocompatível.
 */
function ehSuperAdmin(chatId: number): boolean {
  const { superAdminIds, adminIds } = getConfig().telegram;
  if (!ehAdmin(chatId)) return false;
  if (superAdminIds.length === 0) return true; // sem separação → todos são super
  return superAdminIds.includes(chatId);
}

function primeiroSuperAdminId(): number | null {
  const { superAdminIds, adminIds } = getConfig().telegram;
  const lista = superAdminIds.length > 0 ? superAdminIds : adminIds;
  return lista[0] ?? null;
}

function autorDa(from?: { username?: string; first_name?: string; id: number }): string {
  if (!from) return "admin";
  if (from.username) return `@${from.username}`;
  if (from.first_name) return from.first_name;
  return String(from.id);
}

// ---------------------------------------------------------------------------
// Helpers de navegação
// ---------------------------------------------------------------------------

/**
 * Toda navegação edita a mensagem que contém o botão clicado.
 * Só envia mensagem nova quando a edição é impossível (mensagem antiga demais).
 */
async function mostrar(cq: CallbackQuery, texto: string, teclado: TecladoInline): Promise<void> {
  const chatId = cq.message?.chat.id;
  const messageId = cq.message?.message_id;
  if (!chatId) return;

  if (messageId && (await editarMensagem(chatId, messageId, texto, teclado))) return;
  await enviarMensagem(chatId, texto, teclado);
}

// ---------------------------------------------------------------------------
// Fluxo de aprovação super-admin
// ---------------------------------------------------------------------------

/** Rótulos legíveis das ações que precisam de aprovação. */
const ROTULO_ACAO: Record<AprovacaoPendente["acao"], string> = {
  mudar_numero_site: "☎️ Mudar número oficial do site",
  mudar_titulo_site: "🏷️ Alterar Título da Landing Page",
  mudar_favicon_site: "🖼️ Alterar Favicon da Landing Page",
  converter_lead: "✅ Marcar lead como Convertido",
  perder_lead: "⚫ Marcar lead como Perdido",
  usar_numero_lead_no_site: "🌐 Usar número do lead no site",
};

/** Descrição detalhada para o super-admin entender exatamente o que está aprovando. */
function descricaoAcao(aprovacao: AprovacaoPendente): string {
  const { acao, payload, solicitanteNome } = aprovacao;
  const linhas: string[] = [
    `📋 <b>Solicitação de ${esc(solicitanteNome)}</b>`,
    `⚡ <b>Ação:</b> ${ROTULO_ACAO[acao]}`,
    "",
  ];

  switch (acao) {
    case "mudar_numero_site":
      linhas.push(`☎️ <b>Novo número:</b> <code>${esc(payload["numero"] ?? "—")}</code>`);
      linhas.push(
        "<i>Esse número passará a ser exibido no site para todos os visitantes imediatamente.</i>",
      );
      break;
    case "mudar_titulo_site":
      linhas.push(`🏷️ <b>Novo Título:</b> <code>${esc(payload["titulo"] ?? "—")}</code>`);
      linhas.push("<i>Este título aparecerá na aba do navegador e no SEO para todos os visitantes.</i>");
      break;
    case "mudar_favicon_site":
      linhas.push(`🖼️ <b>Novo Favicon:</b> <code>${esc(payload["favicon"] ?? "—")}</code>`);
      linhas.push("<i>O ícone da aba do navegador será atualizado imediatamente.</i>");
      break;
    case "converter_lead":
      linhas.push(`👤 <b>Lead:</b> <code>#${esc(payload["leadId"]?.slice(0, 8) ?? "—")}</code>`);
      if (payload["nome"]) linhas.push(`   Nome: ${esc(payload["nome"])}`);
      linhas.push("<i>O lead será movido para a etapa 'Convertido' no funil.</i>");
      break;
    case "perder_lead":
      linhas.push(`👤 <b>Lead:</b> <code>#${esc(payload["leadId"]?.slice(0, 8) ?? "—")}</code>`);
      if (payload["nome"]) linhas.push(`   Nome: ${esc(payload["nome"])}`);
      linhas.push("<i>O lead será marcado como 'Perdido' — pode ser reaberto depois.</i>");
      break;
    case "usar_numero_lead_no_site":
      linhas.push(`👤 <b>Lead:</b> <code>#${esc(payload["leadId"]?.slice(0, 8) ?? "—")}</code>`);
      linhas.push(`☎️ <b>Número:</b> <code>${esc(payload["numero"] ?? "—")}</code>`);
      linhas.push("<i>O número desse lead substituirá o número oficial do site.</i>");
      break;
  }

  const expiraEm = new Date(aprovacao.expiraEm);
  linhas.push(
    "",
    `⏰ <i>Esta solicitação expira às ${expiraEm.getHours().toString().padStart(2, "0")}:${expiraEm.getMinutes().toString().padStart(2, "0")}.</i>`,
    "",
    "Deseja aprovar ou rejeitar?",
  );
  return linhas.join("\n");
}

/**
 * Envia a solicitação ao super-admin e guarda no store.
 * Retorna o ID da aprovação.
 */
async function solicitarAprovacao(
  acao: AprovacaoPendente["acao"],
  payload: Record<string, string>,
  solicitanteChatId: number,
  solicitanteNome: string,
): Promise<string> {
  const id = novoUuid();
  const aprovacao: AprovacaoPendente = {
    id,
    acao,
    solicitanteChatId,
    solicitanteNome,
    payload,
    criadaEm: Date.now(),
    expiraEm: Date.now() + DURACAO_APROVACAO_MS,
  };

  await getStore().salvarAprovacao(aprovacao);

  const superAdminId = primeiroSuperAdminId();
  if (superAdminId && superAdminId !== solicitanteChatId) {
    const texto = descricaoAcao(aprovacao);
    const teclado = await tecladoAprovacao(id);
    const msgId = await enviarMensagem(superAdminId, texto, teclado);
    if (msgId) {
      await getStore().salvarAprovacao({ ...aprovacao, mensagemSuperAdminId: msgId });
    }
  }

  return id;
}

/** Executa a ação aprovada e notifica o solicitante. */
async function executarAcaoAprovada(aprovacao: AprovacaoPendente, autor: string): Promise<void> {
  const { acao, payload, solicitanteChatId } = aprovacao;
  let mensagemResultado = "";

  try {
    switch (acao) {
      case "mudar_numero_site": {
        const config = await definirWhatsappSite(payload["numero"]!, autor);
        mensagemResultado = `✅ <b>Aprovado e executado!</b>\n\nNúmero do site alterado para <b>${esc(config.whatsapp)}</b>.`;
        break;
      }
      case "mudar_titulo_site": {
        const config = await definirTituloSite(payload["titulo"]!, autor);
        mensagemResultado = `✅ <b>Aprovado e executado!</b>\n\nTítulo da página alterado para:\n<b>${esc(config.titulo)}</b>`;
        break;
      }
      case "mudar_favicon_site": {
        const config = await definirFaviconSite(payload["favicon"]!, autor);
        mensagemResultado = `✅ <b>Aprovado e executado!</b>\n\nFavicon alterado para:\n<code>${esc(config.favicon)}</code>`;
        break;
      }
      case "converter_lead": {
        const lead = await atualizarEtapaLead(payload["leadId"]!, "convertido", autor);
        mensagemResultado = `✅ <b>Lead convertido!</b>\n\nLead <code>#${lead.id.slice(0, 8)}</code> movido para ✅ Convertido.`;
        break;
      }
      case "perder_lead": {
        const lead = await atualizarEtapaLead(payload["leadId"]!, "perdido", autor);
        mensagemResultado = `✅ <b>Lead marcado como perdido.</b>\n\nLead <code>#${lead.id.slice(0, 8)}</code> movido para ⚫ Perdido.`;
        break;
      }
      case "usar_numero_lead_no_site": {
        const config = await definirWhatsappSite(payload["numero"]!, autor);
        mensagemResultado = `✅ <b>Aprovado e executado!</b>\n\nNúmero <b>${esc(config.whatsapp)}</b> agora é o número oficial do site.`;
        break;
      }
    }
  } catch (erro) {
    const detalhe = erro instanceof Error ? erro.message : "Erro desconhecido.";
    mensagemResultado = `❌ <b>Erro ao executar:</b> ${esc(detalhe)}`;
  }

  // Notifica o admin que fez a solicitação
  await enviarMensagem(solicitanteChatId, mensagemResultado, await tecladoMenu());
}

// ---------------------------------------------------------------------------
// Ponto de entrada
// ---------------------------------------------------------------------------

/** Ponto de entrada do webhook. */
export async function processarUpdate(update: AtualizacaoTelegram): Promise<void> {
  if (update.callback_query) {
    await tratarCallback(update.callback_query);
    return;
  }

  const mensagem = update.message;
  if (!mensagem) return;

  const chatId = mensagem.chat.id;

  if (!ehAdmin(chatId)) {
    await enviarMensagem(chatId, mensagemInicio(false));
    return;
  }

  const texto = (mensagem.text ?? "").trim();

  if (texto === "/start" || texto === "/menu" || texto === "/ajuda") {
    const isSA = ehSuperAdmin(chatId);
    await enviarMensagem(chatId, mensagemInicio(true, isSA), await tecladoMenu());
    return;
  }

  // Qualquer outro texto só é aceito como resposta a uma pergunta do bot.
  await tratarResposta(mensagem);
}

async function tratarResposta(
  mensagem: NonNullable<AtualizacaoTelegram["message"]>,
): Promise<void> {
  const chatId = mensagem.chat.id;
  const pendente = await getStore().obterPendente(chatId);

  // Sem pergunta pendente ou resposta a outra mensagem: silêncio total.
  if (!pendente?.mensagemId) return;
  if (mensagem.reply_to_message?.message_id !== pendente.mensagemId) return;

  const texto = (mensagem.text ?? "").trim();
  if (texto.length === 0) return;

  if (pendente.expiraEm <= Date.now()) {
    await getStore().definirPendente(chatId, null);
    await editarMensagem(
      chatId,
      pendente.mensagemId,
      "⏰ Tempo esgotado. Toque em /start.",
      await tecladoMenu(),
    );
    return;
  }

  const autor = autorDa(mensagem.from);
  await getStore().definirPendente(chatId, null);

  try {
    const resultado = await aplicarResposta(pendente, texto, autor, chatId);
    const editado = await editarMensagem(
      chatId,
      pendente.mensagemId,
      resultado.texto,
      resultado.teclado,
    );
    if (!editado) await enviarMensagem(chatId, resultado.texto, resultado.teclado);
  } catch (erro) {
    const detalhe = erro instanceof Error ? erro.message : "Não foi possível concluir.";
    const aviso = `⚠️ ${esc(detalhe)}`;
    const editado = await editarMensagem(chatId, pendente.mensagemId, aviso, await tecladoMenu());
    if (!editado) await enviarMensagem(chatId, aviso, await tecladoMenu());
  }
}

interface ResultadoResposta {
  readonly texto: string;
  readonly teclado: TecladoInline;
}

async function aplicarResposta(
  pendente: PendenteAdmin,
  texto: string,
  autor: string,
  solicitanteChatId: number,
): Promise<ResultadoResposta> {
  if (pendente.tipo === "numero_site") {
    const isSA = ehSuperAdmin(solicitanteChatId);
    if (isSA) {
      // Super-admin executa diretamente
      const config = await definirWhatsappSite(texto, autor);
      return {
        texto: `✅ <b>Número do site atualizado</b>\n\n☎️ <b>${esc(config.whatsapp)}</b>\n\nO site já mostra este número na próxima renderização.`,
        teclado: await tecladoIdentidadeSite(),
      };
    } else {
      // Admin regular: envia para aprovação
      await solicitarAprovacao(
        "mudar_numero_site",
        { numero: texto },
        solicitanteChatId,
        autor,
      );
      return {
        texto: `🔔 <b>Solicitação enviada ao super-admin</b>\n\nNúmero <code>${esc(texto)}</code> aguarda aprovação.\nVocê será notificado quando for aprovado ou rejeitado.`,
        teclado: await tecladoMenu(),
      };
    }
  }

  if (pendente.tipo === "titulo_site") {
    const isSA = ehSuperAdmin(solicitanteChatId);
    if (isSA) {
      const config = await definirTituloSite(texto, autor);
      return {
        texto: `✅ <b>Título do site atualizado</b>\n\n🏷️ <b>${esc(config.titulo)}</b>\n\nA alteração já está visível para os visitantes.`,
        teclado: await tecladoIdentidadeSite(),
      };
    } else {
      await solicitarAprovacao(
        "mudar_titulo_site",
        { titulo: texto },
        solicitanteChatId,
        autor,
      );
      return {
        texto: `🔔 <b>Solicitação enviada ao super-admin</b>\n\nTítulo <code>${esc(texto)}</code> aguarda aprovação.\nVocê será notificado assim que for analisado.`,
        teclado: await tecladoMenu(),
      };
    }
  }

  if (pendente.tipo === "favicon_site") {
    const isSA = ehSuperAdmin(solicitanteChatId);
    if (isSA) {
      const config = await definirFaviconSite(texto, autor);
      return {
        texto: `✅ <b>Favicon do site atualizado</b>\n\n🖼️ <code>${esc(config.favicon)}</code>\n\nO novo ícone já está configurado.`,
        teclado: await tecladoIdentidadeSite(),
      };
    } else {
      await solicitarAprovacao(
        "mudar_favicon_site",
        { favicon: texto },
        solicitanteChatId,
        autor,
      );
      return {
        texto: `🔔 <b>Solicitação enviada ao super-admin</b>\n\nFavicon <code>${esc(texto)}</code> aguarda aprovação.\nVocê será notificado assim que for analisado.`,
        teclado: await tecladoMenu(),
      };
    }
  }

  if (!pendente.leadId) {
    return { texto: "Não localizei o lead desta operação.", teclado: await tecladoMenu() };
  }

  if (pendente.tipo === "numero_lead") {
    const atualizado = await atualizarWhatsappLead(pendente.leadId, texto, autor);
    return {
      texto: `✅ <b>WhatsApp atualizado</b>\n\n${mensagemLead(atualizado, await obterConfigSite())}`,
      teclado: await tecladoLead(atualizado),
    };
  }

  const lead = await definirObservacao(pendente.leadId, texto, autor);
  return {
    texto: `📝 <b>Observação registrada</b>\n\n${mensagemLead(lead, await obterConfigSite())}`,
    teclado: await tecladoLead(lead),
  };
}

async function tratarCallback(cq: CallbackQuery): Promise<void> {
  const chatId = cq.message?.chat.id;

  if (!chatId || !ehAdmin(cq.from.id)) {
    await responderCallback(cq.id, "Acesso restrito.", true);
    return;
  }
  if (!cq.data) {
    await responderCallback(cq.id, "Ação inválida.", true);
    return;
  }

  const validado = await lerCallback(cq.data);
  if (!validado) {
    await responderCallback(cq.id, "Botão inválido ou expirado.", true);
    return;
  }

  const autor = autorDa(cq.from);
  const isSA = ehSuperAdmin(cq.from.id);

  try {
    // --- Navegação ----------------------------------------------------------
    if (validado.acao === "m") {
      await mostrar(cq, mensagemPainel(await obterMetricasDetalhadas()), await tecladoMenu());
      await responderCallback(cq.id);
      return;
    }
    if (validado.acao === "s") {
      await mostrar(cq, mensagemMetricas(await obterMetricasDetalhadas()), await tecladoSecao());
      await responderCallback(cq.id);
      return;
    }
    if (validado.acao === "g") {
      await mostrar(cq, mensagemGeo(await obterMetricasDetalhadas()), await tecladoVoltar());
      await responderCallback(cq.id);
      return;
    }
    if (validado.acao === "v") {
      await mostrar(
        cq,
        mensagemDispositivos(await obterMetricasDetalhadas()),
        await tecladoVoltar(),
      );
      await responderCallback(cq.id);
      return;
    }
    if (validado.acao === "q") {
      await mostrar(cq, mensagemQualidade(await obterMetricasDetalhadas()), await tecladoVoltar());
      await responderCallback(cq.id);
      return;
    }
    if (validado.acao === "l") {
      const paginaPedida = Number.parseInt(validado.payload, 10);
      const leads = await listarLeadsRecentes(50);
      const pagina = paginar(leads, Number.isSafeInteger(paginaPedida) ? paginaPedida : 0);
      await mostrar(
        cq,
        mensagemLista(pagina.leads, pagina.pagina, pagina.totalPaginas, leads.length),
        await tecladoLista(pagina),
      );
      await responderCallback(cq.id);
      return;
    }

    // --- Aprovação do super-admin (ação "A" = aprovar, "R" = rejeitar) ------
    if (validado.acao === "A") {
      if (!isSA) {
        await responderCallback(cq.id, "Apenas o super-admin pode aprovar.", true);
        return;
      }
      const aprovacao = await getStore().obterAprovacao(validado.payload);
      if (!aprovacao) {
        await mostrar(cq, "❌ <b>Solicitação expirada ou não encontrada.</b>", await tecladoMenu());
        await responderCallback(cq.id, "Solicitação não encontrada.", true);
        return;
      }
      await getStore().removerAprovacao(aprovacao.id);
      await executarAcaoAprovada(aprovacao, autor);
      await mostrar(
        cq,
        `✅ <b>Ação aprovada e executada.</b>\n\n${ROTULO_ACAO[aprovacao.acao]}\nSolicitante: ${esc(aprovacao.solicitanteNome)}`,
        await tecladoMenu(),
      );
      await responderCallback(cq.id, "Aprovado ✅");
      return;
    }

    if (validado.acao === "R") {
      if (!isSA) {
        await responderCallback(cq.id, "Apenas o super-admin pode rejeitar.", true);
        return;
      }
      const aprovacao = await getStore().obterAprovacao(validado.payload);
      if (!aprovacao) {
        await mostrar(cq, "❌ <b>Solicitação expirada ou não encontrada.</b>", await tecladoMenu());
        await responderCallback(cq.id, "Solicitação não encontrada.", true);
        return;
      }
      await getStore().removerAprovacao(aprovacao.id);
      // Notifica o admin que fez a solicitação
      await enviarMensagem(
        aprovacao.solicitanteChatId,
        `❌ <b>Solicitação rejeitada pelo super-admin.</b>\n\nAção: ${ROTULO_ACAO[aprovacao.acao]}`,
        await tecladoMenu(),
      );
      await mostrar(
        cq,
        `❌ <b>Ação rejeitada.</b>\n\n${ROTULO_ACAO[aprovacao.acao]}\nSolicitante: ${esc(aprovacao.solicitanteNome)} foi notificado.`,
        await tecladoMenu(),
      );
      await responderCallback(cq.id, "Rejeitado ❌");
      return;
    }

    // --- Identidade do Site (Título e Favicon com preview real) -----------
    if (validado.acao === "T" && validado.payload === "ver") {
      const config = await obterConfigSite();
      await mostrar(cq, mensagemIdentidadeSite(config), await tecladoIdentidadeSite());
      await responderCallback(cq.id);
      return;
    }

    if (validado.acao === "T" && validado.payload === "mudar") {
      const promptId = await enviarComForca(
        chatId,
        "🏷️ <b>Alterar Título da Landing Page</b>\n\nResponda <b>esta mensagem</b> com o novo título que você deseja para a página.\n\n<i>Exemplo: NIO | Internet Fibra e Central de Atendimento</i>",
        cq.message?.message_id ?? 0,
      );
      if (promptId) {
        await getStore().definirPendente(chatId, {
          tipo: "titulo_site",
          mensagemId: promptId,
          expiraEm: Date.now() + DURACAO_PENDENTE_MS,
        });
      }
      await responderCallback(cq.id, "Responda a mensagem com o novo título");
      return;
    }

    if (validado.acao === "F" && validado.payload === "mudar") {
      const promptId = await enviarComForca(
        chatId,
        "🖼️ <b>Alterar Favicon da Landing Page</b>\n\nResponda <b>esta mensagem</b> com o caminho ou URL do novo ícone (ex: <code>/favicon.png</code> ou link <code>https://...</code>).\n\n<i>A imagem precisa ser um ícone ou logo quadrada.</i>",
        cq.message?.message_id ?? 0,
      );
      if (promptId) {
        await getStore().definirPendente(chatId, {
          tipo: "favicon_site",
          mensagemId: promptId,
          expiraEm: Date.now() + DURACAO_PENDENTE_MS,
        });
      }
      await responderCallback(cq.id, "Responda a mensagem com o caminho do favicon");
      return;
    }

    // --- Número oficial do site ---------------------------------------------
    if (validado.acao === "o" && validado.payload === "site") {
      const promptId = await enviarComForca(
        chatId,
        "☎️ <b>Número oficial do site</b>\n\nResponda <b>esta mensagem</b> com o novo número (DDD + número).\n\n<i>Admins regulares: a mudança precisará de aprovação do super-admin antes de ser publicada.</i>",
        cq.message?.message_id ?? 0,
      );
      if (promptId) {
        await getStore().definirPendente(chatId, {
          tipo: "numero_site",
          mensagemId: promptId,
          expiraEm: Date.now() + DURACAO_PENDENTE_MS,
        });
      }
      await responderCallback(cq.id, "Responda a mensagem enviada");
      return;
    }

    // --- Ações que dependem de um lead --------------------------------------
    const lead = await obterLead(validado.payload);
    if (!lead) {
      await mostrar(cq, "Lead não encontrado.", await tecladoVoltar());
      await responderCallback(cq.id, "Lead não encontrado.", true);
      return;
    }

    switch (validado.acao) {
      case "d": {
        await mostrar(cq, mensagemLead(lead, await obterConfigSite()), await tecladoLead(lead));
        await responderCallback(cq.id, "Atualizado");
        return;
      }
      case "w": {
        if (!lead.whatsapp) {
          await responderCallback(cq.id, "Lead sem número registrado.", true);
          return;
        }
        await responderCallback(cq.id, "Verificando…");
        const resultado = await verificarWhatsapp(lead.whatsapp);
        await mostrar(cq, mensagemVerificacao(lead, resultado), await tecladoLead(lead));
        return;
      }
      case "e": {
        const promptId = await enviarComForca(
          chatId,
          mensagemPromptNumero(lead),
          cq.message?.message_id ?? 0,
        );
        if (promptId) {
          await getStore().definirPendente(chatId, {
            tipo: "numero_lead",
            leadId: lead.id,
            mensagemId: promptId,
            expiraEm: Date.now() + DURACAO_PENDENTE_MS,
          });
        }
        await responderCallback(cq.id, "Responda a mensagem enviada");
        return;
      }
      case "n": {
        const promptId = await enviarComForca(
          chatId,
          mensagemPromptNota(lead),
          cq.message?.message_id ?? 0,
        );
        if (promptId) {
          await getStore().definirPendente(chatId, {
            tipo: "observacao",
            leadId: lead.id,
            mensagemId: promptId,
            expiraEm: Date.now() + DURACAO_PENDENTE_MS,
          });
        }
        await responderCallback(cq.id, "Responda a mensagem enviada");
        return;
      }
      case "c":
      case "p": {
        const etapa = validado.acao === "c" ? "convertido" : "perdido";
        const acaoSA = validado.acao === "c" ? "converter_lead" : ("perder_lead" as const);

        if (isSA) {
          // Super-admin executa direto
          const atualizado = await atualizarEtapaLead(lead.id, etapa, autor);
          await mostrar(
            cq,
            mensagemLead(atualizado, await obterConfigSite()),
            await tecladoLead(atualizado),
          );
          await responderCallback(cq.id, etapa === "convertido" ? "Convertido ✅" : "Perdido ⚫");
        } else {
          // Admin regular: solicita aprovação
          await solicitarAprovacao(
            acaoSA,
            { leadId: lead.id, nome: lead.nome ?? "" },
            chatId,
            autor,
          );
          await mostrar(
            cq,
            `🔔 <b>Solicitação enviada ao super-admin</b>\n\nA ação "<b>${etapa === "convertido" ? "Converter" : "Perder"}</b>" para o lead <code>#${lead.id.slice(0, 8)}</code> aguarda aprovação.\n\nVocê será notificado quando for aprovado ou rejeitado.`,
            await tecladoLead(lead),
          );
          await responderCallback(cq.id, "Aguardando aprovação…");
        }
        return;
      }
      case "o": {
        if (!lead.whatsapp) {
          await responderCallback(cq.id, "Este lead não tem número registrado.", true);
          return;
        }
        if (isSA) {
          const config = await definirWhatsappSite(lead.whatsapp, autor);
          await mostrar(
            cq,
            `🌐 <b>Site atualizado</b>\n\nO WhatsApp do site agora é <b>${esc(config.whatsapp)}</b>.\n\n${mensagemLead(lead, config)}`,
            await tecladoLead(lead),
          );
          await responderCallback(cq.id, "Número do site atualizado");
        } else {
          await solicitarAprovacao(
            "usar_numero_lead_no_site",
            { leadId: lead.id, numero: lead.whatsapp, nome: lead.nome ?? "" },
            chatId,
            autor,
          );
          await mostrar(
            cq,
            `🔔 <b>Solicitação enviada ao super-admin</b>\n\nUsar <code>${esc(lead.whatsapp)}</code> como número oficial do site aguarda aprovação.\n\nVocê será notificado quando for aprovado ou rejeitado.`,
            await tecladoLead(lead),
          );
          await responderCallback(cq.id, "Aguardando aprovação…");
        }
        return;
      }
      default: {
        await responderCallback(cq.id, "Ação sem efeito.", true);
      }
    }
  } catch (erro) {
    console.error("[telegram] falha ao tratar callback:", erro);
    await responderCallback(cq.id, "Falha ao executar a ação.", true);
  }
}

/** Envia o alerta de novo lead / transição para o WhatsApp (uma mensagem só). */
export async function notificarAdministrador(lead: Lead): Promise<void> {
  const { adminIds } = getConfig().telegram;
  if (adminIds.length === 0) return;

  const teclado = await tecladoLead(lead);
  const texto = mensagemAlerta(lead);
  for (const chatId of adminIds) {
    await enviarMensagem(chatId, texto, teclado);
  }
}
