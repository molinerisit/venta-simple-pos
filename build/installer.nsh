; installer.nsh — script custom incluido por electron-builder en el instalador NSIS
; Se ejecuta después de que VentaSimple queda instalado.

!macro customInstall
  ; Instalar RustDesk solo si no está instalado todavía
  IfFileExists "$PROGRAMFILES64\RustDesk\rustdesk.exe" RustDeskYaInstalado RustDeskFaltante

  RustDeskFaltante:
    DetailPrint "Instalando Soporte VentaSimple (RustDesk)..."
    File "/oname=$TEMP\rustdesk-vs-setup.exe" "${BUILD_RESOURCES_DIR}\rustdesk-installer.exe"
    ExecWait '"$TEMP\rustdesk-vs-setup.exe" --silent-install'
    Delete "$TEMP\rustdesk-vs-setup.exe"
    Goto RustDeskListo

  RustDeskYaInstalado:
    DetailPrint "Soporte VentaSimple ya instalado, omitiendo."

  RustDeskListo:
!macroend

!macro customUnInstall
  ; No desinstalar RustDesk al quitar VentaSimple
  ; (el cliente puede necesitarlo independientemente)
!macroend
