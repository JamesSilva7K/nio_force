/** Erros de domínio com status HTTP associado. */

export class ErroValidacao extends Error {
  readonly status = 400;
  constructor(mensagem: string) {
    super(mensagem);
    this.name = "ErroValidacao";
  }
}

export class ErroNaoEncontrado extends Error {
  readonly status = 404;
  constructor(mensagem = "Registro não encontrado.") {
    super(mensagem);
    this.name = "ErroNaoEncontrado";
  }
}

export class ErroLimite extends Error {
  readonly status = 429;
  readonly reiniciaEm: number;
  constructor(reiniciaEm: number) {
    super("Muitas requisições. Tente novamente em instantes.");
    this.name = "ErroLimite";
    this.reiniciaEm = reiniciaEm;
  }
}

export class ErroConfiguracao extends Error {
  readonly status = 503;
  constructor(mensagem: string) {
    super(mensagem);
    this.name = "ErroConfiguracao";
  }
}
