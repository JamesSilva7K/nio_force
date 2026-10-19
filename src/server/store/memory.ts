import type {
  AprovacaoPendente,
  LeadArmazenado,
  LeadStore,
  PendenteAdmin,
  RankingItem,
  RateLimitResult,
  SiteConfig,
} from "./types";

const LIMITE_LEADS_MEMORIA = 5_000;

/**
 * Store em memória — usado em desenvolvimento e como último recurso quando não
 * há Redis configurado. Os dados somem a cada cold start; por isso o webhook
 * avisa o administrador quando o modo volátil está ativo.
 */
class MemoriaStore implements LeadStore {
  readonly nome = "memoria";

  private readonly leads = new Map<string, LeadArmazenado>();
  private readonly ordem: string[] = [];
  private readonly contadores = new Map<string, number>();
  private readonly rankings = new Map<string, Map<string, number>>();
  private readonly pendentes = new Map<number, PendenteAdmin>();
  private readonly indices = new Map<string, string>();
  private readonly taxas = new Map<string, { total: number; reiniciaEm: number }>();
  private readonly aprovacoes = new Map<string, AprovacaoPendente>();
  private config: SiteConfig | null = null;

  async obterLead(id: string): Promise<LeadArmazenado | null> {
    return this.leads.get(id) ?? null;
  }

  async salvarLead(lead: LeadArmazenado): Promise<void> {
    if (!this.leads.has(lead.id)) {
      this.ordem.push(lead.id);
      if (this.ordem.length > LIMITE_LEADS_MEMORIA) {
        const antigo = this.ordem.shift();
        if (antigo) this.leads.delete(antigo);
      }
    }
    this.leads.set(lead.id, lead);
  }

  async listarIds(limite: number): Promise<string[]> {
    return [...this.ordem].reverse().slice(0, Math.max(0, limite));
  }

  async contarLeads(): Promise<number> {
    return this.leads.size;
  }

  /** Zera o estado — usado apenas nos testes. */
  limpar(): void {
    this.leads.clear();
    this.ordem.length = 0;
    this.contadores.clear();
    this.rankings.clear();
    this.pendentes.clear();
    this.indices.clear();
    this.taxas.clear();
    this.aprovacoes.clear();
    this.config = null;
  }

  async incrementar(contador: string, por = 1): Promise<number> {
    const atual = (this.contadores.get(contador) ?? 0) + por;
    this.contadores.set(contador, atual);
    return atual;
  }

  async obterContador(contador: string): Promise<number> {
    return this.contadores.get(contador) ?? 0;
  }

  async incrementarRanking(ranking: string, item: string, por = 1): Promise<void> {
    let mapa = this.rankings.get(ranking);
    if (!mapa) {
      mapa = new Map<string, number>();
      this.rankings.set(ranking, mapa);
    }
    mapa.set(item, (mapa.get(item) ?? 0) + por);
  }

  async topRanking(ranking: string, limite: number): Promise<RankingItem[]> {
    const mapa = this.rankings.get(ranking);
    if (!mapa) return [];
    return [...mapa.entries()]
      .map(([item, total]) => ({ item, total }))
      .sort((a, b) => b.total - a.total)
      .slice(0, Math.max(0, limite));
  }

  async obterConfig(): Promise<SiteConfig | null> {
    return this.config;
  }

  async salvarConfig(config: SiteConfig): Promise<void> {
    this.config = config;
  }

  async indexar(tipo: "tel" | "cpf", hash: string, leadId: string): Promise<void> {
    this.indices.set(`${tipo}:${hash}`, leadId);
  }

  async buscarPorIndice(tipo: "tel" | "cpf", hash: string): Promise<string | null> {
    return this.indices.get(`${tipo}:${hash}`) ?? null;
  }

  async definirPendente(chatId: number, pendente: PendenteAdmin | null): Promise<void> {
    if (pendente === null) this.pendentes.delete(chatId);
    else this.pendentes.set(chatId, pendente);
  }

  async obterPendente(chatId: number): Promise<PendenteAdmin | null> {
    const pendente = this.pendentes.get(chatId);
    if (!pendente) return null;
    if (pendente.expiraEm <= Date.now()) {
      this.pendentes.delete(chatId);
      return null;
    }
    return pendente;
  }

  async limiteTaxa(
    chave: string,
    limite: number,
    janelaSegundos: number,
  ): Promise<RateLimitResult> {
    const agora = Date.now();
    const atual = this.taxas.get(chave);
    if (!atual || atual.reiniciaEm <= agora) {
      const reiniciaEm = agora + janelaSegundos * 1_000;
      this.taxas.set(chave, { total: 1, reiniciaEm });
      return { permitido: true, restante: Math.max(0, limite - 1), reiniciaEm };
    }
    atual.total += 1;
    return {
      permitido: atual.total <= limite,
      restante: Math.max(0, limite - atual.total),
      reiniciaEm: atual.reiniciaEm,
    };
  }

  async salvarAprovacao(aprovacao: AprovacaoPendente): Promise<void> {
    this.aprovacoes.set(aprovacao.id, aprovacao);
  }

  async obterAprovacao(id: string): Promise<AprovacaoPendente | null> {
    const a = this.aprovacoes.get(id);
    if (!a) return null;
    if (a.expiraEm <= Date.now()) {
      this.aprovacoes.delete(id);
      return null;
    }
    return a;
  }

  async removerAprovacao(id: string): Promise<void> {
    this.aprovacoes.delete(id);
  }
}

const escopoGlobal = globalThis as typeof globalThis & { __nioMemoriaStore?: MemoriaStore };

/** Instância única (sobrevive ao hot reload do Vite em desenvolvimento). */
export function memoriaStore(): MemoriaStore {
  escopoGlobal.__nioMemoriaStore ??= new MemoriaStore();
  return escopoGlobal.__nioMemoriaStore;
}
