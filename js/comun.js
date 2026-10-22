/* Utilidades compartidas por la app del árbitro y la de administración. */
(function (global) {
  'use strict';

  const $ = (sel, raiz = document) => raiz.querySelector(sel);
  const $$ = (sel, raiz = document) => Array.from(raiz.querySelectorAll(sel));

  /** Crea un elemento: el('div.clase#id', {atributos}, hijos...) */
  function el(tag, attrs, ...hijos) {
    const [nombre, ...resto] = tag.split(/(?=[.#])/);
    const n = document.createElement(nombre || 'div');
    resto.forEach((p) => (p[0] === '.' ? n.classList.add(p.slice(1)) : (n.id = p.slice(1))));
    if (attrs && (typeof attrs !== 'object' || attrs instanceof Node || Array.isArray(attrs))) {
      hijos.unshift(attrs);
      attrs = null;
    }
    for (const [k, v] of Object.entries(attrs || {})) {
      if (v === undefined || v === null || v === false) continue;
      if (k.startsWith('on') && typeof v === 'function') n.addEventListener(k.slice(2), v);
      else if (k === 'value') n.value = v;
      else if (k === 'checked') n.checked = !!v;
      else if (k === 'html') n.innerHTML = v;
      else n.setAttribute(k, v === true ? '' : v);
    }
    hijos.flat(Infinity).forEach((h) => {
      if (h === null || h === undefined || h === false) return;
      n.append(h instanceof Node ? h : document.createTextNode(String(h)));
    });
    return n;
  }

  function aviso(texto, tipo = 'ok', ms = 3200) {
    let zona = $('#avisos');
    if (!zona) {
      zona = el('div#avisos', { role: 'status', 'aria-live': 'polite' });
      document.body.append(zona);
    }
    const t = el('div.aviso.aviso-' + tipo, texto);
    zona.append(t);
    setTimeout(() => t.classList.add('fuera'), ms);
    setTimeout(() => t.remove(), ms + 400);
  }

  /** Diálogo modal sencillo. Devuelve una promesa con el valor del botón pulsado. */
  function dialogo({ titulo, cuerpo, botones = [{ texto: 'Aceptar', valor: true, primario: true }] }) {
    return new Promise((resolver) => {
      const d = el('dialog.dialogo');
      const cerrar = (v) => {
        d.close();
        d.remove();
        resolver(v);
      };
      d.append(
        el('h2', titulo),
        el('div.dialogo-cuerpo', cuerpo),
        el(
          'div.dialogo-botones',
          botones.map((b) =>
            el(
              'button' + (b.primario ? '.btn.btn-primario' : b.peligro ? '.btn.btn-peligro' : '.btn'),
              { type: 'button', onclick: () => cerrar(typeof b.valor === 'function' ? b.valor() : b.valor) },
              b.texto
            )
          )
        )
      );
      d.addEventListener('cancel', (e) => {
        e.preventDefault();
        cerrar(null);
      });
      document.body.append(d);
      d.showModal();
      const foco = d.querySelector('input, select, textarea') || d.querySelector('.btn-primario');
      if (foco) foco.focus();
    });
  }

  const confirmar = (titulo, texto, si = 'Sí', peligro = false) =>
    dialogo({
      titulo,
      cuerpo: el('p', texto),
      botones: [
        { texto: 'Cancelar', valor: false },
        { texto: si, valor: true, primario: !peligro, peligro },
      ],
    });

  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

  function fechaLarga(iso) {
    if (!iso) return '';
    const d = new Date(iso);
    return d.toLocaleString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  }
  function fechaCorta(yyyyMmDd) {
    if (!yyyyMmDd) return '';
    const [y, m, d] = yyyyMmDd.split('-');
    return `${d}/${m}/${y}`;
  }

  function descargar(nombre, contenido, tipo) {
    const blob = contenido instanceof Blob ? contenido : new Blob([contenido], { type: tipo || 'application/octet-stream' });
    const url = URL.createObjectURL(blob);
    const a = el('a', { href: url, download: nombre });
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
  }

  async function cargarConfigRemota() {
    const r = await fetch('data/config.json?t=' + Date.now(), { cache: 'no-store' });
    if (!r.ok) throw new Error('NO_CONFIG');
    return r.json();
  }

  const MODALIDADES = { fs: 'Fútbol sala', f5: 'Fútbol 5' };

  const COMPETICIONES_POR_DEFECTO = [
    { id: 'fs1', nombre: '1ª División de Fútbol Sala', modalidad: 'fs' },
    { id: 'fs2', nombre: '2ª División de Fútbol Sala', modalidad: 'fs' },
    { id: 'f5', nombre: 'Liga Nacional de Fútbol 5', modalidad: 'f5' },
  ];

  global.U = {
    $,
    $$,
    el,
    aviso,
    dialogo,
    confirmar,
    uid,
    fechaLarga,
    fechaCorta,
    descargar,
    cargarConfigRemota,
    MODALIDADES,
    COMPETICIONES_POR_DEFECTO,
  };
})(window);
