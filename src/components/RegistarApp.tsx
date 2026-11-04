"use client";
import { useEffect } from "react";
import { guardarPedido, type PedidoInstalar } from "@/lib/instalar";

/** Regista o service worker e guarda o pedido de instalação do Chrome/Android. Não mostra nada. */
export default function RegistarApp() {
  useEffect(() => {
    if ("serviceWorker" in navigator && process.env.NODE_ENV === "production") {
      navigator.serviceWorker.register("/sw.js").catch(() => {});
    }
    const antes = (e: Event) => { e.preventDefault(); guardarPedido(e as PedidoInstalar); };
    const instalada = () => guardarPedido(null);
    window.addEventListener("beforeinstallprompt", antes);
    window.addEventListener("appinstalled", instalada);
    return () => { window.removeEventListener("beforeinstallprompt", antes); window.removeEventListener("appinstalled", instalada); };
  }, []);
  return null;
}
