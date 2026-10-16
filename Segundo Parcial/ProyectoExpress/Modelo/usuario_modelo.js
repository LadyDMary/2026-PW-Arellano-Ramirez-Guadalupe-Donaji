const pool = require('../bd-local');

const COLUMNAS_PUBLICAS = 'id, nombre, correo, boleta, rol'

async function listar() {
    const [filas] = await pool.query(`SELECT ${COLUMNAS_PUBLICAS} FROM usuarios ORDER BY id`);
    return filas;
}

// Obtener por id

async function obtenerPorId() {
    const [filas] = await pool.query(`SELECT ${COLUMNAS_PUBLICAS} FROM usuarios where id = ?`);
    return filas[0];
}

// Registrar

async function crear({nombre, correo, contrasenaHash, boleta, rol}) {
    const{info} = await pool.query(
        `INSERT INTO usuarios (nombre, correo, constrasena_hash, boleta, rol) VALUES (?,?,?,?,?)`, [nombre, correo, contrasenaHash, boleta, rol || 'alumno']
    );

    return obtenerPorId(info.insertId)
}

// actualizar

async function actualizar(id, {nombre, correo, rol}) {
    const cambios = Object.entries({nombre, correo, rol}).filter(([, valor]) => valor !== undefined);
    if(cambios.length === 0 ) return obtenerPorId(id);
    const columnas = cambios.map(([columna]) => `${columna} = ?`).join(', ');
    
    const [info] = await pool.query(`UPDATE usuarios SET ${columnas} WHERE id = ?`, [...cambios.map(([, valor]) => valor), id]);
 
    if(info.affectedRows === 0) return undefined;
    return obtenerPorId(id);

}

// eliminar

async function Eliminar(id) {
    const [filas] = await pool.query(`DELETE FROM usuarios WHERE id = ?`, [id]);
    return info.affectedRows > 0;
}

// buscar por correo hash

async function buscarPorCorreoConHash(correo) {
    const [filas] = await pool.query('SELECT * FROM usuarios where correo = ?', [correo]);
    return filas[0];
}

// deberan de crear los modelos de las tablas talleres y asistencia
// tqlleres tuene registraralumno al taller, consultar todosl los talleres
//asistencia tiene registrar asistencia, consultar asistencia de taller

module.exports = {listar, obtenerPorId, crear, actualizar, Eliminar, buscarPorCorreoConHash}

