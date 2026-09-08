import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import PropertyDetail from './PropertyDetail';
import { fetchCatalogItem } from '../api';

/**
 * Resolve o imóvel de `/imovel/{id}` e decide entre quatro estados: carregando,
 * não encontrado, saiu do catálogo, ou encontrado.
 *
 * Busca só este imóvel. Quem abre o link direto não espera o catálogo inteiro.
 * Quando a navegação vem da lista, o card que já está em memória é usado como
 * semente para desenhar a página na hora, e o resultado da busca substitui.
 */
export default function PropertyRoute(props) {
  const { id } = useParams();
  // A chave remonta o carregador ao trocar de imóvel. Resetar o estado dentro
  // do efeito faria render em cascata.
  return <PropertyLoader key={id} id={id} {...props} />;
}

function PropertyLoader({ id, properties, watched, toggleWatch, onVisit }) {
  const seed = properties.find(p => String(p.id) === String(id));
  const [item, setItem] = useState(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetchCatalogItem(id)
      .then(result => {
        if (cancelled) return;
        if (result) setItem(result);
        else setNotFound(true);
      })
      .catch(() => { if (!cancelled) setNotFound(true); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [id]);

  const property = item || seed || null;

  // Registra a visita uma vez, assim que houver um imóvel resolvido.
  useEffect(() => {
    if (property?.id) onVisit?.(property);
    // Só o id importa: reabrir o mesmo imóvel não deve gravar duas vezes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [property?.id]);

  useEffect(() => {
    document.title = property?.title
      ? `${property.title} — Argos`
      : 'Argos — imóveis da Caixa, com a conta completa';
    return () => { document.title = 'Argos — imóveis da Caixa, com a conta completa'; };
  }, [property?.title]);

  if (notFound && !seed) return <PropertyMissing />;
  if (!property) return loading ? <PropertyLoading /> : <PropertyMissing />;

  return (
    <>
      {property.status === 'removed' && <RemovedNotice />}
      <PropertyDetail
        key={property.id}
        property={property}
        watched={watched}
        toggleWatch={toggleWatch}
      />
    </>
  );
}

function PropertyLoading() {
  return (
    <main className="page" style={{ maxWidth: 1480, margin: '0 auto', padding: '72px 28px', minHeight: '65vh', display: 'grid', placeItems: 'center' }}>
      <span className="countdown" style={{ justifyContent: 'center', color: 'var(--fg-2)' }}>
        <span className="dot" style={{ background: 'var(--accent)' }}></span>
        <span className="mono">Carregando o imóvel…</span>
      </span>
    </main>
  );
}

function PropertyMissing() {
  return (
    <main className="page" style={{ maxWidth: 640, margin: '0 auto', padding: '80px 24px', textAlign: 'center' }}>
      <h1 className="h1" style={{ marginBottom: 10 }}>Não encontramos este imóvel</h1>
      <p style={{ color: 'var(--fg-2)', fontSize: 14, lineHeight: 1.6, margin: '0 0 24px' }}>
        O endereço pode estar incompleto, ou o imóvel pode ter sido retirado do
        catálogo da Caixa há bastante tempo.
      </p>
      <Link className="btn primary" to="/">Ver os imóveis disponíveis</Link>
    </main>
  );
}

// Um link compartilhado sobrevive ao imóvel. Dizer que ele saiu é diferente de
// não encontrá-lo, e muito diferente de mostrar preço e contagem regressiva de
// algo que não está mais à venda.
function RemovedNotice() {
  return (
    <div className="page" style={{ maxWidth: 1480, margin: '0 auto', padding: '20px 24px 0' }}>
      <div className="removed-notice" role="status">
        <strong>Este imóvel saiu do catálogo da Caixa.</strong>
        <span>
          Os dados abaixo são os últimos que coletamos e podem estar
          desatualizados. Ele não está mais à venda por aqui.
        </span>
      </div>
    </div>
  );
}
