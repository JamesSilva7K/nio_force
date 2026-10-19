import type { RedisConfig } from "../env";
import type {
  AprovacaoPendente,
  LeadArmazenado,
  LeadStore,
  PendenteAdmin,
  RankingItem,
  RateLimitResult,
  SiteConfig,
} from "./types";

type RespostaRedis<T> = { result: T; error?: never } | { error: string; result?: never };

const TIMEOUT_MS = 5_000;
const TTL_PENDENTE_SEGUNDOS = 900;

/**
 * Store em Redis (Upstash REST / Vercel KV). Funciona em qualquer runtime com
 * `fetch` — inclusive nas funções serverless do plano gratuito da Vercel.
 */
export class RedisStore implements LeadStore {
  readonly nome = "redis";

  constructor(private readonly config: RedisConfig) {}

  private chave(...partes: Array<string | number>): string {
    return [this.config.prefix, ...partes].join(":");
  }

  private async requisitar<T>(caminho: string, corpo: unknown): Promise<T> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      const resposta = await fetch(`${this.config.url}${caminho}`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.config.token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(corpo),
        signal: controller.signal,
        cache: "no-store",
      });

      if (!resposta.ok) {
        throw new Error(`Redis HTTP ${resposta.status}`);
      }

      return (await resposta.json()) as T;
    } finally {
      clearTimeout(timer);
    }
  }

  private async comando<T>(...args: Array<string | number>): Promise<T> {
    const dados = await this.requisitar<RespostaRedis<T>>("", args);
    if (dados.error) throw new Error(`Redis: ${dados.error}`);
    return dados.result as T;
  }

  private async lote(comandos: Array<Array<string | number>>): Promise<void> {
    const dados = await this.requisitar<Array<RespostaRedis<unknown>>>("/pipeline", comandos);
    const falha = dados.find((item) => item.error);
    if (falha?.error) throw new Error(`Redis: ${falha.error}`);
  }

  async obterLead(id: string): Promise<LeadArmazenado | null> {
    const bruto = await this.comando<string | null>("GET", this.chave("lead", id));
    return bruto ? (JSON.parse(bruto) as LeadArmazenado) : null;
  }

  async salvarLead(lead: LeadArmazenado): Promise<void> {
    const score = Date.parse(lead.criadoEm) || Date.now();
    await this.lote([
      ["SET", this.chave("lead", lead.id), JSON.stringify(lead)],
      ["ZADD", this.chave("leads"), score, lead.id],
    ]);
  }

  async listarIds(limite: number): Promise<string[]> {
    if (limite <= 0) return [];
    const ids = await this.comando<string[]>("ZREVRANGE", this.chave("leads"), 0, limite - 1);
    return Array.isArray(ids) ? ids : [];
  }

  async contarLeads(): Promise<number> {
    const total = await this.comando<number>("ZCARD", this.chave("leads"));
    return Number(total) || 0;
  }

  async incrementar(contador: string, por = 1): Promise<number> {
    const total = await this.comando<number>("INCRBY", this.chave("contador", contador), por);
    return Number(total) || 0;
  }

  async obterContador(contador: string): Promise<number> {
    const total = await this.comando<string | null>("GET", this.chave("contador", contador));
    return Number(total ?? 0) || 0;
  }

  async incrementarRanking(ranking: string, item: string, por = 1): Promise<void> {
    await this.comando("ZINCRBY", this.chave("rank", ranking), por, item);
  }

  async topRanking(ranking: string, limite: number): Promise<RankingItem[]> {
    if (limite <= 0) return [];
    const bruto = await this.comando<Array<string | number>>(
      "ZREVRANGE",
      this.chave("rank", ranking),
      0,
      limite - 1,
      "WITHSCORES",
    );
    if (!Array.isArray(bruto)) return [];

    const itens: RankingItem[] = [];
    for (let i = 0; i + 1 < bruto.length; i += 2) {
      const nome = bruto[i];
      const pontos = bruto[i + 1];
      if (typeof nome !== "string") continue;
      itens.push({ item: nome, total: Number(pontos) || 0 });
    }
    return itens;
  }

  async obterConfig(): Promise<SiteConfig | null> {
    const bruto = await this.comando<string | null>("GET", this.chave("config", "site"));
    return bruto ? (JSON.parse(bruto) as SiteConfig) : null;
  }

  async salvarConfig(config: SiteConfig): Promise<void> {
    await this.comando("SET", this.chave("config", "site"), JSON.stringify(config));
  }

  async indexar(tipo: "tel" | "cpf", hash: string, leadId: string): Promise<void> {
    await this.comando("SET", this.chave("idx", tipo, hash), leadId);
  }

  async buscarPorIndice(tipo: "tel" | "cpf", hash: string): Promise<string | null> {
    return await this.comando<string | null>("GET", this.chave("idx", tipo, hash));
  }

  async definirPendente(chatId: number, pendente: PendenteAdmin | null): Promise<void> {
    const chave = this.chave("pendente", chatId);
    if (pendente === null) {
      await this.comando("DEL", chave);
      return;
    }
    await this.comando("SET", chave, JSON.stringify(pendente), "EX", TTL_PENDENTE_SEGUNDOS);
  }

  async obterPendente(chatId: number): Promise<PendenteAdmin | null> {
    const bruto = await this.comando<string | null>("GET", this.chave("pendente", chatId));
    if (!bruto) return null;
    try {
      const pendente = JSON.parse(bruto) as PendenteAdmin;
      return pendente.expiraEm > Date.now() ? pendente : null;
    } catch {
      return null;
    }
  }

  async limiteTaxa(
    chave: string,
    limite: number,
    janelaSegundos: number,
  ): Promise<RateLimitResult> {
    const nome = this.chave("rl", chave);
    const total = Number(await this.comando<number>("INCR", nome)) || 1;

    let ttlMs = janelaSegundos * 1_000;
    if (total === 1) {
      await this.comando("EXPIRE", nome, janelaSegundos);
    } else {
      const restante = Number(await this.comando<number>("PTTL", nome));
      if (Number.isFinite(restante) && restante > 0) ttlMs = restante;
    }

    return {
      permitido: total <= limite,
      restante: Math.max(0, limite - total),
      reiniciaEm: Date.now() + ttlMs,
    };
  }

  /** TTL de 30 min para aprovações pendentes. */
  private static readonly TTL_APROVACAO_SEGUNDOS = 1_800;

  async salvarAprovacao(aprovacao: AprovacaoPendente): Promise<void> {
    await this.comando(
      "SET",
      this.chave("aprovacao", aprovacao.id),
      JSON.stringify(aprovacao),
      "EX",
      RedisStore.TTL_APROVACAO_SEGUNDOS,
    );
  }

  async obterAprovacao(id: string): Promise<AprovacaoPendente | null> {
    const bruto = await this.comando<string | null>("GET", this.chave("aprovacao", id));
    if (!bruto) return null;
    try {
      const a = JSON.parse(bruto) as AprovacaoPendente;
      return a.expiraEm > Date.now() ? a : null;
    } catch {
      return null;
    }
  }

  async removerAprovacao(id: string): Promise<void> {
    await this.comando("DEL", this.chave("aprovacao", id));
  }
}
