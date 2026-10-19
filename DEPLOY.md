# Deploy na Vercel (plano gratuito) — passo a passo

Este projeto é um site TanStack Start que agora inclui:

- API própria de rastreamento de leads (`/api/lead`);
- configuração pública do WhatsApp (`/api/config`);
- webhook do bot do Telegram (`/api/telegram/webhook`);
- painel do administrador dentro do próprio Telegram.

Nada disso exige plano pago. O único serviço externo necessário é um Redis com
API REST (Upstash, plano gratuito) para guardar os leads — funções serverless não
têm disco persistente.

---

## 1. Criar o bot no Telegram

1. Fale com [@BotFather](https://t.me/BotFather) → `/newbot`.
2. Guarde o **token** (`123456789:AA...`). Ele é o `TELEGRAM_BOT_TOKEN`.
3. Descubra seu chat ID: depois do primeiro deploy, envie `/id` para o bot.
   Enquanto isso, você pode usar o [@userinfobot](https://t.me/userinfobot).

## 2. Criar o Redis (Upstash)

1. [upstash.com](https://upstash.com) → **Create Database** → região `us-east-1`
   ou `sa-east-1` → plano **Free**.
2. Aba **REST API** → copie `UPSTASH_REDIS_REST_URL` e `UPSTASH_REDIS_REST_TOKEN`.

> Sem essas duas variáveis o sistema funciona, mas os leads ficam em memória e
> desaparecem a cada cold start. A rota `/api/health` avisa quando isso acontece.

## 3. Gerar os segredos

```bash
openssl rand -base64 32   # LEAD_ENCRYPTION_KEY
openssl rand -hex 32      # TELEGRAM_WEBHOOK_SECRET
openssl rand -hex 32      # ADMIN_API_TOKEN (temporário)
```

A `LEAD_ENCRYPTION_KEY` cifra telefone, CPF, e-mail e nome com AES-256-GCM.
**Perder essa chave significa perder os dados pessoais já gravados.**

## 4. Publicar na Vercel

1. Importe o repositório na Vercel.
2. Framework preset: **Other** (deixe o build como está).
3. Em **Settings → Environment Variables**, cadastre:

| Variável                   | Obrigatória | Valor                                      |
| -------------------------- | ----------- | ------------------------------------------ |
| `TELEGRAM_BOT_TOKEN`       | sim         | token do BotFather                         |
| `TELEGRAM_ADMIN_ID`        | sim         | seu chat ID numérico                       |
| `TELEGRAM_WEBHOOK_SECRET`  | sim         | segredo gerado                             |
| `LEAD_ENCRYPTION_KEY`      | sim         | 32 bytes em base64                         |
| `UPSTASH_REDIS_REST_URL`   | sim         | URL REST do Upstash                        |
| `UPSTASH_REDIS_REST_TOKEN` | sim         | token REST do Upstash                      |
| `SITE_URL`                 | sim         | `https://seu-projeto.vercel.app`           |
| `DEFAULT_WHATSAPP`         | não         | `5511953866646`                            |
| `ALLOWED_HOSTS`            | recomendado | `seu-projeto.vercel.app,seudominio.com.br` |
| `NITRO_PRESET`             | sim         | `vercel`                                   |

4. **Deploy**. O build gera as funções serverless com o preset `vercel` do Nitro.

> `ALLOWED_HOSTS` ativa o bloqueio por domínio (resposta `421` para hosts não
> autorizados). Inclua o domínio da Vercel **e** o domínio próprio.

## 5. Registrar o webhook do Telegram

Uma única chamada, depois do deploy:

```bash
curl -X POST https://seu-projeto.vercel.app/api/telegram/setup \
  -H "x-admin-token: SEU_ADMIN_API_TOKEN"
```

Resposta esperada: `{"ok":true,"webhook":"https://.../api/telegram/webhook"}`.

Confira em `https://api.telegram.org/bot<TOKEN>/getWebhookInfo`.

Depois disso você pode **remover** o `ADMIN_API_TOKEN` da Vercel: a rota passa a
responder `404`.

## 6. Conferir se está tudo no ar

- `GET /api/health` → `{"ok":true,"store":"redis",...}`.
- Envie `/start` para o bot → deve aparecer o painel.
- Abra o site e clique em qualquer botão de WhatsApp → o administrador recebe a
  ficha do lead com botões.

## 7. Uso diário (dentro do Telegram)

O painel é **100% por botões**. O único comando é `/start` (ou `/menu`). Nada de
decorar comandos e nada de mensagens soltas: cada clique **edita a própria
mensagem**, então o chat não enche.

Menu principal:

| Botão           | O que mostra                                        |
| --------------- | --------------------------------------------------- |
| 📊 Métricas     | visitas, leads, cliques, conversão — sempre ao vivo |
| 📍 Localidades  | países, estados e cidades dos acessos               |
| 📱 Dispositivos | desktop × celular, navegadores e sistemas           |
| 🌱 Qualidade    | confiáveis × suspeitos × descartados (antifraude)   |
| 👥 Leads        | lista paginada, 5 por página, abre a ficha          |
| ☎️ Nº do site   | troca o WhatsApp exibido no site (pede o número)    |

Em cada ficha:

- **🔎 Verificar WhatsApp** — análise profunda do número (DDD, UF, nono dígito,
  padrões fictícios). Com `WHATSAPP_VERIFY_URL` configurado, confirma também a
  existência real da conta.
- **✏️ Nº do WhatsApp** — o bot responde pedindo o número; você **responde
  aquela mensagem** e o bot edita a mesma mensagem com o resultado.
- **🌐 Usar nº no site** — publica o número do lead como número oficial do site.
- **✅ Converter / ⚫ Perder** — fecha o funil.
- **📝 Observação** — anotação cifrada, também por resposta à mensagem.

> **Sem spam:** o bot ignora mensagens que não sejam resposta a uma pergunta
> dele. Se você digitar algo solto, nada acontece.

A troca do número do site aparece para os visitantes já na próxima renderização
(o número é lido no servidor).

## 8. Verificação de WhatsApp (o que é real)

| Camada              | O que confirma                                                |
| ------------------- | ------------------------------------------------------------- |
| Local (sempre)      | DDD existente, UF, celular com nono dígito, padrões fictícios |
| Provedor (opcional) | Existência real da conta WhatsApp no número                   |

Não existe jeito gratuito, legítimo e serverless de provar que um número tem
conta WhatsApp. As opções reais são:

1. **Meta Cloud API (WhatsApp Business)** com WABA aprovada — consulta oficial;
2. um **verificador contratado** que já tenha essa integração.

Configure `WHATSAPP_VERIFY_URL` + `WHATSAPP_VERIFY_TOKEN` apontando para um
desses serviços. O contrato é simples:

```http
POST https://seu-provedor/check
Authorization: Bearer <WHATSAPP_VERIFY_TOKEN>
Content-Type: application/json

{ "numero": "5511953866646" }
```

Resposta esperada: `{"existe": true}` ou `{"existe": false}`.

Sem provedor, o bot mostra **“formato válido — conta NÃO confirmada”**. Ele nunca
mente dizendo que verificou.

## 9. Problemas comuns

| Sintoma                       | Causa provável                                                                                            |
| ----------------------------- | --------------------------------------------------------------------------------------------------------- |
| Bot não responde              | webhook não registrado (`getWebhookInfo`) ou `TELEGRAM_WEBHOOK_SECRET` diferente do usado no `setWebhook` |
| "Acesso restrito"             | `TELEGRAM_ADMIN_ID` não bate com o chat que enviou a mensagem                                             |
| Botão responde "expirado"     | clique em botão de mensagem muito antiga; use `/start` para gerar um painel novo                          |
| Leads somem                   | sem Upstash configurado (modo memória)                                                                    |
| Localidades vazias            | fora da Vercel não há cabeçalho de geolocalização; em produção funciona                                   |
| `421 Domínio não autorizado`  | `ALLOWED_HOSTS` sem o domínio atual                                                                       |
| `503 Webhook não configurado` | `TELEGRAM_WEBHOOK_SECRET` ausente                                                                         |

## 10. Desenvolvimento local

```bash
cp .env.example .env.local      # preencha os valores
npm install
npm run dev                     # http://localhost:8080
npm run typecheck
npm test
```

Sem `UPSTASH_REDIS_REST_*` o sistema usa memória. Sem `TELEGRAM_*` a API de
rastreamento continua funcionando; o bot fica inativo.

**Testar o bot antes de publicar:** o Telegram precisa de uma URL pública, então
em desenvolvimento use a ponte de long polling (em outro terminal):

```bash
npm run telegram:poll
```

Ela busca os updates e os entrega em `/api/telegram/webhook` já com o cabeçalho
secreto. Em produção a Vercel recebe direto — não deixe a ponte rodando.

> O `.env.local` guarda o token do bot e as chaves. Ele é ignorado pelo Git
> (`.env.*`, com exceção de `.env.example`). Nunca cole o token em código,
> print ou repositório; se vazar, revogue no @BotFather (`/revoke`).

## 11. Antes de anunciar

Leia [CONFORMIDADE.md](./CONFORMIDADE.md): preencha `src/lib/empresa.ts` (razão
social, CNPJ, endereço, e-mails) e revise as promessas do texto. O sistema **não
faz cloaking** — e isso é intencional.

A tag do Google Ads (`AW-18517052475`) já está ativa. Troque por outra definindo
`VITE_GOOGLE_ADS_ID` na Vercel, sem mexer no código.
