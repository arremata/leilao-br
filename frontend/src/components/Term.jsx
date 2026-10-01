import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { GLOSSARY, glossaryKeyFor } from '../content/glossary';

const TIP_WIDTH = 260;
const GAP = 8;

/**
 * Palavra com explicação: sublinhado pontilhado e um balão ao passar o mouse,
 * ao focar pelo teclado ou ao tocar no celular.
 *
 * O balão vai para um portal com posição fixa: dentro do card ele seria
 * cortado pelo `overflow` e pela borda da grade. Dentro de um card-link, o
 * clique no termo abre o balão e não navega.
 *
 * `k` é a chave do glossário; sem ela, tenta achar pelo próprio texto. Se não
 * houver verbete, renderiza só o texto.
 */
export function Term({ k, children, className = '' }) {
  const key = k || glossaryKeyFor(typeof children === 'string' ? children : '');
  const entry = key ? GLOSSARY[key] : null;
  const anchorRef = useRef(null);
  const [pos, setPos] = useState(null);
  const tipId = useId();

  const open = useCallback(() => {
    const rect = anchorRef.current?.getBoundingClientRect();
    if (!rect) return;
    const left = Math.max(GAP, Math.min(
      rect.left + rect.width / 2 - TIP_WIDTH / 2,
      window.innerWidth - TIP_WIDTH - GAP,
    ));
    // Acima da palavra quando cabe; senão, abaixo.
    const above = rect.top > 140;
    setPos({ left, top: above ? rect.top - GAP : rect.bottom + GAP, above });
  }, []);
  const close = useCallback(() => setPos(null), []);

  useEffect(() => {
    if (!pos) return undefined;
    const onKey = (event) => { if (event.key === 'Escape') close(); };
    const onOutside = (event) => {
      if (!anchorRef.current?.contains(event.target)) close();
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('scroll', close, { passive: true, capture: true });
    window.addEventListener('pointerdown', onOutside);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('scroll', close, { capture: true });
      window.removeEventListener('pointerdown', onOutside);
    };
  }, [pos, close]);

  if (!entry) return children;

  return (
    <>
      <span
        ref={anchorRef}
        className={`term ${className}`}
        tabIndex={0}
        role="button"
        aria-describedby={pos ? tipId : undefined}
        onMouseEnter={open}
        onMouseLeave={close}
        onFocus={open}
        onBlur={close}
        onClick={(event) => {
          // Dentro de um card que é link: o toque explica, não navega.
          event.preventDefault();
          event.stopPropagation();
          if (pos) close(); else open();
        }}
      >
        {children}
      </span>
      {pos && createPortal(
        <div
          id={tipId}
          role="tooltip"
          className={`term-tip${pos.above ? ' is-above' : ''}`}
          style={{ left: pos.left, top: pos.top, width: TIP_WIDTH }}
        >
          <strong>{entry.term}</strong>
          <span>{entry.body}</span>
        </div>,
        document.body,
      )}
    </>
  );
}
