// @vitest-environment node
import { describe, expect, it } from "vitest";

import {
  formatBrPhone,
  isCelularBr,
  isValidCpf,
  isValidEmail,
  maskCpf,
  normalizeBrPhone,
  sanitizeNome,
  sanitizeUtm,
  whatsappLink,
} from "@/lib/br";

describe("normalizeBrPhone", () => {
  it.each([
    ["11953866646", "5511953866646"],
    ["(11) 95386-6646", "5511953866646"],
    ["+55 11 95386-6646", "5511953866646"],
    ["0055 11 95386-6646", "5511953866646"],
    ["011 95386-6646", "5511953866646"],
    ["(11) 3865-1234", "551138651234"],
    ["21 98888-7777", "5521988887777"],
  ])("normaliza %s", (entrada, esperado) => {
    expect(normalizeBrPhone(entrada)).toBe(esperado);
  });

  it.each([
    ["", "vazio"],
    ["abc", "sem dígitos"],
    ["2012345678", "DDD inexistente"],
    ["11853866646", "celular sem o nono dígito"],
    ["1195386664", "curto demais"],
    ["119538666400", "longo demais"],
    ["00000000000", "todos os dígitos iguais"],
    ["90999999999", "DDD 90 não existe"],
  ])("rejeita %s (%s)", (entrada) => {
    expect(normalizeBrPhone(entrada)).toBeNull();
  });
});

describe("formatação", () => {
  it("formata celular e fixo", () => {
    expect(formatBrPhone("5511953866646")).toBe("(11) 95386-6646");
    expect(formatBrPhone("551138651234")).toBe("(11) 3865-1234");
  });

  it("identifica celular com nono dígito", () => {
    expect(isCelularBr("5511953866646")).toBe(true);
    expect(isCelularBr("551138651234")).toBe(false);
  });

  it("monta link wa.me com mensagem codificada", () => {
    expect(whatsappLink("5511953866646", "Olá!")).toBe(
      "https://wa.me/5511953866646?text=Ol%C3%A1!",
    );
  });
});

describe("CPF", () => {
  it("aceita CPF válido com ou sem máscara", () => {
    expect(isValidCpf("529.982.247-25")).toBe(true);
    expect(isValidCpf("52998224725")).toBe(true);
  });

  it("rejeita CPF inválido, repetido ou incompleto", () => {
    expect(isValidCpf("52998224724")).toBe(false);
    expect(isValidCpf("11111111111")).toBe(false);
    expect(isValidCpf("5299822472")).toBe(false);
  });

  it("mascara o CPF para exibição", () => {
    expect(maskCpf("52998224725")).toBe("529.***.***-25");
  });
});

describe("textos e campanhas", () => {
  it("valida e-mail", () => {
    expect(isValidEmail("contato@nio.com.br")).toBe(true);
    expect(isValidEmail("contato@nio")).toBe(false);
  });

  it("sanitiza nome", () => {
    expect(sanitizeNome("  José   da Silva ")).toBe("José da Silva");
    expect(sanitizeNome("J")).toBeNull();
    expect(sanitizeNome("<script>")).toBeNull();
  });

  it("mantém só UTMs conhecidas e remove caracteres de controle", () => {
    expect(
      sanitizeUtm({
        utm_source: "google",
        utm_medium: "cpc",
        foo: "bar",
        utm_campaign: "a\u0000b",
      }),
    ).toEqual({ utm_source: "google", utm_medium: "cpc", utm_campaign: "a b" });
  });
});
