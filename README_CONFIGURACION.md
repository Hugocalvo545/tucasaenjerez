# Configuración y mantenimiento — JLA Apartments

## Cómo hacer un deploy

> ⚠️ **Nunca uses `firebase deploy` directamente.** Usa siempre el script
> para que la versión del service worker se actualice automáticamente.
> Sin esto, los dispositivos móviles con la PWA instalada no recibirán
> la actualización.

**Windows (PowerShell):**
```powershell
.\deploy.ps1
```

**Mac / Linux:**
```bash
bash deploy.sh
```

El script hace automáticamente:
1. Obtiene la fecha actual (`YYYYMMDD`)
2. Actualiza la versión del SW en `public/sw.js` y `service-worker.js`
3. Ejecuta `firebase deploy --only hosting`

---

## Qué hace cada service worker

| Archivo | Alcance | Estrategia |
|---|---|---|
| `public/sw.js` | App pública (`/multi/`) | Network-first para JS/CSS/HTML |
| `public-admin/intranet/service-worker.js` | Intranet | Network-first para JS/CSS/HTML |

**Network-first** = siempre intenta la red; usa caché solo si no hay conexión.
Esto garantiza que los archivos JS/CSS/HTML siempre estén actualizados.

---

## Crear/regenerar iconos PWA

Los iconos actuales (`icon-192.png`, `icon-512.png`) se generaron a partir de
`img/Logo-JLA.jpg`. Para regenerarlos con un nuevo logo, ejecuta en PowerShell:

```powershell
Add-Type -AssemblyName System.Drawing
$src = ".\public\img\Logo-JLA.jpg"   # cambia por el nuevo logo si procede
$img = [System.Drawing.Image]::FromFile((Resolve-Path $src))
foreach ($size in @(192, 512)) {
  $bmp = New-Object System.Drawing.Bitmap($img, $size, $size)
  $bmp.Save(".\public\img\icon-$size.png", [System.Drawing.Imaging.ImageFormat]::Png)
  $bmp.Save(".\public-admin\img\icon-$size.png", [System.Drawing.Imaging.ImageFormat]::Png)
  $bmp.Dispose()
}
$img.Dispose()
Write-Host "Iconos generados."
```

---

## Limpiar caché en dispositivos con la PWA instalada

Tras un deploy, si un dispositivo sigue mostrando la versión antigua:

### Opción 1 — Automática (recomendada)
La app detecta el nuevo service worker al abrir y recarga la página
automáticamente. Esto ocurre en la primera apertura tras el deploy.
Cierra y vuelve a abrir la app si no se actualiza solo.

### Opción 2 — Manual en Android (Chrome)
1. Ve a **Ajustes → Aplicaciones → Chrome** (o la app instalada).
2. Toca **Almacenamiento → Borrar caché**.
3. Vuelve a abrir la app.

### Opción 3 — Manual en iOS (Safari)
1. Ve a **Ajustes → Safari → Avanzado → Datos de sitios web**.
2. Busca el dominio (`app.tucasaenjerez.com` o `admin.tucasaenjerez.com`).
3. Desliza para eliminar y vuelve a abrir.

### Opción 4 — Desde el navegador (desarrollo)
1. Abre las herramientas de desarrollador (F12).
2. Ve a **Application → Service Workers**.
3. Pulsa **Unregister** y recarga la página.

---

## URLs de la app

| | URL |
|---|---|
| App pública (usuarios) | https://app.tucasaenjerez.com/multi/ |
| Intranet (administración) | https://admin.tucasaenjerez.com/intranet/ |
| Consola Firebase | https://console.firebase.google.com/project/tucasaenjerez-3362a/overview |
