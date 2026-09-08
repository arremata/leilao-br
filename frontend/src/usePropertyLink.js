import { usePointerIsCoarse } from './usePointerIsCoarse';

/**
 * Props de link para um imóvel.
 *
 * Um `<a>` de verdade é o que faz botão do meio, cmd+clique e "abrir em nova
 * guia" funcionarem — nenhum deles exige código. No computador o clique comum
 * também abre guia nova, para comparar imóveis sem perder a busca; no celular
 * abrir guia nova só empilha aba e quebra o botão voltar do aparelho.
 */
export function usePropertyLink(id) {
  const isTouch = usePointerIsCoarse();
  return {
    to: `/imovel/${id}`,
    ...(isTouch ? {} : { target: '_blank', rel: 'noopener' }),
  };
}

/** A estrela fica dentro do link: sem preventDefault, salvar navegaria. */
export function stopLinkNavigation(event) {
  event.preventDefault();
  event.stopPropagation();
}
