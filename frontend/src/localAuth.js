export const localAccountKey = 'argos_local_account_v1';
export const localSessionKey = 'argos_local_session_v1';

const normalizeEmail = value => String(value || '').trim().toLowerCase();
const validEmail = value => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
const bytesToHex = bytes => [...new Uint8Array(bytes)].map(byte => byte.toString(16).padStart(2, '0')).join('');

async function passwordHash(password, salt, cryptoApi = globalThis.crypto) {
  const payload = new TextEncoder().encode(`${salt}:${password}`);
  return bytesToHex(await cryptoApi.subtle.digest('SHA-256', payload));
}

function readAccount(storage) {
  try {
    const value = JSON.parse(storage.getItem(localAccountKey));
    return value?.version === 1 && value.user?.email && value.passwordHash && value.salt ? value : null;
  } catch { return null; }
}

export function readLocalSession(storage = window.localStorage) {
  try {
    const account = readAccount(storage);
    const session = JSON.parse(storage.getItem(localSessionKey));
    if (!account || session?.version !== 1 || session.email !== account.user.email) return null;
    return account.user;
  } catch { return null; }
}

export async function createLocalAccount(input, storage = window.localStorage, cryptoApi = globalThis.crypto) {
  const name = String(input?.name || '').trim().replace(/\s+/g, ' ');
  const email = normalizeEmail(input?.email);
  const password = String(input?.password || '');
  if (name.length < 3) throw new Error('Informe seu nome completo.');
  if (!validEmail(email)) throw new Error('Informe um e-mail válido.');
  if (password.length < 8) throw new Error('A senha precisa ter pelo menos 8 caracteres.');
  if (!input?.acceptedTerms) throw new Error('Confirme os Termos de uso e a Política de privacidade.');
  if (readAccount(storage)) throw new Error('Já existe uma conta neste navegador. Entre com seu e-mail e senha.');
  const random = new Uint8Array(16);
  cryptoApi.getRandomValues(random);
  const salt = bytesToHex(random);
  const user = { name: name.slice(0, 120), email: email.slice(0, 200) };
  const account = { version: 1, user, salt, passwordHash: await passwordHash(password, salt, cryptoApi) };
  storage.setItem(localAccountKey, JSON.stringify(account));
  storage.setItem(localSessionKey, JSON.stringify({ version: 1, email: user.email }));
  return user;
}

export async function signInLocal(input, storage = window.localStorage, cryptoApi = globalThis.crypto) {
  const account = readAccount(storage);
  const email = normalizeEmail(input?.email);
  if (!account || email !== account.user.email || await passwordHash(String(input?.password || ''), account.salt, cryptoApi) !== account.passwordHash) {
    throw new Error('E-mail ou senha incorretos.');
  }
  storage.setItem(localSessionKey, JSON.stringify({ version: 1, email }));
  return account.user;
}

export function signOutLocal(storage = window.localStorage) {
  storage.removeItem(localSessionKey);
}
