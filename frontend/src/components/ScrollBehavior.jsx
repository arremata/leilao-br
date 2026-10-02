import { useEffect, useLayoutEffect, useRef } from 'react';
import { useLocation, useNavigationType } from 'react-router-dom';
import { readScrollPositions, writeScrollPositions } from '../scrollPositions';

/** A busca sem o número da página: "Carregar mais" só muda `pagina`. */
function searchWithoutPage(search) {
  const params = new URLSearchParams(search);
  params.delete('pagina');
  return params.toString();
}

// Por quanto tempo, ao voltar, esperar a lista crescer até a posição salva.
const RESTORE_TIMEOUT_MS = 2500;

/**
 * Vai para o topo em navegação nova; em voltar e avançar, devolve a pessoa ao
 * ponto exato em que estava.
 *
 * A restauração do navegador não basta: ela roda antes de o React montar a
 * lista, a página ainda é curta e a posição se perde no topo. Aqui a posição
 * de cada entrada do histórico é guardada (também na sessão da guia, para
 * sobreviver a recarregar) e reaplicada enquanto a lista cresce, até chegar ao
 * ponto salvo ou a pessoa rolar por conta própria.
 *
 * "Carregar mais" grava a página no endereço. Isso não é uma tela nova: a
 * pessoa continua onde estava e os imóveis seguintes aparecem logo abaixo.
 */
export default function ScrollBehavior() {
  const location = useLocation();
  const { pathname, search, key } = location;
  const navigationType = useNavigationType();
  const previous = useRef({ pathname, search });
  const positions = useRef(null);
  const currentKey = useRef(key);

  if (positions.current === null) positions.current = readScrollPositions();

  useEffect(() => {
    if (!('scrollRestoration' in window.history)) return undefined;
    const before = window.history.scrollRestoration;
    window.history.scrollRestoration = 'manual';
    return () => { window.history.scrollRestoration = before; };
  }, []);

  // A posição é anotada a cada rolagem, sob a entrada atual do histórico.
  useEffect(() => {
    let frame = 0;
    const save = () => {
      positions.current[currentKey.current] = window.scrollY;
      writeScrollPositions(positions.current);
    };
    const onScroll = () => {
      if (frame) return;
      frame = requestAnimationFrame(() => { frame = 0; save(); });
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('pagehide', save);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('pagehide', save);
    };
  }, []);

  // Antes da pintura: a tela nova pode encolher a página e o navegador corrige
  // a rolagem. Essa correção não pode ser anotada como posição da tela antiga.
  useLayoutEffect(() => {
    currentKey.current = key;
  }, [key]);

  useEffect(() => {
    const before = previous.current;
    previous.current = { pathname, search };

    if (navigationType === 'POP') {
      const target = positions.current[key];
      if (target > 0) return restoreScroll(target);
      return undefined;
    }
    const onlyPageChanged = before.pathname === pathname
      && before.search !== search
      && searchWithoutPage(before.search) === searchWithoutPage(search);
    if (onlyPageChanged) return undefined;
    window.scrollTo({ top: 0, behavior: 'instant' });
    return undefined;
  }, [pathname, search, key, navigationType]);

  return null;
}

/**
 * Rola até `target` assim que a página tiver altura para isso. Para quando
 * chega, quando o tempo acaba ou quando a pessoa mexe na tela.
 */
function restoreScroll(target) {
  let done = false;
  let frame = 0;
  const started = performance.now();
  const stop = () => {
    done = true;
    cancelAnimationFrame(frame);
    for (const type of USER_SCROLL_EVENTS) window.removeEventListener(type, stop);
  };
  const attempt = () => {
    if (done) return;
    const max = document.documentElement.scrollHeight - window.innerHeight;
    window.scrollTo({ top: Math.min(target, max), behavior: 'instant' });
    if (max >= target || performance.now() - started > RESTORE_TIMEOUT_MS) {
      stop();
      return;
    }
    frame = requestAnimationFrame(attempt);
  };
  for (const type of USER_SCROLL_EVENTS) window.addEventListener(type, stop, { passive: true });
  attempt();
  return stop;
}

const USER_SCROLL_EVENTS = ['wheel', 'touchstart', 'keydown', 'mousedown'];
