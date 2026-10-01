// Fotos tiradas no botão «Capturar» da barra de baixo, à espera de serem abertas no ecrã de captura.
// Vive só na memória do browser (a navegação dentro da app não recarrega a página).
let pendentes: File[] = [];

export const guardarCapturas = (f: File[]) => { pendentes = [...pendentes, ...f]; };
export const tirarCapturas = (): File[] => { const f = pendentes; pendentes = []; return f; };
