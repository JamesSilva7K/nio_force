// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { toBase64Url } from "@/server/crypto";
import { obterConfigSite, obterLead, registrarEvento } from "@/server/leads";
import { memoriaStore } from "@/server/store/memory";
import { resetStoreCache } from "@/server/store";
import type { AtualizacaoTelegram } from "@/server/telegram/api";
import { processarUpdate } from "@/server/telegram/handler";
import { assinarCallback, type Acao } from "@/server/telegram/keyboard";

const ADMIN = 42;
const CHAVE = toBase64Url(new Uint8Array(32).fill(5));

interface Chamada {
  metodo: string;
  payload: Record<string, unknown>;
}

let chamadas: Chamada[] = [];
let proximoId = 100;
let updateId = 1;

beforeEach(() => {
  chamadas = [];
  proximoId = 100;
  updateId = 1;

  vi.stubEnv("NODE_ENV", "test");
  vi.stubEnv("LEAD_ENCRYPTION_KEY", CHAVE);
  vi.stubEnv("TELEGRAM_BOT_TOKEN", "123456:token-de-teste");
  vi.stubEnv("TELEGRAM_ADMIN_ID", String(ADMIN));
  vi.stubEnv("TELEGRAM_WEBHOOK_SECRET", "segredo-webhook");
  vi.stubEnv("UPSTASH_REDIS_REST_URL", "");
  vi.stubEnv("UPSTASH_REDIS_REST_TOKEN", "");
  vi.stubEnv("WHATSAPP_VERIFY_URL", "");
  vi.stubEnv("WHATSAPP_VERIFY_TOKEN", "");
  vi.stubEnv("SITE_URL", "");

  memoriaStore().limpar();
  resetStoreCache();

  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: unknown, init?: { body?: string }) => {
      const metodo = String(url).split("/").pop() ?? "";
      const payload = JSON.parse(init?.body ?? "{}") as Record<string, unknown>;
      chamadas.push({ metodo, payload });
      const id = proximoId++;
      return new Response(
        JSON.stringify({ ok: true, result: { message_id: id, chat: { id: ADMIN } } }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    }),
  );
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

function mensagemSimples(texto: string, extras: Record<string, unknown> = {}): AtualizacaoTelegram {
  return {
    update_id: updateId++,
    message: {
      message_id: 500 + updateId,
      chat: { id: ADMIN },
      from: { id: ADMIN, username: "admin" },
      text: texto,
      ...extras,
    } as NonNullable<AtualizacaoTelegram["message"]>,
  };
}

async function clicar(acao: Acao, payload: string): Promise<void> {
  const data = await assinarCallback(acao, payload);
  await processarUpdate({
    update_id: updateId++,
    callback_query: {
      id: `cb-${updateId}`,
      from: { id: ADMIN },
      message: { message_id: 10, chat: { id: ADMIN } },
      data,
    },
  });
}

function chamadasDe(metodo: string): Record<string, unknown>[] {
  return chamadas.filter((chamada) => chamada.metodo === metodo).map((chamada) => chamada.payload);
}

function textoDaUltimaEdicao(): string {
  const edicoes = chamadasDe("editMessageText");
  return String(edicoes.at(-1)?.["text"] ?? "");
}

async function criarLead() {
  return await registrarEvento(
    { evento: "entrada", whatsapp: "11953866646" },
    { ipHash: "h", userAgent: "vitest" },
  );
}

describe("autorização", () => {
  it("recusa quem não é o administrador", async () => {
    await processarUpdate({
      update_id: 1,
      message: { message_id: 1, chat: { id: 999 }, from: { id: 999 }, text: "/start" },
    });

    expect(chamadasDe("sendMessage")).toHaveLength(1);
    expect(String(chamadasDe("sendMessage")[0]?.["text"])).toContain("Acesso restrito");
  });
});

describe("menu por botões", () => {
  it("/start abre o painel com botões assinados", async () => {
    await processarUpdate(mensagemSimples("/start"));

    const [envio] = chamadasDe("sendMessage");
    const teclado = envio?.["reply_markup"] as {
      inline_keyboard: Array<Array<{ callback_data: string }>>;
    };
    const dados = teclado.inline_keyboard[0]?.[0]?.callback_data ?? "";
    expect(dados.split("|")).toHaveLength(4);
  });

  it("não responde a texto solto (sem pergunta pendente)", async () => {
    await processarUpdate(mensagemSimples("oi, tudo bem?"));

    expect(chamadas).toHaveLength(0);
  });

  it("métrica é editada na própria mensagem", async () => {
    await clicar("s", "agora");

    expect(chamadasDe("editMessageText")).toHaveLength(1);
    expect(textoDaUltimaEdicao()).toContain("Métricas ao vivo");
    expect(chamadasDe("sendMessage")).toHaveLength(0);
  });

  it("localidades e dispositivos usam os mesmos botões", async () => {
    await clicar("g", "geo");
    expect(textoDaUltimaEdicao()).toContain("Localidades dos acessos");

    await clicar("v", "dev");
    expect(textoDaUltimaEdicao()).toContain("Desktop × Celular");

    await clicar("q", "qual");
    expect(textoDaUltimaEdicao()).toContain("Qualidade dos leads");
  });
});

describe("leads", () => {
  it("lista, abre a ficha e volta", async () => {
    const { lead } = await criarLead();

    await clicar("l", "0");
    expect(textoDaUltimaEdicao()).toContain("Leads");

    await clicar("d", lead.id);
    expect(textoDaUltimaEdicao()).toContain(lead.id.slice(0, 8));

    await clicar("l", "0");
    expect(textoDaUltimaEdicao()).toContain("Leads");
  });

  it("verifica o WhatsApp do lead e mostra o resultado honesto", async () => {
    const { lead } = await criarLead();

    await clicar("w", lead.id);

    expect(textoDaUltimaEdicao()).toContain("Verificação de WhatsApp");
    expect(textoDaUltimaEdicao()).toContain("conta NÃO confirmada");
  });

  it("converte o lead", async () => {
    const { lead } = await criarLead();

    await clicar("c", lead.id);

    await expect(obterLead(lead.id)).resolves.toMatchObject({ etapa: "convertido" });
  });

  it("rejeita botão com assinatura forjada", async () => {
    const { lead } = await criarLead();

    await processarUpdate({
      update_id: 900,
      callback_query: {
        id: "cb-falso",
        from: { id: ADMIN },
        message: { message_id: 10, chat: { id: ADMIN } },
        data: `1|e|${lead.id}|assinaturafalsa`,
      },
    });

    expect(chamadasDe("answerCallbackQuery")).toHaveLength(1);
    expect(String(chamadasDe("answerCallbackQuery")[0]?.["text"])).toContain(
      "Botão inválido ou expirado",
    );
  });
});

describe("resposta a mensagem específica", () => {
  it("só aceita o número quando é resposta à pergunta do bot", async () => {
    const { lead } = await criarLead();

    await clicar("e", lead.id);
    const prompt = chamadasDe("sendMessage")[0];
    expect(prompt?.["reply_markup"]).toMatchObject({ force_reply: true });
    const promptId = 100;

    // Resposta a outra mensagem: ignorada em silêncio.
    await processarUpdate(
      mensagemSimples("11 98888-7777", { reply_to_message: { message_id: 999 } }),
    );
    await expect(obterLead(lead.id)).resolves.toMatchObject({ whatsapp: "5511953866646" });

    // Resposta à mensagem certa: aplica.
    await processarUpdate(
      mensagemSimples("11 98888-7777", { reply_to_message: { message_id: promptId } }),
    );

    await expect(obterLead(lead.id)).resolves.toMatchObject({ whatsapp: "5511988887777" });
    expect(chamadasDe("editMessageText").length).toBeGreaterThan(0);
  });

  it("troca o número oficial do site por botão + resposta", async () => {
    await clicar("o", "site");
    const promptId = 100;

    await processarUpdate(
      mensagemSimples("21 98888-7777", { reply_to_message: { message_id: promptId } }),
    );

    await expect(obterConfigSite()).resolves.toMatchObject({ whatsapp: "5521988887777" });
  });
});
