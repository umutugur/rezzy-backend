// src/sockets/io.js
// Cron job'lar gibi request-dışı bağlamlardan io erişimi için tekil saklayıcı.

let _io = null;

export function setIo(io) {
  _io = io;
}

export function getIo() {
  return _io;
}
