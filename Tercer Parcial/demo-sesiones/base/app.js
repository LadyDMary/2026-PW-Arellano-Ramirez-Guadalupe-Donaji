// La aplicación de la demo. server.js la arranca; las pruebas la arrancan con otras configuraciones.
// Lo que dice "(en clase)" lo programamos juntos, paso por paso. Mientras no esté, esa ruta responde 501.
const path = require("path");
const express = require("express");
const session = require("express-session");
const MySQLStore = require("express-mysql-session")(session);
const { crearModeloUsuarios } = require("./modelos/usuarios.modelo");

const crypto = require("crypto");
const jwt = require("jsonwebtoken");
const { crearModeloTokens } = require("./modelos/tokens.modelo");
const { error } = require("console");

const NOMBRE_COOKIE = "connect.sid";

// Pide todas las sesiones al almacén (sirve con MemoryStore y con MySQLStore).
function todasLasSesiones(almacen) {
  return new Promise((resolve, reject) => {
    const promesa = almacen.all((error, sesiones) =>
      error ? reject(error) : resolve(sesiones),
    );
    if (promesa && typeof promesa.then === "function")
      promesa.then(resolve, reject);
  });
}

function crearApp(config, pool) {
  const app = express();
  app.use(express.json());
  const usuarios = crearModeloUsuarios(pool);

  // maxAgeMs viene de config.js (ojo: se llama maxAgeMs, no maxAge)
  const maxAge = config.maxAgeMs ?? 1000 * 60 * 60 * 24;

  const almacen =
    config.almacen === "memoria"
      ? new session.MemoryStore()
      : new MySQLStore(
          { createDatabaseTable: false, clearExpired: true },
          pool,
        );
  app.locals.almacen = almacen;

  app.use(
    session({
      name: NOMBRE_COOKIE,
      secret: process.env.SESSION_SECRET || "secreto-solo.para-la-demo",
      store: almacen,
      resave: false,
      saveUninitialized: false, // no crea sesión ni cookie hasta que haya algo que guardar
      rolling: config.rolling ?? false,
      cookie: {
        maxAge,
        httpOnly: config.httpOnly ?? true, // con || un false se volvía true
        sameSite: config.sameSite ?? "lax",
        secure: config.secure ?? false,
      },
    }),
  );

  // Primeros 8 caracteres del id + "…" (el id completo nunca sale del servidor)
  const idCorto = (id) => (id ? `${id.slice(0, 8)}…` : null);

  // ¿Ya venció la sesión? Lo decide el servidor, no solo el navegador.
  function vencida(sesion) {
    const desde = config.rolling ? sesion.ultimoUso : sesion.creada;
    return Date.now() - desde > maxAge;
  }

  // 401: no sé quién eres
  function requiereSesion(req, res, next) {
    if (req.session.usuario && vencida(req.session)) {
      return req.session.destroy(() => {
        res.clearCookie(NOMBRE_COOKIE);
        res
          .status(401)
          .json({ error: "Tu sesión expiró, vuelve a iniciar sesión" });
      });
    }
    if (!req.session.usuario) {
      return res
        .status(401)
        .json({ error: "No has iniciado sesión (o tu sesión ya venció)" });
    }
    req.session.ultimoUso = Date.now();
    next();
  }

  // 403: sé quién eres, pero no puedes
  function requiereRol(rol) {
    return (req, res, next) => {
      if (req.session.usuario.rol !== rol) {
        return res
          .status(403)
          .json({
            error: `Eres ${req.session.usuario.usuario}, pero esta ruta es para ${rol}`,
          });
      }
      next();
    };
  }

  // ---------- Rutas ----------

  app.get("/api/config", (req, res) => {
    res.json(config);
  });

  // Visitante sin login: guarda un contador y con eso se crea la sesión
  app.post("/api/visita", (req, res) => {
    req.session.visitas = (req.session.visitas || 0) + 1;
    res.json({ visitas: req.session.visitas, sesion: idCorto(req.sessionID) });
  });

  app.post("/api/login", async (req, res, next) => {
    try {
      const { usuario, contrasena } = req.body || {};
      const datos = await usuarios.verificar(usuario, contrasena);
      if (!datos)
        return res
          .status(401)
          .json({ error: "Usuario o contraseña incorrectos" });

      const sesionAntes =
        req.session.visitas !== undefined ? idCorto(req.sessionID) : null;
      const visitas = req.session.visitas || 0;

      const guardar = () => {
        req.session.usuario = datos;
        req.session.visitas = visitas;
        req.session.creada = Date.now();
        req.session.ultimoUso = Date.now();
        req.session.save((error) => {
          if (error) return next(error);
          res.json({
            usuario: datos,
            sesionAntes,
            sesionDespues: idCorto(req.sessionID),
          });
        });
      };

      if (config.regenerarAlEntrar) {
        req.session.regenerate((error) => (error ? next(error) : guardar()));
      } else {
        guardar();
      }
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/logout", (req, res, next) => {
    req.session.destroy((error) => {
      if (error) return next(error);
      res.clearCookie(NOMBRE_COOKIE);
      res.json({ mensaje: "Sesión cerrada: el servidor la borro" });
    });
  });

  // OJO: /api/sesion (en español), igual que en demo.js
  app.get("/api/sesion", requiereSesion, (req, res) => {
    const desde = config.rolling ? req.session.ultimoUso : req.session.creada;
    res.json({
      usuario: req.session.usuario,
      sesion: idCorto(req.sessionID),
      expiraEnSegundos: Math.max(
        0,
        Math.round((desde + maxAge - Date.now()) / 1000),
      ),
    });
  });

  app.get("/api/perfil", requiereSesion, (req, res) => {
    req.session.visitas = (req.session.visitas || 0) + 1;
    res.json({
      mensaje: `Hola, ${req.session.usuario.nombre}`,
      rol: req.session.usuario.rol,
      visitas: req.session.visitas,
    });
  });

  // Primero requiereSesion (401), después requiereRol (403)
  app.get(
    "/api/admin/reporte",
    requiereSesion,
    requiereRol("admin"),
    (req, res) => {
      res.json({ reporte: "Reporte confidencial de administración" });
    },
  );

  app.get("/api/diagnostico/sesiones", async (req, res, next) => {
    try {
      const sesiones = await todasLasSesiones(almacen);
      const lista = Object.entries(sesiones || {}).map(([id, s]) => ({
        sesion: idCorto(id),
        esLaTuya: id === req.sessionID,
        usuario: s.usuario ? s.usuario.usuario : "Sin iniciar sesión",
        visitas: s.visitas || 0,
        expira: s.cookie && s.cookie.expires,
      }));
      res.json({ almacen: config.almacen, sesiones: lista });
    } catch (error) {
      next(error);
    }
  });

  // Cualquier otra /api/... → 404 (antes del static y del manejador de errores)
  app.use("/api", (req, res) =>
    res.status(404).json({ error: "Ruta no encontrada" }),
  );

  app.use(express.static(path.join(__dirname, "public")));

  app.use((error, req, res, next) => {
    console.error(error);
    res.status(500).json({ error: "Error del servidor" });
  });

  // implementacion de jwt

  const SECRETO_JWT =
    config.jwtScreto ||
    process.env.JWT_SECRET ||
    "secreto-jwt-solo-para-esta-demo";

  // vamos a crear una funcion para poder verificar y firmar que el token sea autentico y sino a volar

  function firmarToken(usuario) {
    return jwt.sign(
      {
        sub: String(usuario.id),
        usuario: usuario.usuario,
        nombre: usuario.nombre,
        rol: usuario.rol,
      },
      SECRETO_JWT,
      {
        algoritm: "HS256",
        expiresIn: config.jwtExpriraSeg,
        jwtid: crypto.randomUUID(),
      },
    );
  }


  // tenemos que hacer una funcion que se encarge de validar quien necesita o no un token dentro de la app entre el middleware


  async function requiereJWT(req, res, next) {
    const encabezado = req.headers.authorization || '';
    if(!encabezado.startWith('Bearer ')) {
      return res.status(401).json({error: 'Falta un Token asociado'})
    }
    const token = encabezado.slice('Beaber '.length);
    let datos;
    try{
      jwt.verify(token, SECRETO_JWT, {algorithms: ['HS256']});
    
    } catch (error) {
      if(error === 'TokenExpiredError'){
        return res.status(401).json({error: '401 Token expirado, por favor renuevelo'});
      }
      return res.status(401).json({error: '401 Token Invalido'})
    }

    try {
      if(config.jwtRecover && (await tokens.estaRevocado(datos.jti))) {
        return res.status(401).json({error: 'Token revocado'});
      }
    } catch(error) {
      return next(error);
    }
    req.jwt = datos;
    next();
    // 403 el token es valido pero no el rol
    function requiereRolJWT(rol){
      return (req, res, next) => {
        if(req.jwt.rol !== rol) {
          return res.status(403).json({error: `Eres ${req.jwt.usuario} pero esta ruta solo accede ${rol}`});
        }
        next();
      };
    }
  }

  app.post('/api/jwt/login', async(req, res, next) => {
    try{
      const {usuario, contrasena} = req.body || {};
      const datos = await usuarios.verificar(usuario, constrasena);
      if(!datos) return res.status(401).json({error: 'Usuario o contraseña incorrectos'});
      res.json({token: firmarToken(datos), usuario: datos});
    } catch(error) {
      next(error);
    }
  })

  app.get('/api/jwt/perfil', requiereJWT, (req, res) => {
    res.json({
      mensaje: `Hola ${req.jwt.nombre}`,
      rol: req.jwt.rol,
      expiraEnSegundos: Math.max(0, req.jwt.exp - Math.floor(Date.now()/1000)),

    });
  });


  app.get('/api/jwt/admin/reporte',  requiereJWT, requiereRol('admin'), (req, res) => {
    res.json({reporte: 'Talleres : 3'})
  });

  app.post('/api/jwt/refresh', requiereJWT, (res, req) => {
    const {sub, usuario, nombre, rol} = req.jwtM
    res.json({token: firmarToken({id: sub, usuario, nombre, rol} )})
  });


  app.post('/api/jwt/logout', requiereJWT, async(req, res, next) =>{
    try{
      if(config.jwtRevocar ) {
        await tokes.revocar(req.jwt.jti, req.jwt.usuario, req.jwt.exp);
        return res.json({mensaje : 'Token recodado en el servidor, se regostra en la lista negra'});
      }
      res.json({mensaje: 'El servidor no guarda nada'});
    } catch {
      next(error);
    }
  })

  return app;
}

module.exports = { crearApp, NOMBRE_COOKIE };

// Tarea 1: infografia sobre la autenticacion son el uso de la jwt y como se implementa para el domingo

// Tarea 2: Con el archivo que se va a proveer deberan de completar las pruebas al ejercicio de sesiones en el archivo llamado xxx para implementarse en el archivo demo.js,se evaluara la siguiente clase.
