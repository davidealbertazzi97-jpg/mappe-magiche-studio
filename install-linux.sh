#!/usr/bin/env bash
set -euo pipefail

APP_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
USER_HOME="$(getent passwd "$(id -u)" | cut -d: -f6)"
DATA_DIR="${XDG_DATA_HOME:-${USER_HOME}/.local/share}"
APP_INSTALL_DIR="${DATA_DIR}/mappe-magiche-studio"
APP_DIR_DESKTOP="${DATA_DIR}/applications"
APP_ICON_DIR="${DATA_DIR}/icons/hicolor/scalable/apps"
DESKTOP_FILE="${APP_DIR_DESKTOP}/mappe-magiche-studio.desktop"
ICON_FILE="${APP_ICON_DIR}/mappe-magiche-studio.svg"
APP_URI="$(python3 -c 'from pathlib import Path; import sys; print(Path(sys.argv[1]).as_uri())' "${APP_INSTALL_DIR}/index.html")"

mkdir -p "${APP_INSTALL_DIR}" "${APP_DIR_DESKTOP}" "${APP_ICON_DIR}"
mkdir -p "${APP_INSTALL_DIR}/fonts"
for file in index.html style.css app.js README.md icon.svg; do
  install -m 0644 "${APP_DIR}/${file}" "${APP_INSTALL_DIR}/${file}"
done
cp -a "${APP_DIR}/fonts/." "${APP_INSTALL_DIR}/fonts/"
install -m 0644 "${APP_DIR}/icon.svg" "${ICON_FILE}"
cat > "${DESKTOP_FILE}" <<EOF
[Desktop Entry]
Type=Application
Name=Mappe Magiche Studio
Comment=Crea mappe concettuali per lo studio
Exec=xdg-open ${APP_URI}
Icon=${ICON_FILE}
Terminal=false
Categories=Education;
Keywords=mappe;concetti;scuola;studio;
StartupNotify=true
EOF
chmod 0644 "${DESKTOP_FILE}"

if command -v desktop-file-validate >/dev/null 2>&1; then
  desktop-file-validate "${DESKTOP_FILE}"
fi
if command -v update-desktop-database >/dev/null 2>&1; then
  update-desktop-database "${APP_DIR_DESKTOP}" >/dev/null
fi

printf 'Mappe Magiche Studio installata in %s\n' "${APP_INSTALL_DIR}"
printf 'Launcher nel menu applicazioni: %s\n' "${DESKTOP_FILE}"
