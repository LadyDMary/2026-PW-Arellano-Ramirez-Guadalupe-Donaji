
const taller = {
  nombre: 'Introducción a Python',
  instructor: 'Ing. María López',
  cupo: 25,
  inscritos: 25,
};

// TODO: Object.keys — imprime solo los nombres de las propiedades de `taller`

console.log("Manejo de keys")
console.log(Object.keys(taller));

// TODO: Object.values — imprime solo los valores

console.log("Manejo de valores en un objeto")
console.log(Object.values(taller));

// TODO: Object.entries — recorre con for..of e imprime "campo: valor" de cada propiedad

console.log("Manejo de propiedades de un objeto")
for (const [campo, valor] of Object.entries.taller) {
  console.log(`${campo}: ${valor}`);
}

// TODO: JSON.stringify — convierte `taller` a texto (guárdalo en `textoJson`) e imprímelo

console.log('Transformacion de JSON a Cadena')
const textJson = JSON.stringify(taller, null, 2);
console.log(textJson)
console.log('tipo: ', typeof textJson);

// TODO: JSON.parse — convierte `textoJson` de vuelta a objeto (guárdalo en `objetoDeVuelta`)
//       e imprime `objetoDeVuelta.nombre`

console.log("Ahora de JSON a objeto");
const objetoDeVuelta = JSON.parse(textJson);
console.log('tipo: ' + typeof objetoDeVuelta);