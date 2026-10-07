import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { glossaryEntry, glossaryKeyFor } from '../glossary';
import { usePointerIsCoarse } from '../usePointerIsCoarse';
import { useGlossaryEnabled } from '../glossaryPreference';

const CARD_WIDTH = 260;
const GAP = 10;
const EDGE = 12;
const OPEN_DELAY = 280;
const CLOSE_DELAY = 160;

// Um balão por vez: abrir outro fecha o anterior.
let closeOpenCard = null;

/**
 * Palavra do dicionário com um cartão de definição.
 *
 * Nada marca a palavra em repouso; ao passar o mouse ela muda de cor e o
 * cartão abre, como as prévias de página da Wikipedia. No celular, o toque
 * abre o cartão e não abre o imóvel. O cartão aceita o mouse, para dar tempo
 * de clicar em "Ler no dicionário".
 *
 * `k` é a chave do verbete; sem ela, procura pelo próprio texto. Palavra fora
 * do dicionário, ou com as explicações desligadas no perfil, fica sem balão.
 */
export function Term({ k, as: Tag = 'span', className = '', children }) {
  const entry = glossaryEntry(k || glossaryKeyFor(typeof children === 'string' ? children : ''));
  const enabled = useGlossaryEnabled();
  const isTouch = usePointerIsCoarse();
  const anchorRef = useRef(null);
  const cardRef = useRef(null);
  const timer = useRef(0);
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState(null);
  const cardId = useId();

  const close = useCallback(() => {
    clearTimeout(timer.current);
    setOpen(false);
    setPos(null);
  }, []);
  const show = useCallback(() => {
    clearTimeout(timer.current);
    if (closeOpenCard && closeOpenCard !== close) closeOpenCard();
    closeOpenCard = close;
    setOpen(true);
  }, [close]);
  const later = (fn, ms) => {
    clearTimeout(timer.current);
    timer.current = setTimeout(fn, ms);
  };

  // Posição medida depois de montar: acima da palavra quando cabe, senão abaixo.
  useLayoutEffect(() => {
    if (!open) return;
    const anchor = anchorRef.current?.getBoundingClientRect();
    const height = cardRef.current?.offsetHeight || 0;
    if (!anchor) return;
    const width = Math.min(CARD_WIDTH, window.innerWidth - EDGE * 2);
    const center = anchor.left + anchor.width / 2;
    const left = Math.max(EDGE, Math.min(center - width / 2, window.innerWidth - width - EDGE));
    const above = anchor.top - height - GAP > EDGE;
    setPos({
      left,
      width,
      top: above ? anchor.top - height - GAP : anchor.bottom + GAP,
      above,
      arrow: Math.max(16, Math.min(center - left, width - 16)),
    });
  }, [open]);

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (event) => { if (event.key === 'Escape') close(); };
    const onOutside = (event) => {
      if (!anchorRef.current?.contains(event.target) && !cardRef.current?.contains(event.target)) close();
    };
    const onScroll = (event) => { if (!cardRef.current?.contains(event.target)) close(); };
    window.addEventListener('keydown', onKey);
    window.addEventListener('pointerdown', onOutside);
    window.addEventListener('scroll', onScroll, { passive: true, capture: true });
    window.addEventListener('resize', close);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('pointerdown', onOutside);
      window.removeEventListener('scroll', onScroll, { capture: true });
      window.removeEventListener('resize', close);
    };
  }, [open, close]);

  useEffect(() => () => {
    clearTimeout(timer.current);
    if (closeOpenCard === close) closeOpenCard = null;
  }, [close]);

  if (!entry || !enabled) return Tag === 'span' && !className ? children : <Tag className={className}>{children}</Tag>;

  const hover = isTouch ? {} : {
    onMouseEnter: () => later(show, open ? 0 : OPEN_DELAY),
    onMouseLeave: () => later(close, CLOSE_DELAY),
  };

  return (
    <>
      <Tag
        ref={anchorRef}
        className={`term${open ? ' is-open' : ''}${className ? ` ${className}` : ''}`}
        tabIndex={0}
        aria-describedby={open ? cardId : undefined}
        {...hover}
        onFocus={(event) => { if (event.target.matches(':focus-visible')) show(); }}
        onBlur={(event) => { if (!cardRef.current?.contains(event.relatedTarget)) close(); }}
        onClick={(event) => {
          // No celular o toque explica; dentro de um card, não abre o imóvel.
          if (!isTouch) return;
          event.preventDefault();
          event.stopPropagation();
          if (open) close(); else show();
        }}
      >
        {children}
      </Tag>
      {open && createPortal(
        <div
          ref={cardRef}
          className={`term-card${pos?.above === false ? ' is-below' : ''}`}
          style={pos
            ? { left: pos.left, top: pos.top, width: pos.width, '--arrow-x': `${pos.arrow}px` }
            : { left: 0, top: 0, width: CARD_WIDTH, visibility: 'hidden' }}
          {...hover}
          // O portal sobe pela árvore do React: sem isto, o clique no link do
          // cartão também abriria o imóvel do card.
          onClick={(event) => event.stopPropagation()}
        >
          <strong className="term-card-title">{entry.term}</strong>
          <p id={cardId} className="term-card-body">{entry.body}</p>
          <a className="term-card-link" href={entry.url} target="_blank" rel="noopener" onBlur={close}>
            Ler no dicionário <span aria-hidden="true">→</span>
          </a>
        </div>,
        document.body,
      )}
    </>
  );
}

