import { classificarUserAgent } from "./ua";

/**
 * Padrões de User-Agents de crawlers de anúncios e plataformas (Google Ads, Meta/Facebook,
 * TikTok, Bing, Twitter/X, LinkedIn, Pinterest, etc.) e serviços de hospedagem/inspeção.
 */
const CRAWLERS_PLATAFORMAS = [
  "adsbot-google",
  "google-inspectiontool",
  "mediapartners-google",
  "google-ads",
  "facebookexternalhit",
  "facebookcatalog",
  "facebot",
  "bytespider", // TikTok / ByteDance crawler
  "tiktokbot",
  "twitterbot",
  "bingbot",
  "adidxbot", // Bing Ads bot
  "linkedinbot",
  "pinterestbot",
  "pinterest/0.",
  "snapchat",
  "quora link preview",
  "outbrain",
  "taboolabot",
];

/**
 * Identifica se a requisição é proveniente de bots de plataformas/redes sociais ou indexadores.
 */
export function ehBotPlataformaOuHost(request: Request): boolean {
  const ua = (request.headers.get("user-agent") ?? "").toLowerCase().trim();
  if (!ua) return false;

  for (const padrao of CRAWLERS_PLATAFORMAS) {
    if (ua.includes(padrao)) return true;
  }

  const classificacao = classificarUserAgent(ua);
  if (classificacao.bot && classificacao.crawlerConhecido) {
    return true;
  }

  return false;
}

/**
 * Gera a página HTML estática e completa da Landing Page de Cozinha (Whitepage limpa).
 * Visual profissional, responsivo, moderno e 100% voltado para utilidades e receitas culinárias.
 */
export function renderCozinhaPage(): string {
  return `<!doctype html>
<html lang="pt-BR">
  <head>
    <meta charset="utf-8" />
    <title>Espaço Culinário &amp; Casa | Dicas, Receitas e Utensílios de Cozinha</title>
    <meta name="description" content="Guia completo de organização culinária, receitas práticas para o dia a dia e os melhores utensílios para sua cozinha moderna." />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="robots" content="index, follow" />
    <style>
      :root {
        --cor-primaria: #0f766e;
        --cor-primaria-hover: #115e59;
        --cor-fundo: #f8fafc;
        --cor-card: #ffffff;
        --cor-texto: #1e293b;
        --cor-mutada: #64748b;
        --borda: #e2e8f0;
      }
      * {
        box-sizing: border-box;
        margin: 0;
        padding: 0;
      }
      body {
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
        background-color: var(--cor-fundo);
        color: var(--cor-texto);
        line-height: 1.6;
        -webkit-font-smoothing: antialiased;
      }
      header {
        background-color: var(--cor-card);
        border-bottom: 1px solid var(--borda);
        padding: 1rem 1.5rem;
        position: sticky;
        top: 0;
        z-index: 10;
      }
      .nav-container {
        max-width: 1080px;
        margin: 0 auto;
        display: flex;
        justify-content: space-between;
        align-items: center;
      }
      .logo {
        display: flex;
        align-items: center;
        gap: 0.5rem;
        font-weight: 700;
        font-size: 1.25rem;
        color: var(--cor-primaria);
        text-decoration: none;
      }
      .nav-links {
        display: flex;
        gap: 1.5rem;
        list-style: none;
      }
      .nav-links a {
        color: var(--cor-mutada);
        text-decoration: none;
        font-weight: 500;
        font-size: 0.95rem;
        transition: color 0.15s ease;
      }
      .nav-links a:hover {
        color: var(--cor-primaria);
      }
      main {
        max-width: 1080px;
        margin: 2rem auto;
        padding: 0 1.5rem;
      }
      .hero {
        background: linear-gradient(135deg, #042f2e 0%, #0f766e 100%);
        color: #ffffff;
        border-radius: 1rem;
        padding: 3.5rem 2rem;
        text-align: center;
        margin-bottom: 3rem;
        box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05);
      }
      .hero h1 {
        font-size: 2.25rem;
        line-height: 1.2;
        margin-bottom: 1rem;
        font-weight: 800;
      }
      .hero p {
        font-size: 1.15rem;
        color: #ccfbf1;
        max-width: 680px;
        margin: 0 auto 1.75rem;
      }
      .badge {
        display: inline-block;
        background-color: rgba(255, 255, 255, 0.15);
        color: #ffffff;
        padding: 0.35rem 0.85rem;
        border-radius: 9999px;
        font-size: 0.85rem;
        font-weight: 600;
        margin-bottom: 1rem;
        letter-spacing: 0.05em;
        text-transform: uppercase;
      }
      .secao-titulo {
        font-size: 1.5rem;
        font-weight: 700;
        margin-bottom: 1.5rem;
        color: var(--cor-texto);
      }
      .grid-dicas {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
        gap: 1.5rem;
        margin-bottom: 3rem;
      }
      .card {
        background: var(--cor-card);
        border: 1px solid var(--borda);
        border-radius: 0.75rem;
        padding: 1.5rem;
        display: flex;
        flex-direction: column;
        transition: transform 0.15s ease, box-shadow 0.15s ease;
      }
      .card:hover {
        transform: translateY(-2px);
        box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.05);
      }
      .card-icon {
        font-size: 2rem;
        margin-bottom: 1rem;
      }
      .card h2 {
        font-size: 1.2rem;
        margin-bottom: 0.5rem;
        color: var(--cor-texto);
      }
      .card p {
        color: var(--cor-mutada);
        font-size: 0.95rem;
        flex-grow: 1;
      }
      .card-footer {
        margin-top: 1.25rem;
        padding-top: 1rem;
        border-top: 1px solid var(--borda);
        font-size: 0.85rem;
        color: var(--cor-primaria);
        font-weight: 600;
      }
      .artigo-destaque {
        background: var(--cor-card);
        border: 1px solid var(--borda);
        border-radius: 0.75rem;
        padding: 2rem;
        margin-bottom: 3rem;
      }
      .artigo-destaque h2 {
        font-size: 1.35rem;
        margin-bottom: 1rem;
      }
      .artigo-destaque ul {
        list-style-position: inside;
        color: var(--cor-mutada);
        margin-top: 0.75rem;
        display: flex;
        flex-direction: column;
        gap: 0.5rem;
      }
      footer {
        background-color: var(--cor-card);
        border-top: 1px solid var(--borda);
        padding: 2.5rem 1.5rem;
        margin-top: 4rem;
        color: var(--cor-mutada);
        font-size: 0.9rem;
      }
      .footer-container {
        max-width: 1080px;
        margin: 0 auto;
        display: flex;
        flex-wrap: wrap;
        justify-content: space-between;
        gap: 1.5rem;
      }
      @media (max-width: 640px) {
        .hero {
          padding: 2.5rem 1rem;
        }
        .hero h1 {
          font-size: 1.75rem;
        }
        .nav-links {
          display: none;
        }
      }
    </style>
  </head>
  <body>
    <header>
      <div class="nav-container">
        <a href="/" class="logo">
          🍳 <span>Espaço Culinário &amp; Casa</span>
        </a>
        <ul class="nav-links">
          <li><a href="#dicas">Dicas do Chef</a></li>
          <li><a href="#utensilios">Utensílios Essenciais</a></li>
          <li><a href="#organizacao">Organização</a></li>
        </ul>
      </div>
    </header>

    <main>
      <section class="hero">
        <span class="badge">Gastronomia &amp; Estilo de Vida</span>
        <h1>Transforme sua Cozinha em um Ambiente Prático e Inspirador</h1>
        <p>Técnicas culinárias fundamentais, organização inteligente de despensa e guias práticos para cozinhar melhor todos os dias.</p>
      </section>

      <h2 id="dicas" class="secao-titulo">Guias e Recomendações Culinárias</h2>
      <div class="grid-dicas">
        <article class="card">
          <div class="card-icon">🔪</div>
          <h2>Conservação e Afiação de Facas</h2>
          <p>O cuidado correto com lâminas de aço inox e cerâmica garante cortes precisos, segurança no preparo e durabilidade de longo prazo no seu dia a dia.</p>
          <div class="card-footer">Tempo de leitura: 4 min</div>
        </article>

        <article class="card">
          <div class="card-icon">🍳</div>
          <h2>Panelas Antiaderentes e Cerâmica</h2>
          <p>Entenda como higienizar adequadamente panelas sem riscar o revestimento e as temperaturas ideais para preservar a qualidade dos alimentos.</p>
          <div class="card-footer">Tempo de leitura: 5 min</div>
        </article>

        <article class="card">
          <div class="card-icon">🌿</div>
          <h2>Ervas Frescas e Condimentos</h2>
          <p>Dicas simples de armazenamento em potes herméticos e hidratação de talos para manter temperos frescos por até 3 semanas na geladeira.</p>
          <div class="card-footer">Tempo de leitura: 3 min</div>
        </article>
      </div>

      <section id="utensilios" class="artigo-destaque">
        <h2>Checklist: Utensílios Básicos para uma Cozinha Funcional</h2>
        <p>Montar uma bancada eficiente não exige dezenas de acessórios. Especialistas recomendam focar em peças versáteis de alto rendimento:</p>
        <ul>
          <li><strong>Tábua de corte de bambu ou polietileno:</strong> Evita desgaste acelerado do fio das facas e facilita higienização.</li>
          <li><strong>Frigideira de ferro fundido ou inox de fundo triplo:</strong> Distribuição uniforme de calor para selar e grelhar perfeitamente.</li>
          <li><strong>Espátulas e colheres de silicone culinário:</strong> Suportam altas temperaturas sem deformar e sem arranhar panelas.</li>
          <li><strong>Conjunto medidor padrão (xícaras e colheres):</strong> Precisão garantida no balanceamento de massas e molhos.</li>
        </ul>
      </section>
    </main>

    <footer>
      <div class="footer-container">
        <div>
          <p><strong>Espaço Culinário &amp; Casa</strong></p>
          <p>Conteúdos informativos e guias domésticos para o seu lar.</p>
        </div>
        <div>
          <p>&copy; 2026 Todos os direitos reservados. Informações e guias de culinária doméstica.</p>
        </div>
      </div>
    </footer>
  </body>
</html>`;
}
