/**
 * Google Ads (gtag.js).
 *
 * O identificador é público — não é segredo. Pode ser trocado por variável de
 * ambiente `VITE_GOOGLE_ADS_ID` sem mexer no código.
 *
 * Observação de privacidade: o gtag grava cookies de medição do Google
 * (`_gcl_au`, `_ga`). Isso está declarado na Política de Privacidade.
 */

const ID_PADRAO = "AW-18517052475";

declare global {
  interface Window {
    dataLayer?: unknown[];
    gtag?: (...args: unknown[]) => void;
  }
}

let iniciado = false;

export function googleAdsId(): string {
  const doAmbiente = import.meta.env["VITE_GOOGLE_ADS_ID"];
  return typeof doAmbiente === "string" && doAmbiente.length > 0 ? doAmbiente : ID_PADRAO;
}

/** Injeta o gtag uma única vez, no navegador. */
export function iniciarGoogleTag(): void {
  if (typeof window === "undefined" || iniciado) return;

  const id = googleAdsId();
  if (!/^AW-\d{6,}$/.test(id)) return;

  iniciado = true;

  window.dataLayer = window.dataLayer ?? [];
  window.gtag = function gtag(...args: unknown[]) {
    window.dataLayer?.push(args);
  };
  window.gtag("js", new Date());
  window.gtag("config", id);

  const script = document.createElement("script");
  script.async = true;
  script.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(id)}`;
  document.head.appendChild(script);
}

/** Registra uma conversão (usado nos cliques de WhatsApp, se desejado). */
export function registrarConversao(rotulo: string): void {
  if (typeof window === "undefined" || !window.gtag) return;
  window.gtag("event", "conversion", { send_to: googleAdsId(), event_label: rotulo });
}
