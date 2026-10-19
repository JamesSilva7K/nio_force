// @vitest-environment node
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const RAIZ = process.cwd();

function ler(caminho: string): string {
  return readFileSync(join(RAIZ, caminho), "utf8");
}

const ROTAS = [
  "src/routes/index.tsx",
  "src/routes/privacidade.tsx",
  "src/routes/termos.tsx",
  "src/routes/__root.tsx",
];

describe("conformidade com plataformas de anúncio", () => {
  it("nenhuma rota ramifica conteúdo por user-agent (anti-cloaking)", () => {
    for (const rota of ROTAS) {
      const codigo = ler(rota);
      expect(codigo, rota).not.toMatch(/user-agent/i);
      expect(codigo, rota).not.toMatch(/userAgent/);
      expect(codigo, rota).not.toMatch(/navigator\.userAgent/);
    }
  });

  it("a home linka Política de Privacidade e Termos de Uso", () => {
    const home = ler("src/routes/index.tsx");
    expect(home).toContain('to="/privacidade"');
    expect(home).toContain('to="/termos"');
  });

  it("o rodapé exibe a identificação cadastral quando preenchida", () => {
    const home = ler("src/routes/index.tsx");
    expect(home).toContain("identificacaoCadastral");
  });

  it("as páginas legais existem", () => {
    expect(ler("src/routes/privacidade.tsx")).toContain("Política de Privacidade");
    expect(ler("src/routes/termos.tsx")).toContain("Termos de Uso");
  });
});
