import "./lib/error-capture";

import { consumeLastCapturedError } from "./lib/error-capture";
import { renderErrorPage } from "./lib/error-page";
import { rotearApi } from "./server/api";
import { getConfig, setRuntimeEnv } from "./server/env";
import { aplicarSeguranca, hostPermitido } from "./server/http";

type ServerEntry = {
  fetch: (request: Request, env: unknown, ctx: unknown) => Promise<Response> | Response;
};

interface ContextoPlataforma {
  waitUntil?: (promessa: Promise<unknown>) => void;
}

let serverEntryPromise: Promise<ServerEntry> | undefined;

async function getServerEntry(): Promise<ServerEntry> {
  if (!serverEntryPromise) {
    serverEntryPromise = import("@tanstack/react-start/server-entry").then(
      (m) => (m.default ?? m) as ServerEntry,
    );
  }
  return serverEntryPromise;
}

// h3 swallows in-handler throws into a normal 500 Response with body
// {"unhandled":true,"message":"HTTPError"} — try/catch alone never fires for those.
async function normalizeCatastrophicSsrResponse(response: Response): Promise<Response> {
  if (response.status < 500) return response;
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) return response;

  const body = await response.clone().text();
  if (!isH3SwallowedErrorBody(body)) return response;

  console.error(consumeLastCapturedError() ?? new Error(`h3 swallowed SSR error: ${body}`));
  return new Response(renderErrorPage(), {
    status: 500,
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}

function isH3SwallowedErrorBody(body: string): boolean {
  try {
    const payload = JSON.parse(body) as { unhandled?: unknown; message?: unknown };
    return payload.unhandled === true && payload.message === "HTTPError";
  } catch {
    return false;
  }
}

export default {
  async fetch(request: Request, env: unknown, ctx: unknown) {
    // Permite que a plataforma (Vercel, Workers) injete as variáveis de ambiente.
    setRuntimeEnv(env);

    const contexto = (ctx ?? {}) as ContextoPlataforma;
    const url = new URL(request.url);

    // Anti-clonagem por domínio: só responde aos hosts autorizados.
    if (url.pathname !== "/api/health" && !hostPermitido(request, getConfig().allowedHosts)) {
      return aplicarSeguranca(
        new Response("Domínio não autorizado. Este conteúdo é exclusivo do titular.", {
          status: 421,
          headers: { "content-type": "text/plain; charset=utf-8" },
        }),
      );
    }

    // API própria (rastreamento de leads + webhook do Telegram) responde antes do SSR.
    const respostaApi = await rotearApi(request, {
      ...(contexto.waitUntil ? { waitUntil: contexto.waitUntil.bind(contexto) } : {}),
    });
    if (respostaApi) return aplicarSeguranca(respostaApi);

    try {
      const handler = await getServerEntry();
      const response = await handler.fetch(request, env, ctx);
      const normalizada = await normalizeCatastrophicSsrResponse(response);
      return aplicarSeguranca(normalizada);
    } catch (error) {
      console.error(error);
      return aplicarSeguranca(
        new Response(renderErrorPage(), {
          status: 500,
          headers: { "content-type": "text/html; charset=utf-8" },
        }),
      );
    }
  },
};
