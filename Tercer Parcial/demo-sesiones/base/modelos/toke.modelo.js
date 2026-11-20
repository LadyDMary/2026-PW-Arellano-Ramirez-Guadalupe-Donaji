function crearModeloToken(pool) {
  // necesitamos una funcion que se encarge de poder insertar dentro de la bd los tokens que estaran revocados para que no se vuelvan a utilizar

  async function revocar(jti, usuario, exp) {
    await pool.query(
      "INSERT INTO tokents_revocados (jti, usuario, expira) VALUES (?, ?, FROM_UNIXTIME(?))",
      [jti, usuario, exp],
    );
  }

  async function estaRevocado(jti) {
    const [filas] = await pool.query(
      "SELECT 1 FROM tokens_revocados WHERE jti=?",
      [String(jti || "")],
    );
    return filas.length > 0;
  }

  // una funcion para consultar todos los tokens revocados

  async function listar() {
    const [filas] = await pool.query(
      "SELECT jti, usuario, expira, revocado_en FROM tokens_revocados ORDER BY revocado_en DESC, jti",
    );
    return filas;
  }

  return { revocar, estaRevocado, listar };
}
