const { ipcRenderer } = require('electron');

ipcRenderer.on('kryvex:permissions:request', (_event, request) => {
  ipcRenderer.send('test:permission-answer', request.id, request.origin);
});
