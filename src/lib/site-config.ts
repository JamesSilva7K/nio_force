import { useEffect, useState } from "react";

/**
 * Número de WhatsApp exibido no site.
 *
 * O valor oficial fica no servidor e pode ser alterado pelo administrador pelo
 * Telegram. A página abre com o número padrão e, ao carregar, busca a versão
 * vigente em `/api/config` — assim a troca aparece sem mudar o layout.
 */

export const WHATSAPP_PADRAO = "5511953866646";

const VALIDADE_CACHE_MS = 60_000;

let cache: { valor: string; em: number } | null = null;
let emVoo: Promise<string> | null = null;

function cacheValido(): boolean {
  return cache !== null && Date.now() - cache.em < VALIDADE_CACHE_MS;
}

export function whatsappEmCache(): string {
  return cache?.valor ?? WHATSAPP_PADRAO;
}

async function buscarWhatsapp(): Promise<string> {
  if (cacheValido() && cache) return cache.valor;
  if (emVoo) return emVoo;

  emVoo = (async () => {
    try {
      const resposta = await fetch("/api/config", {
        headers: { Accept: "application/json" },
        credentials: "same-origin",
      });
      if (!resposta.ok) return whatsappEmCache();
      const dados = (await resposta.json()) as { whatsapp?: unknown };
      const numero = typeof dados.whatsapp === "string" ? dados.whatsapp : "";
      if (!/^\d{12,13}$/.test(numero)) return whatsappEmCache();
      cache = { valor: numero, em: Date.now() };
      return numero;
    } catch {
      return whatsappEmCache();
    } finally {
      emVoo = null;
    }
  })();

  return emVoo;
}

/**
 * Hook: devolve o número oficial.
 * `inicial` vem do servidor (SSR) e é a fonte da verdade — evita qualquer troca
 * visível na hidratação e nunca é sobrescrito por um cache antigo do cliente.
 */
export function useSiteWhatsapp(inicial?: string): string {
  const inicialValido = typeof inicial === "string" && /^\d{12,13}$/.test(inicial);

  const [numero, setNumero] = useState<string>(() =>
    inicialValido && inicial ? inicial : whatsappEmCache(),
  );

  useEffect(() => {
    if (inicialValido && inicial) {
      // O valor do SSR é a fonte da verdade: atualiza o cache e não busca de novo.
      cache = { valor: inicial, em: Date.now() };
      return;
    }

    let ativo = true;
    void buscarWhatsapp().then((valor) => {
      if (ativo) setNumero(valor);
    });
    return () => {
      ativo = false;
    };
  }, [inicialValido, inicial]);

  return numero;
}
