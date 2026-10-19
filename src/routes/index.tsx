import { createFileRoute, Link } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { useEffect } from "react";
import {
  AlertTriangle,
  ArrowRight,
  Clock,
  FileText,
  Gauge,
  Headphones,
  Phone,
  Router,
  ShieldCheck,
  Unplug,
  Users,
  Wifi,
  WifiOff,
  Wrench,
  Zap,
} from "lucide-react";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { WhatsappIcon } from "@/components/icons/whatsapp";
import { formatBrPhone } from "@/lib/br";
import { identificacaoCadastral } from "@/lib/empresa";
import { useSiteWhatsapp } from "@/lib/site-config";
import { iniciarRastreamento } from "@/lib/tracking";
import { obterConfigSite } from "@/server/leads";

/**
 * Lê o número oficial no servidor, a cada renderização.
 * O handler é removido do bundle do navegador pelo compilador do TanStack Start.
 */
const carregarConfiguracaoSite = createServerFn({ method: "GET" }).handler(async () => {
  const config = await obterConfigSite();
  return { whatsapp: config.whatsapp };
});

export const Route = createFileRoute("/")({
  loader: () => carregarConfiguracaoSite(),
  head: () => ({
    meta: [
      { title: "Central de Atendimento NIO — Internet fibra e suporte pelo WhatsApp" },
      {
        name: "description",
        content:
          "Soluções em internet fibra e telecom para você e sua empresa. Faturas, suporte técnico e outros serviços com atendimento humano, direto no WhatsApp.",
      },
      { property: "og:type", content: "website" },
      {
        property: "og:title",
        content: "Central de Atendimento NIO — Internet fibra e suporte pelo WhatsApp",
      },
      {
        property: "og:description",
        content:
          "Conexão de qualidade com atendimento de gente. Fale direto com quem resolve, sem fila e sem robô.",
      },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Index,
});

const wa = (numero: string, msg: string) =>
  `https://wa.me/${numero}?text=${encodeURIComponent(msg)}`;

const services = [
  {
    id: "faturas",
    icon: FileText,
    title: "Faturas",
    text: "Tire dúvidas, solicite a segunda via e resolva pendências das suas faturas com rapidez.",
    cta: "Falar sobre faturas",
    msg: "Olá! Preciso de ajuda com minha fatura.",
  },
  {
    id: "suporte",
    icon: Wrench,
    title: "Suporte técnico",
    text: "Internet lenta, Wi‑Fi instável ou sem conexão? Nossa equipe resolve com você, passo a passo.",
    cta: "Solicitar suporte",
    msg: "Olá! Preciso de suporte técnico.",
  },
  {
    id: "planos",
    icon: Wifi,
    title: "Planos de fibra",
    text: "Conheça as velocidades disponíveis no seu endereço e contrate sem complicação.",
    cta: "Consultar planos",
    msg: "Olá! Quero conhecer os planos de fibra disponíveis no meu endereço.",
  },
  {
    id: "outros",
    icon: Headphones,
    title: "Outros serviços",
    text: "Mudança de endereço, alteração de titularidade, upgrade de plano e demais solicitações.",
    cta: "Falar com atendente",
    msg: "Olá! Quero falar com um atendente sobre outro serviço.",
  },
];

const situations = [
  {
    id: "cortada",
    icon: WifiOff,
    title: "Internet cortada",
    text: "Sem conexão nenhuma ou sinal que não volta.",
    msg: "Olá! Minha internet está cortada / sem conexão.",
  },
  {
    id: "fatura",
    icon: AlertTriangle,
    title: "Cortada por fatura",
    text: "Suspensa por falta de pagamento. Veja como reconectar.",
    msg: "Olá! Minha internet foi cortada por causa de uma fatura em aberto.",
  },
  {
    id: "lenta",
    icon: Gauge,
    title: "Internet lenta",
    text: "Trava, demora a carregar ou cai o tempo todo.",
    msg: "Olá! Minha internet está muito lenta.",
  },
  {
    id: "wifi",
    icon: Router,
    title: "Wi‑Fi não conecta",
    text: "Aparece a rede, mas não entra ou fica caindo.",
    msg: "Olá! Meu Wi‑Fi não conecta ou fica caindo.",
  },
  {
    id: "sinal",
    icon: Unplug,
    title: "Sinal só perto do roteador",
    text: "Em outros cômodos o sinal some.",
    msg: "Olá! O sinal do Wi‑Fi só é bom perto do roteador.",
  },
  {
    id: "luz",
    icon: Zap,
    title: "Luz piscando no roteador",
    text: "Luz vermelha ou piscando e nada funciona.",
    msg: "Olá! A luz do meu roteador está piscando e não conecta.",
  },
];

const pilares = [
  {
    icon: Zap,
    title: "Internet fibra estável",
    text: "Conexão estável e de alta velocidade para o seu dia a dia e para a operação da sua empresa.",
  },
  {
    icon: Users,
    title: "Atendimento personalizado",
    text: "Sem fila e sem robô: você fala direto com quem resolve, do primeiro contato ao pós-venda.",
  },
  {
    icon: ShieldCheck,
    title: "Suporte que acompanha",
    text: "Suporte técnico próximo e ágil, para a sua conexão não ficar parada.",
  },
];

const faqs: [string, string][] = [
  [
    "Como peço a 2ª via da fatura?",
    "Clique em “Falar sobre faturas” e envie seu CPF. Enviamos o boleto ou o Pix no mesmo atendimento.",
  ],
  [
    "Minha internet foi cortada por falta de pagamento. Como reconecto?",
    "Envie seu CPF pelo WhatsApp. Confirmamos o valor em aberto, combinamos o pagamento e a reconexão é feita assim que ele aparece.",
  ],
  [
    "Em quanto tempo a internet volta depois de pagar?",
    "Normalmente assim que o pagamento é confirmado. O atendente acompanha seu caso até a conexão voltar.",
  ],
  [
    "Internet lenta é problema do roteador ou da linha?",
    "Depende. Faça os testes rápidos da lista e mande o que apareceu: o atendente decide se é ajuste remoto ou visita técnica.",
  ],
  [
    "Quais planos de fibra estão disponíveis no meu endereço?",
    "A disponibilidade depende da região. Fale com um atendente pelo WhatsApp e receba as velocidades e condições para o seu endereço.",
  ],
  [
    "Qual o horário de atendimento?",
    "Segunda a sexta, das 8h às 18h, direto pelo WhatsApp. Fora desse horário, deixe a mensagem e respondemos na abertura.",
  ],
];

function WaButton({
  href,
  children,
  variant = "solid",
  marcador,
}: {
  href: string;
  children: React.ReactNode;
  variant?: "solid" | "outline";
  marcador?: string;
}) {
  const base =
    "inline-flex items-center justify-center gap-2 rounded-lg px-6 py-3.5 font-display text-lg font-bold uppercase tracking-wide transition-all hover:-translate-y-0.5";
  const v =
    variant === "solid"
      ? "bg-primary text-primary-foreground shadow-glow hover:brightness-105"
      : "border-2 border-primary-deep/20 bg-card text-primary-deep hover:border-primary";
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className={`${base} ${v}`}
      {...(marcador ? { "data-nio": marcador } : {})}
    >
      {children}
    </a>
  );
}

function AnimatedBg() {
  const paths = [
    "M-50 420 C 300 300, 600 520, 1500 260",
    "M-50 520 C 400 420, 800 640, 1500 380",
    "M-50 300 C 350 200, 700 420, 1500 140",
    "M-50 620 C 500 520, 900 720, 1500 520",
  ];
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
      <div className="grid-bg absolute inset-0" />
      <div className="animate-blob absolute -left-20 top-10 h-96 w-96 rounded-full bg-primary/25 blur-3xl" />
      <div className="animate-blob absolute right-0 top-40 h-[28rem] w-[28rem] rounded-full bg-accent/40 blur-3xl [animation-delay:-6s]" />
      <svg
        className="absolute inset-0 h-full w-full"
        viewBox="0 0 1440 800"
        preserveAspectRatio="none"
      >
        {paths.map((d, i) => (
          <g key={i}>
            <path d={d} fill="none" className="stroke-primary/15" strokeWidth="1.5" />
            <path
              d={d}
              fill="none"
              className="animate-fiber stroke-primary"
              strokeWidth="2.5"
              strokeLinecap="round"
              style={{ animationDelay: `${-i * 1.4}s`, animationDuration: `${5 + i}s` }}
            />
          </g>
        ))}
      </svg>
    </div>
  );
}

function SectionTitle({ kicker, title, text }: { kicker: string; title: string; text?: string }) {
  return (
    <>
      <p className="text-sm font-bold uppercase tracking-wider text-primary">{kicker}</p>
      <h2 className="mt-2 font-display text-4xl font-extrabold uppercase text-primary-deep md:text-5xl">
        {title}
      </h2>
      {text && <p className="mt-3 max-w-2xl text-lg text-muted-foreground">{text}</p>}
    </>
  );
}

function Index() {
  const { whatsapp: whatsappDoServidor } = Route.useLoaderData();
  const whatsapp = useSiteWhatsapp(whatsappDoServidor);
  const telefone = formatBrPhone(whatsapp);
  const link = (msg: string) => wa(whatsapp, msg);
  const identificacao = identificacaoCadastral();

  useEffect(() => {
    iniciarRastreamento();
  }, []);

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Topo */}
      <div className="bg-primary-deep text-xs font-semibold uppercase tracking-wider text-background">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-2">
          <span>Nio · Internet fibra e atendimento ao cliente</span>
          <a
            href={link("Olá!")}
            target="_blank"
            rel="noopener noreferrer"
            className="hidden items-center gap-1 sm:flex"
            data-nio="topo:whatsapp"
          >
            Atendimento via WhatsApp <ArrowRight className="h-3 w-3" />
          </a>
        </div>
      </div>

      <header className="sticky top-0 z-40 border-b border-border bg-background/80 backdrop-blur-lg">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-3">
          <a href="#inicio" aria-label="Nio — início" data-nio="header:logo">
            <img src="/logo-nio.png" alt="Nio" className="h-9 w-auto md:h-10" />
          </a>
          <nav className="hidden gap-6 text-sm font-medium text-muted-foreground md:flex">
            {[
              ["Início", "inicio"],
              ["Serviços", "servicos"],
              ["Situações", "situacoes"],
              ["Sobre nós", "sobre"],
              ["Dúvidas", "duvidas"],
            ].map(([l, id]) => (
              <a key={id} href={`#${id}`} className="transition-colors hover:text-primary-deep">
                {l}
              </a>
            ))}
          </nav>
          <a
            href={link("Olá! Vim pelo site.")}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 font-display font-bold uppercase text-primary-foreground shadow-glow"
            data-nio="header:whatsapp"
          >
            <WhatsappIcon className="h-4 w-4" /> WhatsApp
          </a>
        </div>
      </header>

      {/* Hero */}
      <section id="inicio" className="relative overflow-hidden">
        <AnimatedBg />
        <div className="relative mx-auto max-w-4xl px-5 py-24 text-center md:py-32">
          <div className="animate-rise">
            <span className="inline-flex items-center gap-2 rounded-full border border-primary/30 bg-card/70 px-3 py-1 text-sm font-semibold text-primary-deep">
              <span className="relative flex h-2.5 w-2.5">
                <span className="animate-pulse-ring absolute inset-0 rounded-full bg-primary" />
                <span className="relative h-2.5 w-2.5 rounded-full bg-primary" />
              </span>
              Atendimento por WhatsApp
            </span>
            <h1 className="mt-5 font-display text-5xl font-extrabold uppercase leading-[0.95] text-primary-deep md:text-7xl">
              Central de <br />
              atendimento <span className="text-primary">NIO</span>
            </h1>
            <p className="mx-auto mt-5 max-w-xl text-lg text-muted-foreground">
              Soluções em internet fibra e telecom para você e sua empresa. Resolva faturas, suporte
              técnico e outros serviços com agilidade e atendimento personalizado.
            </p>
            <div className="mt-8 flex flex-wrap justify-center gap-3">
              <WaButton href={link("Olá! Quero atendimento.")} marcador="hero:atendimento">
                <WhatsappIcon className="h-5 w-5" /> Iniciar atendimento
              </WaButton>
              <a
                href="#servicos"
                className="inline-flex items-center gap-2 rounded-lg border-2 border-primary-deep/20 bg-card/70 px-6 py-3.5 font-display text-lg font-bold uppercase text-primary-deep hover:border-primary"
              >
                Ver serviços
              </a>
            </div>
            <p className="mt-6 text-sm text-muted-foreground">
              <span className="font-semibold text-primary-deep">Atalhos:</span>{" "}
              <a
                href={link("Olá! Preciso de ajuda com minha fatura.")}
                target="_blank"
                rel="noopener noreferrer"
                className="hover:text-primary-deep"
                data-nio="hero:atalho-faturas"
              >
                Faturas
              </a>
              <span aria-hidden> · </span>
              <a
                href={link("Olá! Preciso de suporte técnico.")}
                target="_blank"
                rel="noopener noreferrer"
                className="hover:text-primary-deep"
                data-nio="hero:atalho-suporte"
              >
                Suporte
              </a>
              <span aria-hidden> · </span>
              <a
                href={link("Olá! Quero falar com um atendente sobre outro serviço.")}
                target="_blank"
                rel="noopener noreferrer"
                className="hover:text-primary-deep"
                data-nio="hero:atalho-outros"
              >
                Outros serviços
              </a>
            </p>
            <div className="mt-8 flex flex-wrap justify-center gap-6 text-sm text-muted-foreground">
              <span className="flex items-center gap-2">
                <Clock className="h-4 w-4 text-primary" /> Seg a sex, 8h às 18h
              </span>
              <span className="flex items-center gap-2">
                <Phone className="h-4 w-4 text-primary" /> {telefone}
              </span>
            </div>
          </div>
        </div>
      </section>

      {/* Serviços */}
      <section id="servicos" className="bg-secondary py-20">
        <div className="mx-auto max-w-6xl px-5">
          <div className="flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
            <div>
              <p className="text-sm font-bold uppercase tracking-wider text-primary">
                Serviços rápidos
              </p>
              <h2 className="mt-2 max-w-xl font-display text-4xl font-extrabold uppercase leading-[0.95] text-primary-deep md:text-5xl">
                Tudo o que você precisa em um só lugar.
              </h2>
            </div>
            <p className="max-w-sm text-lg text-muted-foreground">
              Escolha o canal certo e fale direto com quem resolve. Sem fila, sem robô.
            </p>
          </div>
          <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {services.map((s, i) => (
              <div
                key={s.title}
                className="group flex flex-col rounded-2xl border border-border bg-card p-6 transition-all hover:-translate-y-1 hover:border-primary hover:shadow-glow"
              >
                <div className="flex items-center justify-between">
                  <span className="font-display text-3xl font-extrabold text-primary">
                    0{i + 1}
                  </span>
                  <s.icon className="h-6 w-6 text-primary-deep" />
                </div>
                <h3 className="mt-5 font-display text-2xl font-bold uppercase text-primary-deep">
                  {s.title}
                </h3>
                <p className="mt-2 flex-1 text-sm text-muted-foreground">{s.text}</p>
                <a
                  href={link(s.msg)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-5 inline-flex items-center justify-center gap-2 rounded-lg bg-secondary py-2.5 font-display font-bold uppercase text-primary-deep transition-colors group-hover:bg-primary group-hover:text-primary-foreground"
                  data-nio={`servico:${s.id}`}
                >
                  {s.cta} <ArrowRight className="h-4 w-4" />
                </a>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Situações */}
      <section id="situacoes" className="py-20">
        <div className="mx-auto max-w-6xl px-5">
          <SectionTitle
            kicker="Sua internet está cortada?"
            title="Diga o que está acontecendo"
            text="Clique na situação mais parecida com a sua. A mensagem já vai pronta para o atendente certo."
          />
          <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {situations.map((s) => (
              <a
                key={s.title}
                href={link(s.msg)}
                target="_blank"
                rel="noopener noreferrer"
                className="group flex items-start gap-4 rounded-2xl border border-border bg-card p-6 transition-all hover:-translate-y-1 hover:border-primary hover:shadow-glow"
                data-nio={`situacao:${s.id}`}
              >
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-secondary text-primary-deep transition-colors group-hover:bg-primary group-hover:text-primary-foreground">
                  <s.icon className="h-5 w-5" />
                </span>
                <span className="flex-1">
                  <span className="block font-display text-xl font-bold uppercase text-primary-deep">
                    {s.title}
                  </span>
                  <span className="mt-1 block text-sm text-muted-foreground">{s.text}</span>
                  <span className="mt-3 inline-flex items-center gap-1 text-sm font-bold text-primary">
                    Enviar no WhatsApp{" "}
                    <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
                  </span>
                </span>
              </a>
            ))}
          </div>
        </div>
      </section>

      {/* Sobre nós */}
      <section id="sobre" className="bg-secondary py-20">
        <div className="mx-auto grid max-w-6xl gap-10 px-5 lg:grid-cols-[1fr_1.4fr] lg:items-center">
          <div>
            <p className="text-sm font-bold uppercase tracking-wider text-primary">Sobre nós</p>
            <h2 className="mt-2 font-display text-4xl font-extrabold uppercase leading-[0.95] text-primary-deep md:text-5xl">
              Conexão de qualidade com atendimento de gente.
            </h2>
            <p className="mt-4 text-lg text-muted-foreground">
              A NIO leva internet fibra e soluções de telecom para residências e empresas, com
              atendimento centralizado e humanizado: você fala com pessoas de verdade, direto pelo
              WhatsApp, e resolve o que precisa em poucos minutos.
            </p>
          </div>
          <div className="grid gap-5 sm:grid-cols-3">
            {pilares.map((p) => (
              <div key={p.title} className="rounded-2xl border border-border bg-card p-6">
                <p.icon className="h-6 w-6 text-primary" />
                <h3 className="mt-4 font-display text-xl font-bold uppercase text-primary-deep">
                  {p.title}
                </h3>
                <p className="mt-2 text-sm text-muted-foreground">{p.text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Como funciona */}
      <section className="py-20">
        <div className="mx-auto max-w-6xl px-5">
          <h2 className="text-center font-display text-4xl font-extrabold uppercase text-primary-deep md:text-5xl">
            Simples assim
          </h2>
          <div className="mt-10 grid gap-6 md:grid-cols-3">
            {[
              ["Clique no WhatsApp", "Escolha o assunto ou a situação."],
              ["Fale com uma pessoa", "Gente de verdade, sem fila e sem robô."],
              ["Problema resolvido", "Rápido, com acompanhamento até o fim."],
            ].map(([t, d], i) => (
              <div key={t} className="text-center">
                <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-primary font-display text-2xl font-extrabold text-primary-foreground shadow-glow">
                  {i + 1}
                </div>
                <h3 className="mt-4 font-display text-2xl font-bold uppercase text-primary-deep">
                  {t}
                </h3>
                <p className="mt-1 text-muted-foreground">{d}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section id="duvidas" className="bg-secondary py-20">
        <div className="mx-auto max-w-3xl px-5">
          <h2 className="text-center font-display text-4xl font-extrabold uppercase text-primary-deep md:text-5xl">
            Dúvidas frequentes
          </h2>
          <Accordion type="single" collapsible className="mt-8">
            {faqs.map(([q, a]) => (
              <AccordionItem key={q} value={q}>
                <AccordionTrigger className="text-left text-base font-semibold">
                  {q}
                </AccordionTrigger>
                <AccordionContent className="text-muted-foreground">{a}</AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </div>
      </section>

      {/* CTA */}
      <section className="relative overflow-hidden bg-primary-deep py-20 text-background">
        <div className="animate-blob absolute -right-20 -top-20 h-80 w-80 rounded-full bg-primary/30 blur-3xl" />
        <div className="relative mx-auto max-w-4xl px-5 text-center">
          <h2 className="font-display text-4xl font-extrabold uppercase md:text-6xl">
            Precisa de ajuda agora?
          </h2>
          <p className="mt-3 opacity-80">
            Fatura, suporte ou outro serviço: um atendente responde dentro do horário de
            atendimento.
          </p>
          <div className="mt-8">
            <WaButton href={link("Olá! Preciso de ajuda.")} marcador="cta:ajuda">
              <WhatsappIcon className="h-5 w-5" /> Chamar no WhatsApp
            </WaButton>
          </div>
        </div>
      </section>

      <footer className="border-t border-border py-10 text-center text-sm text-muted-foreground">
        <div className="mx-auto max-w-6xl px-5">
          <img
            src="/logo-nio.png"
            alt="Nio"
            className="mx-auto h-8 w-auto"
            data-nio="footer:logo"
          />
          <p className="mt-4">
            © {new Date().getFullYear()} Nio · Suporte e atendimento ao cliente
          </p>
          {identificacao && <p className="mt-1 text-xs">{identificacao}</p>}
          <p className="mt-1 text-xs">
            Seg a sex, 8h às 18h · {telefone} · Internet fibra e telecom
          </p>
          <p className="mt-3 flex flex-wrap justify-center gap-x-4 gap-y-1 text-xs">
            <Link to="/privacidade" className="hover:text-primary-deep">
              Política de Privacidade
            </Link>
            <Link to="/termos" className="hover:text-primary-deep">
              Termos de Uso
            </Link>
          </p>
        </div>
      </footer>

      {/* WhatsApp flutuante */}
      <a
        href={link("Olá! Vim pelo site.")}
        target="_blank"
        rel="noopener noreferrer"
        aria-label="Falar no WhatsApp"
        className="fixed bottom-5 right-5 z-50 flex h-14 w-14 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-glow"
        data-nio="flutuante:whatsapp"
      >
        <span className="animate-pulse-ring absolute inset-0 rounded-full bg-primary" />
        <WhatsappIcon className="relative h-7 w-7" />
      </a>
    </div>
  );
}
