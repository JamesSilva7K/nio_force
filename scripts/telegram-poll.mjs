#!/usr/bin/env node
/**
 * Ponte de desenvolvimento: recebe os updates do Telegram por long polling e
 * encaminha para o webhook local, como se a Vercel estivesse chamando.
 *
 * Use apenas em desenvolvimento — em produção o Telegram fala direto com
 * /api/telegram/webhook via HTTPS.
 *
 *   node --env-file=.env.local scripts/telegram-poll.mjs
 */

const BOT = process.env.TELEGRAM_BOT_TOKEN;
const SEGREDO = process.env.TELEGRAM_WEBHOOK_SECRET;
const ALVO = process.env.LOCAL_WEBHOOK ?? "http://127.0.0.1:8080/api/telegram/webhook";

if (!BOT) {
  console.error("[poll] TELEGRAM_BOT_TOKEN ausente. Rode com --env-file=.env.local");
  process.exit(1);
}
if (!SEGREDO) {
  console.error("[poll] TELEGRAM_WEBHOOK_SECRET ausente.");
  process.exit(1);
}

const dormir = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

let offset = 0;
let rodando = true;
process.on("SIGINT", () => {
  rodando = false;
  console.log("\n[poll] encerrando…");
});

console.log(`[poll] escutando o bot e encaminhando para ${ALVO}`);

while (rodando) {
  try {
    const params = new URLSearchParams({
      timeout: "25",
      allowed_updates: JSON.stringify(["message", "callback_query"]),
    });
    if (offset > 0) params.set("offset", String(offset));

    const resposta = await fetch(`https://api.telegram.org/bot${BOT}/getUpdates?${params}`, {
      signal: AbortSignal.timeout(35_000),
    });
    const dados = await resposta.json();

    if (!dados.ok) {
      console.error("[poll] Telegram recusou:", dados.description ?? resposta.status);
      await dormir(3_000);
      continue;
    }

    for (const update of dados.result ?? []) {
      offset = Math.max(offset, update.update_id + 1);
      const envio = await fetch(ALVO, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-telegram-bot-api-secret-token": SEGREDO,
        },
        body: JSON.stringify(update),
      });
      console.log(`[poll] update ${update.update_id} → ${envio.status}`);
      if (envio.status >= 400) {
        const corpo = await envio.text();
        console.log("  resposta:", corpo.slice(0, 200));
      }
    }
  } catch (erro) {
    if (rodando) {
      console.error("[poll]", erro?.message ?? erro);
      await dormir(2_500);
    }
  }
}
