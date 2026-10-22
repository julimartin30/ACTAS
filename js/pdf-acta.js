/*
 * Genera el PDF del acta siguiendo los modelos de fútbol sala y fútbol 5.
 * Usa pdf-lib (vendor/pdf-lib.min.js). A4 apaisado, coordenadas desde arriba a la izquierda.
 */
(function (global) {
  'use strict';
  const W = 842;
  const H = 595;
  const M = 22;

  const WINANSI_EXTRA = '€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ';
  function limpio(s) {
    return Array.from(String(s ?? ''))
      .map((ch) => {
        const c = ch.charCodeAt(0);
        if ((c >= 0x20 && c <= 0x7e) || (c >= 0xa0 && c <= 0xff) || WINANSI_EXTRA.includes(ch)) return ch;
        if (ch === '\t') return ' ';
        if (ch === '\n' || ch === '\r') return ch;
        return '?';
      })
      .join('');
  }

  let logoCache;
  async function cargarLogo() {
    if (logoCache !== undefined) return logoCache;
    logoCache = null;
    for (const [ruta, tipo] of [['assets/logo.png', 'png'], ['assets/logo.jpg', 'jpg']]) {
      try {
        const r = await fetch(ruta, { cache: 'no-cache' });
        if (r.ok) {
          logoCache = { bytes: new Uint8Array(await r.arrayBuffer()), tipo };
          break;
        }
      } catch (e) {
        /* sin logo */
      }
    }
    return logoCache;
  }

  async function generar(acta, datos) {
    const { PDFDocument, StandardFonts, rgb } = global.PDFLib;
    const doc = await PDFDocument.create();
    const f = await doc.embedFont(StandardFonts.Helvetica);
    const fb = await doc.embedFont(StandardFonts.HelveticaBold);
    const NEGRO = rgb(0, 0, 0);
    const GRIS = rgb(0.82, 0.82, 0.82);
    const GRIS_OSC = rgb(0.55, 0.55, 0.55);
    const MARCA = rgb(0.075, 0.137, 0.247);
    const ROJO = rgb(0.78, 0.06, 0.18);
    const TENUE = rgb(0.35, 0.35, 0.35);

    const comp = (datos.competiciones || []).find((c) => c.id === acta.competicion) || { nombre: '', modalidad: 'fs' };
    const esF5 = comp.modalidad === 'f5';
    const p = acta.partido;

    let page = doc.addPage([W, H]);

    /* ---------- primitivas ---------- */
    const rect = (x, y, w, h, o = {}) =>
      page.drawRectangle({
        x,
        y: H - y - h,
        width: w,
        height: h,
        color: o.fill,
        borderColor: o.stroke === false ? undefined : o.color || NEGRO,
        borderWidth: o.stroke === false ? 0 : o.lw ?? 0.6,
        borderDashArray: o.dash,
      });
    const linea = (x1, y1, x2, y2, o = {}) =>
      page.drawLine({ start: { x: x1, y: H - y1 }, end: { x: x2, y: H - y2 }, thickness: o.lw ?? 0.6, color: o.color || NEGRO, dashArray: o.dash });
    const ancho = (t, size, bold) => (bold ? fb : f).widthOfTextAtSize(limpio(t), size);
    const texto = (t, x, yBase, size = 8, o = {}) => {
      t = limpio(t);
      if (!t) return;
      page.drawText(t, { x, y: H - yBase, size, font: o.bold ? fb : f, color: o.color || NEGRO });
    };

    /** Texto ajustado a una celda (reduce tamaño y recorta si no cabe). */
    function celda(t, x, y, w, h, o = {}) {
      t = limpio(t).trim();
      if (!t) return;
      const pad = o.pad ?? 2.5;
      let size = o.size || 7.5;
      const min = o.min || 5;
      while (size > min && ancho(t, size, o.bold) > w - pad * 2) size -= 0.25;
      while (t.length > 1 && ancho(t, size, o.bold) > w - pad * 2) t = t.slice(0, -2) + '…';
      const tw = ancho(t, size, o.bold);
      const tx = o.align === 'center' ? x + (w - tw) / 2 : o.align === 'right' ? x + w - pad - tw : x + pad;
      const ty = y + h / 2 + size * 0.35;
      texto(t, tx, ty, size, o);
    }

    /** Parte texto en líneas que caben en un ancho. */
    function partir(t, w, size, bold) {
      const lineas = [];
      limpio(t)
        .split(/\r?\n/)
        .forEach((parrafo) => {
          const palabras = parrafo.split(/\s+/).filter(Boolean);
          if (!palabras.length) return lineas.push('');
          let actual = '';
          palabras.forEach((pal) => {
            const prueba = actual ? actual + ' ' + pal : pal;
            if (ancho(prueba, size, bold) <= w) actual = prueba;
            else {
              if (actual) lineas.push(actual);
              while (ancho(pal, size, bold) > w && pal.length > 1) {
                let i = pal.length;
                while (i > 1 && ancho(pal.slice(0, i), size, bold) > w) i--;
                lineas.push(pal.slice(0, i));
                pal = pal.slice(i);
              }
              actual = pal;
            }
          });
          lineas.push(actual);
        });
      return lineas;
    }

    const fecha = (yyyyMmDd) => {
      if (!yyyyMmDd) return '';
      const [y, m, d] = yyyyMmDd.split('-');
      return `${d}/${m}/${y}`;
    };
    const fechaHora = (iso) =>
      iso ? new Date(iso).toLocaleString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '';

    /* ---------- Cabecera ---------- */
    const logo = await cargarLogo();
    if (logo) {
      try {
        const img = logo.tipo === 'png' ? await doc.embedPng(logo.bytes) : await doc.embedJpg(logo.bytes);
        const esc = Math.min(250 / img.width, 78 / img.height);
        page.drawImage(img, { x: M, y: H - 22 - img.height * esc - (78 - img.height * esc) / 2, width: img.width * esc, height: img.height * esc });
      } catch (e) {
        /* logo no válido: se ignora */
      }
    }
    if (!logo) {
      const ls = partir(datos.organizacion || '', 250, 11, true).slice(0, 4);
      ls.forEach((l, i) => texto(l, M, 44 + i * 14, 11, { bold: true, color: MARCA }));
    }
    texto('Temporada ' + (datos.temporada || ''), M, 108, 7.5, { color: TENUE });

    // Caja de título
    const tx = 300,
      tw = 140,
      ty = M,
      th = 92;
    rect(tx, ty, tw, th, { lw: 1.2 });
    const titulo = esF5 ? ['FUTBOL 5'] : ['FUTBOL', 'SALA'];
    titulo.forEach((l, i) => {
      const size = 20;
      const y0 = ty + (th - titulo.length * 22) / 2 + 18 + i * 22;
      texto(l, tx + (tw - ancho(l, size, true)) / 2, y0, size, { bold: true });
    });

    // Caja de datos
    const dx = tx + tw,
      dw = W - M - dx,
      dLab = 78;
    const filasDatos = [
      ['Competición', comp.nombre],
      ['Instalación', p.instalacion],
      ['Fecha', fecha(p.fecha)],
      ['Hora', p.hora],
      ['Jornada', p.jornada],
      [esF5 ? 'Árbitro' : 'Árbitros', (p.arbitros || []).filter(Boolean).slice(0, esF5 ? 1 : 2).join(' / ')],
      ['Cronometrador', p.cronometrador],
    ];
    const dh = th / filasDatos.length;
    rect(dx, ty, dw, th, { lw: 1.2 });
    linea(dx + dLab, ty, dx + dLab, ty + th);
    filasDatos.forEach(([k, v], i) => {
      const y = ty + i * dh;
      if (i) linea(dx, y, dx + dw, y, { lw: 0.5 });
      celda(k, dx, y, dLab, dh, { bold: true, align: 'right', size: 7.5 });
      celda(v, dx + dLab, y, dw - dLab, dh, { size: 8 });
    });

    /* ---------- Tablas de equipos ---------- */
    const yT = 122;
    const anchoT = (W - 2 * M) / 2;
    const cols = [
      ['DORSAL', 30],
      ['POSICIÓN', 46],
      ['APELLIDOS', 140],
      ['NOMBRE', 91],
      ['GOLES', 28],
      ['A', 17],
      ['R', 17],
      ['FALTAS', 30],
    ];
    const hTitulo = 12,
      hCab = 16,
      hFila = 15;

    function tablaEquipo(x0, etiqueta, t) {
      const filas = esF5 ? ['Jugador', 'Jugador', 'Jugador', 'Jugador', 'Jugador', 'Jugador', 'Jugador', 'Jugador', 'Portero', 'Portero', 'Guía', 'Entrenador'] : ['Jugador', 'Jugador', 'Jugador', 'Jugador', 'Jugador', 'Jugador', 'Jugador', 'Jugador', 'Portero', 'Portero', 'Entrenador', ''];
      const faltasEtq = ['1', '2', '3', '4', '5', 'D.P', '1', '2', '3', '4', '5', 'D.P'];
      const total = hTitulo + hCab + filas.length * hFila;
      rect(x0, yT, anchoT, total, { lw: 1.2 });
      // Título
      celda(etiqueta + ' ' + (t.nombre || ''), x0, yT, anchoT, hTitulo, { bold: true, size: 8 });
      linea(x0, yT + hTitulo, x0 + anchoT, yT + hTitulo, { lw: 1 });
      // Cabecera de columnas
      let cx = x0;
      const yc = yT + hTitulo;
      const xs = [];
      cols.forEach(([nom, w], i) => {
        xs.push(cx);
        if (nom === 'A' || nom === 'R') {
          if (nom === 'A') {
            celda('TARJETA', cx, yc, 34, hCab / 2, { bold: true, align: 'center', size: 6 });
            linea(cx, yc + hCab / 2, cx + 34, yc + hCab / 2, { lw: 0.4 });
          }
          celda(nom, cx, yc + hCab / 2, w, hCab / 2, { bold: true, align: 'center', size: 6 });
        } else if (nom === 'FALTAS') {
          celda('FALTAS', cx, yc, w, hCab / 2, { bold: true, align: 'center', size: 5 });
          celda('ACUMUL', cx, yc + hCab / 2 - 1, w, hCab / 2, { bold: true, align: 'center', size: 5 });
        } else celda(nom, cx, yc, w, hCab, { bold: true, align: 'center', size: 6.5 });
        if (i) linea(cx, yc + (nom === 'R' ? hCab / 2 : 0), cx, yT + total, { lw: 0.5 });
        cx += w;
      });
      // Datos de filas
      const conv = (t.jugadores || []).filter((j) => j.juega);
      const porDorsal = (a, b) => (Number(a.dorsal) || 999) - (Number(b.dorsal) || 999);
      const campo_ = conv.filter((j) => j.posicion !== 'Portero').sort(porDorsal);
      const porteros = conv.filter((j) => j.posicion === 'Portero').sort(porDorsal);
      const filaPersona = (i) => {
        if (i < 8) return campo_[i];
        if (i < 10) return porteros[i - 8];
        if (filas[i] === 'Guía') return t.guia;
        if (filas[i] === 'Entrenador') return t.entrenador;
        return null;
      };

      filas.forEach((tipo, i) => {
        const y = yc + hCab + i * hFila;
        linea(x0, y, x0 + anchoT, y, { lw: i === 0 ? 1 : 0.5 });
        // Sombreados como en el modelo
        if (tipo === 'Portero' || (tipo === 'Entrenador' && esF5)) rect(xs[1], y, cols[1][1], hFila, { fill: GRIS, stroke: false });
        if (tipo === '') rect(x0, y, xs[7] - x0, hFila, { fill: GRIS_OSC, stroke: false });
        if (tipo) celda(tipo, xs[1], y, cols[1][1], hFila, { align: 'center', size: 7 });

        const per = filaPersona(i);
        if (per) {
          if (i < 10) celda(per.dorsal, xs[0], y, cols[0][1], hFila, { align: 'center', bold: true, size: 8 });
          celda(per.apellidos, xs[2], y, cols[2][1], hFila, { size: 7.5 });
          celda(per.nombre, xs[3], y, cols[3][1], hFila, { size: 7.5 });
          if (i < 10 && Number(per.goles) > 0) celda(String(per.goles), xs[4], y, cols[4][1], hFila, { align: 'center', bold: true, size: 8 });
          if (Number(per.amarillas) > 0) celda(String(per.amarillas), xs[5], y, cols[5][1], hFila, { align: 'center', bold: true, size: 8 });
          if (per.roja) celda('X', xs[6], y, cols[6][1], hFila, { align: 'center', bold: true, size: 8, color: ROJO });
        }
        // Faltas acumuladas: filas 0-5 = 1ª parte, 6-11 = 2ª parte
        const parte = i < 6 ? 0 : 1;
        const n = (i % 6) + 1;
        const marcada = (t.faltas || [0, 0])[parte] >= n;
        if (marcada) rect(xs[7] + 2, y + 2, cols[7][1] - 4, hFila - 4, { fill: MARCA, stroke: false });
        celda(faltasEtq[i], xs[7], y, cols[7][1], hFila, { align: 'center', size: 7, bold: marcada, color: marcada ? rgb(1, 1, 1) : NEGRO });
      });
      // Separador de partes en faltas
      linea(xs[7], yc + hCab + 6 * hFila, x0 + anchoT, yc + hCab + 6 * hFila, { lw: 1 });
      return yT + total;
    }

    const finTabla = Math.max(tablaEquipo(M, 'EQUIPO LOCAL:', acta.local), tablaEquipo(M + anchoT, 'EQUIPO VISITANTE:', acta.visitante));

    /* ---------- Firmas de entrenadores ---------- */
    const yF = finTabla + 10;
    const hF = 58;
    function cajaFirmaEntrenador(x0, t) {
      texto('Firma Entrenador', x0, yF + hF / 2 + 3, 7.5);
      const bx = x0 + 70,
        bw = 230;
      rect(bx, yF, bw, hF, { dash: [2, 2], lw: 0.6 });
      const fi = t.firma;
      const lineas = [];
      if (fi && fi.estado === 'firmada') {
        lineas.push(['FIRMADA ELECTRÓNICAMENTE', true, MARCA, 8]);
        lineas.push(['Con el código de firma del equipo', false, NEGRO, 7]);
        lineas.push([fechaHora(fi.fecha), false, NEGRO, 7]);
        lineas.push([[t.entrenador.nombre, t.entrenador.apellidos].filter(Boolean).join(' '), false, TENUE, 7]);
      } else if (fi && fi.estado === 'sin_firma') {
        lineas.push(['SIN FIRMA DEL ENTRENADOR', true, ROJO, 8]);
        partir('Motivo: ' + fi.motivo + (fi.detalle ? '. ' + fi.detalle : ''), bw - 10, 6.8).slice(0, 4).forEach((l) => lineas.push([l, false, NEGRO, 6.8]));
      } else {
        lineas.push(['Sin firmar', false, TENUE, 7.5]);
      }
      lineas.forEach(([l, b, c, s], i) => texto(l, bx + 6, yF + 13 + i * 10.5, s, { bold: b, color: c }));
    }
    cajaFirmaEntrenador(M + 20, acta.local);
    cajaFirmaEntrenador(M + anchoT + 20, acta.visitante);

    /* ---------- Bloque inferior ---------- */
    const yB = yF + hF + 10;
    const yRes = H - 30 - 50; // fila de resultado y firmas
    const hObs = yRes - 6 - yB;

    // Observaciones (+ incidencias de firma)
    const extra = (acta.incidenciasFirma || []).map(
      (inc) => `Acta cerrada sin firma del entrenador del equipo ${inc.lado} (${acta[inc.lado].nombre}): ${inc.motivo}${inc.detalle ? ' - ' + inc.detalle : ''}.`
    );
    const textoObs = [acta.observaciones || '', ...extra].filter((x) => x.trim()).join('\n');
    const ox = esF5 ? M + anchoT + 8 : M + 100;
    const ow = W - M - ox;
    rect(ox, yB, ow, hObs, { lw: 1.2 });
    texto('OBSERVACIONES:', ox + 4, yB + 10, 7.5, { bold: true });
    const sizeObs = 7.2,
      lhObs = 8.8;
    const lineasObs = partir(textoObs, ow - 10, sizeObs);
    const caben = Math.floor((hObs - 16) / lhObs);
    const desbordan = lineasObs.length > caben;
    lineasObs.slice(0, desbordan ? caben - 1 : caben).forEach((l, i) => texto(l, ox + 5, yB + 21 + i * lhObs, sizeObs));
    if (desbordan) texto('(continúa en la página siguiente)', ox + 5, yB + 21 + (caben - 1) * lhObs, sizeObs, { bold: true, color: TENUE });

    // Fisioterapeuta (fútbol 5)
    if (esF5) {
      const fx = M + 50,
        fw = anchoT - 70;
      texto('Fisioterapeuta', fx - 52, yB + 10, 7.5);
      rect(fx, yB, fw, 14);
      celda(p.fisio && p.fisio.nombre, fx, yB, fw, 14, { size: 8 });
      texto('Firma', fx - 24, yB + 26, 7.5);
      const hFis = hObs - 18;
      rect(fx, yB + 18, fw, hFis, { lw: 1 });
      linea(fx, yB + 18 + hFis - 14, fx + fw, yB + 18 + hFis - 14, { dash: [2, 2], lw: 0.5 });
      texto('DNI: ', fx + 4, yB + 18 + hFis - 4, 7.5, { bold: true });
      texto((p.fisio && p.fisio.dni) || '', fx + 24, yB + 18 + hFis - 4, 7.5);
    }

    // Resultado
    const rx = M + 100,
      rw = 250,
      rh = 50;
    rect(rx, yRes, rw, rh, { lw: 1.2 });
    celda('RESULTADO', rx, yRes, rw, 12, { bold: true, align: 'center', size: 7.5 });
    linea(rx, yRes + 12, rx + rw, yRes + 12);
    linea(rx, yRes + 23, rx + rw, yRes + 23);
    linea(rx + rw / 2, yRes + 12, rx + rw / 2, yRes + rh);
    celda('EQUIPO LOCAL', rx, yRes + 12, rw / 2, 11, { bold: true, align: 'center', size: 6.5 });
    celda('EQUIPO VISITANTE', rx + rw / 2, yRes + 12, rw / 2, 11, { bold: true, align: 'center', size: 6.5 });
    celda(acta.resultado.local, rx, yRes + 23, rw / 2, rh - 23, { bold: true, align: 'center', size: 18 });
    celda(acta.resultado.visitante, rx + rw / 2, yRes + 23, rw / 2, rh - 23, { bold: true, align: 'center', size: 18 });

    // Firmas de árbitros y cronometrador
    const cajas = esF5
      ? [['Firma árbitro', 'arb0'], ['Firma cronometrador', 'crono']]
      : [['Firma árbitro', 'arb0'], ['Firma árbitro', 'arb1'], ['Firma cronometrador', 'crono']];
    const sx = rx + rw + 16,
      sw = (W - M - sx) / cajas.length;
    cajas.forEach(([etq, k], i) => {
      const x = sx + i * sw;
      rect(x, yRes, sw, rh, { lw: 0.8 });
      linea(x, yRes + 12, x + sw, yRes + 12, { lw: 0.5 });
      celda(etq, x, yRes, sw, 12, { size: 7, align: 'center' });
      if (k === 'arb0') {
        celda(p.arbitros[0], x, yRes + 13, sw, 11, { bold: true, size: 7.5, align: 'center' });
        if (acta.cierre) {
          celda('Firmado electrónicamente', x, yRes + 24, sw, 10, { size: 6.5, align: 'center', color: MARCA });
          celda(fechaHora(acta.cierre.fecha), x, yRes + 34, sw, 10, { size: 6.5, align: 'center', color: TENUE });
        }
      } else if (k === 'arb1') {
        celda(p.arbitros[1], x, yRes + 13, sw, 11, { bold: true, size: 7.5, align: 'center' });
      } else {
        celda(p.cronometrador, x, yRes + 13, sw, 11, { bold: true, size: 7.5, align: 'center' });
      }
    });

    /* ---------- Página 2 (observaciones largas) ---------- */
    const paginas = [page];
    if (desbordan) {
      page = doc.addPage([W, H]);
      paginas.push(page);
      texto('OBSERVACIONES (continuación) · ' + (acta.local.nombre || '') + ' - ' + (acta.visitante.nombre || ''), M, M + 12, 10, { bold: true });
      const resto = partir(textoObs, W - 2 * M, 9);
      const porPag = Math.floor((H - 2 * M - 40) / 11.5);
      resto.slice(0, porPag).forEach((l, i) => texto(l, M, M + 34 + i * 11.5, 9));
    }

    /* ---------- Pie con datos de verificación ---------- */
    paginas.forEach((pg, i) => {
      page = pg;
      const pie = [
        'Acta electrónica ' + acta.numero,
        acta.cierre ? 'Cerrada el ' + fechaHora(acta.cierre.fecha) + ' por ' + acta.cierre.arbitro + ' (' + acta.cierre.usuario + ')' : 'BORRADOR - SIN CERRAR',
        acta.cierre && acta.cierre.huella ? 'Verificación: ' + acta.cierre.huella.slice(0, 16).toUpperCase() : '',
        'Página ' + (i + 1) + '/' + paginas.length,
      ]
        .filter(Boolean)
        .join('   ·   ');
      texto(pie, M, H - 12, 6.5, { color: TENUE });
    });

    doc.setTitle(`Acta ${acta.numero}: ${acta.local.nombre} - ${acta.visitante.nombre}`);
    doc.setSubject(comp.nombre);
    doc.setAuthor(acta.cierre ? acta.cierre.arbitro : '');
    doc.setCreator('Actas online');
    doc.setLanguage('es-ES');
    try {
      await doc.attach(new TextEncoder().encode(JSON.stringify(acta, null, 1)), 'acta-' + acta.numero + '.json', {
        mimeType: 'application/json',
        description: 'Datos del acta en formato JSON',
        creationDate: new Date(),
        modificationDate: new Date(),
      });
    } catch (e) {
      /* adjunto opcional */
    }
    return doc.save();
  }

  global.ActaPDF = { generar };
})(window);
