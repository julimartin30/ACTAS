/*
 * Cifrado de la configuración y firma por código.
 *
 * - Los datos (equipos, plantillas, usuarios) se cifran con una clave aleatoria (DEK).
 * - Esa clave se "envuelve" una vez por usuario con una clave derivada de su contraseña
 *   (PBKDF2-SHA256). Sin un usuario y contraseña válidos no se puede leer nada.
 * - Los códigos de equipo nunca se guardan: solo su huella (PBKDF2 con sal).
 *
 * Funciona en el navegador y en Node 20+ (Web Crypto estándar).
 */
(function (global) {
  'use strict';
  const subtle = global.crypto.subtle;
  const enc = new TextEncoder();
  const dec = new TextDecoder();
  const ITER_USUARIO = 310000;
  const ITER_CODIGO = 120000;

  function b64(bytes) {
    bytes = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
    let s = '';
    for (let i = 0; i < bytes.length; i += 0x8000) {
      s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    }
    return btoa(s);
  }
  function unb64(s) {
    const bin = atob(s);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }
  function hex(buf) {
    return Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, '0')).join('');
  }
  const aleatorio = (n) => global.crypto.getRandomValues(new Uint8Array(n));

  async function sha256Hex(texto) {
    return hex(await subtle.digest('SHA-256', enc.encode(texto)));
  }

  async function derivar(password, sal, iter, usos) {
    const base = await subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveKey']);
    return subtle.deriveKey(
      { name: 'PBKDF2', salt: sal, iterations: iter, hash: 'SHA-256' },
      base,
      { name: 'AES-GCM', length: 256 },
      false,
      usos
    );
  }

  async function cifrar(clave, bytes) {
    const iv = aleatorio(12);
    const ct = await subtle.encrypt({ name: 'AES-GCM', iv }, clave, bytes);
    return { iv: b64(iv), ct: b64(ct) };
  }
  async function descifrar(clave, caja) {
    const pt = await subtle.decrypt({ name: 'AES-GCM', iv: unb64(caja.iv) }, clave, unb64(caja.ct));
    return new Uint8Array(pt);
  }

  const importarDek = (raw) =>
    subtle.importKey('raw', raw, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);

  const normalizarUsuario = (u) => String(u || '').trim().toLowerCase();

  /** Identificador opaco del usuario dentro del fichero (no revela el nombre de usuario). */
  const idUsuario = (usuario) => sha256Hex('actas-fedc|' + normalizarUsuario(usuario));

  /** Envuelve la DEK para un usuario con su contraseña. */
  async function llaveParaUsuario(dekRaw, usuario, password) {
    const sal = aleatorio(16);
    const k = await derivar(password, sal, ITER_USUARIO, ['encrypt']);
    const caja = await cifrar(k, dekRaw);
    return { id: await idUsuario(usuario), llave: { sal: b64(sal), iter: ITER_USUARIO, ...caja } };
  }

  /** Recupera la DEK con usuario + contraseña. Lanza error si no son válidos. */
  async function abrirLlave(fichero, usuario, password) {
    const id = await idUsuario(usuario);
    const llave = fichero.llaves && fichero.llaves[id];
    if (!llave) throw new Error('CREDENCIALES');
    try {
      const k = await derivar(password, unb64(llave.sal), llave.iter || ITER_USUARIO, ['decrypt']);
      return await descifrar(k, llave);
    } catch (e) {
      throw new Error('CREDENCIALES');
    }
  }

  async function sellarDatos(dekRaw, datos) {
    const k = await importarDek(dekRaw);
    return cifrar(k, enc.encode(JSON.stringify(datos)));
  }
  async function abrirDatos(dekRaw, caja) {
    const k = await importarDek(dekRaw);
    return JSON.parse(dec.decode(await descifrar(k, caja)));
  }

  /** Construye el fichero config.json completo. */
  async function sellarConfig(datos, dekRaw, llaves) {
    return {
      formato: 'actas-fedc',
      version: 1,
      actualizado: new Date().toISOString(),
      llaves,
      datos: await sellarDatos(dekRaw, datos),
    };
  }

  /** Abre config.json con usuario y contraseña → { datos, dekRaw, perfil }. */
  async function abrirConfig(fichero, usuario, password) {
    if (!fichero || fichero.formato !== 'actas-fedc') throw new Error('FORMATO');
    const dekRaw = await abrirLlave(fichero, usuario, password);
    const datos = await abrirDatos(dekRaw, fichero.datos);
    const u = normalizarUsuario(usuario);
    const perfil = (datos.usuarios || []).find((x) => normalizarUsuario(x.usuario) === u);
    if (!perfil || perfil.activo === false) throw new Error('CREDENCIALES');
    return { datos, dekRaw, perfil };
  }

  /* ---------- Códigos de equipo ---------- */
  const ALFABETO = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // sin 0/O, 1/I
  const normalizarCodigo = (c) => String(c || '').toUpperCase().replace(/[^A-Z0-9]/g, '');

  function generarCodigo(longitud = 6) {
    const r = aleatorio(longitud);
    let s = '';
    for (let i = 0; i < longitud; i++) s += ALFABETO[r[i] % ALFABETO.length];
    return s;
  }

  async function huellaCodigo(codigo, salB64) {
    const sal = salB64 ? unb64(salB64) : aleatorio(16);
    const base = await subtle.importKey('raw', enc.encode(normalizarCodigo(codigo)), 'PBKDF2', false, ['deriveBits']);
    const bits = await subtle.deriveBits(
      { name: 'PBKDF2', salt: sal, iterations: ITER_CODIGO, hash: 'SHA-256' },
      base,
      256
    );
    return { sal: b64(sal), iter: ITER_CODIGO, huella: hex(bits) };
  }

  async function comprobarCodigo(codigo, guardado) {
    if (!guardado || !guardado.huella || !normalizarCodigo(codigo)) return false;
    const h = await huellaCodigo(codigo, guardado.sal);
    return h.huella === guardado.huella;
  }

  global.Cripto = {
    aleatorio,
    b64,
    unb64,
    sha256Hex,
    idUsuario,
    normalizarUsuario,
    llaveParaUsuario,
    abrirLlave,
    sellarConfig,
    abrirConfig,
    sellarDatos,
    abrirDatos,
    generarCodigo,
    normalizarCodigo,
    huellaCodigo,
    comprobarCodigo,
  };
})(typeof window !== 'undefined' ? window : globalThis);
