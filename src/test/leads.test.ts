// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { toBase64Url } from "@/server/crypto";
import { ErroValidacao } from "@/server/errors";
import {
  atualizarWhatsappLead,
  buscarLead,
  definirWhatsappSite,
  metricas,
  obterConfigSite,
  obterLead,
  registrarEvento,
} from "@/server/leads";
import { getStore, resetStoreCache } from "@/server/store";
import { memoriaStore } from "@/server/store/memory";

const CHAVE = toBase64Url(new Uint8Array(32).fill(3));
const CONTEXTO = { ipHash: "hash-ip", userAgent: "vitest" };

beforeEach(() => {
  vi.stubEnv("NODE_ENV", "test");
  vi.stubEnv("LEAD_ENCRYPTION_KEY", CHAVE);
  vi.stubEnv("DEFAULT_WHATSAPP", "5511953866646");
  vi.stubEnv("UPSTASH_REDIS_REST_URL", "");
  vi.stubEnv("UPSTASH_REDIS_REST_TOKEN", "");
  memoriaStore().limpar();
  resetStoreCache();
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("registrarEvento", () => {
  it("cria o lead na primeira entrada com atribuição de campanha", async () => {
    const { lead, criado } = await registrarEvento(
      { evento: "entrada", caminho: "/", utm: { utm_source: "google", utm_medium: "cpc" } },
      CONTEXTO,
    );

    expect(criado).toBe(true);
    expect(lead.etapa).toBe("entrada");
    expect(lead.visitas).toBe(1);
    expect(lead.utm).toEqual({ utm_source: "google", utm_medium: "cpc" });
    await expect(obterLead(lead.id)).resolves.toMatchObject({ id: lead.id });
  });

  it("avança o funil até o WhatsApp mantendo o primeiro toque", async () => {
    const { lead } = await registrarEvento({ evento: "entrada", caminho: "/" }, CONTEXTO);
    await registrarEvento(
      { id: lead.id, evento: "clique_servico", rotulo: "servico:faturas" },
      CONTEXTO,
    );
    const final = await registrarEvento(
      { id: lead.id, evento: "clique_whatsapp", rotulo: "hero:atendimento" },
      CONTEXTO,
    );

    expect(final.criado).toBe(false);
    expect(final.lead.etapa).toBe("whatsapp");
    expect(final.lead.eventos.map((evento) => evento.nome)).toEqual([
      "entrada",
      "clique_servico",
      "clique_whatsapp",
    ]);
  });

  it("rejeita evento desconhecido", async () => {
    await expect(registrarEvento({ evento: "hackear" }, CONTEXTO)).rejects.toBeInstanceOf(
      ErroValidacao,
    );
  });

  it("ignora id inválido e gera um novo", async () => {
    const { lead } = await registrarEvento({ id: "../../etc/passwd", evento: "entrada" }, CONTEXTO);
    expect(lead.id).toMatch(/^[0-9a-f-]{36}$/);
  });
});

describe("PII", () => {
  it("guarda telefone e CPF cifrados e localiza por índice cego", async () => {
    const { lead } = await registrarEvento(
      {
        evento: "entrada",
        whatsapp: "(11) 98888-7777",
        cpf: "529.982.247-25",
        nome: "Maria Souza",
      },
      CONTEXTO,
    );

    expect(lead.whatsapp).toBe("5511988887777");
    expect(lead.cpf).toBe("52998224725");

    const bruto = await getStore().obterLead(lead.id);
    const serializado = JSON.stringify(bruto);
    expect(bruto?.pii?.startsWith("v1.")).toBe(true);
    expect(serializado).not.toContain("988887777");
    expect(serializado).not.toContain("52998224725");
    expect(serializado).not.toContain("Maria Souza");

    await expect(buscarLead("(11) 98888-7777")).resolves.toMatchObject({ id: lead.id });
    await expect(buscarLead("529.982.247-25")).resolves.toMatchObject({ id: lead.id });
    await expect(buscarLead(lead.id)).resolves.toMatchObject({ id: lead.id });
    await expect(buscarLead("11999999999")).resolves.toBeNull();
  });

  it("descarta número inválido em vez de gravar lixo", async () => {
    const { lead } = await registrarEvento({ evento: "entrada", whatsapp: "1234" }, CONTEXTO);
    expect(lead.whatsapp).toBeUndefined();
  });
});

describe("atualizarWhatsappLead", () => {
  it("atualiza o número, registra evento e reindexa a busca", async () => {
    const { lead } = await registrarEvento(
      { evento: "entrada", whatsapp: "11953866646" },
      CONTEXTO,
    );

    const atualizado = await atualizarWhatsappLead(lead.id, "11 98888-7777", "admin");

    expect(atualizado.whatsapp).toBe("5511988887777");
    expect(atualizado.eventos.at(-1)?.nome).toBe("numero_atualizado");
    await expect(buscarLead("11988887777")).resolves.toMatchObject({ id: lead.id });
  });

  it("recusa número inválido", async () => {
    const { lead } = await registrarEvento({ evento: "entrada" }, CONTEXTO);
    await expect(atualizarWhatsappLead(lead.id, "999", "admin")).rejects.toBeInstanceOf(
      ErroValidacao,
    );
  });
});

describe("configuração do site", () => {
  it("usa o número padrão até o administrador alterar", async () => {
    const inicial = await obterConfigSite();
    expect(inicial.whatsapp).toBe("5511953866646");

    const alterado = await definirWhatsappSite("21 98888-7777", "admin");
    expect(alterado.whatsapp).toBe("5521988887777");
    await expect(obterConfigSite()).resolves.toMatchObject({ whatsapp: "5521988887777" });
  });

  it("recusa número inválido", async () => {
    await expect(definirWhatsappSite("abc", "admin")).rejects.toBeInstanceOf(ErroValidacao);
  });
});

describe("metricas", () => {
  it("conta leads, cliques e transições", async () => {
    const { lead } = await registrarEvento({ evento: "entrada" }, CONTEXTO);
    await registrarEvento({ id: lead.id, evento: "clique_whatsapp" }, CONTEXTO);

    const dados = await metricas();
    expect(dados.total).toBe(1);
    expect(dados.cliquesWhatsapp).toBe(1);
    expect(dados.noWhatsapp).toBe(1);
    expect(dados.taxaWhatsapp).toBe(100);
  });
});
