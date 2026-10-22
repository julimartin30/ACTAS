# Actas online · Fútbol sala y Fútbol 5

Web para que los árbitros cumplimenten las actas de los partidos (1ª y 2ª División de Fútbol Sala y Liga Nacional de Fútbol 5) desde el móvil. El entrenador de cada equipo firma con un código propio, y al cerrar se genera el PDF con el formato de los modelos de la FEDC.

Funciona entera en GitHub Pages: no hace falta servidor, base de datos ni cuentas externas.

## Cómo funciona

| Quién | Qué hace | Dónde |
|---|---|---|
| Administrador (tú) | Da de alta árbitros, equipos, plantillas y genera los códigos de firma | `admin.html` |
| Árbitro | Entra con usuario y contraseña, crea el acta, rellena datos, jugadores, goles, tarjetas, faltas y resultado | `index.html` |
| Entrenador | Revisa el acta en el móvil del árbitro y escribe el código de su equipo | `index.html`, pestaña «Firmas y cierre» |
| Árbitro | Cierra el acta con su contraseña y envía el PDF (compartir, correo o descarga) | `index.html` |

**Firma del entrenador:** si después de firmar se cambia cualquier dato del acta (salvo las observaciones), la firma se anula y hay que volver a firmar.

**Cierre sin firma:** el acta se puede cerrar aunque falte la firma de un entrenador. El árbitro elige el motivo, que queda reflejado en el recuadro de firma y en las observaciones del PDF.

**Jugadores:** aparecen los de la plantilla precargada y el árbitro marca quién juega. También puede añadir jugadores a mano, o elegir «Otro equipo» y escribirlo todo. El límite es el del modelo de acta: 8 jugadores de campo y 2 porteros.

**Sin cobertura:** tras abrir la web una vez con conexión, funciona sin internet. Los borradores se guardan solos en el dispositivo, cifrados.

## Publicarlo en GitHub (una sola vez)

1. Crea un repositorio nuevo en GitHub, por ejemplo `actas`.
2. Sube **todo el contenido** de esta carpeta: «Add file» → «Upload files», arrastra los archivos y carpetas y pulsa «Commit changes». Incluye el archivo oculto `.nojekyll`.
3. Ve a **Settings → Pages**. En «Branch» elige `main` y la carpeta `/ (root)`, y pulsa «Save».
4. En uno o dos minutos la web estará en `https://TU-USUARIO.github.io/actas/`.

## Primeros pasos: sustituir la configuración de prueba

La carpeta `data/config.json` trae datos de **demostración**:

| Usuario | Contraseña | Rol |
|---|---|---|
| `admin` | `admin-demo-2026` | Administrador |
| `arbitro` | `arbitro-demo-2026` | Árbitro |

Los equipos de prueba usan los códigos `DEMO1S`, `DEMO2S`… `DEMO6F`, `DEMO7F`.

**Antes de usarla de verdad:**

1. Abre `https://TU-USUARIO.github.io/actas/admin.html` y pulsa **«Crear configuración nueva»**. Así se genera una clave de cifrado nueva y los usuarios de demostración dejan de existir.
2. Da de alta los árbitros (pestaña «Árbitros y usuarios»). Usa contraseñas de al menos 10 caracteres; el botón «Sugerir contraseña» genera una.
3. Da de alta los equipos de cada competición, con su entrenador, guía (en fútbol 5) e instalación habitual.
4. Para cargar la plantilla, usa «Pegar lista» y pega las columnas de Excel: dorsal, apellidos, nombre y posición.
5. En **«Publicar»**, pulsa «Generar códigos para los equipos que no tienen». Descarga la **hoja de códigos** y entrega a cada entrenador el suyo. Los códigos solo se pueden ver en ese momento.
6. Pulsa **«Descargar config.json»** y súbelo a la carpeta `data` del repositorio, sustituyendo al anterior.

Cada vez que cambies algo en la administración (un árbitro nuevo, un fichaje, un código), repite el paso 6.

## Logo en el PDF

Si añades el logo de la federación como `assets/logo.png` (o `assets/logo.jpg`), aparecerá en la cabecera del acta. Sin logo, se muestra el nombre de la organización.

## Seguridad: qué protege y qué no

- `config.json` es público en GitHub, pero está **cifrado** (AES-256 con claves derivadas de cada contraseña mediante PBKDF2). Sin un usuario y contraseña válidos no se puede leer ni un nombre de jugador.
- Los **códigos de entrenador** no se guardan, solo su huella. Ni el árbitro ni nadie que mire el código puede averiguarlos.
- Cada PDF lleva un número de acta, la fecha y hora de cierre, el árbitro que la cerró y un código de verificación. También lleva los datos completos del acta en un adjunto `acta-….json` dentro del propio PDF, útil si más adelante quieres procesar estadísticas.
- **Límites que debes conocer:**
  - Las actas cerradas solo existen en el móvil del árbitro hasta que te envía el PDF. No hay un archivo central de actas.
  - Un usuario eliminado deja de poder entrar con la configuración nueva. Sin embargo, el historial de Git conserva las versiones antiguas de `config.json`. Si alguna vez necesitas revocar a alguien de forma estricta, crea una configuración nueva.
  - Como todo se comprueba en el navegador, esto es adecuado para la gestión de actas, no para datos de alto riesgo.

## Estructura

```
index.html          App del árbitro
admin.html          Panel de administración
data/config.json    Configuración cifrada (equipos, plantillas, usuarios, huellas de códigos)
js/cripto.js        Cifrado y códigos de firma
js/app.js           Lógica de las actas
js/pdf-acta.js      Generación del PDF (modelos FS y F5)
js/admin.js         Panel de administración
js/comun.js         Utilidades
css/estilos.css     Estilos
vendor/pdf-lib.min.js  Librería PDF (licencia MIT)
sw.js, manifest.webmanifest  Uso sin conexión e instalación en el móvil
```
