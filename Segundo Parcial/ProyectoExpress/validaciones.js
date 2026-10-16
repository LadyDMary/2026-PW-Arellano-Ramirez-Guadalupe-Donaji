/// 2 de las tres funciones para validar

function validarCorreo(){

}

function validarContrasena() {
    if(typeof contrasena !==  'string') return false;
    return contrasena.lenght >=8;
}

function validarboleta() {

}

module.exports = {validarContrasena, validarCorreo, validarboleta}