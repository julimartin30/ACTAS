/* App del árbitro: acceso, cumplimentación, firma y cierre de actas. */
(function () {
  'use strict';
  const { $, el, aviso, dialogo, confirmar, uid, fechaLarga, fechaCorta, descargar, MODALIDADES } = U;

  const CLAVE_CONFIG = 'actas-fedc:config';
  const CLAVE_SESION = 'actas-fedc:sesion';
  const MAX_JUGADORES = 8;
  const MAX_PORTEROS = 2;

  const S = {
    fichero: null,
    datos: null,
    dekRaw: null,
    perfil: null,
    idUsuario: null,
    actas: [],
    acta: null,
    pestana: 'partido',
    intentosFallidos: {},
  };
  const app = $('#app');

  /* ================= Almacenamiento ================= */
  const lsGet = (k) => {
    try {
      return localStorage.getItem(k);
    } catch {
      return null;
    }
  };
  const lsSet = (k, v) => {
    try {
      localStorage.setItem(k, v);
      return true;
    } catch {
      return false;
    }
  };

  async function cargarActas() {
    S.actas = [];
    const crudo = lsGet('actas-fedc:actas:' + S.idUsuario);
    if (!crudo) return;
    try {
      S.actas = await Cripto.abrirDatos(S.dekRaw, JSON.parse(crudo));
    } catch {
      // La clave cambió (configuración nueva): se conserva una copia sin tocar.
      lsSet('actas-fedc:actas-antiguas:' + S.idUsuario + ':' + Date.now(), crudo);
      lsSet('actas-fedc:actas:' + S.idUsuario, '');
      aviso('Había actas guardadas con una configuración anterior que ya no se pueden abrir.', 'alerta', 6000);
    }
  }

  let temporizador = null;
  function guardar(inmediato) {
    if (S.acta) S.acta.modificada = new Date().toISOString();
    clearTimeout(temporizador);
    const hacer = async () => {
      const caja = await Cripto.sellarDatos(S.dekRaw, S.actas);
      if (!lsSet('actas-fedc:actas:' + S.idUsuario, JSON.stringify(caja))) {
        aviso('No se ha podido guardar en este dispositivo (¿navegación privada o sin espacio?).', 'error', 6000);
        return;
      }
      const g = $('#estado-guardado');
      if (g) g.textContent = 'Guardado ' + new Date().toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    };
    if (inmediato) return hacer();
    temporizador = setTimeout(hacer, 400);
  }

  /* ================= Acceso ================= */
  async function inicio() {
    $('#btn-salir').addEventListener('click', salir);
    try {
      S.fichero = await U.cargarConfigRemota();
      lsSet(CLAVE_CONFIG, JSON.stringify(S.fichero));
    } catch {
      const c = lsGet(CLAVE_CONFIG);
      S.fichero = c ? JSON.parse(c) : null;
    }
    // Sesión abierta en esta pestaña
    try {
      const ses = JSON.parse(sessionStorage.getItem(CLAVE_SESION) || 'null');
      if (ses && S.fichero) {
        const dek = Cripto.unb64(ses.dek);
        const datos = await Cripto.abrirDatos(dek, S.fichero.datos);
        const perfil = datos.usuarios.find((u) => Cripto.normalizarUsuario(u.usuario) === ses.usuario && u.activo !== false);
        if (perfil) return entrar({ datos, dekRaw: dek, perfil });
      }
    } catch {
      sessionStorage.removeItem(CLAVE_SESION);
    }
    pantallaLogin();
  }

  function pantallaLogin(error) {
    $('#usuario-actual').hidden = true;
    $('#btn-salir').hidden = true;
    const form = el(
      'form',
      el('label.campo', el('span', 'Usuario'), el('input', { name: 'usuario', required: true, autocomplete: 'username', autocapitalize: 'none', spellcheck: 'false' })),
      el('label.campo', el('span', 'Contraseña'), el('input', { name: 'password', type: 'password', required: true, autocomplete: 'current-password' })),
      el('button.btn.btn-primario', { type: 'submit' }, 'Entrar')
    );
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const b = form.querySelector('button');
      b.disabled = true;
      b.textContent = 'Comprobando…';
      try {
        const r = await Cripto.abrirConfig(S.fichero, form.usuario.value, form.password.value);
        sessionStorage.setItem(CLAVE_SESION, JSON.stringify({ usuario: Cripto.normalizarUsuario(r.perfil.usuario), dek: Cripto.b64(r.dekRaw) }));
        entrar(r);
      } catch {
        pantallaLogin('Usuario o contraseña incorrectos.');
      }
    });
    app.replaceChildren(
      el(
        'div.login',
        el(
          'div.tarjeta',
          el('div.cabecera-login', el('img.logo-login', { src: 'assets/logo.png', alt: 'FEDC' }), el('h1', 'Actas de partido'), el('div.ayuda', 'Acceso para árbitros')),
          error ? el('div.nota.nota-error', error) : null,
          S.fichero ? form : el('div.nota.nota-alerta', 'La aplicación todavía no está configurada. El administrador debe publicar data/config.json.')
        ),
        el('p.ayuda', { style: 'text-align:center' }, el('a', { href: 'admin.html' }, 'Administración'))
      )
    );
  }

  async function entrar(r) {
    S.datos = r.datos;
    S.dekRaw = r.dekRaw;
    S.perfil = r.perfil;
    S.idUsuario = await Cripto.idUsuario(r.perfil.usuario);
    $('#sub-org').textContent = [S.datos.organizacion, S.datos.temporada].filter(Boolean).join(' · ');
    $('#usuario-actual').textContent = S.perfil.nombre;
    $('#usuario-actual').hidden = false;
    $('#btn-salir').hidden = false;
    await cargarActas();
    pantallaLista();
  }

  async function salir() {
    if (!(await confirmar('Cerrar sesión', 'Los borradores quedan guardados en este dispositivo. ¿Salir?', 'Salir'))) return;
    sessionStorage.removeItem(CLAVE_SESION);
    S.datos = S.dekRaw = S.perfil = S.acta = null;
    S.actas = [];
    pantallaLogin();
  }

  /* ================= Utilidades del acta ================= */
  const competicion = (id) => (S.datos.competiciones || []).find((c) => c.id === id);
  const equipoCfg = (id) => (S.datos.equipos || []).find((e) => e.id === id);
  const modalidad = (a) => (competicion(a.competicion) || {}).modalidad || 'fs';
  const nombreEquipo = (t) => (t && t.nombre) || '—';
  const convocados = (t) => (t.jugadores || []).filter((j) => j.juega);

  function equipoVacio() {
    return {
      equipoId: null,
      nombre: '',
      jugadores: [],
      entrenador: { apellidos: '', nombre: '', amarillas: 0, roja: false },
      guia: { apellidos: '', nombre: '', amarillas: 0, roja: false },
      faltas: [0, 0],
      firma: null,
    };
  }

  function nuevaActa() {
    const hoy = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    const fecha = `${hoy.getFullYear()}-${pad(hoy.getMonth() + 1)}-${pad(hoy.getDate())}`;
    return {
      id: uid(),
      numero: 'ACT-' + fecha.replace(/-/g, '') + '-' + Cripto.generarCodigo(4),
      estado: 'borrador',
      creada: hoy.toISOString(),
      modificada: hoy.toISOString(),
      usuario: S.perfil.usuario,
      competicion: '',
      partido: { instalacion: '', fecha, hora: '', jornada: '', arbitros: [S.perfil.nombre || '', ''], cronometrador: '', fisio: { nombre: '', dni: '' } },
      local: equipoVacio(),
      visitante: equipoVacio(),
      resultado: { local: '', visitante: '', manual: false },
      observaciones: '',
      incidenciasFirma: [],
      cierre: null,
      fase: 1,
    };
  }

  const golesDe = (t) => convocados(t).filter((j) => j.participa !== false).reduce((s, j) => s + (Number(j.goles) || 0), 0);

  function sincronizarResultado(a) {
    if (!a.resultado.manual) {
      a.resultado.local = String(golesDe(a.local));
      a.resultado.visitante = String(golesDe(a.visitante));
    }
  }

  /** Contenido que firma el entrenador: todo menos observaciones y firmas. */
  function contenidoFirmable(a) {
    const limpiar = (t) => ({
      equipoId: t.equipoId,
      nombre: t.nombre,
      jugadores: convocados(t).map(({ dorsal, posicion, apellidos, nombre, goles, amarillas, roja, participa }) => ({ dorsal, posicion, apellidos, nombre, participa: participa !== false, goles, amarillas, roja })),
      entrenador: t.entrenador,
      guia: modalidad(a) === 'f5' ? t.guia : null,
      faltas: t.faltas,
    });
    return JSON.stringify({ numero: a.numero, competicion: a.competicion, partido: a.partido, local: limpiar(a.local), visitante: limpiar(a.visitante), resultado: [a.resultado.local, a.resultado.visitante] });
  }
  const huellaFirmable = (a) => Cripto.sha256Hex(contenidoFirmable(a));

  async function firmaValida(a, lado) {
    const f = a[lado].firma;
    return !!(f && f.estado === 'firmada' && f.huella === (await huellaFirmable(a)));
  }

  /* ================= Listado ================= */
  function pantallaLista() {
    S.acta = null;
    const orden = (x, y) => (y.modificada || '').localeCompare(x.modificada || '');
    const borradores = S.actas.filter((a) => a.estado === 'borrador').sort(orden);
    const cerradas = S.actas.filter((a) => a.estado === 'cerrada').sort(orden);

    const item = (a) => {
      const c = competicion(a.competicion);
      return el(
        'div.item-acta',
        el('div.partido', nombreEquipo(a.local) + ' – ' + nombreEquipo(a.visitante), ' ', el('span.chip.chip-' + a.estado, a.estado === 'cerrada' ? 'Cerrada' : (a.fase === 2 ? 'Fase 2 · Partido' : 'Fase 1 · Antes del partido'))),
        el(
          'div.acciones',
          a.estado === 'borrador'
            ? [el('button.btn.btn-peq.btn-primario', { onclick: () => abrirActa(a) }, 'Continuar'), el('button.btn.btn-peq.btn-peligro', { onclick: () => borrarActa(a) }, 'Eliminar')]
            : [el('button.btn.btn-peq', { onclick: () => descargarPdf(a) }, 'PDF'), el('button.btn.btn-peq.btn-oscuro', { onclick: () => pantallaCerrada(a) }, 'Enviar')]
        ),
        el(
          'div.meta',
          [c ? c.nombre : 'Sin competición', a.partido.jornada ? 'Jornada ' + a.partido.jornada : '', fechaCorta(a.partido.fecha), a.estado === 'cerrada' && a.resultado.local !== '' ? a.resultado.local + '-' + a.resultado.visitante : '']
            .filter(Boolean)
            .join(' · ')
        )
      );
    };

    app.replaceChildren(
      el(
        'div.fila-botones',
        { style: 'justify-content:space-between;margin-bottom:14px' },
        el('h1', { style: 'margin:0' }, 'Mis actas'),
        el('button.btn.btn-primario', { onclick: () => abrirActa(null) }, '+ Nueva acta')
      ),
      el(
        'div.tarjeta',
        el('h2', 'En curso'),
        borradores.length ? el('div.lista-actas', borradores.map(item)) : el('div.vacio', 'No tienes actas en curso. Pulsa «Nueva acta» al llegar a la instalación.')
      ),
      el(
        'div.tarjeta',
        el('h2', 'Cerradas'),
        el('p.ayuda', 'Se guardan solo en este dispositivo. Asegúrate de enviar el PDF al administrador.'),
        cerradas.length ? el('div.lista-actas', cerradas.slice(0, 40).map(item)) : el('div.vacio', 'Todavía no has cerrado ninguna acta.')
      )
    );
    window.scrollTo(0, 0);
  }

  function abrirActa(a) {
    if (!a) {
      a = nuevaActa();
      S.actas.push(a);
      guardar(true);
    }
    S.acta = a;
    a.fase = a.fase || 1;
    S.pestana = a.fase === 2 ? 'juego-local' : 'partido';
    pintarEditor();
  }

  async function borrarActa(a) {
    if (!(await confirmar('Eliminar borrador', `¿Eliminar el acta ${nombreEquipo(a.local)} – ${nombreEquipo(a.visitante)}? No se puede deshacer.`, 'Eliminar', true))) return;
    S.actas = S.actas.filter((x) => x !== a);
    await guardar(true);
    pantallaLista();
  }

  /* ================= Editor ================= */
  // Fase 1: antes del partido (datos del encuentro y participantes).
  // Fase 2: partido (participación, goles, amonestaciones, faltas, resultado, firmas).
  const FASES = {
    1: [
      ['partido', 'Datos del encuentro'],
      ['conv-local', 'Local'],
      ['conv-visitante', 'Visitante'],
    ],
    2: [
      ['juego-local', 'Local'],
      ['juego-visitante', 'Visitante'],
      ['resultado', 'Resultado'],
      ['cierre', 'Firmas y cierre'],
    ],
  };
  const pestanasFase = (a) => FASES[a.fase || 1];

  function pintarEditor() {
    const a = S.acta;
    a.fase = a.fase || 1;
    const pest = pestanasFase(a);
    if (!pest.some((p) => p[0] === S.pestana)) S.pestana = pest[0][0];
    const idx = pest.findIndex((p) => p[0] === S.pestana);
    const c = competicion(a.competicion);

    const botonFase = (n, titulo, sub) =>
      el(
        'button.fase' + (a.fase === n ? '.activa' : '') + (a.fase > n ? '.hecha' : ''),
        {
          type: 'button',
          'aria-current': a.fase === n ? 'step' : null,
          onclick: () => {
            if (n === a.fase) return;
            if (n === 2) confirmarFase1();
            else volverFase1();
          },
        },
        el('span.n', a.fase > n ? '✓' : n),
        el('span', el('b', titulo), el('small', sub))
      );

    app.replaceChildren(
      el(
        'div.cabecera-acta',
        el('h1', a.local.nombre || a.visitante.nombre ? nombreEquipo(a.local) + ' – ' + nombreEquipo(a.visitante) : 'Nueva acta'),
        el('span.guardado#estado-guardado', 'Borrador · se guarda automáticamente')
      ),
      el('div.ayuda', c ? c.nombre + ' · ' + MODALIDADES[c.modalidad] : 'Elige la competición para empezar', ' · ', a.numero),
      el(
        'div.fases',
        botonFase(1, 'Antes del partido', 'Datos del encuentro y participantes'),
        botonFase(2, 'Partido', 'Resultado, participación y amonestaciones')
      ),
      el(
        'nav.pestanas',
        { role: 'tablist' },
        pest.map(([id, t], i) =>
          el('button.pestana', { role: 'tab', 'aria-selected': String(id === S.pestana), onclick: () => irA(id) }, el('span.num', i + 1), t)
        )
      ),
      el('section#contenido')
    );
    const cont = $('#contenido');
    ({
      partido: tabPartido,
      'conv-local': (n) => tabConvocatoria(n, 'local'),
      'conv-visitante': (n) => tabConvocatoria(n, 'visitante'),
      'juego-local': (n) => tabJuego(n, 'local'),
      'juego-visitante': (n) => tabJuego(n, 'visitante'),
      resultado: tabResultado,
      cierre: tabCierre,
    })[S.pestana](cont);

    let siguiente;
    if (idx < pest.length - 1) siguiente = el('button.btn.btn-oscuro', { onclick: () => irA(pest[idx + 1][0]) }, 'Siguiente');
    else if (a.fase === 1) siguiente = el('button.btn.btn-primario', { onclick: confirmarFase1 }, 'Confirmar y pasar al partido');
    else siguiente = el('button.btn.btn-primario', { onclick: finalizar }, 'Finalizar acta');

    app.append(
      el(
        'div.pie-acta',
        el(
          'div.contenido',
          el('button.btn', { onclick: () => (guardar(true), pantallaLista()) }, '← Mis actas'),
          el(
            'div.fila-botones',
            idx > 0 ? el('button.btn', { onclick: () => irA(pest[idx - 1][0]) }, 'Anterior') : a.fase === 2 ? el('button.btn', { onclick: volverFase1 }, '← Fase 1') : null,
            siguiente
          )
        )
      )
    );
  }

  function irA(id) {
    if (id !== 'partido' && !S.acta.competicion) {
      aviso('Primero elige la competición.', 'alerta');
      id = 'partido';
    }
    S.pestana = id;
    pintarEditor();
    window.scrollTo(0, 0);
  }

  async function confirmarFase1() {
    const a = S.acta;
    const { errores, avisos } = validarFase1(a);
    if (errores.length) {
      await dialogo({ titulo: 'Faltan datos de la fase 1', cuerpo: [el('p', 'Corrige lo siguiente antes de empezar el partido:'), el('ul', errores.map((e) => el('li', e)))] });
      return;
    }
    const resumen = ['local', 'visitante'].map((l) => {
      const c = convocados(a[l]);
      return el('li', `${nombreEquipo(a[l])}: ${c.filter((j) => j.posicion !== 'Portero').length} jugadores y ${c.filter((j) => j.posicion === 'Portero').length} porteros`);
    });
    const ok = await dialogo({
      titulo: 'Pasar a la fase 2: partido',
      cuerpo: [
        el('ul', { style: 'margin:0;padding-left:18px' }, resumen),
        avisos.length ? el('div.nota.nota-alerta', el('b', 'Revisa: '), el('ul', { style: 'margin:4px 0 0;padding-left:18px' }, avisos.map((x) => el('li', x)))) : null,
        el('p.ayuda', 'Los participantes quedan fijados. Si hace falta corregirlos, podrás volver a la fase 1.'),
      ],
      botones: [
        { texto: 'Seguir revisando', valor: false },
        { texto: 'Empezar fase 2', valor: true, primario: true },
      ],
    });
    if (!ok) return;
    ['local', 'visitante'].forEach((l) => convocados(a[l]).forEach((j) => {
      if (j.participa === undefined) j.participa = true;
    }));
    a.fase = 2;
    sincronizarResultado(a);
    await guardar(true);
    S.pestana = 'juego-local';
    pintarEditor();
    window.scrollTo(0, 0);
  }

  async function volverFase1() {
    const a = S.acta;
    const firmada = a.local.firma || a.visitante.firma;
    const ok = await confirmar(
      'Volver a la fase 1',
      'Podrás corregir los datos del encuentro y los participantes. Los goles y tarjetas anotados se conservan.' + (firmada ? ' Si cambias algo, los entrenadores tendrán que volver a firmar.' : ''),
      'Volver a la fase 1'
    );
    if (!ok) return;
    a.fase = 1;
    await guardar(true);
    S.pestana = 'conv-local';
    pintarEditor();
    window.scrollTo(0, 0);
  }

  /** Input enlazado a obj[clave]. */
  function campo(etiqueta, obj, clave, attrs = {}, req = false) {
    const { onCambio, ancho, ...resto } = attrs;
    const input = el(resto.tag || 'input', {
      ...resto,
      tag: null,
      value: obj[clave] ?? '',
      oninput: (e) => {
        obj[clave] = e.target.value;
        if (onCambio) onCambio(e.target.value);
        guardar();
      },
    });
    return el('label.campo' + (ancho ? '.ancho' : ''), el('span' + (req ? '.req' : ''), etiqueta), input);
  }

  /* ---------- Pestaña: partido ---------- */
  function tabPartido(cont) {
    const a = S.acta;
    const p = a.partido;
    const esF5 = modalidad(a) === 'f5';
    const instalaciones = [...new Set((S.datos.equipos || []).map((e) => e.instalacion).filter(Boolean))].sort();
    const otrosArbitros = (S.datos.usuarios || []).map((u) => u.nombre).filter(Boolean);

    const selComp = el(
      'select',
      {
        required: true,
        onchange: async (e) => {
          const nueva = e.target.value;
          const conEquipos = a.local.equipoId || a.visitante.equipoId || convocados(a.local).length || convocados(a.visitante).length;
          if (a.competicion && conEquipos && !(await confirmar('Cambiar competición', 'Se vaciarán los equipos y jugadores ya seleccionados. ¿Continuar?', 'Cambiar', true))) {
            e.target.value = a.competicion;
            return;
          }
          if (conEquipos) {
            a.local = equipoVacio();
            a.visitante = equipoVacio();
          }
          a.competicion = nueva;
          sincronizarResultado(a);
          guardar();
          pintarEditor();
        },
      },
      el('option', { value: '' }, 'Elige…'),
      (S.datos.competiciones || []).map((c) => el('option', { value: c.id, selected: c.id === a.competicion }, c.nombre))
    );

    cont.append(
      el(
        'div.tarjeta',
        el('h2', 'Datos del partido'),
        el(
          'div.rejilla',
          el('label.campo.ancho', el('span.req', 'Competición'), selComp),
          campo('Instalación', p, 'instalacion', { list: 'lista-instalaciones', ancho: true }, true),
          el('datalist#lista-instalaciones', instalaciones.map((i) => el('option', { value: i }))),
          campo('Fecha', p, 'fecha', { type: 'date' }, true),
          campo('Hora', p, 'hora', { type: 'time' }, true),
          campo('Jornada', p, 'jornada', { inputmode: 'text', placeholder: 'p. ej. 5' })
        )
      ),
      el(
        'div.tarjeta',
        el('h2', 'Equipo arbitral'),
        el(
          'div.rejilla',
          el('datalist#lista-arbitros', otrosArbitros.map((n) => el('option', { value: n }))),
          campo(esF5 ? 'Árbitro' : 'Árbitro 1', p.arbitros, 0, { list: 'lista-arbitros' }, true),
          esF5 ? null : campo('Árbitro 2', p.arbitros, 1, { list: 'lista-arbitros' }),
          campo('Cronometrador', p, 'cronometrador')
        )
      ),
      esF5
        ? el(
            'div.tarjeta',
            el('h2', 'Fisioterapeuta'),
            el('div.rejilla', campo('Nombre y apellidos', p.fisio, 'nombre'), campo('DNI', p.fisio, 'dni', { autocapitalize: 'characters' }))
          )
        : null
    );
  }

  /* ---------- Fase 1: participantes de cada equipo ---------- */
  function tabConvocatoria(cont, lado) {
    const a = S.acta;
    const t = a[lado];
    const otro = a[lado === 'local' ? 'visitante' : 'local'];
    const esF5 = modalidad(a) === 'f5';
    const disponibles = (S.datos.equipos || []).filter((e) => e.competicion === a.competicion).sort((x, y) => x.nombre.localeCompare(y.nombre, 'es'));

    const selEquipo = el(
      'select',
      {
        onchange: async (e) => {
          const v = e.target.value;
          if ((t.jugadores.length || t.nombre) && !(await confirmar('Cambiar equipo', 'Se sustituirán los jugadores del acta por los del nuevo equipo. ¿Continuar?', 'Cambiar', true))) {
            e.target.value = t.equipoId || (t.nombre ? '__otro' : '');
            return;
          }
          const nuevo = equipoVacio();
          if (v && v !== '__otro') {
            const cfg = equipoCfg(v);
            nuevo.equipoId = cfg.id;
            nuevo.nombre = cfg.nombre;
            nuevo.jugadores = (cfg.jugadores || []).map((j) => ({
              id: 'r_' + uid(),
              dorsal: j.dorsal || '',
              posicion: j.posicion || 'Jugador',
              apellidos: j.apellidos || '',
              nombre: j.nombre || '',
              goles: 0,
              amarillas: 0,
              roja: false,
              juega: false,
              plantilla: true,
            }));
            nuevo.entrenador = { ...nuevo.entrenador, ...(cfg.entrenador || {}) };
            nuevo.guia = { ...nuevo.guia, ...(cfg.guia || {}) };
            if (lado === 'local' && !a.partido.instalacion && cfg.instalacion) a.partido.instalacion = cfg.instalacion;
          }
          a[lado] = nuevo;
          if (v === '__otro') a[lado].manual = true;
          sincronizarResultado(a);
          guardar();
          pintarEditor();
        },
      },
      el('option', { value: '' }, 'Elige el equipo…'),
      disponibles.map((e) => el('option', { value: e.id, selected: t.equipoId === e.id, disabled: otro.equipoId === e.id }, e.nombre)),
      el('option', { value: '__otro', selected: !t.equipoId && (t.manual || !!t.nombre) }, 'Otro equipo (escribir a mano)')
    );

    const manual = !t.equipoId && (t.manual || !!t.nombre);
    const contador = el('div.ayuda');
    const lista = el('div.jugadores');

    const pintarContador = () => {
      const c = convocados(t);
      const nj = c.filter((j) => j.posicion !== 'Portero').length;
      const np = c.filter((j) => j.posicion === 'Portero').length;
      contador.textContent = `En el acta: ${nj} de ${MAX_JUGADORES} jugadores · ${np} de ${MAX_PORTEROS} porteros`;
    };

    const cabe = (j, nuevaPos) => {
      const pos = nuevaPos || j.posicion;
      const c = convocados(t).filter((x) => x !== j);
      if (pos === 'Portero') return c.filter((x) => x.posicion === 'Portero').length < MAX_PORTEROS;
      return c.filter((x) => x.posicion !== 'Portero').length < MAX_JUGADORES;
    };

    const fila = (j) => {
      const tr = el('div.jug.conv');
      const actualizarClases = () => {
        tr.classList.toggle('no-juega', !j.juega);
        tr.classList.toggle('portero', j.posicion === 'Portero');
      };
      const cambiar = (clave, v) => {
        j[clave] = v;
        sincronizarResultado(a);
        guardar();
      };
      tr.append(
        el(
          'div.c-juega',
          el('input', {
            type: 'checkbox',
            checked: j.juega,
            title: 'En el acta',
            'aria-label': 'Incluir en el acta',
            onchange: (e) => {
              if (e.target.checked && !cabe(j)) {
                e.target.checked = false;
                return aviso(j.posicion === 'Portero' ? `Máximo ${MAX_PORTEROS} porteros en el acta.` : `Máximo ${MAX_JUGADORES} jugadores de campo en el acta.`, 'error');
              }
              cambiar('juega', e.target.checked);
              actualizarClases();
              pintarContador();
            },
          })
        ),
        el('div.c-dorsal', el('input', { value: j.dorsal, inputmode: 'numeric', maxlength: 3, placeholder: 'Nº', 'aria-label': 'Dorsal', oninput: (e) => cambiar('dorsal', e.target.value.replace(/\D/g, '')) })),
        el(
          'div.c-pos',
          el(
            'select',
            {
              'aria-label': 'Posición',
              onchange: (e) => {
                if (j.juega && !cabe(j, e.target.value)) {
                  e.target.value = j.posicion;
                  return aviso('No caben más ' + (e.target.value === 'Portero' ? 'porteros.' : 'jugadores de campo.'), 'error');
                }
                cambiar('posicion', e.target.value);
                actualizarClases();
                pintarContador();
              },
            },
            [['Jugador', 'Jugador'], ['Portero', 'Portero']].map(([p, tx]) => el('option', { value: p, selected: j.posicion === p }, tx))
          )
        ),
        el('div.c-apellidos', el('input', { value: j.apellidos, placeholder: 'Apellidos', 'aria-label': 'Apellidos', readonly: j.plantilla || null, oninput: (e) => cambiar('apellidos', e.target.value) })),
        el('div.c-nombre', el('input', { value: j.nombre, placeholder: 'Nombre', 'aria-label': 'Nombre', readonly: j.plantilla || null, oninput: (e) => cambiar('nombre', e.target.value) })),
        el(
          'div.c-borrar',
          j.plantilla
            ? null
            : el('button.btn.btn-peq.btn-peligro.btn-icono', {
                title: 'Quitar',
                'aria-label': 'Quitar jugador',
                onclick: () => {
                  t.jugadores = t.jugadores.filter((x) => x !== j);
                  sincronizarResultado(a);
                  guardar();
                  tr.remove();
                  pintarContador();
                },
              }, '✕')
        )
      );
      actualizarClases();
      return tr;
    };

    const ordenados = () =>
      [...t.jugadores].sort((x, y) => (x.posicion === 'Portero') - (y.posicion === 'Portero') || (Number(x.dorsal) || 999) - (Number(y.dorsal) || 999));

    const pintarLista = () => {
      lista.replaceChildren(
        el('div.jug.conv.cabecera', el('div', '✓'), el('div', 'Dorsal'), el('div', 'Posición'), el('div', 'Apellidos'), el('div', 'Nombre'), el('div', '')),
        ...ordenados().map(fila)
      );
      if (!t.jugadores.length) lista.append(el('div.vacio', t.equipoId || manual ? 'Añade los jugadores que figuran en el acta.' : 'Elige primero el equipo.'));
      pintarContador();
    };
    pintarLista();

    const persona = (titulo, obj) => el('div.persona', el('h3', titulo), el('div.fila', campo('Apellidos', obj, 'apellidos'), campo('Nombre', obj, 'nombre')));

    cont.append(
      el(
        'div.tarjeta',
        el('h2', lado === 'local' ? 'Equipo local' : 'Equipo visitante'),
        el('div.rejilla', el('label.campo', el('span.req', 'Equipo'), selEquipo), manual ? campo('Nombre del equipo', t, 'nombre', {}, true) : null),
        manual ? el('div.nota.nota-alerta', { style: 'margin-top:12px' }, 'Equipo no registrado: no tendrá código de firma y el acta se cerrará sin firma de su entrenador.') : null
      ),
      el(
        'div.tarjeta',
        el(
          'div.fila-botones',
          { style: 'justify-content:space-between;margin-bottom:10px' },
          el('div', el('h2', { style: 'margin:0' }, 'Participantes'), contador),
          el(
            'div.fila-botones',
            t.jugadores.some((j) => j.plantilla)
              ? el('button.btn.btn-peq', {
                  onclick: () => {
                    let fuera = 0;
                    ordenados().forEach((j) => {
                      if (!j.juega) {
                        if (cabe(j)) j.juega = true;
                        else fuera++;
                      }
                    });
                    if (fuera) aviso(fuera + ' jugadores no caben en el acta (máx. 8 + 2 porteros).', 'alerta');
                    sincronizarResultado(a);
                    guardar();
                    pintarLista();
                  },
                }, 'Marcar todos')
              : null,
            el('button.btn.btn-peq.btn-primario', {
              disabled: !(t.equipoId || manual) || null,
              onclick: () => {
                const j = { id: 'm_' + uid(), dorsal: '', posicion: 'Jugador', apellidos: '', nombre: '', goles: 0, amarillas: 0, roja: false, juega: true, plantilla: false };
                if (!cabe(j)) {
                  j.posicion = 'Portero';
                  if (!cabe(j)) return aviso('El acta ya está completa (8 jugadores y 2 porteros).', 'error');
                }
                t.jugadores.push(j);
                guardar();
                pintarLista();
                const ult = Array.from(lista.querySelectorAll('.c-apellidos input')).find((i) => !i.value && !i.readOnly);
                if (ult) ult.focus();
              },
            }, '+ Jugador a mano')
          )
        ),
        el('p.ayuda', 'Marca ✓ a los jugadores que figuran en el acta y revisa su dorsal. Los de la plantilla no se pueden renombrar; si falta alguien, añádelo a mano.'),
        lista
      ),
      el('div.tarjeta', el('h2', 'Cuerpo técnico'), el('div.staff', persona('Entrenador', t.entrenador), esF5 ? persona('Guía', t.guia) : null))
    );
  }

  /* ---------- Fase 2: participación, goles, amonestaciones y faltas ---------- */
  function tabJuego(cont, lado) {
    const a = S.acta;
    const t = a[lado];
    const esF5 = modalidad(a) === 'f5';
    const lista = el('div.jugadores');
    const contador = el('div.ayuda');

    const ordenados = () =>
      convocados(t).sort((x, y) => (x.posicion === 'Portero') - (y.posicion === 'Portero') || (Number(x.dorsal) || 999) - (Number(y.dorsal) || 999));

    const pintarContador = () => {
      const c = convocados(t);
      contador.textContent = `${c.filter((j) => j.participa !== false).length} de ${c.length} han participado · ${golesDe(t)} goles`;
    };

    const fila = (j) => {
      const tr = el('div.jug.juego');
      const cambiar = (clave, v) => {
        j[clave] = v;
        sincronizarResultado(a);
        guardar();
        pintarContador();
      };
      const goles = el('div.c-goles', el('span.etq-movil', 'Goles'), contadorNum(j, 'goles', 0, 99, (v) => cambiar('goles', v), 'Goles'));
      const actualizar = () => {
        tr.classList.toggle('no-participa', j.participa === false);
        tr.classList.toggle('portero', j.posicion === 'Portero');
      };
      tr.append(
        el(
          'div.c-juega',
          el('input', {
            type: 'checkbox',
            checked: j.participa !== false,
            title: 'Ha participado',
            'aria-label': 'Ha participado ' + j.nombre + ' ' + j.apellidos,
            onchange: (e) => {
              if (!e.target.checked && Number(j.goles) > 0) {
                j.goles = 0;
                goles.querySelector('output').textContent = '0';
              }
              cambiar('participa', e.target.checked);
              actualizar();
            },
          })
        ),
        el('div.c-dorsal', el('span.dorsal', j.dorsal || '—')),
        el('div.c-persona', el('b', [j.nombre, j.apellidos].filter(Boolean).join(' ') || 'Sin nombre'), el('small', j.posicion === 'Portero' ? 'Portero' : 'Jugador')),
        goles,
        el('div.c-amarillas', el('span.etq-movil', 'Amar.'), contadorNum(j, 'amarillas', 0, 2, (v) => cambiar('amarillas', v), 'Tarjetas amarillas', 'amarilla')),
        el('div.c-roja', botonRoja(j, (v) => cambiar('roja', v)))
      );
      actualizar();
      return tr;
    };

    const pintarLista = () => {
      const c = ordenados();
      lista.replaceChildren(el('div.jug.juego.cabecera', el('div', 'Jugó'), el('div', 'Dorsal'), el('div', 'Jugador'), el('div', 'Goles'), el('div', 'Amarillas'), el('div', 'Roja')), ...c.map(fila));
      if (!c.length) lista.append(el('div.vacio', 'No hay jugadores en el acta de este equipo. Si es un error, vuelve a la fase 1 para añadirlos.'));
      pintarContador();
    };
    pintarLista();

    const persona = (titulo, obj) =>
      el(
        'div.persona',
        el('h3', titulo),
        el('div', el('b', [obj.nombre, obj.apellidos].filter(Boolean).join(' ') || '—')),
        el('div.tarjetas', el('span.ayuda', 'Amarillas'), contadorNum(obj, 'amarillas', 0, 2, (v) => ((obj.amarillas = v), guardar()), 'Amarillas', 'amarilla'), el('span.ayuda', 'Roja'), botonRoja(obj, (v) => ((obj.roja = v), guardar())))
      );

    cont.append(
      el(
        'div.tarjeta',
        el(
          'div.fila-botones',
          { style: 'justify-content:space-between;margin-bottom:10px' },
          el('div', el('h2', { style: 'margin:0' }, (lado === 'local' ? 'Local: ' : 'Visitante: ') + nombreEquipo(t)), contador),
          el(
            'div.fila-botones',
            el('button.btn.btn-peq', { onclick: () => (convocados(t).forEach((j) => (j.participa = true)), guardar(), pintarLista()) }, 'Todos han jugado')
          )
        ),
        el('p.ayuda', 'Desmarca a quien no haya llegado a jugar. Anota goles y tarjetas; los jugadores del banquillo también pueden ser amonestados.'),
        lista
      ),
      el('div.tarjeta', el('h2', 'Amonestaciones al cuerpo técnico'), el('div.staff', persona('Entrenador', t.entrenador), esF5 ? persona('Guía', t.guia) : null)),
      el(
        'div.tarjeta',
        el('h2', 'Faltas acumuladas'),
        el('p.ayuda', 'Pulsa la casilla de la última falta cometida en cada parte. D.P = doble penalti.'),
        el('div.faltas', [0, 1].map((parte) => casillasFaltas(t, parte)))
      )
    );
  }

  function contadorNum(obj, clave, min, max, alCambiar, etiqueta, clase) {
    const salida = el('output', String(obj[clave] || 0));
    const poner = (v) => {
      v = Math.max(min, Math.min(max, v));
      obj[clave] = v;
      salida.textContent = v;
      alCambiar(v);
    };
    return el(
      'div.contador' + (clase ? '.' + clase : ''),
      { role: 'group', 'aria-label': etiqueta },
      el('button', { type: 'button', 'aria-label': 'Restar', onclick: () => poner((obj[clave] || 0) - 1) }, '−'),
      salida,
      el('button', { type: 'button', 'aria-label': 'Sumar', onclick: () => poner((obj[clave] || 0) + 1) }, '+')
    );
  }

  function botonRoja(obj, alCambiar) {
    const b = el('button.toggle-roja', { type: 'button', 'aria-pressed': String(!!obj.roja), title: 'Tarjeta roja', 'aria-label': 'Tarjeta roja' }, 'R');
    b.addEventListener('click', () => {
      const v = b.getAttribute('aria-pressed') !== 'true';
      b.setAttribute('aria-pressed', String(v));
      alCambiar(v);
    });
    return b;
  }

  function casillasFaltas(t, parte) {
    const caja = el('div.casillas');
    const pintar = () =>
      caja.replaceChildren(
        ...[1, 2, 3, 4, 5, 6].map((n) =>
          el(
            'button.casilla' + (n === 6 ? '.dp' : '') + (t.faltas[parte] >= n ? '.marcada' : ''),
            {
              type: 'button',
              'aria-label': `Falta ${n === 6 ? 'doble penalti' : n}, ${parte + 1}ª parte`,
              'aria-pressed': String(t.faltas[parte] >= n),
              onclick: () => {
                t.faltas[parte] = t.faltas[parte] === n ? n - 1 : n;
                guardar();
                pintar();
              },
            },
            n === 6 ? 'D.P' : String(n)
          )
        )
      );
    pintar();
    return el('div.parte', el('b', (parte + 1) + 'ª parte'), caja);
  }

  /* ---------- Pestaña: resultado ---------- */
  function tabResultado(cont) {
    const a = S.acta;
    sincronizarResultado(a);
    const aviso_ = el('div');
    const comprobar = () => {
      const gl = golesDe(a.local),
        gv = golesDe(a.visitante);
      const difiere = String(gl) !== String(a.resultado.local) || String(gv) !== String(a.resultado.visitante);
      aviso_.replaceChildren(
        difiere
          ? el(
              'div.nota.nota-alerta',
              `La suma de goles de los jugadores es ${gl}-${gv}. Si la diferencia se debe a goles en propia puerta u otra causa, explícalo en observaciones. `,
              el('button.btn.btn-peq', { onclick: () => ((a.resultado.manual = false), sincronizarResultado(a), guardar(), pintarEditor()) }, 'Usar suma de goles')
            )
          : el('div.nota.nota-ok', 'El resultado coincide con los goles anotados a los jugadores.')
      );
    };
    const marcador = (lado) =>
      el('input', {
        type: 'number',
        inputmode: 'numeric',
        min: 0,
        max: 99,
        value: a.resultado[lado],
        'aria-label': 'Goles ' + lado,
        oninput: (e) => {
          a.resultado[lado] = e.target.value;
          a.resultado.manual = true;
          guardar();
          comprobar();
        },
      });
    comprobar();

    cont.append(
      el(
        'div.tarjeta',
        el('h2', 'Resultado final'),
        el(
          'div.marcador',
          el('div', el('div.equipo-nombre', nombreEquipo(a.local)), marcador('local')),
          el('div.guion', '–'),
          el('div', el('div.equipo-nombre', nombreEquipo(a.visitante)), marcador('visitante'))
        ),
        el('div', { style: 'margin-top:14px' }, aviso_)
      ),
      el(
        'div.tarjeta',
        el('h2', 'Observaciones'),
        el('p.ayuda', 'Incidencias, expulsiones, retrasos, estado de la instalación… No forman parte de lo que firma el entrenador, así que puedes completarlas después de las firmas.'),
        campo('Observaciones del árbitro', a, 'observaciones', { tag: 'textarea', rows: 8 })
      )
    );
  }

  /* ---------- Pestaña: firmas y cierre ---------- */
  function tabCierre(cont) {
    const a = S.acta;
    const c = competicion(a.competicion);
    const p = a.partido;
    cont.append(
      el(
        'div.tarjeta.resumen-cierre',
        el('h2', 'Resumen'),
        el(
          'dl',
          el('dt', 'Competición'), el('dd', c ? c.nombre : '—'),
          el('dt', 'Partido'), el('dd', nombreEquipo(a.local) + ' – ' + nombreEquipo(a.visitante)),
          el('dt', 'Resultado'), el('dd', (a.resultado.local || '0') + ' – ' + (a.resultado.visitante || '0')),
          el('dt', 'Fecha y hora'), el('dd', [fechaCorta(p.fecha), p.hora].filter(Boolean).join(' · ') || '—'),
          el('dt', 'Instalación'), el('dd', p.instalacion || '—'),
          el('dt', 'Jugadores'), el('dd', convocados(a.local).length + ' local · ' + convocados(a.visitante).length + ' visitante')
        )
      ),
      el(
        'div.tarjeta',
        el('h2', 'Firma de los entrenadores'),
        el('p.ayuda', 'Cada entrenador revisa el acta en este dispositivo y escribe el código de su equipo. Si después se cambia algún dato (salvo las observaciones), la firma se anula y hay que volver a firmar.'),
        el('div.firmas#firmas')
      ),
      el(
        'div.tarjeta',
        el('h2', 'Cerrar el acta'),
        el('p', 'Al finalizar, el acta queda bloqueada y se genera el PDF para enviarlo. Si algún entrenador no ha firmado, se te pedirá el motivo y quedará reflejado en el acta.'),
        el('button.btn.btn-primario', { onclick: finalizar }, 'Finalizar acta')
      )
    );
    pintarFirmas();
  }

  async function pintarFirmas() {
    const z = $('#firmas');
    if (!z) return;
    const a = S.acta;
    const huella = await huellaFirmable(a);
    const tarjeta = (lado) => {
      const t = a[lado];
      const cfg = t.equipoId ? equipoCfg(t.equipoId) : null;
      const f = t.firma;
      const valida = f && f.estado === 'firmada' && f.huella === huella;
      const caducada = f && f.estado === 'firmada' && !valida;
      const cab = el('div.titulo-firma', el('b', nombreEquipo(t)), el('small', lado === 'local' ? 'Local' : 'Visitante'));

      if (valida) {
        return el(
          'div.firma.firmada',
          cab,
          el('div.estado', '✓ Firmada por el entrenador'),
          el('div.ayuda', fechaLarga(f.fecha)),
          el('div', el('button.btn.btn-peq', {
            onclick: async () => {
              if (await confirmar('Anular firma', 'La firma se eliminará y el entrenador tendrá que volver a introducir el código.', 'Anular', true)) {
                t.firma = null;
                guardar();
                pintarFirmas();
              }
            },
          }, 'Anular firma'))
        );
      }

      if (!cfg || !cfg.codigo) {
        return el('div.firma', cab, el('div.estado', 'Sin firma posible'), el('div.ayuda', cfg ? 'Este equipo no tiene código configurado.' : 'Equipo no registrado.'), el('div.ayuda', 'El acta se cerrará sin su firma y se te pedirá el motivo.'));
      }

      const inp = el('input', { type: 'password', inputmode: 'text', autocomplete: 'off', autocapitalize: 'characters', spellcheck: 'false', placeholder: 'Código', 'aria-label': 'Código del equipo ' + nombreEquipo(t) });
      const form = el('form', inp, el('button.btn.btn-oscuro', { type: 'submit' }, 'Firmar'));
      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const reg = S.intentosFallidos[lado] || { n: 0, hasta: 0 };
        if (Date.now() < reg.hasta) return aviso('Demasiados intentos. Espera ' + Math.ceil((reg.hasta - Date.now()) / 1000) + ' s.', 'error');
        const b = form.querySelector('button');
        b.disabled = true;
        const ok = await Cripto.comprobarCodigo(inp.value, cfg.codigo);
        b.disabled = false;
        if (!ok) {
          reg.n++;
          if (reg.n >= 5) {
            reg.hasta = Date.now() + 60000;
            reg.n = 0;
          }
          S.intentosFallidos[lado] = reg;
          inp.value = '';
          inp.focus();
          return aviso('Código incorrecto.', 'error');
        }
        S.intentosFallidos[lado] = { n: 0, hasta: 0 };
        t.firma = { estado: 'firmada', fecha: new Date().toISOString(), huella: await huellaFirmable(a) };
        await guardar(true);
        aviso('Acta firmada por el entrenador de ' + nombreEquipo(t) + '.');
        pintarFirmas();
      });
      return el(
        'div.firma',
        cab,
        caducada ? el('div.nota.nota-alerta', { style: 'margin:0' }, 'El acta cambió después de firmar. El entrenador debe volver a firmar.') : el('div.estado', 'Pendiente de firma'),
        el('div.ayuda', 'Entrenador: ' + ([t.entrenador.nombre, t.entrenador.apellidos].filter(Boolean).join(' ') || '—')),
        form
      );
    };
    z.replaceChildren(tarjeta('local'), tarjeta('visitante'));
  }

  /* ---------- Validación y cierre ---------- */
  /** Comprobaciones de la fase 1 (datos del encuentro y participantes). */
  function validarFase1(a) {
    const errores = [];
    const avisos = [];
    const p = a.partido;
    if (!a.competicion) errores.push('Falta la competición.');
    if (!p.instalacion.trim()) errores.push('Falta la instalación.');
    if (!p.fecha) errores.push('Falta la fecha.');
    if (!p.hora) errores.push('Falta la hora.');
    if (!String(p.arbitros[0] || '').trim()) errores.push('Falta el nombre del árbitro.');
    if (!p.cronometrador.trim()) avisos.push('No has indicado cronometrador.');
    ['local', 'visitante'].forEach((lado) => {
      const t = a[lado];
      const nom = lado === 'local' ? 'Equipo local' : 'Equipo visitante';
      if (!t.nombre.trim()) return errores.push(nom + ': falta el equipo.');
      const c = convocados(t);
      if (!c.length) avisos.push(nom + ': no hay jugadores en el acta (¿incomparecencia?).');
      const dorsales = {};
      c.forEach((j) => {
        if (!j.apellidos.trim() && !j.nombre.trim()) errores.push(nom + ': hay un jugador sin nombre.');
        if (!j.dorsal) errores.push(`${nom}: ${j.nombre} ${j.apellidos} no tiene dorsal.`);
        else if (dorsales[j.dorsal]) errores.push(`${nom}: el dorsal ${j.dorsal} está repetido.`);
        dorsales[j.dorsal] = true;
      });
      if (!c.some((j) => j.posicion === 'Portero') && c.length) avisos.push(nom + ': no hay ningún portero.');
    });
    if (a.local.nombre && a.local.nombre === a.visitante.nombre) errores.push('Local y visitante son el mismo equipo.');
    return { errores, avisos };
  }

  /** Comprobaciones completas para cerrar el acta (fase 1 + fase 2). */
  function validar(a) {
    const { errores, avisos } = validarFase1(a);
    if (a.resultado.local === '' || a.resultado.visitante === '') errores.push('Falta el resultado.');
    if (String(golesDe(a.local)) !== String(a.resultado.local) || String(golesDe(a.visitante)) !== String(a.resultado.visitante))
      avisos.push('El resultado no coincide con la suma de goles de los jugadores.');
    return { errores, avisos };
  }

  const MOTIVOS = [
    'El entrenador no está presente',
    'El entrenador no recuerda el código',
    'El entrenador se niega a firmar',
    'Problema técnico con el dispositivo',
    'Equipo sin código de firma',
    'Incomparecencia del equipo',
    'Otro motivo',
  ];

  async function finalizar() {
    const a = S.acta;
    if ((a.fase || 1) < 2) {
      aviso('Primero confirma la fase 1 y anota el desarrollo del partido.', 'alerta');
      return;
    }
    const { errores, avisos } = validar(a);
    if (errores.length) {
      await dialogo({ titulo: 'Faltan datos', cuerpo: [el('p', 'Corrige lo siguiente antes de cerrar el acta:'), el('ul', errores.map((e) => el('li', e)))] });
      return;
    }

    // Firmas pendientes → motivo
    const incidencias = [];
    for (const lado of ['local', 'visitante']) {
      if (await firmaValida(a, lado)) continue;
      const t = a[lado];
      const cfg = t.equipoId ? equipoCfg(t.equipoId) : null;
      const sel = el('select', MOTIVOS.map((m) => el('option', { selected: (!cfg || !cfg.codigo) && m === 'Equipo sin código de firma' }, m)));
      const det = el('textarea', { rows: 3, placeholder: 'Detalle (opcional)' });
      const r = await dialogo({
        titulo: 'Cerrar sin firma de ' + nombreEquipo(t),
        cuerpo: [el('p', 'El entrenador de este equipo no ha firmado. Indica el motivo; quedará reflejado en el acta.'), el('label.campo', el('span', 'Motivo'), sel), el('label.campo', el('span', 'Detalle'), det)],
        botones: [
          { texto: 'Volver a firmas', valor: null },
          { texto: 'Continuar sin firma', valor: () => ({ motivo: sel.value, detalle: det.value.trim() }), primario: true },
        ],
      });
      if (!r) {
        if (S.pestana !== 'cierre') irA('cierre');
        return;
      }
      incidencias.push({ lado, ...r });
    }

    // Confirmación con contraseña del árbitro
    const pass = el('input', { type: 'password', autocomplete: 'current-password' });
    const cuerpo = [
      avisos.length ? el('div.nota.nota-alerta', el('b', 'Revisa: '), el('ul', { style: 'margin:4px 0 0;padding-left:18px' }, avisos.map((x) => el('li', x)))) : null,
      el('p', 'Una vez cerrada, el acta no se puede modificar. Para firmarla como árbitro, escribe tu contraseña.'),
      el('label.campo', el('span', 'Contraseña de ' + S.perfil.usuario), pass),
    ];
    const pw = await dialogo({ titulo: 'Firmar y cerrar el acta', cuerpo, botones: [{ texto: 'Cancelar', valor: null }, { texto: 'Cerrar acta', valor: () => pass.value, primario: true }] });
    if (pw === null) return;
    try {
      await Cripto.abrirLlave(S.fichero, S.perfil.usuario, pw);
    } catch {
      return aviso('Contraseña incorrecta. El acta sigue abierta.', 'error');
    }

    for (const inc of incidencias) {
      a[inc.lado].firma = { estado: 'sin_firma', motivo: inc.motivo, detalle: inc.detalle, fecha: new Date().toISOString() };
    }
    a.incidenciasFirma = incidencias;
    a.estado = 'cerrada';
    const ahora = new Date().toISOString();
    a.cierre = { fecha: ahora, usuario: S.perfil.usuario, arbitro: S.perfil.nombre };
    a.cierre.huella = await Cripto.sha256Hex(JSON.stringify({ ...a, cierre: { fecha: ahora, usuario: a.cierre.usuario } }));
    a.modificada = ahora;
    await guardar(true);
    pantallaCerrada(a, true);
  }

  /* ================= Acta cerrada: PDF y envío ================= */
  function nombreFichero(a) {
    const limpiar = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 30);
    return `Acta_${a.partido.fecha || ''}_${limpiar(a.local.nombre)}_vs_${limpiar(a.visitante.nombre)}.pdf`;
  }

  async function crearPdf(a) {
    const bytes = await ActaPDF.generar(a, S.datos);
    return new File([bytes], nombreFichero(a), { type: 'application/pdf' });
  }

  async function descargarPdf(a) {
    try {
      const f = await crearPdf(a);
      descargar(f.name, f);
    } catch (e) {
      console.error(e);
      aviso('No se pudo generar el PDF: ' + e.message, 'error', 6000);
    }
  }

  function pantallaCerrada(a, recien) {
    S.acta = null;
    const email = S.datos.emailAdmin;
    const asunto = `Acta ${a.numero}: ${a.local.nombre} ${a.resultado.local}-${a.resultado.visitante} ${a.visitante.nombre}`;
    const puedeCompartir = !!(navigator.canShare && navigator.share);

    app.replaceChildren(
      el(
        'div.tarjeta',
        recien ? el('div.nota.nota-ok', '✓ Acta cerrada correctamente.') : null,
        el('h1', a.local.nombre + ' ' + a.resultado.local + ' – ' + a.resultado.visitante + ' ' + a.visitante.nombre),
        el('p.ayuda', [(competicion(a.competicion) || {}).nombre, fechaCorta(a.partido.fecha), a.numero].filter(Boolean).join(' · ')),
        a.incidenciasFirma && a.incidenciasFirma.length
          ? el('div.nota.nota-alerta', 'Cerrada sin firma de: ' + a.incidenciasFirma.map((i) => nombreEquipo(a[i.lado]) + ' (' + i.motivo.toLowerCase() + ')').join('; '))
          : null,
        el('h2', { style: 'margin-top:16px' }, 'Enviar el acta'),
        el('p', email ? `Envía el PDF a la organización (${email}).` : 'Envía el PDF a la organización.'),
        el(
          'div.fila-botones',
          puedeCompartir
            ? el('button.btn.btn-primario', {
                onclick: async () => {
                  try {
                    const f = await crearPdf(a);
                    if (!navigator.canShare({ files: [f] })) return descargar(f.name, f);
                    await navigator.share({ files: [f], title: asunto, text: asunto });
                  } catch (e) {
                    if (e.name !== 'AbortError') aviso('No se pudo compartir: ' + e.message, 'error');
                  }
                },
              }, 'Compartir PDF (correo, WhatsApp…)')
            : null,
          el('button.btn' + (puedeCompartir ? '' : '.btn-primario'), { onclick: () => descargarPdf(a) }, 'Descargar PDF'),
          email
            ? el('a.btn', { href: `mailto:${encodeURIComponent(email)}?subject=${encodeURIComponent(asunto)}&body=${encodeURIComponent('Adjunto el acta del partido (descarga el PDF y adjúntalo a este correo).\n\n' + asunto)}` }, 'Abrir correo')
            : null
        ),
        el('div', { style: 'margin-top:18px' }, el('button.btn', { onclick: pantallaLista }, '← Mis actas'))
      )
    );
    window.scrollTo(0, 0);
  }

  inicio();
})();
