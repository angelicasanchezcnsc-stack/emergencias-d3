// Almacén local del celular (IndexedDB). Guarda la sesión, la copia de la base
// y las llaves de los sobres como objetos no exportables.

const BD = 'emergencias-d3';
let abierta;

function abrir() {
  if (!abierta) {
    abierta = new Promise((ok, mal) => {
      const r = indexedDB.open(BD, 1);
      r.onupgradeneeded = () => r.result.createObjectStore('kv');
      r.onsuccess = () => ok(r.result);
      r.onerror = () => mal(r.error);
    });
  }
  return abierta;
}

async function operar(modo, fn) {
  const bd = await abrir();
  return new Promise((ok, mal) => {
    const tx = bd.transaction('kv', modo);
    const r = fn(tx.objectStore('kv'));
    tx.oncomplete = () => ok(r && r.result);
    tx.onerror = () => mal(tx.error);
  });
}

export const leer = clave => operar('readonly', s => s.get(clave));
export const guardar = (clave, valor) => operar('readwrite', s => s.put(valor, clave));
export const borrar = clave => operar('readwrite', s => s.delete(clave));
export const limpiar = () => operar('readwrite', s => s.clear());
