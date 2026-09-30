// Estados de uma máquina (ficheiro leve, seguro para usar no browser).
export type Estado = "stock" | "vendido" | "abatido" | "outro";
export type EstadoFolha = Estado | "ignorar";
export const ESTADOS: Estado[] = ["stock", "vendido", "abatido", "outro"];
export const ROTULO_ESTADO: Record<Estado, string> = { stock: "Em stock", vendido: "Vendida", abatido: "Abatida", outro: "Outro" };
