# Conformidade com plataformas de anúncios (Google Ads, Meta, TikTok)

> **Princípio deste sistema: conformidade, não evasão.**
> Nada aqui foi feito para "esconder" o site de revisores, mostrar conteúdo
> diferente para robôs ou burlar análise. Essas técnicas (cloaking) são
> detectáveis, derrubam a conta de anúncios e, no Brasil, podem configurar
> publicidade enganosa (CDC, art. 37). O que existe é transparência verificável.

---

## 1. O que garante conformidade na prática

| Exigência típica das plataformas        | Como o sistema atende                                                    |
| --------------------------------------- | ------------------------------------------------------------------------ |
| Página de destino acessível e funcional | SSR com `200`, sem interstício, sem redirecionamento automático          |
| Conteúdo igual para usuário e revisor   | **Não existe ramo por user-agent**: a página é idêntica para todos       |
| Identificação do anunciante             | Rodapé com razão social, CNPJ e endereço (`src/lib/empresa.ts`)          |
| Política de Privacidade acessível       | `/privacidade`, linkada no rodapé                                        |
| Termos de Uso                           | `/termos`, linkados no rodapé                                            |
| Coerência entre anúncio e destino       | Copy fala de fatura/suporte/planos e o destino faz exatamente isso       |
| Canal de contato real                   | WhatsApp com mensagem pré-preenchida + telefone visível                  |
| Sem coleta enganosa de dados            | Sem formulário escondido; contato só no WhatsApp                         |
| Sem promessa enganosa                   | Nenhum "100% grátis", "garantido", contador falso ou escassez artificial |

## 2. Verdade sobre "blindar contra políticas"

Nenhum código "blinda" um site contra as políticas de uma plataforma: quem
decide é a revisão humana/automática da plataforma. O que o sistema faz é
**reduzir o risco de reprovação**:

1. **Transparência total** — o mesmo HTML, os mesmos preços, o mesmo CTA para
   todo mundo, incluindo o revisor.
2. **Rastreamento ético** — anti-fraude sim, perseguição não: sem fingerprint,
   sem cookie de terceiros, sem pixel de rede social.
3. **Provas no código** — a suíte de testes falha se alguém introduzir
   comportamento condicionado a user-agent nas rotas.

O que **não** é feito, de propósito:

- ❌ cloaking (conteúdo diferente para revisor/bot);
- ❌ redirecionamento para página "limpa" quando detecta revisor;
- ❌ texto invisível ou keyword stuffing;
- ❌ depoimentos, contadores de clientes ou notas inventadas;
- ❌ urgência falsa ("últimas vagas", "promoção acaba hoje");
- ❌ pedir CPF antes de explicar para quê.

## 3. Checklist do proprietário antes de subir campanha

- [ ] Preencher `src/lib/empresa.ts`: razão social, CNPJ, endereço, e-mail de
      contato e e-mail do encarregado (LGPD). Os colchetes aparecem no rodapé e
      nas páginas legais até serem preenchidos.
- [ ] Publicar os mesmos termos no perfil da empresa no Google/Meta.
- [ ] Garantir que o número do WhatsApp é o mesmo do anúncio.
- [ ] Revisar as promessas do texto: nada de "internet grátis" ou "sem fidelidade"
      se não for verdade.
- [ ] Configurar `ALLOWED_HOSTS` com o domínio oficial (evita que cópias
      apontem para a sua implantação).
- [ ] Se anunciar no Meta, concluir a verificação de empresa e vincular o
      WhatsApp Business.

## 4. Perguntas de revisão que o site já responde

- **O que o site faz?** Explica serviços de internet, suporte, faturas e planos de fibra.
- **Quem é o responsável?** Rodapé + página de privacidade.
- **Como falar?** WhatsApp com mensagem pronta e telefone visível.
- **Quais dados são coletados?** Seção "Quais dados coletamos".
- **Há custo escondido?** Não há cobrança no site; valores são confirmados no
  atendimento antes de qualquer pagamento.

## 5. Risco residual (honestidade)

- A seção de dívidas foi removida do site; restou apenas a menção informativa a
  "fatura em aberto" e reconexão. Mantenha o texto assim e nunca prometa "limpar
  o nome" ou "negociar qualquer valor".
- Preencha `src/lib/empresa.ts` antes de publicar: o rodapé só exibe a linha
  cadastral quando razão social/CNPJ/endereço estão preenchidos.
- O número exibido no site muda por decisão do administrador. Se houver campanha
  ativa, o número do anúncio precisa continuar correspondendo.
- Nenhuma ferramenta garante aprovação. Se uma campanha for reprovada, o caminho
  é corrigir a causa apontada — não tentar enganar a revisão.
