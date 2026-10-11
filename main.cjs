const { app, BrowserWindow, Menu, dialog } = require('electron');
const path = require('node:path');

const APP_NAME = 'Mappe Magiche Studio';
const APP_PAGE = path.join(__dirname, 'index.html');

app.setName(APP_NAME);

function createMenu() {
  const template = [
    {
      label: 'File',
      submenu: [
        { role: 'close', label: 'Chiudi finestra' },
        { role: 'quit', label: 'Esci' },
      ],
    },
    { role: 'editMenu', label: 'Modifica' },
    {
      label: 'Visualizza',
      submenu: [
        { role: 'reload', label: 'Ricarica' },
        { type: 'separator' },
        { role: 'resetZoom', label: 'Dimensione predefinita' },
        { role: 'zoomIn', label: 'Ingrandisci' },
        { role: 'zoomOut', label: 'Riduci' },
        { type: 'separator' },
        { role: 'togglefullscreen', label: 'Schermo intero' },
      ],
    },
    {
      label: 'Aiuto',
      submenu: [
        {
          label: 'Informazioni su Mappe Magiche Studio',
          click: () => dialog.showMessageBox({
            type: 'info',
            title: `Informazioni su ${APP_NAME}`,
            message: APP_NAME,
            detail: `Versione ${app.getVersion()}\nLe mappe vengono salvate in questo dispositivo.`,
          }),
        },
      ],
    },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

function createWindow() {
  const window = new BrowserWindow({
    width: 1440,
    height: 940,
    minWidth: 920,
    minHeight: 640,
    backgroundColor: '#f7f8ff',
    autoHideMenuBar: true,
    icon: path.join(__dirname, 'build', 'icons', 'app.png'),
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      spellcheck: true,
    },
  });

  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  window.loadFile(APP_PAGE);
}

app.whenReady().then(() => {
  createMenu();
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
