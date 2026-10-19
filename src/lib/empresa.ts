/**
 * Dados cadastrais exibidos nas páginas legais e no rodapé.
 *
 * Preencha os quatro campos abaixo antes de publicar: políticas de anúncios
 * (Google Ads / Meta) e a LGPD exigem identificação do controlador.
 * Enquanto estiverem vazios, o rodapé simplesmente não mostra a linha e as
 * páginas legais usam apenas o nome fantasia — nada de colchetes na tela.
 */
export const EMPRESA = {
  nomeFantasia: "Nio Fibra",
  razaoSocial: "",
  cnpj: "",
  endereco: "",
  emailContato: "",
  emailEncarregado: "",
  atualizadoEm: "19/10/2026",
} as const;

/** Linha de identificação para o rodapé (null enquanto não preenchida). */
export function identificacaoCadastral(): string | null {
  if (!EMPRESA.razaoSocial && !EMPRESA.cnpj) return null;
  return [EMPRESA.razaoSocial, EMPRESA.cnpj ? `CNPJ ${EMPRESA.cnpj}` : "", EMPRESA.endereco]
    .filter((parte) => parte.length > 0)
    .join(" · ");
}
