import { useEffect } from "react";
import { useLocation } from "react-router-dom";

/** Ogni cambio route: in cima alla pagina (niente scroll “restored” in mezzo). */
export default function ScrollToTop() {
  const { pathname } = useLocation();

  useEffect(() => {
    if (typeof history !== "undefined" && "scrollRestoration" in history) {
      history.scrollRestoration = "manual";
    }
    window.scrollTo(0, 0);
  }, [pathname]);

  return null;
}
