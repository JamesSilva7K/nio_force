# Nio Fibra — site de atendimento + monitoramento de leads

Landing page de uma provedora de internet que encaminha o visitante para o
WhatsApp, com um sistema próprio de rastreamento de leads e um painel de
administração dentro do Telegram.

O visual da página **não foi alterado**: mesma estrutura, mesmas classes, mesmos
textos de marketing. O que mudou está sob o capô.

## Stack

- [TanStack Start](https://tanstack.com/start) (React 19 + SSR) sobre Vite
- Tailwind CSS 4 + componentes Radix (shadcn/ui)
- API própria em Web Standards (`Request`/`Response`), sem framework de servidor extra
- Redis via REST (Upstash / Vercel KV) para persistência
- Bot do Telegram via API HTTP, sem SDK
- Testes com Vitest

## Como funciona

```
Visitante → página (SSR) → /api/lead  →  lead no Redis
                                ↓
                        bot do Telegram → administrador
                                ↓
                     botão "editar número" → /api/config → site
```

1. Ao abrir a página, o navegador cria um id anônimo (`localStorage`) e registra
   `entrada`. Cada carregamento seguinte registra `visualizacao`.
2. Cada clique em um CTA de WhatsApp gera `clique_whatsapp` e move o lead para a
   etapa `whatsapp` do funil.
3. O administrador recebe a ficha completa com botões no Telegram.
4. Ao trocar o número oficial do site, a próxima renderização do servidor já usa
   o número novo (o número é lido no `loader` da rota, no servidor).

## Estrutura

| Caminho                   | Responsabilidade                                                       |
| ------------------------- | ---------------------------------------------------------------------- |
| `src/server.ts`           | entrada do servidor: API, cabeçalhos de segurança, anti-clonagem e SSR |
| `src/server/api.ts`       | rotas HTTP, limites de taxa, honeypot, deduplicação do webhook         |
| `src/server/leads.ts`     | domínio: registrar evento, mover etapa, atualizar número, métricas     |
| `src/server/crypto.ts`    | AES-256-GCM, HMAC-SHA-256, comparação em tempo constante               |
| `src/server/seguranca.ts` | chave mestra, cifra das PII, índice cego de busca                      |
| `src/server/store/`       | store em memória e store Redis (REST), mesma interface                 |
| `src/server/telegram/`    | API do Telegram, formatação PT-BR, botões assinados, comandos          |
| `src/lib/br.ts`           | validação de telefone (DDD + nono dígito), CPF, e-mail, UTM            |
| `src/lib/tracking.ts`     | rastreamento no navegador (`sendBeacon` + `keepalive`)                 |
| `src/lib/site-config.ts`  | número oficial no cliente, com valor inicial vindo do SSR              |

## Rodando localmente

```bash
cp .env.example .env.local   # preencha o que tiver
pnpm install
pnpm dev                     # http://localhost:8080
```

Sem `UPSTASH_REDIS_*` o sistema usa memória (os dados somem ao reiniciar).
Sem `TELEGRAM_*` o site funciona normalmente e o bot fica inativo.

## Scripts

| Comando          | O que faz                   |
| ---------------- | --------------------------- |
| `pnpm dev`       | servidor de desenvolvimento |
| `pnpm build`     | build de produção (Nitro)   |
| `pnpm preview`   | pré-visualiza o build       |
| `pnpm typecheck` | `tsc --noEmit`              |
| `pnpm lint`      | ESLint + Prettier           |
| `pnpm test`      | Vitest (96 testes)          |

## Endpoints

| Rota                    | Método | Descrição                                                |
| ----------------------- | ------ | -------------------------------------------------------- |
| `/api/lead`             | POST   | registra evento de rastreamento (com antifraude)         |
| `/api/config`           | GET    | número de WhatsApp vigente (cache de 15 s)               |
| `/api/health`           | GET    | estado da configuração e do store                        |
| `/api/telegram/webhook` | POST   | webhook do bot (exige `x-telegram-bot-api-secret-token`) |
| `/api/telegram/setup`   | POST   | registra o webhook (exige `ADMIN_API_TOKEN`)             |
| `/api/admin/metricas`   | GET    | métricas completas por link assinado temporário          |

## Bot do Telegram

**Só botões.** O único comando é `/start`; todo o resto é navegação por botões
que edita a própria mensagem. Textos soltos são ignorados (sem spam).

- Menu: **📊 Métricas**, **📍 Localidades**, **📱 Dispositivos**, **🌱 Qualidade**,
  **👥 Leads**, **☎️ Nº do site**.
- Ficha do lead: **🔄 Atualizar**, **🔎 Verificar WhatsApp**, **✏️ Nº do WhatsApp**,
  **📝 Observação**, **✅ Converter**, **⚫ Perder**, **🌐 Usar nº no site**.
- Perguntas usam `force_reply`: o administrador só é ouvido respondendo à
  mensagem específica do bot.

Todos os botões carregam assinatura HMAC; qualquer `callback_data` forjado é
recusado.

## Antifraude e qualidade

Cada lead recebe pontuação de risco (0–100) por user-agent, client hints, país,
e-mail descartável, telefone repetido, tempo de clique e volume por IP.
Resultado: **confiável**, **suspeito** ou **descartado**. Descartados não geram
notificação, o que evita spam no Telegram.

## Métricas

Acessos por dispositivo, navegador, sistema, país, estado e cidade — sempre
calculadas na hora (nada de cache velho). Geolocalização vem dos cabeçalhos da
borda (Vercel/Cloudflare); sem eles, o acesso conta como “Não identificado”.

## Google Ads (gtag.js)

A tag de conversão `AW-18517052475` é injetada uma única vez no cliente por
`src/lib/analytics.ts` (pode ser trocada por `VITE_GOOGLE_ADS_ID`). A CSP do
servidor já libera `googletagmanager.com` e os domínios de medição do Google,
e a Política de Privacidade declara os cookies `_gcl_au` e `_ga`.

## Testar o bot localmente

```bash
npm run dev          # em um terminal
npm run telegram:poll  # em outro: long polling -> webhook local
```

O script `scripts/telegram-poll.mjs` busca os updates no Telegram e os entrega
ao webhook local com o cabeçalho secreto — em produção a Vercel recebe direto.

## Conformidade com anúncios

O site **não faz cloaking**: o mesmo HTML é servido para visitante, robô e
revisor. Rodapé com identificação da empresa, Política de Privacidade e Termos
de Uso. Detalhes e checklist em [CONFORMIDADE.md](./CONFORMIDADE.md).

## Segurança

Resumo: HTTPS/HSTS, PII cifrada com AES-256-GCM, botões assinados com HMAC,
senha de webhook em tempo constante, limites de taxa por IP, CSP com
`frame-ancestors 'none'`, bloqueio por domínio e rotas administrativas assinadas
com expiração.

Leia [SEGURANCA.md](./SEGURANCA.md) para o que está implementado e,
principalmente, para os limites reais (DDoS, clonagem de conteúdo, ofuscação,
verificação de WhatsApp).

## Deploy

Passo a passo na Vercel gratuita em [DEPLOY.md](./DEPLOY.md), incluindo a
variável `NITRO_PRESET=vercel`.

## Privacidade (LGPD)

Nenhum cookie de terceiros, nenhum script de analytics externo. O IP é gravado
apenas como hash com sal. Telefone, CPF, e-mail, nome e observações só existem
se informados e ficam cifrados no Redis.
