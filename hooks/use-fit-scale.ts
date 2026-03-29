import {
  useLayoutEffect,
  useRef,
  useState,
  type DependencyList,
} from "react";

/**
 * Escala el contenido para que quepa en el contenedor sin scroll (dashboard TV).
 * Mide con transform desactivado y aplica scale + ancho compensado.
 */
export function useFitScale(deps: DependencyList) {
  const containerRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);

  useLayoutEffect(() => {
    const update = () => {
      const c = containerRef.current;
      const el = contentRef.current;
      if (!c || !el) return;
      el.style.transform = "none";
      el.style.width = "";
      const h = el.scrollHeight;
      const w = el.scrollWidth;
      const ch = c.clientHeight;
      const cw = c.clientWidth;
      if (h === 0 || w === 0 || ch === 0) return;
      const s = Math.min(1, cw / w, ch / h);
      setScale(s);
    };

    update();
    const ro = new ResizeObserver(() => {
      requestAnimationFrame(update);
    });
    const c = containerRef.current;
    const el = contentRef.current;
    if (c) ro.observe(c);
    if (el) ro.observe(el);
    window.addEventListener("resize", update);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", update);
    };
  }, deps);

  return { containerRef, contentRef, scale };
}
