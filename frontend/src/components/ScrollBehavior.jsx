import { useEffect } from 'react';
import { useLocation, useNavigationType } from 'react-router-dom';

/**
 * Vai para o topo em navegação nova; em voltar e avançar, deixa o navegador
 * restaurar a posição.
 *
 * O comportamento anterior forçava o topo em toda troca de tela, o que faria a
 * lista perder o lugar sempre que a pessoa voltasse de um imóvel.
 */
export default function ScrollBehavior() {
  const { pathname, search } = useLocation();
  const navigationType = useNavigationType();

  useEffect(() => {
    if (navigationType === 'POP') return;
    window.scrollTo({ top: 0, behavior: 'instant' });
  }, [pathname, search, navigationType]);

  return null;
}
