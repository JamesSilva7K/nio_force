/**
 * Validação e normalização de dados brasileiros.
 *
 * Módulo puro (sem I/O, sem dependências de runtime) para ser usado tanto no
 * servidor (API/Telegram) quanto no cliente (formulários e rastreamento).
 */

/** DDDs realmente atribuídos pela Anatel. */
const DDD_VALIDOS: ReadonlySet<string> = new Set([
  "11",
  "12",
  "13",
  "14",
  "15",
  "16",
  "17",
  "18",
  "19",
  "21",
  "22",
  "24",
  "27",
  "28",
  "31",
  "32",
  "33",
  "34",
  "35",
  "37",
  "38",
  "41",
  "42",
  "43",
  "44",
  "45",
  "46",
  "47",
  "48",
  "49",
  "51",
  "53",
  "54",
  "55",
  "61",
  "62",
  "63",
  "64",
  "65",
  "66",
  "67",
  "68",
  "69",
  "71",
  "73",
  "74",
  "75",
  "77",
  "79",
  "81",
  "82",
  "83",
  "84",
  "85",
  "86",
  "87",
  "88",
  "89",
  "91",
  "92",
  "93",
  "94",
  "95",
  "96",
  "97",
  "98",
  "99",
]);

const EMAIL_RE = /^[^\s@]{1,64}@[^\s@.]+(?:\.[^\s@.]+)+$/;
const NOME_RE = /^[\p{L}\p{M}'.\- ]{2,80}$/u;

/** Remove tudo que não for dígito. */
export function onlyDigits(value: string): string {
  return value.replace(/\D+/g, "");
}

/** Verdadeiro quando a string tem só dígitos repetidos (ex.: 11999999999). */
function todosIguais(digits: string): boolean {
  return digits.length > 0 && new Set(digits).size === 1;
}

/**
 * Normaliza um telefone brasileiro para o formato E.164 sem "+" (ex.: 5511953866646).
 * Aceita máscara, +55, 0055, 0xx e nono dígito opcional.
 * Retorna `null` quando o número não é um telefone brasileiro plausível.
 */
export function normalizeBrPhone(input: string): string | null {
  if (typeof input !== "string") return null;
  let digits = onlyDigits(input);
  if (digits.length === 0) return null;

  if (digits.startsWith("00")) digits = digits.slice(2);
  if (digits.startsWith("55") && (digits.length === 12 || digits.length === 13)) {
    digits = digits.slice(2);
  }
  // Prefixo de operadora / discagem nacional: 0 + DDD + número.
  if (digits.startsWith("0") && (digits.length === 11 || digits.length === 12)) {
    digits = digits.slice(1);
  }

  if (digits.length !== 10 && digits.length !== 11) return null;
  if (todosIguais(digits)) return null;

  const ddd = digits.slice(0, 2);
  if (!DDD_VALIDOS.has(ddd)) return null;

  const assinante = digits.slice(2);
  const primeiro = assinante.charCodeAt(0) - 48;

  if (digits.length === 11) {
    // Celular: sempre começa com 9.
    return primeiro === 9 ? `55${digits}` : null;
  }
  // Fixo: começa com 2, 3, 4 ou 5.
  return primeiro >= 2 && primeiro <= 5 ? `55${digits}` : null;
}

/** Valida e devolve o telefone em E.164 (só dígitos) ou `null`. */
export function parseBrWhatsapp(input: string): string | null {
  return normalizeBrPhone(input);
}

export function isValidBrPhone(input: string): boolean {
  return normalizeBrPhone(input) !== null;
}

/** Formata E.164 (5511953866646) como "(11) 95386-6646". */
export function formatBrPhone(e164: string): string {
  const digits = onlyDigits(e164);
  const local = digits.startsWith("55") && digits.length > 11 ? digits.slice(2) : digits;
  if (local.length !== 10 && local.length !== 11) return e164;

  const ddd = local.slice(0, 2);
  const resto = local.slice(2);
  const corte = resto.length - 4;
  return `(${ddd}) ${resto.slice(0, corte)}-${resto.slice(corte)}`;
}

/** Link wa.me a partir de um número já normalizado. */
export function whatsappLink(e164: string, mensagem?: string): string {
  const base = `https://wa.me/${onlyDigits(e164)}`;
  return mensagem ? `${base}?text=${encodeURIComponent(mensagem)}` : base;
}

/** Valida CPF pelo dígito verificador (aceita com ou sem máscara). */
export function isValidCpf(input: string): boolean {
  const cpf = onlyDigits(input);
  if (cpf.length !== 11 || todosIguais(cpf)) return false;

  const digito = (ate: number): number => {
    let soma = 0;
    for (let i = 0; i < ate; i++) {
      soma += (cpf.charCodeAt(i) - 48) * (ate + 1 - i);
    }
    const resto = (soma * 10) % 11;
    return resto === 10 ? 0 : resto;
  };

  return digito(9) === cpf.charCodeAt(9) - 48 && digito(10) === cpf.charCodeAt(10) - 48;
}

/** Mascara o CPF para exibição: 123.***.***-09. */
export function maskCpf(input: string): string {
  const cpf = onlyDigits(input);
  if (cpf.length !== 11) return "—";
  return `${cpf.slice(0, 3)}.***.***-${cpf.slice(9)}`;
}

export function isValidEmail(input: string): boolean {
  const value = input.trim();
  return value.length <= 254 && EMAIL_RE.test(value);
}

/** Nome próprio: letras, espaços, apóstrofo, hífen e ponto. */
export function sanitizeNome(input: string): string | null {
  const value = input.replace(/\s+/g, " ").trim();
  if (!NOME_RE.test(value)) return null;
  return value.slice(0, 80);
}

// eslint-disable-next-line no-control-regex -- remover caracteres de controle é o objetivo
const CARACTERES_DE_CONTROLE = /[\u0000-\u001f\u007f]/g;

/** Texto livre curto, sem caracteres de controle. */
export function sanitizeTexto(input: string, max = 280): string {
  return input.replace(CARACTERES_DE_CONTROLE, " ").replace(/\s+/g, " ").trim().slice(0, max);
}

const UTM_KEYS = [
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_term",
  "utm_content",
  "gclid",
  "fbclid",
] as const;

export type UtmKey = (typeof UTM_KEYS)[number];
export type UtmParams = Partial<Record<UtmKey, string>>;

/** Mantém apenas parâmetros de campanha conhecidos, curtos e sem controle. */
export function sanitizeUtm(input: unknown): UtmParams {
  const fonte = (typeof input === "object" && input !== null ? input : {}) as Record<
    string,
    unknown
  >;
  const out: UtmParams = {};
  for (const key of UTM_KEYS) {
    const raw = fonte[key];
    if (typeof raw !== "string") continue;
    const value = sanitizeTexto(raw, 120);
    if (value.length > 0) out[key] = value;
  }
  return out;
}

/** Verdadeiro quando o número informado é um celular brasileiro com nono dígito. */
export function isCelularBr(e164: string): boolean {
  const local = onlyDigits(e164).replace(/^55/, "");
  return local.length === 11 && local.charCodeAt(2) - 48 === 9;
}

/** Unidade da federação de cada DDD válido. */
const UF_POR_DDD: Readonly<Record<string, string>> = {
  "11": "SP",
  "12": "SP",
  "13": "SP",
  "14": "SP",
  "15": "SP",
  "16": "SP",
  "17": "SP",
  "18": "SP",
  "19": "SP",
  "21": "RJ",
  "22": "RJ",
  "24": "RJ",
  "27": "ES",
  "28": "ES",
  "31": "MG",
  "32": "MG",
  "33": "MG",
  "34": "MG",
  "35": "MG",
  "37": "MG",
  "38": "MG",
  "41": "PR",
  "42": "PR",
  "43": "PR",
  "44": "PR",
  "45": "PR",
  "46": "PR",
  "47": "SC",
  "48": "SC",
  "49": "SC",
  "51": "RS",
  "53": "RS",
  "54": "RS",
  "55": "RS",
  "61": "DF",
  "62": "GO",
  "63": "TO",
  "64": "GO",
  "65": "MT",
  "66": "MT",
  "67": "MS",
  "68": "AC",
  "69": "RO",
  "71": "BA",
  "73": "BA",
  "74": "BA",
  "75": "BA",
  "77": "BA",
  "79": "SE",
  "81": "PE",
  "82": "AL",
  "83": "PB",
  "84": "RN",
  "85": "CE",
  "86": "PI",
  "87": "PE",
  "88": "CE",
  "89": "PI",
  "91": "PA",
  "92": "AM",
  "93": "PA",
  "94": "PA",
  "95": "RR",
  "96": "AP",
  "97": "AM",
  "98": "MA",
  "99": "MA",
};

/** UF do DDD (ex.: "11" → "SP"). */
export function estadoDoDdd(ddd: string): string | null {
  return UF_POR_DDD[onlyDigits(ddd).slice(0, 2)] ?? null;
}

/** UF de um número em E.164. */
export function estadoDoNumero(e164: string): string | null {
  const local = onlyDigits(e164).replace(/^55/, "");
  return estadoDoDdd(local.slice(0, 2));
}
