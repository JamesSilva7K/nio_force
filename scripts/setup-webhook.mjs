#!/usr/bin/env node
/**
 * Utilitário de configuração e diagnóstico do Webhook do Telegram.
 *
 * Uso:
 *   # Ver o status atual do webhook:
 *   node --env-file=.env.local scripts/setup-webhook.mjs --info
 *
 *   # Registrar o webhook usando a URL do .env.local (SITE_URL):
 *   node --env-file=.env.local scripts/setup-webhook.mjs
 *
 *   # Registrar especificando a URL pública da Vercel:
 *   node --env-file=.env.local scripts/setup-webhook.mjs https://seu-site.vercel.app
 *
 *   # Remover o webhook (necessário para rodar o telegram-poll.mjs localmente):
 *   node --env-file=.env.local scripts/setup-webhook.mjs --delete
 */

const BOT = process.env.TELEGRAM_BOT_TOKEN;
const SEGREDO = process.env.TELEGRAM_WEBHOOK_SECRET;
const argumento = process.argv[2];

if (!BOT) {
  console.error("❌ TELEGRAM_BOT_TOKEN ausente. Rode com --env-file=.env.local");
  process.exit(1);
}

async function verInfo() {
  const resp = await fetch(`https://api.telegram.org/bot${BOT}/getWebhookInfo`);
  const dados = await resp.json();
  console.log("ℹ️ Status atual do Webhook no Telegram:");
  console.log(JSON.stringify(dados.result, null, 2));
}

async function remover() {
  console.log("⏳ Removendo webhook do Telegram...");
  const resp = await fetch(`https://api.telegram.org/bot${BOT}/deleteWebhook?drop_pending_updates=false`);
  const dados = await resp.json();
  if (dados.ok) {
    console.log("✅ Webhook removido com sucesso! O bot agora pode responder via long-polling (scripts/telegram-poll.mjs).");
  } else {
    console.error("❌ Falha ao remover webhook:", dados.description);
  }
}

async function configurar(baseUrl) {
  if (!SEGREDO) {
    console.error("❌ TELEGRAM_WEBHOOK_SECRET ausente no ambiente.");
    process.exit(1);
  }

  const webhookUrl = `${baseUrl.replace(/\/$/, "")}/api/telegram/webhook`;
  console.log(`⏳ Registrando webhook: ${webhookUrl}`);

  const resp = await fetch(`https://api.telegram.org/bot${BOT}/setWebhook`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      url: webhookUrl,
      secret_token: SEGREDO,
      allowed_updates: ["message", "callback_query"],
      drop_pending_updates: false,
      max_connections: 40,
    }),
  });

  const dados = await resp.json();
  if (dados.ok) {
    console.log("✅ Webhook registrado com sucesso no Telegram!");
    console.log(`🔗 URL: ${webhookUrl}`);
    console.log(`🛡️ Secret Token: configurado e protegido.`);
  } else {
    console.error("❌ Telegram recusou a configuração:", dados.description);
  }
}

async function principal() {
  if (argumento === "--info") {
    await verInfo();
    return;
  }

  if (argumento === "--delete") {
    await remover();
    return;
  }

  const urlAlvo = (argumento && argumento.startsWith("http"))
    ? argumento
    : process.env.SITE_URL;

  if (!urlAlvo || urlAlvo.includes("127.0.0.1") || urlAlvo.includes("localhost")) {
    console.log("⚠️ ATENÇÃO: Nenhuma URL pública HTTPS informada.");
    console.log("   O Telegram exige uma URL HTTPS pública para webhooks.");
    console.log("   Se estiver em ambiente de desenvolvimento local, use:");
    console.log("     npm run telegram:poll");
    console.log("");
    console.log("   Para registrar em produção (Vercel), passe a URL:");
    console.log("     node --env-file=.env.local scripts/setup-webhook.mjs https://sua-url.vercel.app");
    console.log("");
    await verInfo();
    return;
  }

  await configurar(urlAlvo);
  await verInfo();
}

principal().catch((erro) => {
  console.error("❌ Erro inesperado:", erro);
  process.exit(1);
});
