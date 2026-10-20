import { ErroLimite, ErroNaoEncontrado, ErroValidacao } from "./errors";

/** Cabeçalhos de segurança aplicados a toda resposta. */
const CABECALHOS_BASE: Record<string, string> = {
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Cross-Origin-Opener-Policy": "same-origin",
  "Cross-Origin-Resource-Policy": "same-origin",
  "Permissions-Policy":
    "accelerometer=(), camera=(), geolocation=(), gyroscope=(), magnetometer=(), microphone=(), payment=(), usb=()",
  "X-DNS-Prefetch-Control": "off",
};

/** CSP: bloqueia enquadramento (clonagem por iframe), plugins e origens externas. */
const CSP = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' https://www.googletagmanager.com https://www.googleadservices.com https://googleads.g.doubleclick.net https://www.google.com",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' https://fonts.gstatic.com data:",
  "img-src 'self' data: blob: https://www.googletagmanager.com https://www.google-analytics.com https://googleads.g.doubleclick.net https://www.googleadservices.com https://www.google.com https://www.google.com.br",
  "connect-src 'self' https://www.googletagmanager.com https://www.google-analytics.com https://region1.google-analytics.com https://analytics.google.com https://googleads.g.doubleclick.net https://stats.g.doubleclick.net https://www.googleadservices.com https://www.google.com",
  "frame-src https://www.googletagmanager.com",
  "frame-ancestors 'none'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self' https://wa.me https://api.whatsapp.com",
  "upgrade-insecure-requests",
].join("; ");

/** Aplica os cabeçalhos de segurança, preservando os já definidos. */
export function aplicarSeguranca(resposta: Response): Response {
  const headers = new Headers(resposta.headers);
  for (const [nome, valor] of Object.entries(CABECALHOS_BASE)) {
    if (!headers.has(nome)) headers.set(nome, valor);
  }
  if (!headers.has("Strict-Transport-Security")) {
    headers.set("Strict-Transport-Security", "max-age=63072000; includeSubDomains; preload");
  }
  if (!headers.has("X-Robots-Tag")) headers.set("X-Robots-Tag", "index, follow");

  const tipo = headers.get("content-type") ?? "";
  if (tipo.includes("text/html") && !headers.has("Content-Security-Policy")) {
    headers.set("Content-Security-Policy", CSP);
  }

  // 204/205/304 não podem carregar corpo.
  const semCorpo = resposta.status === 204 || resposta.status === 205 || resposta.status === 304;

  return new Response(semCorpo ? null : resposta.body, {
    status: resposta.status,
    statusText: resposta.statusText,
    headers,
  });
}

/** Resposta JSON com cabeçalhos de segurança e sem cache por padrão. */
export function jsonResposta(
  corpo: unknown,
  status = 200,
  extras: Record<string, string> = {},
): Response {
  const headers = new Headers({
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store, max-age=0",
    "X-Content-Type-Options": "nosniff",
    ...extras,
  });
  for (const [nome, valor] of Object.entries(CABECALHOS_BASE)) {
    headers.set(nome, valor);
  }
  return new Response(JSON.stringify(corpo), { status, headers });
}

export function textoResposta(texto: string, status = 200): Response {
  const headers = new Headers({ "Content-Type": "text/plain; charset=utf-8" });
  for (const [nome, valor] of Object.entries(CABECALHOS_BASE)) {
    headers.set(nome, valor);
  }
  return new Response(texto, { status, headers });
}

/** Converte um erro de domínio em resposta JSON segura (sem stack trace). */
export function erroResposta(erro: unknown): Response {
  if (erro instanceof ErroLimite) {
    return jsonResposta({ ok: false, erro: erro.message }, 429, {
      "Retry-After": String(Math.max(1, Math.ceil((erro.reiniciaEm - Date.now()) / 1000))),
    });
  }
  if (erro instanceof ErroValidacao) {
    return jsonResposta({ ok: false, erro: erro.message }, 400);
  }
  if (erro instanceof ErroNaoEncontrado) {
    return jsonResposta({ ok: false, erro: erro.message }, 404);
  }

  console.error("[api] erro inesperado:", erro);
  return jsonResposta({ ok: false, erro: "Erro interno." }, 500);
}

/** IP do cliente a partir dos cabeçalhos do proxy (Vercel/Cloudflare). */
export function ipDoCliente(request: Request): string {
  const encaminhado = request.headers.get("x-forwarded-for");
  if (encaminhado) {
    const primeiro = encaminhado.split(",")[0];
    if (primeiro && primeiro.trim().length > 0) return primeiro.trim();
  }
  return request.headers.get("cf-connecting-ip") ?? request.headers.get("x-real-ip") ?? "0.0.0.0";
}

/** Lê o corpo JSON respeitando um limite de bytes. */
export async function lerJson<T>(request: Request, limiteBytes: number): Promise<T> {
  const declarado = Number(request.headers.get("content-length") ?? "0");
  if (Number.isFinite(declarado) && declarado > limiteBytes) {
    throw new ErroValidacao("Corpo da requisição grande demais.");
  }
  const texto = await request.text();
  if (texto.length > limiteBytes) {
    throw new ErroValidacao("Corpo da requisição grande demais.");
  }
  try {
    return JSON.parse(texto) as T;
  } catch {
    throw new ErroValidacao("JSON inválido.");
  }
}

/** Compara o host da requisição com a lista permitida (anti-clonagem por domínio). */
export function hostPermitido(request: Request, permitidos: readonly string[]): boolean {
  if (permitidos.length === 0) return true;
  const url = new URL(request.url);
  const host = (request.headers.get("host") ?? url.host).toLowerCase();
  const semPorta = host.split(":")[0] ?? host;
  return permitidos.some(
    (permitido) =>
      semPorta === permitido ||
      semPorta.endsWith(`.${permitido}`) ||
      (permitido.startsWith(".") && semPorta.endsWith(permitido)),
  );
}
