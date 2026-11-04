# PresuFactu

Aplicación web para gestionar **clientes, presupuestos y facturas**, con panel de control, ajustes de empresa/impuestos/moneda, generación de PDF mediante impresión y **sincronización con Google Sheets**.

Está hecha únicamente con **HTML, CSS y JavaScript** (sin frameworks ni compilación), lista para publicar en **GitHub Pages**.

---

## Funcionalidades

- **Acceso con usuario y PIN** (local, guardado con PBKDF2-SHA256 + sal aleatoria).
- **Panel** con facturación del año, cobrado, pendiente, presupuestos abiertos, gráfico de 6 meses y actividad reciente.
- **CRUD de clientes** con búsqueda por nombre, NIF, email, teléfono o ciudad.
- **Presupuestos y facturas**:
  - líneas con cantidad, precio, descuento por línea e IVA por línea;
  - descuento global;
  - IVA **21 %, 10 %, 4 % y exento** (ampliable en Ajustes);
  - retención de IRPF opcional;
  - estados, vencimientos, forma de pago y notas;
  - numeración automática configurable (`FAC-2026-0001`);
  - duplicar, editar, eliminar, **convertir presupuesto en factura** y marcar como pagada;
  - vista previa e **impresión / Guardar como PDF** con diseño profesional.
- **Ajustes**:
  - datos de la empresa y logo;
  - tipos de IVA e IRPF;
  - moneda, símbolo y decimales;
  - numeración y prefijos;
  - plazos, notas y textos legales;
  - conexión con Google Sheets;
  - seguridad (cambiar usuario/PIN, bloquear, cerrar sesión);
  - copias de seguridad JSON y exportaciones CSV.
- **Google Sheets** mediante Google Apps Script: subir, descargar y sincronización automática opcional.
- **Tema claro/oscuro**, diseño adaptable a móvil y bloqueo por inactividad (30 min).

---

## 1. Probarlo en tu ordenador

No necesita instalación. Puedes abrir `index.html` directamente, aunque se recomienda un servidor local para que el navegador trate la página como un origen seguro:

```bash
# Opción con Python
python -m http.server 8080

# Opción con Node
npx serve .
```

Después abre `http://localhost:8080`.

En el primer arranque te pedirá crear un **usuario y un PIN** (mínimo 4 caracteres). Después puedes:

1. Ir a **Ajustes → Empresa** y completar tus datos.
2. Configurar **Impuestos**, **Moneda** y **Numeración**.
3. Añadir clientes y crear tu primer presupuesto o factura.

---

## 2. Publicarlo en GitHub Pages

1. Crea un repositorio en GitHub (puede ser público o privado; Pages necesita público en cuentas gratuitas).
2. Sube todo el contenido de esta carpeta a la rama `main`.
3. En GitHub entra en **Settings → Pages**.
4. En *Build and deployment* elige **Deploy from a branch**, rama `main` y carpeta `/ (root)`.
5. Guarda y espera un minuto. La app quedará en:
   `https://TU-USUARIO.github.io/TU-REPO/`

Comandos de ejemplo para subirlo:

```bash
git init
git add .
git commit -m "PresuFactu inicial"
git branch -M main
git remote add origin https://github.com/TU-USUARIO/TU-REPO.git
git push -u origin main
```

> Al ser una web estática, los datos se guardan en el navegador (`localStorage`) y la copia en la nube se hace en tu Google Sheets. No hay servidor propio ni base de datos.

---

## 3. Conectar Google Sheets (recomendado)

Google Sheets no permite escribir desde JavaScript del navegador de forma segura. Por eso se usa una **Web App de Google Apps Script** incluida en `apps-script/Code.gs`, que actúa como API privada.

### Paso a paso

1. **Crea una hoja de cálculo** nueva en [Google Sheets](https://sheets.google.com). El nombre puede ser `PresuFactu · Datos`.
2. Abre **Extensiones → Apps Script**.
3. Borra el código que aparezca y pega **todo** el contenido de [`apps-script/Code.gs`](apps-script/Code.gs).
4. Busca la constante `TOKEN` y cámbiala por una clave privada larga, por ejemplo:
   ```js
   var CONFIG = {
     TOKEN: 'pf_9f3k2m8x7q1w5e4r6t0y',
     SHEET_ID: '',
     ...
   };
   ```
   Guarda el proyecto.
5. Pulsa **Implementar → Nueva implementación → Aplicación web**.
   - **Descripción:** PresuFactu
   - **Ejecutar como:** Yo
   - **Quién tiene acceso:** Cualquier persona
   
   > Es necesario «Cualquier persona» para que la app estática pueda llamar a la API sin login de Google. La protección real es el **token secreto**.
6. Autoriza los permisos con tu cuenta de Google.
7. Copia la URL de implementación, que termina en **`/exec`**:
   `https://script.google.com/macros/s/AKfy.../exec`
8. En PresuFactu entra en **Ajustes → Google Sheets**, pega la URL y el mismo token.
9. Pulsa **Probar conexión** y después **Subir a Sheets**.

La primera subida crea automáticamente estas hojas:

| Hoja | Contenido |
|---|---|
| `Estado` | Copia completa en JSON (oculta, no editar) |
| `Info` | Fecha de última sincronización |
| `Clientes` | Copia legible de clientes |
| `Documentos` | Copia legible de presupuestos y facturas |
| `Ajustes` | Configuración de empresa, impuestos, moneda y numeración |

> Las hojas legibles se regeneran en cada sincronización. Si editas `Estado` a mano puedes corromper la sincronización. Usa siempre la app.

### Sincronización automática

Actívala en **Ajustes → Google Sheets**. Cada vez que guardes un cliente, documento o ajuste, se subirá el estado completo a los ~2 segundos.

### Trabajar desde varios dispositivos

- La app **no fusiona cambios**: el último que sube gana.
- Al empezar en un dispositivo nuevo, configura la URL y el token y pulsa **Descargar de Sheets**.
- Evita editar los mismos datos en dos dispositivos a la vez.

### Si cambias el código del Apps Script

Vuelve a **Implementar → Gestionar implementaciones → Editar → Nueva versión**. Si no, Google seguirá ejecutando la versión antigua.

---

## 4. Impresión y PDF

En la vista previa de cualquier documento pulsa **Imprimir / PDF**. Se abrirá el diálogo del navegador:

- Destino: **Guardar como PDF**.
- Formato **A4**, márgenes predeterminados.
- Activa **Gráficos de fondo** si quieres conservar el color de las etiquetas.

---

## 5. Copias de seguridad

- **Ajustes → Datos → Copia completa (JSON)**: descarga todo (clientes, documentos, ajustes y logo).
- **Restaurar copia JSON**: reemplaza los datos del dispositivo. Si la sincronización automática está activa, también se subirá a la nube.
- Exportaciones **CSV** de clientes, presupuestos y facturas (separador `;` y BOM, compatibles con Excel en español).

Guarda una copia antes de limpiar el navegador o cambiar de dispositivo. `localStorage` se borra si el usuario limpia los datos del sitio.

---

## 6. Seguridad: lo que debes saber

- El PIN protege el acceso a la interfaz **en este dispositivo**. No cifra los datos almacenados en `localStorage`.
- La URL y el token de Apps Script se guardan en `localStorage`. Cualquiera con acceso al dispositivo y al navegador podría leerlos.
- Cualquiera que tenga **la URL `/exec` y el token** puede leer y escribir en tu hoja. Mantenlos privados.
- Si pierdes el PIN, la app permite **restablecer el acceso** en el mismo dispositivo sin borrar los datos. Es una decisión de usabilidad: si necesitas seguridad fuerte, usa un backend con autenticación real.
- Usa la app solo en dispositivos de confianza y mantén activada la verificación en dos pasos de tu cuenta de Google.
- Google puede cancelar la sesión o caducar la implementación si cambias permisos; en ese caso crea una nueva implementación y actualiza la URL.

---

## 7. Estructura del proyecto

```
.
├── index.html                # Estructura de la app y pantallas
├── assets/
│   ├── css/
│   │   └── styles.css        # Estilos, tema claro/oscuro e impresión
│   └── js/
│       ├── auth.js           # Login local con PIN (PBKDF2)
│       ├── store.js          # Estado, CRUD, totales, numeración, CSV
│       ├── sheets.js         # Cliente de la API de Apps Script
│       ├── core.js           # Utilidades, modales, panel y clientes
│       ├── documents.js      # Presupuestos, facturas, PDF
│       ├── settings.js       # Ajustes y sincronización
│       └── app.js            # Arranque y eventos globales
├── apps-script/
│   └── Code.gs               # API para Google Sheets
├── .gitignore                # Archivos locales que no deben subirse
└── README.md
```

No hay dependencias de npm ni proceso de build.

---

## 8. Personalización rápida

- **Colores y tipografía:** variables CSS al inicio de `assets/css/styles.css`.
- **Tipos de IVA iniciales:** se cambian desde la app en **Ajustes → Impuestos**; los valores de fábrica están en `assets/js/store.js`.
- **Formas de pago:** arrays `PAYMENT_METHODS` en `assets/js/documents.js` y `assets/js/settings.js`.
- **Textos legales:** **Ajustes → Facturación**.

---

## 9. Problemas frecuentes

| Problema | Solución |
|---|---|
| «La URL no devuelve JSON…» | La implementación no está publicada como Web App o la URL no termina en `/exec`. Revisa Implementar → Gestionar implementaciones. |
| «Token de acceso incorrecto» | El token de la app y el de `Code.gs` no coinciden. Cópialo de nuevo y guarda. |
| Error 401/403 | Vuelve a implementar con «Ejecutar como: Yo» y «Acceso: Cualquier persona». |
| Los cambios no se reflejan en Sheets | Pulsa **Subir a Sheets**. Si tienes activada la sincronización automática, espera unos segundos. |
| He cambiado el Apps Script y no funciona | Publica una **nueva versión** de la implementación. |
| Al descargar de Sheets desaparecen mis datos | La descarga reemplaza el estado local. Antes de descargar, sube los cambios de este dispositivo o haz una copia JSON. |
| He olvidado el PIN | En la pantalla de acceso pulsa «¿Olvidaste tu PIN?». Se restablece el acceso sin borrar los datos. |
| Quiero empezar de cero | **Ajustes → Datos → Borrar todos los datos locales**. El acceso se conserva. |

---

Hecho para funcionar sin servidores propios: **GitHub Pages + Google Sheets + tu navegador**.
