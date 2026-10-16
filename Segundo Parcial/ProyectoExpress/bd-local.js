const mysql = require('mysql2/promise');

// la base de datos local la usaremos para berificar pruebas internas, se buscara que deben crea cada uno una cuenta en supabase.com y generaremos una api para conectarnos a un servicio en bd en la nube, para ello debemos configurar el archivo .env

const pool = mysql.createPool({
    host:'localhost',
    prot:'3306',
    user:'1234',
    password:'n0m3l0',
    database:'cecyt9_local',
    dateStrings:true,
    
});