/** NIF português: 9 dígitos, o último é de controlo (módulo 11). */
export function nifValido(nif: string): boolean {
  if (!/^\d{9}$/.test(nif)) return false;
  const d = nif.split("").map(Number);
  const soma = d.slice(0, 8).reduce((s, n, i) => s + n * (9 - i), 0);
  const c = 11 - (soma % 11);
  return (c >= 10 ? 0 : c) === d[8];
}
