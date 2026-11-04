"use client";

// O Chrome/Android avisa uma única vez (evento «beforeinstallprompt»), muitas vezes antes de abrir as Definições.
// Guardamos o pedido aqui para o botão «Adicionar ao ecrã principal» o usar mais tarde.

export type PedidoInstalar = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: "accepted" | "dismissed" }> };

let pedido: PedidoInstalar | null = null;
const ouvintes = new Set<() => void>();
const avisar = () => ouvintes.forEach((f) => f());

export function guardarPedido(p: PedidoInstalar | null) { pedido = p; avisar(); }
export function pedidoAtual() { return pedido; }
export function aoMudar(f: () => void) { ouvintes.add(f); return () => { ouvintes.delete(f); }; }

/** A app já está aberta como app instalada (e não no browser)? */
export function estaInstalada() {
  if (typeof window === "undefined") return false;
  return window.matchMedia("(display-mode: standalone)").matches
    || window.matchMedia("(display-mode: fullscreen)").matches
    || (navigator as Navigator & { standalone?: boolean }).standalone === true;
}

export function eIOS() {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent;
  // O iPad recente apresenta-se como Mac: distingue-se por ter ecrã tátil
  return /iPad|iPhone|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
}
