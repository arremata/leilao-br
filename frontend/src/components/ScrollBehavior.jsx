import { useEffect, useRef } from 'react';
import { useLocation, useNavigationType } from 'react-router-dom';

/** A busca sem o número da página: "Carregar mais" só muda `pagina`. */
function searchWithoutPage(search) {
  const params = new URLSearchParams(search);
  params.delete('pagina');
  return params.toString();
}

/**
 * Vai para o topo em navegação nova; em voltar e avançar, deixa o navegador
 * restaurar a posição.
 *
 * O comportamento anterior forçava o topo em toda troca de tela, o que faria a
 * lista perder o lugar sempre que a pessoa voltasse de um imóvel.
 *
 * "Carregar mais" grava a página no endereço. Isso não é uma tela nova: a
 * pessoa continua onde estava e os imóveis seguintes aparecem logo abaixo.
 */
export default function ScrollBehavior() {
  const { pathname, search } = useLocation();
  const navigationType = useNavigationType();
  const previous = useRef({ pathname, search });

  useEffect(() => {
    const before = previous.current;
    previous.current = { pathname, search };
    if (navigationType === 'POP') return;
    const onlyPageChanged = before.pathname === pathname
      && before.search !== search
      && searchWithoutPage(before.search) === searchWithoutPage(search);
    if (onlyPageChanged) return;
    window.scrollTo({ top: 0, behavior: 'instant' });
  }, [pathname, search, navigationType]);

  return null;
}
