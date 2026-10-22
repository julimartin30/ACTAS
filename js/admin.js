/* Panel de administración: crea y edita data/config.json (cifrado). */
(function () {
  'use strict';
  const { $, el, aviso, dialogo, confirmar, uid, descargar, MODALIDADES, COMPETICIONES_POR_DEFECTO } = U;

  const S = {
    fichero: null, // config.json tal y como se cargó
    datos: null, // datos descifrados
    dekRaw: null,
    llaves: {},
    perfil: null,
    cambios: false,
    vista: 'equipos',
    equipoAbierto: null,
    filtroComp: '',
    codigosNuevos: {}, // equipoId -> código en claro (solo durante esta sesión)
  };
  const app = $('#app');

  window.addEventListener('beforeunload', (e) => {
    if (S.cambios) {
      e.preventDefault();
      e.returnValue = '';
    }
  });

  function marcarCambio() {
    S.cambios = true;
    pintarAvisoCambios();
  }

  /* ================= Inicio ================= */
  async function inicio() {
    try {
      S.fichero = await U.cargarConfigRemota();
    } catch (e) {
      S.fichero = null;
    }
    pantallaAcceso();
  }

  function pantallaAcceso(error) {
    app.replaceChildren();
    const form = el(
      'form',
      { autocomplete: 'on' },
      el('label.campo', el('span', 'Usuario administrador'), el('input', { name: 'usuario', required: true, autocomplete: 'username', autocapitalize: 'none' })),
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
        if (r.perfil.rol !== 'admin') throw new Error('NO_ADMIN');
        cargarSesion(r);
      } catch (err) {
        pantallaAcceso(err.message === 'NO_ADMIN' ? 'Este usuario no es administrador.' : 'Usuario o contraseña incorrectos.');
      }
    });

    const inputFichero = el('input', { type: 'file', accept: '.json,application/json', hidden: true });
    inputFichero.addEventListener('change', async () => {
      const f = inputFichero.files[0];
      if (!f) return;
      try {
        const j = JSON.parse(await f.text());
        if (j.formato !== 'actas-fedc') throw new Error();
        S.fichero = j;
        aviso('Configuración cargada desde archivo. Inicia sesión.');
        pantallaAcceso();
      } catch {
        aviso('Ese archivo no es un config.json válido.', 'error');
      }
    });

    app.append(
      el(
        'div.login',
        el(
          'div.tarjeta',
          el('div.cabecera-login', el('div.distintivo', 'ACT'), el('div', el('h1', 'Administración'), el('div.ayuda', 'Gestión de equipos, árbitros y códigos de firma'))),
          error ? el('div.nota.nota-error', error) : null,
          S.fichero
            ? form
            : el('div.nota.nota-info', 'Todavía no hay ninguna configuración publicada en data/config.json. Crea una nueva para empezar.'),
          el(
            'div.fila-botones',
            { style: 'margin-top:16px' },
            el('button.btn.btn-peq', { type: 'button', onclick: () => inputFichero.click() }, 'Abrir config.json del ordenador'),
            el('button.btn.btn-peq', { type: 'button', onclick: pantallaNueva }, 'Crear configuración nueva'),
            inputFichero
          )
        )
      )
    );
  }

  function pantallaNueva() {
    app.replaceChildren();
    const f = el(
      'form.rejilla',
      el('label.campo.ancho', el('span.req', 'Organización (aparece en el PDF)'), el('input', { name: 'org', required: true, value: 'FEDC · Federación Española de Deportes para Ciegos' })),
      el('label.campo', el('span.req', 'Temporada'), el('input', { name: 'temporada', required: true, value: '2026-27' })),
      el('label.campo', el('span', 'Email donde recibir las actas'), el('input', { name: 'email', type: 'email' })),
      el('h3.ancho', { style: 'margin:8px 0 0' }, 'Tu usuario de administrador'),
      el('label.campo', el('span.req', 'Usuario'), el('input', { name: 'usuario', required: true, autocapitalize: 'none', autocomplete: 'username' })),
      el('label.campo', el('span.req', 'Nombre y apellidos'), el('input', { name: 'nombre', required: true })),
      el('label.campo', el('span.req', 'Contraseña (mín. 10 caracteres)'), el('input', { name: 'p1', type: 'password', required: true, minlength: 10, autocomplete: 'new-password' })),
      el('label.campo', el('span.req', 'Repite la contraseña'), el('input', { name: 'p2', type: 'password', required: true, minlength: 10, autocomplete: 'new-password' })),
      el('div.fila-botones.ancho', el('button.btn', { type: 'button', onclick: () => pantallaAcceso() }, 'Volver'), el('button.btn.btn-primario', { type: 'submit' }, 'Crear configuración'))
    );
    f.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (f.p1.value !== f.p2.value) return aviso('Las contraseñas no coinciden.', 'error');
      if (S.fichero && !(await confirmar('Ya existe una configuración', 'Si publicas la nueva, sustituirá a la actual y los usuarios actuales dejarán de funcionar. ¿Continuar?', 'Continuar', true))) return;
      const dekRaw = Cripto.aleatorio(32);
      const usuario = Cripto.normalizarUsuario(f.usuario.value);
      const datos = {
        organizacion: f.org.value.trim(),
        temporada: f.temporada.value.trim(),
        emailAdmin: f.email.value.trim(),
        competiciones: JSON.parse(JSON.stringify(COMPETICIONES_POR_DEFECTO)),
        equipos: [],
        usuarios: [{ usuario, nombre: f.nombre.value.trim(), rol: 'admin', activo: true }],
      };
      const ll = await Cripto.llaveParaUsuario(dekRaw, usuario, f.p1.value);
      cargarSesion({ datos, dekRaw, perfil: datos.usuarios[0] }, { [ll.id]: ll.llave });
      marcarCambio();
      S.vista = 'publicar';
      pintarPanel();
      aviso('Configuración creada. Añade equipos y árbitros y después publícala.');
    });
    app.append(el('div.tarjeta', el('h1', 'Nueva configuración'), el('p.ayuda', 'Se genera una clave de cifrado nueva. Solo quien tenga un usuario y contraseña podrá abrir los datos.'), f));
  }

  function cargarSesion(r, llaves) {
    S.datos = r.datos;
    S.dekRaw = r.dekRaw;
    S.perfil = r.perfil;
    S.llaves = llaves || JSON.parse(JSON.stringify(S.fichero.llaves));
    S.datos.competiciones = S.datos.competiciones || JSON.parse(JSON.stringify(COMPETICIONES_POR_DEFECTO));
    S.datos.equipos = S.datos.equipos || [];
    S.datos.usuarios = S.datos.usuarios || [];
    $('#sub-org').textContent = (S.datos.organizacion || '') + (S.datos.temporada ? ' · ' + S.datos.temporada : '');
    pintarPanel();
  }

  /* ================= Panel ================= */
  const VISTAS = [
    ['equipos', 'Equipos y plantillas'],
    ['usuarios', 'Árbitros y usuarios'],
    ['general', 'Competiciones y datos'],
    ['publicar', 'Publicar'],
  ];

  function pintarPanel() {
    app.replaceChildren(
      el(
        'nav.pestanas',
        { role: 'tablist' },
        VISTAS.map(([id, t]) =>
          el('button.pestana', { role: 'tab', 'aria-selected': String(S.vista === id), onclick: () => ((S.vista = id), (S.equipoAbierto = null), pintarPanel()) }, t)
        )
      ),
      el('div#aviso-cambios'),
      el('section#vista')
    );
    pintarAvisoCambios();
    const v = $('#vista');
    if (S.vista === 'equipos') S.equipoAbierto ? vistaEquipo(v, S.equipoAbierto) : vistaEquipos(v);
    if (S.vista === 'usuarios') vistaUsuarios(v);
    if (S.vista === 'general') vistaGeneral(v);
    if (S.vista === 'publicar') vistaPublicar(v);
  }

  function pintarAvisoCambios() {
    const z = $('#aviso-cambios');
    if (!z) return;
    z.replaceChildren(
      S.cambios && S.vista !== 'publicar'
        ? el(
            'div.nota.nota-alerta',
            'Hay cambios sin publicar. Cuando termines, ve a ',
            el('a', { href: '#', onclick: (e) => (e.preventDefault(), (S.vista = 'publicar'), pintarPanel()) }, 'Publicar'),
            ' y sube el nuevo config.json al repositorio.'
          )
        : ''
    );
  }

  const comp = (id) => S.datos.competiciones.find((c) => c.id === id);
  const modalidadDe = (eq) => (comp(eq.competicion) || {}).modalidad || 'fs';

  /* ---------- Equipos ---------- */
  function vistaEquipos(v) {
    const filtro = el(
      'select',
      { onchange: (e) => ((S.filtroComp = e.target.value), pintarPanel()) },
      el('option', { value: '' }, 'Todas las competiciones'),
      S.datos.competiciones.map((c) => el('option', { value: c.id, selected: S.filtroComp === c.id }, c.nombre))
    );
    const lista = S.datos.equipos
      .filter((e) => !S.filtroComp || e.competicion === S.filtroComp)
      .sort((a, b) => (a.competicion + a.nombre).localeCompare(b.competicion + b.nombre, 'es'));

    v.append(
      el(
        'div.tarjeta',
        el('div.fila-botones', { style: 'justify-content:space-between;margin-bottom:12px' }, el('h2', { style: 'margin:0' }, 'Equipos'), el('button.btn.btn-primario', { onclick: nuevoEquipo }, '+ Nuevo equipo')),
        el('label.campo', { style: 'max-width:340px;margin-bottom:12px' }, el('span', 'Filtrar'), filtro),
        lista.length
          ? el(
              'div.adm-equipos',
              lista.map((eq) =>
                el(
                  'div.adm-equipo',
                  el(
                    'div.datos',
                    el('b', eq.nombre),
                    el(
                      'small',
                      (comp(eq.competicion) || { nombre: '¿Competición?' }).nombre,
                      ' · ',
                      (eq.jugadores || []).length + ' jugadores',
                      ' · ',
                      eq.codigo ? 'código configurado' : 'SIN código de firma'
                    )
                  ),
                  el('button.btn.btn-peq', { onclick: () => ((S.equipoAbierto = eq.id), pintarPanel()) }, 'Editar')
                )
              )
            )
          : el('div.vacio', 'No hay equipos todavía.')
      )
    );
  }

  function nuevoEquipo() {
    const eq = {
      id: 'eq_' + uid(),
      nombre: 'Nuevo equipo',
      competicion: S.filtroComp || (S.datos.competiciones[0] || {}).id,
      instalacion: '',
      entrenador: { apellidos: '', nombre: '' },
      guia: { apellidos: '', nombre: '' },
      codigo: null,
      jugadores: [],
    };
    S.datos.equipos.push(eq);
    marcarCambio();
    S.equipoAbierto = eq.id;
    pintarPanel();
  }

  function vistaEquipo(v, id) {
    const eq = S.datos.equipos.find((e) => e.id === id);
    if (!eq) return ((S.equipoAbierto = null), pintarPanel());
    eq.entrenador = eq.entrenador || { apellidos: '', nombre: '' };
    eq.guia = eq.guia || { apellidos: '', nombre: '' };
    eq.jugadores = eq.jugadores || [];

    const campo = (etq, obj, clave, extra = {}) =>
      el('label.campo', el('span', etq), el('input', { value: obj[clave] || '', ...extra, oninput: (e) => ((obj[clave] = e.target.value), marcarCambio()) }));

    const tablaJug = el('tbody');
    const pintarJugadores = () => {
      tablaJug.replaceChildren(
        ...eq.jugadores.map((j, i) =>
          el(
            'tr',
            el('td.dorsal', el('input', { value: j.dorsal || '', inputmode: 'numeric', 'aria-label': 'Dorsal', oninput: (e) => ((j.dorsal = e.target.value), marcarCambio()) })),
            el('td', el('input', { value: j.apellidos || '', 'aria-label': 'Apellidos', oninput: (e) => ((j.apellidos = e.target.value), marcarCambio()) })),
            el('td', el('input', { value: j.nombre || '', 'aria-label': 'Nombre', oninput: (e) => ((j.nombre = e.target.value), marcarCambio()) })),
            el(
              'td',
              el(
                'select',
                { 'aria-label': 'Posición', onchange: (e) => ((j.posicion = e.target.value), marcarCambio()) },
                ['Jugador', 'Portero'].map((p) => el('option', { selected: (j.posicion || 'Jugador') === p }, p))
              )
            ),
            el('td', el('button.btn.btn-peq.btn-peligro.btn-icono', { title: 'Quitar', 'aria-label': 'Quitar jugador', onclick: () => (eq.jugadores.splice(i, 1), marcarCambio(), pintarJugadores()) }, '✕'))
          )
        )
      );
      if (!eq.jugadores.length) tablaJug.append(el('tr', el('td', { colspan: 5, class: 'vacio' }, 'Sin jugadores en la plantilla.')));
    };
    pintarJugadores();

    const esF5 = () => modalidadDe(eq) === 'f5';
    const bloqueGuia = el('div.persona', el('h3', 'Guía (fútbol 5)'), el('div.fila', campo('Apellidos', eq.guia, 'apellidos'), campo('Nombre', eq.guia, 'nombre')));
    bloqueGuia.hidden = !esF5();

    const estadoCodigo = el('div');
    const pintarCodigo = () => {
      estadoCodigo.replaceChildren(
        eq.codigo
          ? el('div.nota.nota-ok', 'Código de firma configurado.', S.codigosNuevos[eq.id] ? [' Código: ', el('b', { style: 'font-family:var(--mono);letter-spacing:.15em' }, S.codigosNuevos[eq.id])] : ' Por seguridad no se puede mostrar; si se ha perdido, genera uno nuevo.')
          : el('div.nota.nota-alerta', 'Este equipo no tiene código: su entrenador no podrá firmar el acta (el árbitro tendrá que cerrarla sin firma).')
      );
    };
    pintarCodigo();

    v.append(
      el(
        'div.tarjeta',
        el('div.fila-botones', { style: 'justify-content:space-between;margin-bottom:12px' }, el('button.btn.btn-peq', { onclick: () => ((S.equipoAbierto = null), pintarPanel()) }, '← Equipos'), el('button.btn.btn-peq.btn-peligro', { onclick: borrarEquipo }, 'Eliminar equipo')),
        el(
          'div.rejilla',
          el('label.campo.ancho', el('span.req', 'Nombre del equipo'), el('input', { value: eq.nombre, oninput: (e) => ((eq.nombre = e.target.value), marcarCambio()) })),
          el(
            'label.campo',
            el('span.req', 'Competición'),
            el(
              'select',
              {
                onchange: (e) => {
                  eq.competicion = e.target.value;
                  bloqueGuia.hidden = !esF5();
                  marcarCambio();
                },
              },
              S.datos.competiciones.map((c) => el('option', { value: c.id, selected: c.id === eq.competicion }, c.nombre))
            )
          ),
          campo('Instalación habitual (se propone al árbitro)', eq, 'instalacion')
        )
      ),
      el(
        'div.tarjeta',
        el('h2', 'Cuerpo técnico'),
        el('div.staff', el('div.persona', el('h3', 'Entrenador'), el('div.fila', campo('Apellidos', eq.entrenador, 'apellidos'), campo('Nombre', eq.entrenador, 'nombre'))), bloqueGuia)
      ),
      el(
        'div.tarjeta',
        el('h2', 'Código de firma del entrenador'),
        el('p.ayuda', 'El entrenador lo introduce en el móvil del árbitro para firmar el acta. Se guarda cifrado como huella: ni el árbitro ni tú podréis leerlo después.'),
        estadoCodigo,
        el('div.fila-botones', el('button.btn.btn-oscuro', { onclick: () => generarCodigoEquipo(eq).then(pintarCodigo) }, eq.codigo ? 'Generar código nuevo' : 'Generar código'), el('button.btn', { onclick: () => escribirCodigoEquipo(eq).then(pintarCodigo) }, 'Escribir un código'))
      ),
      el(
        'div.tarjeta',
        el('div.fila-botones', { style: 'justify-content:space-between;margin-bottom:8px' }, el('h2', { style: 'margin:0' }, 'Plantilla'), el('div.fila-botones', el('button.btn.btn-peq', { onclick: () => pegarLista(eq, pintarJugadores) }, 'Pegar lista'), el('button.btn.btn-peq.btn-primario', { onclick: () => (eq.jugadores.push({ id: 'j_' + uid(), dorsal: '', apellidos: '', nombre: '', posicion: 'Jugador' }), marcarCambio(), pintarJugadores()) }, '+ Jugador'))),
        el('div.desplazable', el('table.tabla', el('thead', el('tr', el('th', 'Dorsal'), el('th', 'Apellidos'), el('th', 'Nombre'), el('th', 'Posición'), el('th', ''))), tablaJug))
      )
    );

    async function borrarEquipo() {
      if (!(await confirmar('Eliminar equipo', `¿Eliminar «${eq.nombre}» y su plantilla?`, 'Eliminar', true))) return;
      S.datos.equipos = S.datos.equipos.filter((e) => e !== eq);
      delete S.codigosNuevos[eq.id];
      S.equipoAbierto = null;
      marcarCambio();
      pintarPanel();
    }
  }

  async function generarCodigoEquipo(eq) {
    if (eq.codigo && !(await confirmar('Código nuevo', 'El código anterior dejará de funcionar en cuanto publiques la configuración. ¿Generar uno nuevo?', 'Generar'))) return;
    const codigo = Cripto.generarCodigo(6);
    eq.codigo = await Cripto.huellaCodigo(codigo);
    S.codigosNuevos[eq.id] = codigo;
    marcarCambio();
    await dialogo({
      titulo: 'Código de ' + eq.nombre,
      cuerpo: [el('div.codigo-grande', codigo), el('p.ayuda', 'Apúntalo y entrégaselo al entrenador. Podrás descargar todos los códigos generados en esta sesión desde «Publicar»; después ya no se podrán recuperar.')],
    });
  }

  async function escribirCodigoEquipo(eq) {
    const inp = el('input', { minlength: 4, maxlength: 16, autocapitalize: 'characters', style: 'font-family:var(--mono);letter-spacing:.2em;text-transform:uppercase' });
    const v = await dialogo({
      titulo: 'Escribir código para ' + eq.nombre,
      cuerpo: [el('label.campo', el('span', 'Código (4-16 letras o números)'), inp)],
      botones: [{ texto: 'Cancelar', valor: null }, { texto: 'Guardar', valor: () => inp.value, primario: true }],
    });
    if (v === null) return;
    const c = Cripto.normalizarCodigo(v);
    if (c.length < 4) return aviso('El código debe tener al menos 4 caracteres.', 'error');
    eq.codigo = await Cripto.huellaCodigo(c);
    S.codigosNuevos[eq.id] = c;
    marcarCambio();
    aviso('Código guardado.');
  }

  async function pegarLista(eq, repintar) {
    const ta = el('textarea', { rows: 10, placeholder: '7; García López; Ana; Jugador\n1; Pérez Ruiz; Luis; Portero' });
    const reemplazar = el('input', { type: 'checkbox' });
    const v = await dialogo({
      titulo: 'Pegar lista de jugadores',
      cuerpo: [
        el('p.ayuda', 'Una línea por jugador: dorsal; apellidos; nombre; posición. Puedes pegar directamente columnas de Excel. La posición es opcional (Jugador por defecto; escribe Portero o P para porteros).'),
        ta,
        el('label', { style: 'display:flex;gap:8px;align-items:center' }, reemplazar, 'Sustituir la plantilla actual'),
      ],
      botones: [{ texto: 'Cancelar', valor: null }, { texto: 'Añadir', valor: () => ta.value, primario: true }],
    });
    if (!v) return;
    const nuevos = v
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean)
      .map((l) => {
        let p = l.split(/\t|;/).map((x) => x.trim());
        if (p.length === 1) p = l.split(',').map((x) => x.trim());
        let dorsal = '';
        if (/^\d{1,3}$/.test(p[0])) dorsal = p.shift();
        const [apellidos = '', nombre = '', pos = ''] = p;
        return { id: 'j_' + uid(), dorsal, apellidos, nombre, posicion: /^p/i.test(pos) ? 'Portero' : 'Jugador' };
      });
    if (reemplazar.checked) eq.jugadores = nuevos;
    else eq.jugadores.push(...nuevos);
    marcarCambio();
    repintar();
    aviso(nuevos.length + ' jugadores añadidos.');
  }

  /* ---------- Usuarios ---------- */
  function vistaUsuarios(v) {
    const filas = el('tbody');
    const pintar = async () => {
      const ids = await Promise.all(S.datos.usuarios.map((u) => Cripto.idUsuario(u.usuario)));
      filas.replaceChildren(
        ...S.datos.usuarios.map((u, i) => {
          const tieneLlave = !!S.llaves[ids[i]];
          const yo = Cripto.normalizarUsuario(u.usuario) === Cripto.normalizarUsuario(S.perfil.usuario);
          return el(
            'tr',
            el('td', el('b', u.usuario), yo ? el('span.chip', { style: 'margin-left:6px' }, 'tú') : null, !tieneLlave ? el('div.ayuda', { style: 'color:var(--error)' }, 'Sin contraseña') : null),
            el('td', el('input', { value: u.nombre || '', 'aria-label': 'Nombre', oninput: (e) => ((u.nombre = e.target.value), marcarCambio()) })),
            el('td', el('select', { disabled: yo, 'aria-label': 'Rol', onchange: (e) => ((u.rol = e.target.value), marcarCambio()) }, el('option', { value: 'arbitro', selected: u.rol !== 'admin' }, 'Árbitro'), el('option', { value: 'admin', selected: u.rol === 'admin' }, 'Administrador'))),
            el('td', el('label', { style: 'display:flex;gap:6px;align-items:center' }, el('input', { type: 'checkbox', style: 'width:auto;min-height:0', checked: u.activo !== false, disabled: yo, onchange: (e) => ((u.activo = e.target.checked), marcarCambio()) }), 'Activo')),
            el(
              'td',
              el(
                'div.fila-botones',
                el('button.btn.btn-peq', { onclick: () => cambiarPassword(u).then(pintar) }, 'Contraseña'),
                yo ? null : el('button.btn.btn-peq.btn-peligro', { onclick: () => borrarUsuario(u, ids[i]).then(pintar) }, 'Eliminar')
              )
            )
          );
        })
      );
    };
    pintar();
    v.append(
      el(
        'div.tarjeta',
        el('div.fila-botones', { style: 'justify-content:space-between;margin-bottom:12px' }, el('h2', { style: 'margin:0' }, 'Árbitros y usuarios'), el('button.btn.btn-primario', { onclick: () => nuevoUsuario().then(pintar) }, '+ Nuevo usuario')),
        el('p.ayuda', 'Los árbitros pueden rellenar y cerrar actas. Los administradores, además, entran en este panel. Desactivar un usuario le impide entrar en cuanto publiques la configuración.'),
        el('div.desplazable', el('table.tabla', el('thead', el('tr', el('th', 'Usuario'), el('th', 'Nombre (sale en el acta)'), el('th', 'Rol'), el('th', 'Estado'), el('th', ''))), filas))
      )
    );
  }

  function formPassword(conUsuario) {
    const campos = {
      usuario: el('input', { autocapitalize: 'none', autocomplete: 'off', required: true }),
      nombre: el('input', { required: true }),
      rol: el('select', el('option', { value: 'arbitro' }, 'Árbitro'), el('option', { value: 'admin' }, 'Administrador')),
      p1: el('input', { type: 'password', autocomplete: 'new-password' }),
      p2: el('input', { type: 'password', autocomplete: 'new-password' }),
    };
    const sugerir = el('button.btn.btn-peq', {
      type: 'button',
      onclick: () => {
        const p = Cripto.generarCodigo(4) + '-' + Cripto.generarCodigo(4) + '-' + Cripto.generarCodigo(4);
        campos.p1.value = campos.p2.value = p;
        campos.p1.type = campos.p2.type = 'text';
      },
    }, 'Sugerir contraseña');
    const cuerpo = [
      conUsuario ? el('label.campo', el('span.req', 'Usuario'), campos.usuario) : null,
      conUsuario ? el('label.campo', el('span.req', 'Nombre y apellidos'), campos.nombre) : null,
      conUsuario ? el('label.campo', el('span', 'Rol'), campos.rol) : null,
      el('label.campo', el('span.req', 'Contraseña (mín. 10 caracteres)'), campos.p1),
      el('label.campo', el('span.req', 'Repite la contraseña'), campos.p2),
      el('div', sugerir),
    ];
    return { campos, cuerpo };
  }

  function validarPassword(c) {
    if (c.p1.value.length < 10) return 'La contraseña debe tener al menos 10 caracteres.';
    if (c.p1.value !== c.p2.value) return 'Las contraseñas no coinciden.';
    return null;
  }

  async function nuevoUsuario() {
    const { campos, cuerpo } = formPassword(true);
    const ok = await dialogo({ titulo: 'Nuevo usuario', cuerpo, botones: [{ texto: 'Cancelar', valor: false }, { texto: 'Crear', valor: true, primario: true }] });
    if (!ok) return;
    const usuario = Cripto.normalizarUsuario(campos.usuario.value);
    if (!usuario || !campos.nombre.value.trim()) return aviso('Usuario y nombre son obligatorios.', 'error');
    if (S.datos.usuarios.some((u) => Cripto.normalizarUsuario(u.usuario) === usuario)) return aviso('Ese usuario ya existe.', 'error');
    const err = validarPassword(campos);
    if (err) return aviso(err, 'error');
    const ll = await Cripto.llaveParaUsuario(S.dekRaw, usuario, campos.p1.value);
    S.llaves[ll.id] = ll.llave;
    S.datos.usuarios.push({ usuario, nombre: campos.nombre.value.trim(), rol: campos.rol.value, activo: true });
    marcarCambio();
    aviso('Usuario creado. Recuerda publicar la configuración.');
  }

  async function cambiarPassword(u) {
    const { campos, cuerpo } = formPassword(false);
    const ok = await dialogo({ titulo: 'Contraseña de ' + u.usuario, cuerpo, botones: [{ texto: 'Cancelar', valor: false }, { texto: 'Guardar', valor: true, primario: true }] });
    if (!ok) return;
    const err = validarPassword(campos);
    if (err) return aviso(err, 'error');
    const ll = await Cripto.llaveParaUsuario(S.dekRaw, u.usuario, campos.p1.value);
    S.llaves[ll.id] = ll.llave;
    marcarCambio();
    aviso('Contraseña cambiada.');
  }

  async function borrarUsuario(u, id) {
    if (!(await confirmar('Eliminar usuario', `¿Eliminar a ${u.usuario}? No podrá entrar cuando publiques la configuración.`, 'Eliminar', true))) return;
    S.datos.usuarios = S.datos.usuarios.filter((x) => x !== u);
    delete S.llaves[id];
    marcarCambio();
  }

  /* ---------- General ---------- */
  function vistaGeneral(v) {
    const d = S.datos;
    const campo = (etq, clave, extra = {}) => el('label.campo', extra.ancho ? { class: 'campo ancho' } : null, el('span', etq), el('input', { value: d[clave] || '', type: extra.type || 'text', oninput: (e) => ((d[clave] = e.target.value), marcarCambio()) }));
    const tbody = el('tbody');
    const pintarComp = () =>
      tbody.replaceChildren(
        ...d.competiciones.map((c, i) => {
          const enUso = d.equipos.some((e) => e.competicion === c.id);
          return el(
            'tr',
            el('td', el('input', { value: c.nombre, 'aria-label': 'Nombre', oninput: (e) => ((c.nombre = e.target.value), marcarCambio()) })),
            el('td', el('select', { 'aria-label': 'Modalidad', onchange: (e) => ((c.modalidad = e.target.value), marcarCambio()) }, Object.entries(MODALIDADES).map(([k, t]) => el('option', { value: k, selected: c.modalidad === k }, t)))),
            el('td', el('button.btn.btn-peq.btn-peligro', { disabled: enUso, title: enUso ? 'Tiene equipos asignados' : '', onclick: () => (d.competiciones.splice(i, 1), marcarCambio(), pintarComp()) }, 'Quitar'))
          );
        })
      );
    pintarComp();
    v.append(
      el('div.tarjeta', el('h2', 'Datos generales'), el('div.rejilla', campo('Organización (aparece en el PDF)', 'organizacion', { ancho: true }), campo('Temporada', 'temporada'), campo('Email donde recibir las actas', 'emailAdmin', { type: 'email' }))),
      el(
        'div.tarjeta',
        el('div.fila-botones', { style: 'justify-content:space-between;margin-bottom:8px' }, el('h2', { style: 'margin:0' }, 'Competiciones'), el('button.btn.btn-peq.btn-primario', { onclick: () => (d.competiciones.push({ id: 'c_' + uid(), nombre: 'Nueva competición', modalidad: 'fs' }), marcarCambio(), pintarComp()) }, '+ Competición')),
        el('p.ayuda', 'La modalidad decide el modelo de acta: fútbol sala (2 árbitros) o fútbol 5 (guía y fisioterapeuta).'),
        el('table.tabla', el('thead', el('tr', el('th', 'Nombre'), el('th', 'Modalidad'), el('th', ''))), tbody)
      )
    );
  }

  /* ---------- Publicar ---------- */
  function vistaPublicar(v) {
    const sinCodigo = S.datos.equipos.filter((e) => !e.codigo);
    const arbitros = S.datos.usuarios.filter((u) => u.activo !== false);
    const codigos = Object.entries(S.codigosNuevos)
      .map(([id, c]) => [S.datos.equipos.find((e) => e.id === id), c])
      .filter(([e]) => e);
    v.append(
      el(
        'div.tarjeta',
        el('h2', 'Publicar la configuración'),
        S.cambios ? el('div.nota.nota-alerta', 'Tienes cambios sin publicar.') : el('div.nota.nota-ok', 'No hay cambios pendientes.'),
        el(
          'ol',
          el('li', 'Pulsa «Descargar config.json».'),
          el('li', 'En GitHub, entra en la carpeta ', el('code', 'data'), ' del repositorio → «Add file» → «Upload files» y sube el archivo (sustituye al anterior).'),
          el('li', 'Pulsa «Commit changes». En 1-2 minutos los árbitros ya tendrán los cambios (deben volver a iniciar sesión).')
        ),
        el('div.fila-botones', el('button.btn.btn-primario', { onclick: publicar }, 'Descargar config.json'), codigos.length ? el('button.btn', { onclick: () => descargarCodigos(codigos) }, 'Descargar hoja de códigos (' + codigos.length + ')') : null)
      ),
      el(
        'div.tarjeta',
        el('h2', 'Comprobaciones'),
        el('ul', el('li', S.datos.equipos.length + ' equipos, ' + arbitros.length + ' usuarios activos.'), sinCodigo.length ? el('li', { style: 'color:var(--alerta)' }, sinCodigo.length + ' equipos sin código de firma: ' + sinCodigo.map((e) => e.nombre).join(', ')) : el('li', 'Todos los equipos tienen código de firma.')),
        el('div.fila-botones', sinCodigo.length ? el('button.btn.btn-oscuro', { onclick: generarTodos }, 'Generar códigos para los equipos que no tienen') : null)
      )
    );

    async function generarTodos() {
      for (const eq of S.datos.equipos.filter((e) => !e.codigo)) {
        const c = Cripto.generarCodigo(6);
        eq.codigo = await Cripto.huellaCodigo(c);
        S.codigosNuevos[eq.id] = c;
      }
      marcarCambio();
      pintarPanel();
      aviso('Códigos generados. Descarga la hoja de códigos antes de salir.');
    }
  }

  async function publicar() {
    const fichero = await Cripto.sellarConfig(S.datos, S.dekRaw, S.llaves);
    descargar('config.json', JSON.stringify(fichero, null, 1), 'application/json');
    S.fichero = fichero;
    S.cambios = false;
    pintarPanel();
    aviso('config.json descargado. Súbelo a la carpeta data del repositorio.');
  }

  function descargarCodigos(codigos) {
    const lineas = [
      'CÓDIGOS DE FIRMA DE ENTRENADORES',
      (S.datos.organizacion || '') + ' · ' + (S.datos.temporada || ''),
      'Generados el ' + new Date().toLocaleString('es-ES'),
      '',
      ...codigos
        .sort((a, b) => (a[0].competicion + a[0].nombre).localeCompare(b[0].competicion + b[0].nombre, 'es'))
        .map(([e, c]) => `${(comp(e.competicion) || {}).nombre || ''} | ${e.nombre} | ${c}`),
      '',
      'Entrega a cada entrenador solo el código de su equipo. Guarda esta hoja en lugar seguro.',
    ];
    descargar('codigos-equipos.txt', lineas.join('\r\n'), 'text/plain;charset=utf-8');
  }

  inicio();
})();
