import { createFileRoute, Link } from "@tanstack/react-router";

import { EMPRESA } from "@/lib/empresa";

export const Route = createFileRoute("/termos")({
  head: () => ({
    meta: [
      { title: "Termos de Uso — Nio Fibra" },
      {
        name: "description",
        content:
          "Condições de uso do site da Nio Fibra: atendimento por WhatsApp, propriedade intelectual, uso proibido e responsabilidades.",
      },
      { name: "robots", content: "index, follow" },
    ],
  }),
  component: Termos,
});

function Secao({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <section className="mt-8">
      <h2 className="font-display text-2xl font-bold uppercase text-primary-deep">{titulo}</h2>
      <div className="mt-3 space-y-3 text-muted-foreground">{children}</div>
    </section>
  );
}

function Termos() {
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
          Termos de Uso
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Última atualização: {EMPRESA.atualizadoEm}
        </p>

        <Secao titulo="1. Identificação">
          <p>
            Este site é operado por {EMPRESA.razaoSocial || EMPRESA.nomeFantasia}
            {EMPRESA.cnpj ? `, CNPJ ${EMPRESA.cnpj}` : ""}
            {EMPRESA.endereco ? `, com sede em ${EMPRESA.endereco}` : ""} (“Nio Fibra”). Ao navegar
            ou utilizar o atendimento, você concorda com estes termos.
          </p>
        </Secao>

        <Secao titulo="2. Objeto">
          <p>
            O site apresenta serviços de internet, suporte técnico, faturas e negociação de débitos,
            e direciona o visitante para o atendimento humano pelo WhatsApp. O conteúdo é
            informativo e não substitui o contrato de prestação de serviço vigente com a operadora.
          </p>
        </Secao>

        <Secao titulo="3. Atendimento">
          <p>
            O atendimento ocorre em horário comercial, de segunda a sexta, das 8h às 18h. Valores,
            prazos e condições de negociação são sempre confirmados por um atendente antes de
            qualquer pagamento.
          </p>
        </Secao>

        <Secao titulo="4. Uso permitido e proibido">
          <p>É permitido navegar, compartilhar links e solicitar atendimento.</p>
          <p>É proibido:</p>
          <ul className="list-disc space-y-2 pl-5">
            <li>
              copiar, raspar ou republicar o conteúdo para simular este site ou esta operadora;
            </li>
            <li>
              automatizar acessos, contornar limites de uso ou tentar obter dados de terceiros;
            </li>
            <li>enviar informações falsas ou de terceiros sem autorização;</li>
            <li>usar o canal de atendimento para spam, fraude ou assédio.</li>
          </ul>
        </Secao>

        <Secao titulo="5. Propriedade intelectual">
          <p>
            Marca, textos, layout, código e imagens pertencem à Nio Fibra ou são usados com licença.
            O uso indevido sujeita o responsável às medidas civis e criminais cabíveis.
          </p>
        </Secao>

        <Secao titulo="6. Disponibilidade">
          <p>
            Buscamos manter o site disponível, mas ele pode ficar temporariamente fora do ar por
            manutenção, falha de terceiros ou motivos de força maior. Não há garantia de
            disponibilidade ininterrupta.
          </p>
        </Secao>

        <Secao titulo="7. Limitação de responsabilidade">
          <p>
            Não nos responsabilizamos por decisões tomadas com base em informações desatualizadas de
            terceiros, por indisponibilidade do WhatsApp ou por danos decorrentes de uso indevido
            deste site. O atendimento oficial ocorre exclusivamente pelos canais divulgados aqui.
          </p>
        </Secao>

        <Secao titulo="8. Privacidade">
          <p>
            O tratamento de dados pessoais é descrito na{" "}
            <Link to="/privacidade" className="font-semibold text-primary hover:underline">
              Política de Privacidade
            </Link>
            .
          </p>
        </Secao>

        <Secao titulo="9. Foro">
          <p>
            Aplica-se a legislação brasileira. Fica eleito o foro do domicílio do consumidor para
            questões de consumo, conforme o Código de Defesa do Consumidor.
          </p>
        </Secao>
      </main>

      <footer className="border-t border-border py-8 text-center text-sm text-muted-foreground">
        © {new Date().getFullYear()} {EMPRESA.nomeFantasia}
      </footer>
    </div>
  );
}
