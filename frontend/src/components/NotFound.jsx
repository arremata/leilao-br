import { Link } from 'react-router-dom';

/**
 * Endereço que não corresponde a nenhuma tela.
 *
 * Distinto de "não encontramos este imóvel": lá a rota existe e o imóvel é que
 * não. Aqui nem a rota existe. Os dois precisam oferecer um caminho de volta —
 * um endereço errado não pode ser um beco sem saída.
 */
export default function NotFound() {
  return (
    <main className="page" style={{ maxWidth: 640, margin: '0 auto', padding: '80px 24px', textAlign: 'center' }}>
      <h1 className="h1" style={{ marginBottom: 10 }}>Esta página não existe</h1>
      <p style={{ color: 'var(--fg-2)', fontSize: 14, lineHeight: 1.6, margin: '0 0 24px' }}>
        O endereço pode estar incompleto ou ter sido digitado errado.
      </p>
      <Link className="btn primary" to="/">Ver os imóveis</Link>
    </main>
  );
}
