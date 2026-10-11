# Mappe Magiche Studio

Applicazione per creare mappe concettuali illustrate, progettata per lo studio e la scuola secondaria di primo grado. Funziona nel browser e come applicazione desktop per Linux e Windows.

## Funzioni

- Crea e sposta forme, note, immagini e mascotte; aggiungi testo e didascalie.
- Collega gli elementi con frecce orientate, bidirezionali o lasciate sospese. I punti di aggancio sono mostrati durante il trascinamento.
- Modifica forme e collegamenti dal menu contestuale; ridimensiona gli elementi e formatta il testo.
- Scegli tra 16 caratteri open source, incluso OpenDyslexic. I font sono inclusi per l’uso offline; le licenze sono in `fonts/licenses/`.
- Salva automaticamente la mappa nel browser o nell’app desktop; importa ed esporta file JSON e immagini PNG.
- Cerca immagini su Wikimedia Commons o inserisci un URL.

La scelta del carattere è personale: l’app permette di confrontare stili diversi e non associa un font a una diagnosi né promette benefici clinici.

## Avvio rapido

### Browser

Apri `index.html` con un browser aggiornato. Non serve un server né una connessione per creare e salvare mappe. La ricerca su Wikimedia Commons e il caricamento di immagini web richiedono internet.

### Linux

Scarica l’AppImage dalla sezione **Releases**, rendila eseguibile e avviala:

```bash
chmod +x Mappe-Magiche-Studio-*.AppImage
./Mappe-Magiche-Studio-*.AppImage
```

In alternativa, esegui `./install-linux.sh` per installare la versione browser nel menu delle applicazioni. Per usare l’app desktop installata, scegli l’AppImage.

### Windows

Scarica `Mappe-Magiche-Studio-Setup-*.exe` dalla sezione **Releases**, avvialo e segui la procedura di installazione. L’installer installa l’app per l’utente corrente e può creare collegamenti nel menu Start e sul desktop.

## Uso

- Trascina una forma dalla palette sulla lavagna o selezionala per aggiungerla al centro.
- Trascina gli elementi per spostarli. Quando trascini un pallino blu, i punti di aggancio diventano visibili; rilascia su una forma per collegarla o nel vuoto per lasciare la linea sospesa.
- Trascina una punta libera per agganciarla in seguito. Fai doppio clic su una punta collegata per scollegarla e spostarla.
- Seleziona una forma per aprire i comandi rapidi. Il clic destro mostra le opzioni di modifica, duplicazione, eliminazione e dimensione; puoi anche ridimensionare dall’angolo in basso a destra.
- Fai doppio clic su una forma per modificarne testo e colore. Per le immagini puoi aggiungere una didascalia; per le mascotte puoi cambiare personaggio e fumetto.
- Testi e didascalie vanno a capo entro la forma. Il carattere e le dimensioni si adattano allo spazio disponibile.
- Fai clic destro su una freccia per eliminarla, renderla bidirezionale o invertirne il verso.
- Usa i comandi di zoom per ingrandire, ridurre o adattare la mappa alla lavagna.
- La mappa si salva automaticamente. **Esporta** crea un file JSON trasferibile; **Importa** lo riapre; **PNG** scarica un’immagine della mappa.

## Tasti rapidi

- `Ctrl+S` / `⌘S`: salva la mappa.
- `Canc` / `Backspace`: elimina la forma o il collegamento selezionato.
- `Invio`: modifica la forma selezionata.
- Clic destro: apre le opzioni dell’elemento.
- `+` / `-`: ingrandisce o riduce la lavagna; `0`: adatta la mappa.
- `Esc`: chiude la finestra aperta.

## Dati e privacy

Mappe e testi vengono conservati localmente nel profilo del browser o dell’app desktop. Non vengono inviati a un server dell’app. La ricerca immagini usa Wikimedia Commons; il caricamento di un’immagine web contatta l’indirizzo scelto dall’utente.

## Caratteri e licenze di terze parti

Sono inclusi Atkinson Hyperlegible Next, Fira Sans, IBM Plex Sans, Inter, JetBrains Mono, Lato, Lexend, Merriweather, Noto Sans, Nunito Sans, Open Sans, OpenDyslexic, Roboto, Source Sans 3, Source Serif 4 e Ubuntu Sans. I file WOFF2 sono forniti localmente e non vengono scaricati durante l’uso. I relativi testi di licenza e le note di copyright sono in `fonts/licenses/`; i font non sono stati modificati.

## Compilazione

Requisiti: Node.js 22.12 o successivo e npm. Le dipendenze di build sono fissate in `package-lock.json`.

```bash
npm ci
npm start
npm run build:linux
```

La build Linux crea l’AppImage in `dist/`. Per creare l’installer Windows x64, esegui su Windows:

```powershell
npm ci
npm run build:windows
```

Il comando genera l’installer NSIS in `dist/`. Le immagini delle macchine virtuali e gli altri file di test non fanno parte del repository.

## Licenza

La licenza del codice dell’app verrà aggiunta prima della pubblicazione pubblica del repository. Le licenze dei font restano quelle elencate in `fonts/licenses/`.

---

# Mappe Magiche Studio (English)

An application for creating illustrated concept maps, designed for studying and middle school. It runs in a browser and as a desktop application on Linux and Windows.

## Features

- Create and move shapes, notes, images, and mascots; add text and captions.
- Connect items with directional or two-way arrows, or leave a line unattached. Connection points appear while you drag an endpoint.
- Edit shapes and connections from their context menus; resize items and format text.
- Choose from 16 open-source fonts, including OpenDyslexic. Fonts are bundled for offline use; their licenses are in `fonts/licenses/`.
- Autosave maps in the browser or desktop app; import and export JSON files and PNG images.
- Search Wikimedia Commons for images or enter an image URL.

Font preference is personal: the app lets students compare different styles. It does not associate a font with a diagnosis or promise clinical benefits.

## Quick start

### Browser

Open `index.html` in an up-to-date browser. No server or internet connection is needed to create and save maps. Searching Wikimedia Commons and loading web images require internet access.

### Linux

Download the AppImage from **Releases**, make it executable, and run it:

```bash
chmod +x Mappe-Magiche-Studio-*.AppImage
./Mappe-Magiche-Studio-*.AppImage
```

Alternatively, run `./install-linux.sh` to add the browser version to the applications menu. Choose the AppImage to use the desktop application.

### Windows

Download `Mappe-Magiche-Studio-Setup-*.exe` from **Releases**, run it, and follow the installation steps. The installer installs the app for the current user and can add shortcuts to the Start menu and desktop.

## Using the app

- Drag a shape from the palette to the board, or select it to add it in the center.
- Drag items to move them. When you drag a blue handle, connection points appear; drop it on a shape to connect it or in empty space to leave the line suspended.
- Drag a free endpoint to attach it later. Double-click a connected endpoint to detach and move it.
- Select a shape to show its quick actions. Right-click for edit, duplicate, delete, and size options; you can also resize from the lower-right corner.
- Double-click a shape to edit its text and color. Add a caption below an image or change a mascot and its speech bubble.
- Text and captions wrap inside their shapes. Font size adapts to the available space.
- Right-click an arrow to delete it, make it two-way, or reverse its direction.
- Use the zoom controls to zoom in, zoom out, or fit the map to the board.
- Maps autosave. **Export** creates a portable JSON file; **Import** opens it again; **PNG** downloads an image of the map.

## Keyboard shortcuts

- `Ctrl+S` / `⌘S`: save the map.
- `Delete` / `Backspace`: delete the selected shape or connection.
- `Enter`: edit the selected shape.
- Right-click: open the item's options.
- `+` / `-`: zoom in or out; `0`: fit the map to the board.
- `Esc`: close the open dialog.

## Data and privacy

Maps and text are stored locally in the browser or desktop app profile. They are not sent to an app server. Image search uses Wikimedia Commons; loading a web image contacts the address selected by the user.

## Fonts and third-party licenses

The app bundles Atkinson Hyperlegible Next, Fira Sans, IBM Plex Sans, Inter, JetBrains Mono, Lato, Lexend, Merriweather, Noto Sans, Nunito Sans, Open Sans, OpenDyslexic, Roboto, Source Sans 3, Source Serif 4, and Ubuntu Sans. WOFF2 files are served locally and are not downloaded while using the app. Their license texts and copyright notices are in `fonts/licenses/`; the fonts have not been modified.

## Build

Requirements: Node.js 22.12 or later and npm. Build dependencies are pinned in `package-lock.json`.

```bash
npm ci
npm start
npm run build:linux
```

The Linux build creates an AppImage in `dist/`. To create the Windows x64 installer, run on Windows:

```powershell
npm ci
npm run build:windows
```

This generates the NSIS installer in `dist/`. Virtual machine images and other test files are not part of the repository.

## License

The application source license will be added before the repository is made public. Font licenses remain listed in `fonts/licenses/`.
