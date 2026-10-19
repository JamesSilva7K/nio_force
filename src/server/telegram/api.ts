import { getConfig } from "../env";

/** Botão de teclado inline do Telegram. */
export interface BotaoInline {
  readonly text: string;
  readonly callback_data?: string;
  readonly url?: string;
}

export interface TecladoInline {
  readonly inline_keyboard: ReadonlyArray<ReadonlyArray<BotaoInline>>;
}

export interface MensagemTelegram {
  readonly message_id: number;
  readonly chat: { readonly id: number };
  readonly text?: string;
}

export interface CallbackQuery {
  readonly id: string;
  readonly from: { readonly id: number; readonly username?: string; readonly first_name?: string };
  readonly message?: MensagemTelegram;
  readonly data?: string;
}

export interface AtualizacaoTelegram {
  readonly update_id: number;
  readonly message?: {
    readonly message_id: number;
    readonly chat: { readonly id: number; readonly type?: string };
    readonly from?: {
      readonly id: number;
      readonly username?: string;
      readonly first_name?: string;
    };
    readonly text?: string;
    /** Presente quando a mensagem é uma resposta a outra mensagem do chat. */
    readonly reply_to_message?: { readonly message_id: number };
  };
  readonly callback_query?: CallbackQuery;
}

interface RespostaGenerica<T> {
  readonly ok: boolean;
  readonly result?: T;
  readonly description?: string;
}

const TIMEOUT_MS = 8_000;
const LIMITE_TEXTO = 4_000;

/** Chama um método da API do Telegram. Devolve `null` em falha (nunca lança). */
export async function chamarTelegram<T>(
  metodo: string,
  payload: Record<string, unknown>,
): Promise<T | null> {
  const { telegram } = getConfig();
  if (!telegram.token) {
    console.error("[telegram] TELEGRAM_BOT_TOKEN ausente: chamada ignorada.");
    return null;
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const resposta = await fetch(`https://api.telegram.org/bot${telegram.token}/${metodo}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: controller.signal,
      cache: "no-store",
    });
    const dados = (await resposta.json()) as RespostaGenerica<T>;
    if (!dados.ok) {
      console.error(`[telegram] ${metodo} falhou: ${dados.description ?? resposta.status}`);
      return null;
    }
    return dados.result ?? null;
  } catch (erro) {
    console.error(`[telegram] erro de rede em ${metodo}:`, erro);
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export async function enviarMensagem(
  chatId: number,
  texto: string,
  teclado?: TecladoInline,
): Promise<number | null> {
  const mensagem = await chamarTelegram<MensagemTelegram>("sendMessage", {
    chat_id: chatId,
    text: texto.slice(0, LIMITE_TEXTO),
    parse_mode: "HTML",
    disable_web_page_preview: true,
    ...(teclado ? { reply_markup: teclado } : {}),
  });
  return mensagem?.message_id ?? null;
}

export async function editarMensagem(
  chatId: number,
  messageId: number,
  texto: string,
  teclado?: TecladoInline,
): Promise<boolean> {
  const resultado = await chamarTelegram<MensagemTelegram | boolean>("editMessageText", {
    chat_id: chatId,
    message_id: messageId,
    text: texto.slice(0, LIMITE_TEXTO),
    parse_mode: "HTML",
    disable_web_page_preview: true,
    ...(teclado ? { reply_markup: teclado } : {}),
  });
  return resultado !== null;
}

/**
 * Envia uma mensagem "responda a esta" (force_reply).
 * O administrador só é ouvido se responder exatamente a esta mensagem.
 */
export async function enviarComForca(
  chatId: number,
  texto: string,
  responderA: number,
): Promise<number | null> {
  const mensagem = await chamarTelegram<MensagemTelegram>("sendMessage", {
    chat_id: chatId,
    text: texto.slice(0, LIMITE_TEXTO),
    parse_mode: "HTML",
    disable_web_page_preview: true,
    reply_parameters: { message_id: responderA, allow_sending_without_reply: true },
    reply_markup: { force_reply: true, selective: true },
  });
  return mensagem?.message_id ?? null;
}

export async function responderCallback(
  callbackId: string,
  texto?: string,
  alerta = false,
): Promise<void> {
  await chamarTelegram("answerCallbackQuery", {
    callback_query_id: callbackId,
    ...(texto ? { text: texto.slice(0, 190) } : {}),
    ...(alerta ? { show_alert: true } : {}),
  });
}

/** Registra o webhook com token secreto (o Telegram envia no cabeçalho). */
export async function configurarWebhook(url: string, secret: string): Promise<boolean> {
  const resultado = await chamarTelegram<boolean>("setWebhook", {
    url,
    secret_token: secret,
    allowed_updates: ["message", "callback_query"],
    drop_pending_updates: false,
    max_connections: 40,
  });
  return resultado === true;
}

export async function removerWebhook(): Promise<boolean> {
  return (await chamarTelegram<boolean>("deleteWebhook", { drop_pending_updates: false })) === true;
}
