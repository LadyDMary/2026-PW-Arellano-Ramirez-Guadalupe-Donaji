// La aplicación de la demo. server.js la arranca; las pruebas la arrancan con otras configuraciones.
// Lo que dice "(en clase)" lo programamos juntos, paso por paso. Mientras no esté, esa ruta responde 501.
const path = require("path");
const express = require("express");
const session = require("express-session");
const MySQLStore = require("express-mysql-session")(session);
const { crearModeloUsuarios } = require("./modelos/usuarios.modelo");
const { resolve } = require("dns");
const { rejects } = require("assert");
const { config } = require("dotenv");

const NOMBRE_COOKIE = "connect.sid";

// si hay una sesion preexistente obtenerla del almacen en vez de crearla

function todasLasSesiones(almacen) {
  return new Promise((resolve, reject) => {
    const promesa = almacen.all((error, sessiones) =>
      error ? reject(error) : resolve(sessiones),
    );
    if (promesa && typeof promesa.then === "function")
      promesa.then(resolve, reject);
  });
}

function crearApp(config, pool) {
  const app = express();
  app.use(express.json());
  const usuarios = crearModeloUsuarios(pool);

  // aqui nosotros debemos identificar la sesios sera por tabla en bd, o la sesion sera una cookie en memoria del navegador, o es una mezcla, sesion en  memoria de servidor y por la tabla en bd y cookie en navegador y bd.

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
      //no se crea la sesion ni la cookie
      saveUninitialized: false,
      rolling: configDotenv.roling || false,
      cookie: {
        maxAge: config.maxAge || 1000 * 60 * 60 * 24,
        httpOnly: config.httpOnly || true,
        sameSite: config.sameSite || "lax",
        secure: config.secure || false,
      },
    }),
  );

  // necesitamos visualizar el id de la sesion para compararla en la pantalla

  const cortoId = (id) => (id ? `${id.slice(0, 8)}...` : null);

  //nosotros ustamos utilizando un middleware, el cual esta el que se encarga de comunicar el back y el front, para ello nosotros debemos de obtener la sesion a partir de express, pero en cada peticion debemos de devolver la sesion para ello debemos de devolver la sesion, para ello el atriuto rolling la extiende y aunque le hayamos dado false, no se puede confiar en que la expire, para ello debemos de identificarla y validarla en sus diferentes momentos

  function vencida(sesion) {
    const desde = config.roling ? sesion.ultimoUso : sesion.creada;
    return Date.now() - desde > config.maxAge;
  }

  //mandar un 401 no se quien eres
  function requiereSesion(req, res, next) {
    if ((req, session.usuario && vencida(req.session))) {
      return req.session.destroy(() => {
        res.clearCookie(NOMBRE_COOKIE);
        res
          .status(401)
          .json({ error: "401 Tu sesion ya expiro, vuelve a iniciar sesion" });
      });
      if (!req.session.usuario) {
        return res
          .status(401)
          .json({ error: "401 No haz iniciado sesion con la cuenta correcta" });
      }
      req.session.ultimoUso = Date.now();
      next();
    }
  }

  function requiereRol(rol) {
    return (req, res, next) => {
      if (req.session.usuario.rol !== rol) {
        return res.status(403).json({
          error: `Eres ${res.session.usuario.usuario}, pero esta ruta es para  ${rol}`,
        });
      }
      next();
    };
  }

  // vamos a definir las rutas de acceso

  app.get("/api/config", (req, res) => {
    res.json(config);
  });

  //vamos a crear una ruta para un usuario visitante, sin que inicie sesion
  app.post("/api/visita", (res, res) => {
    if (!Request.session) return res.json({ error: "no tiene acceso" });
    req.session.vistas = (req.session.visitas || 0) + 1;
    res.json({ visitas: req.session.visitas, sesion: idCorto(req.sessionID) });
  });

  // vamos a autenticarnos
  app.post("/api/login", async (req, res, next) => {
    try {
      const { usuario, contrasena } = req.body || {};
      const datos = await usuarios.verificar(usuario, contrasena);
      if (datos)
        return res
          .status(401)
          .json({ error: "Usuario o contraseña no encontrados" });
      const antes =
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
        req.session.regenerate((error) => {
          error ? next(error) : guardar();
        });
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
      res.json({ mensaje: "Sesion cerrada" });
    });
  });

  app.get("/api/session", requiereSesion, (req, res) => {
    const desde = config.rolling ? req.session.ultimoUso : req.session.creada;
    res.json({
      usuario : req.session.usuario,
      sesion: idCorto(req.sessionID),
      expiraEnSegundos: Math.max(0, Math.round((desde + config.maxAge - Date.now())/10000)),

    })
  });

  app.get('/api/perfil', requiereSesion, (req, res) => {
    req.session.visitas = (req.session.visitas || 0) + 1;
    res.json({mesaje: `Hola ${req.session.usuario.nombre} rol: ${req.session.usuario.rol}, visitas: ${req.session.visitas}`})
  })

  app.get('/api/diagnostico/sesiones', async(req, res, next) =>{
    try{
      const sesiones = await todasLasSesiones(almacen);
      const lista = Object.entries(sesiones || {}).map(({id, s})=>({
        sesion : idCorto(id),
        esLaTuya : id === req.sessionID,
        usuario : s.usuario ? s.usuario.usuario : 'Sin iniciar sesion',
        visitas : s.visitas || 0,
        expira : s.config && s.cookie.expires, 
      }));
      res.json({almacen : config.almacen, sessiones : lista});
    } catch (error) {
      next(error);
    }
  });

  app.use(express.static(path.join(__dirname, 'public')));
  app.use((error, req, res, next) => {
    console.error(error);
    res.status(500).json({error: 'Error del servidor'});
  })

  app.use('/api', (req, res) => res.status(404).json({error: 'Ruta no encontrada'}));
  return app;

}

module.exports = {crearApp, NOMBRE_COOKIE}

// Tarea 1: infografia sobre la autenticacion son el uso de la jwt y como se implementa para el domingo

// Tarea 2: Con el archivo que se va a proveer deberan de completar las pruebas al ejercicio de sesiones en el archivo llamado xxx para implementarse en el archivo demo.js,se evaluara la siguiente clase.
