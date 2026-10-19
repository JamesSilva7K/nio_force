# Segurança — o que está implementado e o que é honestamente impossível

Este documento descreve o modelo de segurança real do sistema. Ele existe para
que ninguém compre uma promessa que a tecnologia não cumpre.

## 1. Criptografia

| Camada                 | Implementação                                                                                   |
| ---------------------- | ----------------------------------------------------------------------------------------------- |
| Em trânsito            | HTTPS/TLS terminado na borda da Vercel + HSTS (`max-age=63072000; preload`)                     |
| PII em repouso         | AES-256-GCM (Web Crypto), IV aleatório de 96 bits por registro, envelope `v1.<iv>.<ciphertext>` |
| Chave                  | `LEAD_ENCRYPTION_KEY` (32 bytes), só no ambiente do servidor                                    |
| Botões do Telegram     | HMAC-SHA-256 truncado em 80 bits, comparação em tempo constante                                 |
| IP do visitante        | SHA-256 com sal (`IP_HASH_SALT`) — o IP nunca é gravado em claro                                |
| Busca por telefone/CPF | índice cego (hash com sal), não permite leitura dos valores                                     |

A PII (telefone, CPF, e-mail, nome, observações) é cifrada **antes** de chegar ao
Redis. Quem tiver acesso ao banco vê apenas envelopes opacos.

## 2. Autenticação e autorização

- **Webhook**: o Telegram envia `x-telegram-bot-api-secret-token`; a comparação é
  em tempo constante. Sem o segredo correto a resposta é `401`.
- **Administrador**: allowlist `TELEGRAM_ADMIN_ID`. Qualquer outro chat recebe
  "Acesso restrito" e nenhuma ação é executada.
- **Botões**: `callback_data` é `versao|acao|leadId|assinatura`. Sem a assinatura
  HMAC válida, o clique é recusado — mesmo que alguém copie o formato.
- **Setup**: `/api/telegram/setup` exige `x-admin-token`; sem
  `ADMIN_API_TOKEN` configurado a rota responde `404`.

## 3. DDoS, abuso e portas

O que **é** feito:

- limites por IP: 40 req/min e 400 req/hora no rastreamento, 120/min no
  `/api/config`, 240/min no webhook;
- limite de corpo: 2 KB nos eventos, 128 KB no webhook;
- timeouts de 5 s (Redis) e 8 s (Telegram), sem chamadas penduradas;
- `Cache-Control` curto no `/api/config` e `no-store` nas rotas sensíveis;
- deduplicação de `update_id` do Telegram.

O que **vem da plataforma**: a Vercel absorve ataques volumétricos (L3/L4) na
borda e não expõe portas — só 443/80 no proxy. Não existe SSH, banco ou porta
administrativa abertos.

O que **não** existe no plano gratuito: WAF com regras personalizadas, proteção
"always on" contra ataques de camada 7 sofisticados e SLA. Para um ataque
direcionado e sustentado, o caminho é Cloudflare (proxy + rate limiting) na
frente do domínio. Isso é uma decisão de infraestrutura, não de código.

## 4. Clonagem do site

- `Content-Security-Policy: frame-ancestors 'none'` e `X-Frame-Options: DENY`
  impedem embutir o site em iframe (a forma mais comum de clone visual).
- Script anti-frame no `<head>` como segunda barreira.
- `ALLOWED_HOSTS` responde `421` para domínios não autorizados que apontem para
  a sua implantação.
- `Cross-Origin-Resource-Policy: same-origin` e `Cross-Origin-Opener-Policy`
  isolam o contexto.

**Limite honesto:** HTML, CSS, JavaScript e imagens de um site público são
copiáveis por definição. Nenhuma técnica impede alguém de salvar a página e
hospedar uma cópia. O que se protege de verdade é o que dá valor: a API, o bot,
os leads e a marca. Contra cópia de conteúdo, o instrumento é jurídico (DMCA,
registro de marca) — não técnico.

## 5. Sobre "obfuscação"

O pedido original mencionava ofuscar o código. O sistema **não** usa ofuscação
como controle de segurança, por três motivos:

1. ofuscação não é criptografia — o código volta a ser legível com esforço
   pequeno;
2. ela quebra depuração, monitoramento de erro e auditoria;
3. ela cria falsa sensação de proteção.

O que protege de fato já está no lugar: segredos **nunca** vão para o bundle do
navegador (só variáveis `VITE_*` iriam, e nenhuma é usada), a PII é cifrada, e
toda decisão sensível acontece no servidor.

## 6. Antifraude e leads falsos

Todo acesso passa por uma pontuação de risco determinística
(`src/server/antifraude.ts`):

| Sinal                                        | Peso |
| -------------------------------------------- | ---- |
| Campo-armadilha (honeypot) preenchido        | 100  |
| User-agent vazio                             | 30   |
| Automação / headless / biblioteca HTTP       | 70   |
| Crawler conhecido (Googlebot etc.)           | 35   |
| Chrome sem client hints (UA forjado)         | 15   |
| Acesso fora do Brasil                        | 30   |
| E-mail descartável                           | 30   |
| Telefone já usado em outro lead              | 25   |
| Clique em menos de 700 ms                    | 15   |
| Mais de 20 requisições do mesmo IP na janela | 20   |

`≥ 60` → **descartado** (não notifica), `≥ 30` → **suspeito**, senão
**confiável**. A regra é auditável: cada ponto tem motivo registrado.

Não há fingerprint de navegador, canvas, fontes ou plugins — só o que o
navegador envia por padrão.

## 7. Rotas administrativas assinadas

Links de administração (`/api/admin/metricas?t=...`) usam token
`expira.assinatura` (HMAC-SHA-256, 12 bytes, comparação em tempo constante) com
validade padrão de 10 minutos. Sem token válido a rota responde `401` e não
revela nada.

**Honestidade:** URL não é "criptografável" — o caminho sempre aparece no
histórico do navegador e em logs. O que existe é assinatura + expiração, que
impede adivinhação e forja. Tráfego é cifrado por HTTPS, não a URL em si.

## 8. LGPD

- **Minimização**: o site grava apenas dados de navegação pseudônimos (id
  aleatório, página, campanha, user-agent, dispositivo, geolocalização aproximada,
  hash de IP). Nome, telefone e CPF só existem se o titular ou o atendente
  informarem.
- **Sem cookies de terceiros**: nenhum pixel, nenhum script de analytics externo.
- **Base legal**: legítimo interesse para segurança e melhoria do atendimento;
  consentimento para dados de contato.
- **Segurança**: PII cifrada, acesso restrito ao administrador no Telegram.
- **Direitos do titular**: para excluir um lead, remova a chave
  `nio:lead:<id>` do Redis (e as entradas `nio:idx:*` correspondentes). Como os
  dados estão cifrados, apagar a `LEAD_ENCRYPTION_KEY` torna todo o histórico
  ilegível de forma irreversível.

## 9. Checklist antes de ir para produção

- [ ] `LEAD_ENCRYPTION_KEY` gerada e guardada em cofre (não no Git)
- [ ] `TELEGRAM_WEBHOOK_SECRET` com 32 bytes aleatórios
- [ ] `TELEGRAM_ADMIN_ID` correto e testado
- [ ] `ALLOWED_HOSTS` com domínio Vercel + domínio próprio
- [ ] Upstash configurado e `/api/health` retornando `store: "redis"`
- [ ] `ADMIN_API_TOKEN` removido depois de registrar o webhook
- [ ] `src/lib/empresa.ts` preenchido (razão social, CNPJ, endereço, e-mails)
- [ ] Backup/exportação periódica dos leads
- [ ] `npm run typecheck`, `npm run lint` e `npm test` verdes
