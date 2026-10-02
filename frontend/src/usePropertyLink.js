import { useLocation } from 'react-router-dom';
import { usePointerIsCoarse } from './usePointerIsCoarse';

/**
 * Props de link para um imóvel.
 *
 * Um `<a>` de verdade é o que faz botão do meio, cmd+clique e "abrir em nova
 * guia" funcionarem — nenhum deles exige código. No computador o clique comum
 * também abre guia nova, para comparar imóveis sem perder a busca; no celular
 * abrir guia nova só empilha aba e quebra o botão voltar do aparelho.
 *
 * `state.from` diz ao imóvel de que tela a pessoa veio, para o "← voltar" dele
 * voltar no histórico (mesma busca, mesma posição) em vez de abrir a lista do
 * zero.
 */
export function usePropertyLink(id) {
  const isTouch = usePointerIsCoarse();
  const { pathname, search } = useLocation();
  return {
    to: `/imovel/${id}`,
    state: { from: `${pathname}${search}` },
    ...(isTouch ? {} : { target: '_blank', rel: 'noopener' }),
  };
}

const BACK_LABELS = { '/salvos': 'Salvos', '/vistos': 'Vistos' };

/** Rótulo do "← voltar" do imóvel, conforme a tela de origem. */
export function backLabel(from) {
  return BACK_LABELS[String(from || '').split('?')[0]] || 'Imóveis';
}

/** A estrela fica dentro do link: sem preventDefault, salvar navegaria. */
export function stopLinkNavigation(event) {
  event.preventDefault();
  event.stopPropagation();
}
