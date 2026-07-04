/**
 * ponytail: imprimir link del frontend en consola al iniciar el servidor
 * Sin dependencias ni abstracciones complejas.
 */
try {
  var url = ($app.settings().meta.appUrl || "http://127.0.0.1:8090").replace(/\/$/, "");
  console.log("├─ Frontend:  " + url + "/client/index.html (o " + url + "/)");
} catch (err) {
  console.log("├─ Frontend:  http://127.0.0.1:8090/client/index.html (o /)");
}
