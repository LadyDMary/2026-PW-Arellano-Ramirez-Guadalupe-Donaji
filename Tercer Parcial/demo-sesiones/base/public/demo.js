// La página solo hace fetch a la API. El navegador manda la cookie solo (misma página, mismo servidor).

// Atajo para no repetir document.getElementById en cada línea; el código queda más corto y fácil de leer.
const $ = (id) => document.getElementById(id);

// Centraliza todos los fetch en un solo lugar para que el resto del código reciba siempre
// { status, datos }; así 401 y 403 se tratan como respuestas normales, porque fetch no lanza error con ellos.
async function llamar(metodo, url, cuerpo) {
  const opciones = { method: metodo, headers: {} };
  // El Content-Type solo se manda con cuerpo: sin él, express.json() no leería el JSON,
  // y en un GET no hay nada que declarar.
  if (cuerpo) {
    opciones.headers['Content-Type'] = 'application/json';
    opciones.body = JSON.stringify(cuerpo);
  }
  const respuesta = await fetch(url, opciones);
  let datos = null;
  // Si el servidor responde algo que no es JSON (un error raro), json() truena;
  // con el try/catch dejamos datos en null para que la página siga funcionando.
  try { datos = await respuesta.json(); } catch { datos = null; }
  return { status: respuesta.status, datos };
}

// Deja un registro visible de cada petición para poder comparar códigos y respuestas
// sin abrir Network, que es justo lo que se pide como evidencia.
function anotar(metodo, url, status, datos) {
  const li = document.createElement('li');
  // El color depende del código porque la diferencia entre 401 y 403 es lo que se quiere observar.
  const clase = status < 300 ? 'ok' : status === 401 ? 'e401' : status === 403 ? 'e403' : 'error';
  // Aquí innerHTML es seguro: solo mezcla el status, el método y la URL, que salen de nuestro propio código.
  li.innerHTML = `<span class="codigo ${clase}">${status}</span> <code>${metodo} ${url}</code>`;
  const cuerpo = document.createElement('pre');
  // El JSON va con textContent porque viene del servidor y no debe interpretarse como HTML (evita XSS).
  cuerpo.textContent = JSON.stringify(datos, null, 2);
  li.appendChild(cuerpo);
  // prepend para que lo más reciente quede arriba y no haya que bajar el scroll.
  $('bitacora').prepend(li);
}

// Le pregunta al servidor quién soy, porque el navegador no sabe nada de la sesión:
// solo el servidor puede confirmar si la cookie sigue siendo válida.
async function refrescarEstado() {
  const { status, datos } = await llamar('GET', '/api/sesion');
  const estado = $('estado');
  if (status === 200) {
    estado.textContent = `${datos.usuario.nombre} · rol ${datos.usuario.rol} · sesión ${datos.sesion} · vence en ${datos.expiraEnSegundos} s`;
    estado.className = 'estado con-sesion';
  } else {
    // Cualquier código distinto de 200 se trata como "sin sesión": la página no distingue
    // entre no haber entrado y haber vencido, solo muestra lo que el servidor decidió.
    estado.textContent = 'Sin sesión (el servidor responde 401)';
    estado.className = 'estado sin-sesion';
  }
  // Se muestra lo que JavaScript puede leer para comprobar el efecto de httpOnly:
  // con httpOnly: true sale vacío aunque haya sesión, porque el navegador oculta la cookie al script.
  $('cookie-js').textContent = document.cookie || '(vacío)';
}

// Pinta lo que el servidor tiene guardado, para ver que los datos de la sesión viven en el servidor
// y no en el navegador. Es un diagnóstico solo para la clase: un servidor real no expondría esto.
async function refrescarSesiones() {
  const { datos: respuesta } = await llamar('GET', '/api/diagnostico/sesiones');
  // Si la petición falló, respuesta es null; se usa un arreglo vacío para no romper el for de más abajo.
  const datos = respuesta ? respuesta.sesiones : [];
  if (respuesta) {
    // Se dice dónde viven las sesiones porque esa es la diferencia que se quiere ver
    // entre memoria (se pierde al reiniciar) y MySQL (sobrevive).
    $('donde').textContent = respuesta.almacen === 'memoria'
      ? 'En la MEMORIA del servidor: se borra al reiniciarlo.'
      : 'En MySQL, tabla sessions. En Workbench: SELECT * FROM demo_sesiones.sessions;';
  }
  const cuerpo = $('tabla-sesiones');
  // Se vacía antes de llenar para que al pulsar varias veces no se acumulen filas duplicadas.
  cuerpo.innerHTML = '';
  if (!datos || datos.length === 0) {
    // Una fila avisando que no hay nada, para que la tabla no parezca rota cuando está vacía.
    cuerpo.innerHTML = '<tr><td colspan="4">(sin sesiones)</td></tr>';
    return;
  }
  for (const s of datos) {
    const fila = document.createElement('tr');
    // Se resalta la propia sesión para distinguirla de las de otros navegadores (útil en el secuestro).
    if (s.esLaTuya) fila.className = 'tuya';
    // expira llega como texto ISO en UTC; se convierte a hora local para que se pueda leer.
    // Puede faltar, y sin esta guarda saldría "Invalid Date".
    const vence = s.expira ? new Date(s.expira).toLocaleTimeString() : '—';
    for (const valor of [s.sesion + (s.esLaTuya ? ' (la tuya)' : ''), s.usuario, s.visitas, vence]) {
      const celda = document.createElement('td');
      // textContent y no innerHTML: el usuario viene del servidor y no debe ejecutarse como HTML.
      celda.textContent = valor;
      fila.appendChild(celda);
    }
    cuerpo.appendChild(fila);
  }
}

// Tras cualquier acción hay que actualizar las dos vistas juntas; si no, el estado y la tabla
// quedarían mostrando momentos distintos de la sesión. Se esperan en orden para que se pinten de forma consistente.
async function refrescarTodo() {
  await refrescarEstado();
  await refrescarSesiones();
}

// Rellena la contraseña de ejemplo al cambiar de usuario para no tener que escribirla
// cada vez que se alterna entre ana, luis y admin durante la demo.
$('usuario').addEventListener('change', () => {
  $('contrasena').value = `${$('usuario').value}12345`;
});

// preventDefault evita que el formulario recargue la página, que borraría la bitácora;
// el login se hace con fetch para poder ver el código y la respuesta.
$('form-login').addEventListener('submit', async (evento) => {
  evento.preventDefault();
  const cuerpo = { usuario: $('usuario').value, contrasena: $('contrasena').value };
  const { status, datos } = await llamar('POST', '/api/login', cuerpo);
  anotar('POST', '/api/login', status, datos);
  // Se refresca todo porque el login cambia quién soy y agrega una sesión en el servidor.
  await refrescarTodo();
});

// Un solo manejador sirve para todos los botones de la tarjeta 3: el método y la ruta salen de
// data-metodo y data-url, así que agregar un botón nuevo en el HTML no requiere tocar el JS.
for (const boton of document.querySelectorAll('[data-url]')) {
  boton.addEventListener('click', async () => {
    const { metodo, url } = boton.dataset;
    const { status, datos } = await llamar(metodo, url);
    anotar(metodo, url, status, datos);
    // Se refresca todo porque cualquiera de estas rutas puede cambiar la sesión
    // (el logout la destruye, el perfil sube las visitas, la visita crea una).
    await refrescarTodo();
  });
}

// Permiten volver a preguntar al servidor sin hacer otra acción: la sesión puede cambiar por su
// cuenta (vencer, o ser usada desde otra ventana) y la página no se entera sola.
$('btn-refrescar').addEventListener('click', refrescarTodo);
$('btn-sesiones').addEventListener('click', refrescarSesiones);

// La configuración se pide una sola vez al cargar porque solo cambia al reiniciar el servidor,
// y con la sangría de stringify se puede leer como en config.js.
llamar('GET', '/api/config').then(({ datos }) => {
  $('config').textContent = JSON.stringify(datos, null, 2);
});
// Al abrir la página se pregunta el estado de inmediato: si ya había una cookie válida,
// no se debe mostrar "sin sesión" hasta que el usuario pulse algo.
refrescarTodo();