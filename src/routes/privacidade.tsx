import { createFileRoute, Link } from "@tanstack/react-router";

import { EMPRESA } from "@/lib/empresa";

export const Route = createFileRoute("/privacidade")({
  head: () => ({
    meta: [
      { title: "Política de Privacidade — Nio Fibra" },
      {
        name: "description",
        content:
          "Como a Nio Fibra coleta, usa, armazena e protege dados pessoais no atendimento pelo WhatsApp, conforme a LGPD.",
      },
      { name: "robots", content: "index, follow" },
    ],
  }),
  component: Privacidade,
});

function Secao({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <section className="mt-8">
      <h2 className="font-display text-2xl font-bold uppercase text-primary-deep">{titulo}</h2>
      <div className="mt-3 space-y-3 text-muted-foreground">{children}</div>
    </section>
  );
}

function Privacidade() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-5 py-4">
          <Link to="/" className="font-display text-3xl font-extrabold lowercase text-primary">
            nio
          </Link>
          <Link
            to="/"
            className="text-sm font-medium text-muted-foreground hover:text-primary-deep"
          >
            Voltar ao site
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-5 py-12">
        <h1 className="font-display text-4xl font-extrabold uppercase text-primary-deep">
          Política de Privacidade
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Última atualização: {EMPRESA.atualizadoEm}
        </p>

        <Secao titulo="Quem é o controlador">
          <p>
            {EMPRESA.razaoSocial || EMPRESA.nomeFantasia}
            {EMPRESA.cnpj ? `, CNPJ ${EMPRESA.cnpj}` : ""}
            {EMPRESA.endereco ? `, com sede em ${EMPRESA.endereco}` : ""} é a controladora dos dados
            pessoais tratados neste site.
          </p>
          <p>
            Contato: {EMPRESA.emailContato || "pelo WhatsApp oficial de atendimento"} · Encarregado
            de dados (DPO): {EMPRESA.emailEncarregado || "solicite o contato pelo atendimento"}.
          </p>
        </Secao>

        <Secao titulo="Quais dados coletamos">
          <p>
            <strong className="text-foreground">Dados de navegação:</strong> identificador aleatório
            guardado no seu navegador, página de entrada, parâmetros de campanha, site de origem,
            tipo de dispositivo, sistema, navegador, e país/estado/cidade aproximados (derivados do
            IP pela infraestrutura de hospedagem).
          </p>
          <p>
            <strong className="text-foreground">Endereço IP:</strong> não é armazenado. Guardamos
            apenas um código hash irreversível, usado para segurança e limitação de abuso.
          </p>
          <p>
            <strong className="text-foreground">Dados de contato:</strong> nome, telefone
            (WhatsApp), CPF e e-mail — somente quando você os informa no atendimento.
          </p>
          <p>
            <strong className="text-foreground">Cookies:</strong> usamos a tag de medição do Google
            Ads (gtag.js), que grava os cookies <code>_gcl_au</code> e <code>_ga</code> para medir
            quantas visitas vieram dos nossos anúncios e quantas geraram contato. Não usamos pixels
            de redes sociais nem vendedores de dados. Para bloquear, ajuste as permissões de cookies
            do seu navegador ou as{" "}
            <a
              href="https://myadcenter.google.com/"
              target="_blank"
              rel="noopener noreferrer"
              className="font-semibold text-primary hover:underline"
            >
              preferências de anúncios do Google
            </a>
            .
          </p>
        </Secao>

        <Secao titulo="Por que tratamos esses dados">
          <ul className="list-disc space-y-2 pl-5">
            <li>Prestar atendimento e responder solicitações sobre faturas e suporte técnico.</li>
            <li>
              Segurança da informação: identificar acessos automatizados e tentativas de fraude.
            </li>
            <li>Medir, de forma agregada, o desempenho das campanhas e a experiência do site.</li>
            <li>Cumprir obrigações legais e regulatórias aplicáveis.</li>
          </ul>
        </Secao>

        <Secao titulo="Base legal">
          <p>
            Tratamos dados de contato para executar o contrato e atender solicitações a seu pedido
            (art. 7º, V e VI, da LGPD). Para segurança, prevenção a fraude e métricas agregadas,
            usamos legítimo interesse (art. 7º, IX), sempre com minimização de dados. A medição de
            anúncios usa legítimo interesse na divulgação do serviço, com dados pseudonimizados pelo
            Google; você pode se opor a qualquer momento pelos canais abaixo.
          </p>
        </Secao>

        <Secao titulo="Com quem compartilhamos">
          <ul className="list-disc space-y-2 pl-5">
            <li>
              <strong className="text-foreground">Vercel</strong> — hospedagem do site e das rotas
              de API (EUA).
            </li>
            <li>
              <strong className="text-foreground">Upstash</strong> — banco de dados Redis onde os
              registros ficam cifrados.
            </li>
            <li>
              <strong className="text-foreground">Telegram</strong> — canal privado por onde o
              administrador recebe e atualiza os registros de atendimento.
            </li>
            <li>
              <strong className="text-foreground">WhatsApp/Meta</strong> — quando você escolhe
              iniciar o atendimento por esse canal, sujeito à política da própria plataforma.
            </li>
            <li>
              <strong className="text-foreground">Google</strong> — medição de anúncios e conversões
              (Google Ads), com dados pseudonimizados; sujeito à política de privacidade do Google.
            </li>
          </ul>
          <p>
            Não vendemos dados pessoais e não usamos os seus dados de contato para publicidade
            comportamental.
          </p>
        </Secao>

        <Secao titulo="Por quanto tempo guardamos">
          <p>
            Registros de atendimento são mantidos por até 12 meses após o último contato, salvo
            prazo legal ou regulatório maior. Métricas agregadas, sem identificação, podem ser
            mantidas por prazo indeterminado.
          </p>
        </Secao>

        <Secao titulo="Seus direitos">
          <p>
            Você pode solicitar confirmação de tratamento, acesso, correção, anonimização,
            portabilidade ou eliminação dos seus dados, além de informações sobre compartilhamento
            (art. 18 da LGPD). Basta escrever para {EMPRESA.emailEncarregado}. Respondemos em até 15
            dias.
          </p>
        </Secao>

        <Secao titulo="Segurança">
          <p>
            Dados pessoais são cifrados em repouso com AES-256-GCM; o tráfego usa HTTPS com HSTS. O
            acesso ao painel é restrito a um único administrador autenticado no Telegram. Em caso de
            incidente relevante, comunicaremos os titulares e a ANPD conforme a lei.
          </p>
        </Secao>

        <Secao titulo="Alterações">
          <p>Podemos atualizar esta política. A data de revisão no topo indica a versão vigente.</p>
        </Secao>

        <p className="mt-10 text-sm text-muted-foreground">
          Veja também os{" "}
          <Link to="/termos" className="font-semibold text-primary hover:underline">
            Termos de Uso
          </Link>
          .
        </p>
      </main>

      <footer className="border-t border-border py-8 text-center text-sm text-muted-foreground">
        © {new Date().getFullYear()} {EMPRESA.nomeFantasia}
      </footer>
    </div>
  );
}
