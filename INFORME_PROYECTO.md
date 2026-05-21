# Informe tecnico del proyecto Mini CRM

## 1. Descripcion general

Este proyecto es una aplicacion web sencilla para gestionar leads de un mini CRM. Permite:

- Crear leads con nombre, email, fuente y estado.
- Consultar el listado completo de leads.
- Buscar leads por nombre o email.
- Filtrar leads por estado.
- Editar leads existentes.
- Eliminar leads.
- Guardar la informacion de forma persistente en una base de datos SQLite local.

La aplicacion esta pensada como una app monolitica pequena: el backend sirve tanto la API como los archivos estaticos del frontend. No usa framework frontend; la interfaz esta hecha con HTML, CSS y JavaScript nativo.

## 2. Estructura de carpetas y archivos

```text
mini-crm-codex/
├── .gitignore
├── INFORME_PROYECTO.md
├── package.json
├── package-lock.json
├── data/
│   └── mini-crm.sqlite
├── public/
│   ├── index.html
│   ├── styles.css
│   └── app.js
└── src/
    └── server.js
```

Tambien existe una carpeta `node_modules/`, que contiene las dependencias instaladas por npm, y una carpeta `.npm-cache/`. Ambas son carpetas locales de instalacion/cache y no forman parte del codigo fuente principal.

## 3. Responsabilidad de cada archivo principal

### `package.json`

Define la configuracion basica del proyecto Node.js:

- Nombre, version, descripcion y licencia.
- Archivo principal: `src/server.js`.
- Scripts disponibles:
  - `npm start`: arranca el servidor.
  - `npm run dev`: arranca el servidor con recarga automatica usando `node --watch`.
- Dependencias:
  - `express`: servidor HTTP y API REST.
  - `sqlite3`: conexion con la base de datos SQLite.

### `package-lock.json`

Bloquea las versiones exactas de las dependencias instaladas. Sirve para que otras personas puedan reproducir la misma instalacion con `npm install`.

### `.gitignore`

Indica que no deberian subirse al repositorio carpetas y archivos locales como:

- `node_modules/`
- `.npm-cache/`
- `.env`
- logs de npm

### `src/server.js`

Es el backend completo de la aplicacion. Sus responsabilidades principales son:

- Crear y configurar la app de Express.
- Leer JSON en las peticiones con `express.json()`.
- Servir el frontend desde la carpeta `public/`.
- Crear la carpeta `data/` si no existe.
- Abrir la base de datos SQLite en `data/mini-crm.sqlite`.
- Crear la tabla `leads` si todavia no existe.
- Exponer los endpoints de la API:
  - `GET /leads`: devuelve todos los leads.
  - `POST /leads`: crea un nuevo lead.
  - `PUT /leads/:id`: actualiza un lead existente.
  - `DELETE /leads/:id`: elimina un lead.
- Validar que `name` y `email` existan antes de crear o actualizar.
- Gestionar errores y devolver respuestas JSON claras.

La tabla principal se crea con esta estructura:

```sql
CREATE TABLE IF NOT EXISTS leads (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  source TEXT,
  status TEXT NOT NULL DEFAULT 'nuevo',
  createdAt TEXT NOT NULL
);
```

### `public/index.html`

Define la estructura visual de la app:

- Titulo de la pagina.
- Formulario para crear o editar leads.
- Campos del formulario:
  - Nombre.
  - Email.
  - Fuente.
  - Estado.
- Boton para anadir lead o guardar cambios.
- Boton para cancelar la edicion.
- Barra de filtros:
  - Busqueda por nombre o email.
  - Filtro por estado.
  - Contador de leads visibles.
- Tabla donde se muestran los leads.

Este archivo no contiene logica de negocio; solo define la estructura HTML que despues manipula `app.js`.

### `public/styles.css`

Contiene todos los estilos de la interfaz:

- Layout general de la pagina.
- Estilos del formulario.
- Estilos de inputs, selects y botones.
- Estilos de la tabla de leads.
- Badges visuales para los estados:
  - `nuevo`
  - `contactado`
  - `perdido`
- Adaptacion responsive para pantallas pequenas.

### `public/app.js`

Contiene toda la logica del frontend. Sus responsabilidades principales son:

- Capturar referencias a los elementos del DOM.
- Cargar leads desde la API con `GET /leads`.
- Guardar una cache local de leads en `leadsCache`.
- Renderizar la tabla de leads.
- Aplicar busqueda y filtros en el navegador.
- Crear leads con `POST /leads`.
- Editar leads con `PUT /leads/:id`.
- Eliminar leads con `DELETE /leads/:id`.
- Cambiar el formulario entre modo creacion y modo edicion.
- Mostrar mensajes de exito o error.
- Escapar texto antes de insertarlo en la tabla para evitar inyeccion HTML.
- Detectar si la pagina se ha abierto como archivo local (`file://`) y avisar de que debe usarse el servidor local para poder guardar datos.

### `data/mini-crm.sqlite`

Es la base de datos SQLite local donde se guardan los leads. Actualmente contiene la tabla `leads`.

Este archivo almacena datos reales de la aplicacion. En un proyecto compartido conviene decidir si debe versionarse o si debe generarse localmente en cada entorno.

## 4. Flujo completo al crear un lead

Este es el flujo desde el frontend hasta la base de datos cuando una persona crea un lead:

1. La persona abre la app desde el servidor local, normalmente en `http://127.0.0.1:3000`.

2. El navegador carga `public/index.html`, `public/styles.css` y `public/app.js`. Estos archivos los sirve Express desde `src/server.js` usando `express.static("public")`.

3. Al cargarse `app.js`, se ejecuta `loadLeads()`, que llama a `GET /leads` para pintar los leads existentes en la tabla.

4. La persona rellena el formulario con:
   - `name`
   - `email`
   - `source`
   - `status`

5. Al enviar el formulario, `public/app.js` intercepta el evento `submit` con `event.preventDefault()`. Asi evita que el navegador recargue la pagina.

6. `app.js` lee los valores con `FormData` y crea un objeto JavaScript:

```js
const lead = {
  name: formData.get("name").trim(),
  email: formData.get("email").trim(),
  source: formData.get("source").trim(),
  status: formData.get("status")
};
```

7. Como no hay un lead en edicion, el frontend envia una peticion:

```http
POST /leads
Content-Type: application/json
```

con el lead en formato JSON en el cuerpo de la peticion.

8. En el backend, Express recibe la peticion. `express.json()` transforma el JSON del cuerpo en `req.body`.

9. El endpoint `POST /leads` extrae los campos:

```js
const { name, email, source, status = "nuevo" } = req.body;
```

10. El backend valida que existan `name` y `email`. Si falta alguno, responde con codigo `400` y un mensaje de error.

11. Si los datos son validos, el backend crea una fecha en formato ISO:

```js
const createdAt = new Date().toISOString();
```

12. El backend inserta el lead en SQLite mediante una consulta parametrizada:

```sql
INSERT INTO leads (name, email, source, status, createdAt)
VALUES (?, ?, ?, ?, ?)
```

Usar parametros evita concatenar valores directamente dentro del SQL y reduce el riesgo de inyeccion SQL.

13. SQLite guarda el registro en la tabla `leads` y genera automaticamente el `id`.

14. El backend consulta el lead recien creado con:

```sql
SELECT * FROM leads WHERE id = ?
```

15. El backend devuelve al frontend una respuesta `201 Created` con el lead creado en JSON.

16. El frontend recibe la respuesta, resetea el formulario, muestra el mensaje "Lead anadido correctamente." y vuelve a llamar a `loadLeads()`.

17. `loadLeads()` hace de nuevo `GET /leads`, recibe el listado actualizado desde SQLite y vuelve a pintar la tabla.

## 5. Tecnologias utilizadas

- **Node.js**: entorno de ejecucion JavaScript para el backend.
- **Express**: framework HTTP usado para servir la API y los archivos estaticos.
- **SQLite**: base de datos local basada en archivo.
- **sqlite3**: libreria Node.js para conectar con SQLite.
- **HTML5**: estructura de la interfaz.
- **CSS3**: estilos visuales y responsive.
- **JavaScript nativo en navegador**: logica frontend sin frameworks.
- **Fetch API**: comunicacion HTTP entre frontend y backend.
- **npm**: gestion de dependencias y scripts.
- **CommonJS**: sistema de modulos usado en `server.js` mediante `require`.

## 6. Posibles mejoras o ampliaciones futuras

### Mejoras funcionales

- Anadir nuevos campos al lead, como telefono, empresa, cargo, notas o fecha de proximo contacto.
- Anadir estados adicionales, por ejemplo `calificado`, `ganado` o `en seguimiento`.
- Incorporar historial de actividad por lead.
- Permitir ordenar la tabla por columnas.
- Anadir paginacion si el numero de leads crece.
- Exportar leads a CSV o Excel.
- Importar leads desde CSV.
- Crear una vista de detalle para cada lead.

### Mejoras tecnicas

- Separar el backend en varios archivos, por ejemplo:
  - rutas
  - acceso a datos
  - validaciones
  - configuracion de base de datos
- Anadir tests automatizados para los endpoints.
- Centralizar el manejo de errores.
- Validar emails con mas precision en backend.
- Normalizar los valores de `status` para evitar estados no esperados.
- Anadir migraciones de base de datos si el esquema empieza a crecer.
- Usar variables de entorno documentadas para `PORT`, `HOST` y rutas de datos.
- Crear un archivo `README.md` con instrucciones de instalacion y ejecucion.

### Mejoras de seguridad

- Anadir autenticacion si la app va a ser usada por mas de una persona.
- Proteger la API frente a usos no autorizados.
- Anadir limites de tamano para el JSON recibido.
- Validar y sanear mejor los datos de entrada.
- Evitar versionar datos reales de SQLite si el proyecto se comparte.

### Mejoras de experiencia de usuario

- Confirmar antes de eliminar un lead.
- Mostrar estados de carga en botones y tabla.
- Mejorar los mensajes de error.
- Permitir limpiar filtros rapidamente.
- Anadir indicadores visuales cuando no hay resultados.
- Mejorar la accesibilidad del formulario y la tabla.

### Mejoras de despliegue

- Preparar configuracion para desplegar en un servidor.
- Valorar una base de datos externa si la app deja de ser local.
- Anadir logs mas estructurados.
- Documentar comandos de puesta en marcha para desarrollo y produccion.

## Resumen rapido para continuar el desarrollo

La app funciona como un mini CRM CRUD de leads. El frontend esta en `public/` y se comunica con la API usando `fetch`. El backend esta concentrado en `src/server.js`, donde se definen los endpoints y se accede a SQLite. La base de datos vive en `data/mini-crm.sqlite` y contiene una tabla `leads`.

Para empezar a desarrollar, lo normal seria:

```bash
npm install
npm run dev
```

Despues se puede abrir la app en:

```text
http://127.0.0.1:3000
```

El punto mas importante a tener en cuenta es que el proyecto esta muy concentrado en pocos archivos. Esto lo hace facil de entender, pero si crece convendria separar responsabilidades para mantenerlo ordenado.
