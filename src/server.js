const express = require("express");
const path = require("path");
const fs = require("fs");
const sqlite3 = require("sqlite3").verbose();

const app = express();
const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || "127.0.0.1";
const DB_DIR = path.join(__dirname, "..", "data");
const DB_PATH = path.join(DB_DIR, "mini-crm.sqlite");

// Express entiende cuerpos JSON y sirve el frontend sin cambiar los archivos de public/.
app.use(express.json());
app.use(express.static("public"));

// Creamos la carpeta de datos si no existe para guardar la base SQLite dentro del proyecto.
fs.mkdirSync(DB_DIR, { recursive: true });

// Abrimos una conexion persistente al archivo de base de datos local.
const db = new sqlite3.Database(DB_PATH, (error) => {
  if (error) {
    console.error("No se pudo abrir la base de datos SQLite:", error.message);
    process.exit(1);
  }
});

// Promisificamos las operaciones usadas por los endpoints para poder trabajar con async/await.
function runQuery(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function handleRun(error) {
      if (error) {
        reject(error);
        return;
      }

      resolve({
        changes: this.changes,
        lastID: this.lastID
      });
    });
  });
}

function getQuery(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (error, row) => {
      if (error) {
        reject(error);
        return;
      }

      resolve(row);
    });
  });
}

function allQuery(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (error, rows) => {
      if (error) {
        reject(error);
        return;
      }

      resolve(rows);
    });
  });
}

// Esta tabla reemplaza el antiguo array en memoria y persiste cada lead en SQLite.
async function initializeDatabase() {
  await runQuery(`
    CREATE TABLE IF NOT EXISTS leads (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      email TEXT NOT NULL,
      source TEXT,
      status TEXT NOT NULL DEFAULT 'nuevo',
      createdAt TEXT NOT NULL
    )
  `);
}

// Normalizamos la salida para mantener el mismo formato JSON que consume el frontend.
function mapLead(row) {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    source: row.source,
    status: row.status,
    createdAt: row.createdAt
  };
}

// Validamos los campos obligatorios antes de escribir en la base de datos.
function validateLeadPayload({ name, email }) {
  if (!name || !email) {
    return "Los campos name y email son obligatorios.";
  }

  return null;
}

function escapeCsvValue(value) {
  const text = value == null ? "" : String(value);

  if (/[",\r\n]/.test(text)) {
    return `"${text.replaceAll('"', '""')}"`;
  }

  return text;
}

function buildLeadsCsv(rows) {
  const headers = ["nombre", "email", "fuente", "estatus", "created_at"];
  const lines = rows.map((row) =>
    [
      row.name,
      row.email,
      row.source,
      row.status,
      row.createdAt
    ]
      .map(escapeCsvValue)
      .join(",")
  );

  return [headers.join(","), ...lines].join("\r\n");
}

// GET /leads lee todos los leads desde SQLite, ordenados por fecha de creacion descendente.
app.get("/leads", async (req, res) => {
  try {
    const rows = await allQuery("SELECT * FROM leads ORDER BY datetime(createdAt) DESC, id DESC");
    res.json(rows.map(mapLead));
  } catch (error) {
    console.error("Error al leer leads:", error.message);
    res.status(500).json({
      error: "No se pudieron cargar los leads."
    });
  }
});

// GET /leads/export.csv genera un CSV descargable con todos los leads.
app.get("/leads/export.csv", async (req, res) => {
  try {
    const rows = await allQuery("SELECT * FROM leads ORDER BY datetime(createdAt) DESC, id DESC");
    const csv = buildLeadsCsv(rows);

    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", 'attachment; filename="leads.csv"');
    res.send(`\ufeff${csv}`);
  } catch (error) {
    console.error("Error al exportar leads:", error.message);
    res.status(500).json({
      error: "No se pudieron exportar los leads."
    });
  }
});

// POST /leads inserta un nuevo lead en SQLite y devuelve el registro creado.
app.post("/leads", async (req, res) => {
  const { name, email, source, status = "nuevo" } = req.body;
  const validationError = validateLeadPayload({ name, email });

  if (validationError) {
    return res.status(400).json({
      error: validationError
    });
  }

  try {
    const createdAt = new Date().toISOString();
    const result = await runQuery(
      `
        INSERT INTO leads (name, email, source, status, createdAt)
        VALUES (?, ?, ?, ?, ?)
      `,
      [name, email, source || null, status || "nuevo", createdAt]
    );
    const lead = await getQuery("SELECT * FROM leads WHERE id = ?", [result.lastID]);

    return res.status(201).json(mapLead(lead));
  } catch (error) {
    console.error("Error al crear lead:", error.message);
    return res.status(500).json({
      error: "No se pudo crear el lead."
    });
  }
});

// PUT /leads/:id actualiza un lead existente en SQLite.
app.put("/leads/:id", async (req, res) => {
  const leadId = Number(req.params.id);
  const { name, email, source, status = "nuevo" } = req.body;
  const validationError = validateLeadPayload({ name, email });

  if (validationError) {
    return res.status(400).json({
      error: validationError
    });
  }

  try {
    const result = await runQuery(
      `
        UPDATE leads
        SET name = ?, email = ?, source = ?, status = ?
        WHERE id = ?
      `,
      [name, email, source || null, status || "nuevo", leadId]
    );

    if (result.changes === 0) {
      return res.status(404).json({
        error: "Lead no encontrado."
      });
    }

    const lead = await getQuery("SELECT * FROM leads WHERE id = ?", [leadId]);

    return res.json(mapLead(lead));
  } catch (error) {
    console.error("Error al actualizar lead:", error.message);
    return res.status(500).json({
      error: "No se pudo actualizar el lead."
    });
  }
});

// DELETE /leads/:id elimina el lead de SQLite.
app.delete("/leads/:id", async (req, res) => {
  const leadId = Number(req.params.id);

  try {
    const result = await runQuery("DELETE FROM leads WHERE id = ?", [leadId]);

    if (result.changes === 0) {
      return res.status(404).json({
        error: "Lead no encontrado."
      });
    }

    return res.status(204).send();
  } catch (error) {
    console.error("Error al eliminar lead:", error.message);
    return res.status(500).json({
      error: "No se pudo eliminar el lead."
    });
  }
});

// Inicializamos SQLite antes de levantar el servidor para asegurar que la tabla existe.
initializeDatabase()
  .then(() => {
    app.listen(PORT, HOST, () => {
      console.log(`Mini CRM API escuchando en http://${HOST}:${PORT}`);
      console.log(`Base de datos SQLite en ${DB_PATH}`);
    });
  })
  .catch((error) => {
    console.error("No se pudo inicializar la base de datos:", error.message);
    process.exit(1);
  });
