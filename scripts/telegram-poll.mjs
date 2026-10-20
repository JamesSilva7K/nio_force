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

if (!BOT) {
  console.error("[poll] TELEGRAM_BOT_TOKEN ausente. Rode com --env-file=.env.local");
  process.exit(1);
}
if (!SEGREDO) {
  console.error("[poll] TELEGRAM_WEBHOOK_SECRET ausente.");
  process.exit(1);
}

const dormir = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function detectarAlvo() {
  if (process.env.LOCAL_WEBHOOK) return process.env.LOCAL_WEBHOOK;
  const candidatos = [
    process.env.SITE_URL ? `${process.env.SITE_URL.replace(/\/$/, "")}/api/telegram/webhook` : null,
    "http://127.0.0.1:8080/api/telegram/webhook",
    "http://127.0.0.1:3000/api/telegram/webhook",
    "http://127.0.0.1:5173/api/telegram/webhook",
  ].filter(Boolean);

  for (const url of candidatos) {
    try {
      const ping = await fetch(url.replace("/telegram/webhook", "/health"), {
        signal: AbortSignal.timeout(600),
      });
      if (ping.status < 500) return url;
    } catch {
      // continua procurando porta ativa
    }
  }
  return candidatos[0] || "http://127.0.0.1:8080/api/telegram/webhook";
}

let offset = 0;
let rodando = true;
process.on("SIGINT", () => {
  rodando = false;
  console.log("\n[poll] encerrando…");
});

console.log("[poll] iniciando escuta do bot Telegram...");

while (rodando) {
  try {
    const alvo = await detectarAlvo();
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
      console.error("[poll] Telegram recusou getUpdates:", dados.description ?? resposta.status);
      await dormir(3_000);
      continue;
    }

    for (const update of dados.result ?? []) {
      try {
        const envio = await fetch(alvo, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-telegram-bot-api-secret-token": SEGREDO,
          },
          body: JSON.stringify(update),
          signal: AbortSignal.timeout(5_000),
        });

        console.log(`[poll] update #${update.update_id} → ${alvo} (${envio.status})`);
        if (envio.status >= 400) {
          const corpo = await envio.text();
          console.log("  resposta do servidor:", corpo.slice(0, 200));
        }
        // Só avança o offset após tentar enviar com sucesso
        offset = Math.max(offset, update.update_id + 1);
      } catch {
        console.error(`[poll] ⚠️ Falha ao conectar no servidor local (${alvo}).`);
        console.error(`[poll] 👉 Certifique-se de iniciar o servidor em outro terminal: npm run dev`);
        await dormir(3_000);
        break; // Tenta o mesmo update novamente no próximo ciclo
      }
    }
  } catch (erro) {
    if (rodando) {
      console.error("[poll]", erro?.message ?? erro);
      await dormir(2_500);
    }
  }
}
