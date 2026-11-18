
import express from "express";
import cors from "cors";
import helmet from "helmet";
import multer from "multer";
import rateLimit from "express-rate-limit";
import dotenv from "dotenv";
import { pool } from "./db.js";
import XLSX from "xlsx";
import crypto from "crypto";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 4000;

// --------------------------------------------------
// CONFIGURACIÓN GENERAL
// --------------------------------------------------

const allowedOrigins = (
  process.env.FRONTEND_ORIGIN || "http://localhost:5173"
)
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

// Render pone un proxy delante: así req.protocol es https y el rate limit ve la IP real.
app.set("trust proxy", 1);

app.use(helmet());

app.use(
  cors({
    origin: allowedOrigins,
  })
);

app.use(express.json({ limit: "100kb" }));

// --------------------------------------------------
// LÍMITE DE CONSULTAS
// --------------------------------------------------

const lookupLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    message: "Demasiadas consultas. Intenta nuevamente más tarde.",
  },
});

// --------------------------------------------------
// CONFIGURACIÓN DE ARCHIVOS DE AUTORIZACIÓN
// --------------------------------------------------

const upload = multer({
  storage: multer.memoryStorage(),

  limits: {
    fileSize: 5 * 1024 * 1024,
  },

  fileFilter: (_req, file, cb) => {
    const allowedTypes = [
      "application/pdf",
      "image/jpeg",
      "image/png",
    ];

    if (!allowedTypes.includes(file.mimetype)) {
      return cb(
        new Error("Solo se permite PDF, JPG o PNG.")
      );
    }

    cb(null, true);
  },
});

// --------------------------------------------------
// CAMPOS QUE SE DEVUELVEN AL CONSULTAR BENEFICIARIOS
// --------------------------------------------------

const publicFields = `
  id,
  item,
  nombres,
  apellidos,
  documento,
  pasaporte,
  telefono,
  correo,
  telegram,
  comprobante_hash,
  ciudad_residencia,
  aeropuerto_cercano,
  pais_residencia,
  pasaporte_url,
  cuenta_bancaria,
  banco,
  tipo_cuenta,
  cantidad_bonos,
  valor_consignado,
  lider,
  no_tiene_cuenta_o_no_puede_recibir,
  tercero_nombres,
  tercero_apellidos,
  tercero_documento,
  tercero_numero_cuenta,
  tercero_banco,
  autorizacion_nombre_archivo,
  pasaporte_nombre_archivo,
  updated_at
`;

// --------------------------------------------------
// RUTA DE PRUEBA
// --------------------------------------------------

app.get("/api/health", (_req, res) => {
  res.json({
    ok: true,
    message: "API Bono Dorado funcionando correctamente.",
  });
});

// --------------------------------------------------
// BUSCAR BENEFICIARIO POR DOCUMENTO O PASAPORTE
// --------------------------------------------------

app.get(
  "/api/beneficiaries/lookup",
  lookupLimiter,
  async (req, res, next) => {
    try {
      const term = String(req.query.term || "").trim();

      if (!term) {
        return res.status(400).json({
          message: "Escribe tu documento o pasaporte.",
        });
      }

      const result = await pool.query(
        `
        SELECT ${publicFields}
        FROM beneficiaries
        WHERE regexp_replace(documento, '\\s', '', 'g') =
              regexp_replace($1, '\\s', '', 'g')

           OR regexp_replace(COALESCE(pasaporte, ''), '\\s', '', 'g') =
              regexp_replace($1, '\\s', '', 'g')

        LIMIT 1
        `,
        [term]
      );

      if (!result.rowCount) {
        return res.status(404).json({
          message: "NO SE ENCUENTRA EN LA BASE DE DATOS",
        });
      }

      const row = result.rows[0];
      res.json({
        ...row,
        is_admin: onlyDigits(row.documento) === ADMIN_DOCUMENTO,
      });
    } catch (error) {
      next(error);
    }
  }
);

// --------------------------------------------------
// ADMINISTRACIÓN: REPORTE DE ACTUALIZACIONES
// --------------------------------------------------

const onlyDigits = (value) => String(value ?? "").replace(/\D/g, "");
const ADMIN_DOCUMENTO = onlyDigits(process.env.ADMIN_DOCUMENTO || "30308544");

const adminLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "Demasiados intentos. Intenta más tarde." },
});

function requireAdmin(req, res, next) {
  if (onlyDigits(req.get("x-admin-documento")) !== ADMIN_DOCUMENTO) {
    return res.status(401).json({ message: "No tienes acceso de administración." });
  }
  next();
}

// "Actualizado" = el beneficiario guardó el formulario después de la importación.
const updatedRowsQuery = `
  SELECT ${publicFields}, created_at
  FROM beneficiaries
  WHERE updated_at > created_at + interval '2 seconds'
  ORDER BY updated_at DESC
`;

const REPORT_COLUMNS = [
  ["updated_at", "Fecha de actualización"],
  ["documento", "Documento"],
  ["nombres", "Nombres"],
  ["apellidos", "Apellidos"],
  ["pasaporte", "Pasaporte"],
  ["pasaporte_url", "Enlace pasaporte"],
  ["telefono", "Teléfono"],
  ["correo", "Correo"],
  ["telegram", "Telegram"],
  ["comprobante_hash", "Comprobante / hash"],
  ["ciudad_residencia", "Ciudad y departamento"],
  ["aeropuerto_cercano", "Aeropuerto cercano"],
  ["pais_residencia", "País"],
  ["cuenta_bancaria", "Cuenta bancaria"],
  ["banco", "Banco"],
  ["tipo_cuenta", "Tipo de cuenta"],
  ["cantidad_bonos", "Cantidad de bonos"],
  ["valor_consignado", "Valor consignado"],
  ["lider", "Líder"],
  ["no_tiene_cuenta_o_no_puede_recibir", "Pago a tercero"],
  ["tercero_nombres", "Tercero nombres"],
  ["tercero_apellidos", "Tercero apellidos"],
  ["tercero_documento", "Tercero documento"],
  ["tercero_numero_cuenta", "Tercero cuenta"],
  ["tercero_banco", "Tercero banco"],
  ["autorizacion_nombre_archivo", "Autorización adjunta"],
  ["pasaporte_nombre_archivo", "Pasaporte subido desde dispositivo"],
];

app.get("/api/admin/updates", adminLimiter, requireAdmin, async (_req, res, next) => {
  try {
    const [rows, total] = await Promise.all([
      pool.query(updatedRowsQuery),
      pool.query("SELECT count(*)::int AS total FROM beneficiaries"),
    ]);
    res.json({ total: total.rows[0].total, rows: rows.rows });
  } catch (error) {
    next(error);
  }
});

app.get("/api/admin/updates.xlsx", adminLimiter, requireAdmin, async (_req, res, next) => {
  try {
    const { rows } = await pool.query(updatedRowsQuery);
    const data = rows.map((row) =>
      Object.fromEntries(
        REPORT_COLUMNS.map(([key, label]) => [
          label,
          key === "updated_at"
            ? new Date(row[key]).toLocaleString("es-CO", { timeZone: "America/Bogota" })
            : key === "no_tiene_cuenta_o_no_puede_recibir"
            ? (row[key] ? "Sí" : "No")
            : row[key] ?? "",
        ])
      )
    );

    const sheet = XLSX.utils.json_to_sheet(data, {
      header: REPORT_COLUMNS.map(([, label]) => label),
    });
    // Enlaces clicables: al abrir el Excel, el pasaporte se abre en el navegador.
    const linkCol = REPORT_COLUMNS.findIndex(([key]) => key === "pasaporte_url");
    rows.forEach((row, i) => {
      const cell = sheet[XLSX.utils.encode_cell({ r: i + 1, c: linkCol })];
      if (cell && row.pasaporte_url) cell.l = { Target: row.pasaporte_url, Tooltip: "Ver pasaporte" };
    });
    sheet["!cols"] = REPORT_COLUMNS.map(([, label]) => ({ wch: Math.max(14, label.length + 2) }));
    const book = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(book, sheet, "Actualizaciones");

    const date = new Date().toISOString().slice(0, 10);
    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    );
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="actualizaciones-bono-dorado-${date}.xlsx"`
    );
    res.send(XLSX.write(book, { type: "buffer", bookType: "xlsx" }));
  } catch (error) {
    next(error);
  }
});

// Ver el pasaporte subido (público solo para quien tenga el enlace, como "cualquiera con el enlace" en Drive).
app.get("/api/passport/:token", async (req, res, next) => {
  try {
    if (!/^[a-f0-9]{32}$/.test(req.params.token)) {
      return res.status(404).json({ message: "Enlace no válido." });
    }
    const { rows } = await pool.query(
      `SELECT pasaporte_nombre_archivo n, pasaporte_mime_type m, pasaporte_archivo f
       FROM beneficiaries WHERE pasaporte_token = $1`,
      [req.params.token]
    );
    if (!rows[0]?.f) {
      return res.status(404).json({ message: "No se encontró el pasaporte." });
    }
    const name = String(rows[0].n || "pasaporte").replace(/["\\\r\n]/g, "_");
    // Sin CSP de helmet para que el visor de PDF del navegador funcione.
    res.removeHeader("Content-Security-Policy");
    res.setHeader("Content-Type", rows[0].m);
    res.setHeader("Content-Disposition", `inline; filename="${encodeURIComponent(name)}"`);
    res.send(rows[0].f);
  } catch (error) {
    next(error);
  }
});

app.get("/api/admin/passport/:id", adminLimiter, requireAdmin, async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `SELECT pasaporte_nombre_archivo n, pasaporte_mime_type m, pasaporte_archivo f
       FROM beneficiaries WHERE id = $1`,
      [Number(req.params.id) || 0]
    );
    if (!rows[0]?.f) {
      return res.status(404).json({ message: "No hay pasaporte subido." });
    }
    const name = String(rows[0].n || "pasaporte").replace(/["\\\r\n]/g, "_");
    res.setHeader("Content-Type", rows[0].m);
    res.setHeader("Content-Disposition", `attachment; filename="${encodeURIComponent(name)}"`);
    res.send(rows[0].f);
  } catch (error) {
    next(error);
  }
});

// --------------------------------------------------
// ACTUALIZAR BENEFICIARIO
// --------------------------------------------------

app.put(
  "/api/beneficiaries/:id",
  upload.fields([
    { name: "autorizacion", maxCount: 1 },
    { name: "pasaporte_archivo", maxCount: 1 },
  ]),
  async (req, res, next) => {
    let client;
    let transactionStarted = false;

    try {
      client = await pool.connect();

      const id = Number(req.params.id);

      if (!Number.isInteger(id) || id <= 0) {
        return res.status(400).json({
          message: "Registro inválido.",
        });
      }

      const b = req.body;
      const authFile = req.files?.autorizacion?.[0];
      const passportFile = req.files?.pasaporte_archivo?.[0];

      // --------------------------------------------------
      // VALIDAR DATOS DEL PASAPORTE
      // --------------------------------------------------

      const passportNumber = String(
        b.pasaporte || ""
      ).trim();

      let passportUrl = String(
        b.pasaporte_url || ""
      ).trim();

      // Aceptar enlaces de archivos alojados en Google Drive.
      if (passportUrl) {
        let parsedUrl;

        try {
          parsedUrl = new URL(passportUrl);
        } catch {
          return res.status(400).json({
            message: "El enlace del pasaporte no es válido.",
          });
        }

        const ownLink =
          parsedUrl.host === req.get("host") &&
          /^\/api\/passport\/[a-f0-9]{32}$/.test(parsedUrl.pathname);

        const validDriveLink =
          ownLink ||
          parsedUrl.protocol === "https:" &&
          parsedUrl.hostname === "drive.google.com" &&
          (
            /^\/file\/d\/[a-zA-Z0-9_-]+\/view/.test(
              parsedUrl.pathname
            ) ||
            parsedUrl.pathname === "/open"
          );

        if (!validDriveLink) {
          return res.status(400).json({
            message:
              "El enlace del pasaporte debe corresponder a un archivo de Google Drive.",
          });
        }
      }

      // Pasaporte subido desde el dispositivo: enlace propio, no adivinable, para abrirlo en el navegador.
      const passportToken = passportFile ? crypto.randomBytes(16).toString("hex") : null;
      if (passportToken) {
        passportUrl = `${req.protocol}://${req.get("host")}/api/passport/${passportToken}`;
      }

      // --------------------------------------------------
      // VALIDAR RESPUESTA SOBRE CUENTA BANCARIA
      // --------------------------------------------------

      const yes =
        b.no_tiene_cuenta_o_no_puede_recibir === "true";

      if (
        yes &&
        (
          !b.tercero_nombres?.trim() ||
          !b.tercero_apellidos?.trim() ||
          !b.tercero_documento?.trim() ||
          !b.tercero_numero_cuenta?.trim() ||
          !b.tercero_banco?.trim()
        )
      ) {
        return res.status(400).json({
          message:
            "Completa todos los datos de la persona autorizada.",
        });
      }

      // --------------------------------------------------
      // CONSERVAR AUTORIZACIÓN ANTERIOR
      // --------------------------------------------------

      if (yes && !authFile) {
        const old = await pool.query(
          `
          SELECT autorizacion_archivo
          FROM beneficiaries
          WHERE id = $1
          `,
          [id]
        );

        if (!old.rowCount) {
          return res.status(404).json({
            message: "No se encontró el beneficiario.",
          });
        }

        if (!old.rows[0].autorizacion_archivo) {
          return res.status(400).json({
            message:
              "Adjunta la autorización en PDF, JPG o PNG.",
          });
        }
      }

      // --------------------------------------------------
      // DATOS PARA ACTUALIZAR
      // --------------------------------------------------

      const values = [
        b.nombres,
        b.apellidos,
        passportNumber,
        b.telefono,
        b.correo,
        b.telegram,
        b.comprobante_hash,
        b.ciudad_residencia,
        b.aeropuerto_cercano,
        b.pais_residencia,
        passportUrl,
        b.cuenta_bancaria,
        b.banco,
        b.tipo_cuenta,
        yes,
        yes ? b.tercero_nombres : null,
        yes ? b.tercero_apellidos : null,
        yes ? b.tercero_documento : null,
        yes ? b.tercero_numero_cuenta : null,
        yes ? b.tercero_banco : null,
        authFile?.originalname || null,
        authFile?.mimetype || null,
        authFile?.buffer || null,
        b.cantidad_bonos,
        b.valor_consignado,
        b.lider,
        passportFile?.originalname || null,
        passportFile?.mimetype || null,
        passportFile?.buffer || null,
        passportToken,
        id,
      ];

      // --------------------------------------------------
      // ACTUALIZAR BASE DE DATOS
      // --------------------------------------------------

      await client.query("BEGIN");
      transactionStarted = true;

      const result = await client.query(
        `
        UPDATE beneficiaries SET

          nombres = $1,
          apellidos = $2,
          pasaporte = $3,
          telefono = $4,
          correo = $5,
          telegram = $6,
          comprobante_hash = $7,
          ciudad_residencia = $8,
          aeropuerto_cercano = $9,
          pais_residencia = $10,
          pasaporte_url = COALESCE(NULLIF($11, ''), pasaporte_url),
          cuenta_bancaria = $12,
          banco = $13,
          tipo_cuenta = $14,

          no_tiene_cuenta_o_no_puede_recibir = $15,

          tercero_nombres = $16,
          tercero_apellidos = $17,
          tercero_documento = $18,
          tercero_numero_cuenta = $19,
          tercero_banco = $20,

          autorizacion_nombre_archivo =
            COALESCE($21, autorizacion_nombre_archivo),

          autorizacion_mime_type =
            COALESCE($22, autorizacion_mime_type),

          autorizacion_archivo =
            COALESCE($23, autorizacion_archivo),

          cantidad_bonos = $24,
          valor_consignado = $25,
          lider = $26,

          pasaporte_nombre_archivo = COALESCE($27, pasaporte_nombre_archivo),
          pasaporte_mime_type = COALESCE($28, pasaporte_mime_type),
          pasaporte_archivo = COALESCE($29, pasaporte_archivo),
          pasaporte_token = COALESCE($30, pasaporte_token),

          updated_at = NOW()

        WHERE id = $31
        RETURNING pasaporte_url
        `,
        values
      );

      if (!result.rowCount) {
        await client.query("ROLLBACK");
        transactionStarted = false;

        return res.status(404).json({
          message: "No se encontró el beneficiario.",
        });
      }

      await client.query("COMMIT");
      transactionStarted = false;

      res.json({
        message: "Tus datos fueron actualizados correctamente.",
        pasaporte_url: result.rows[0].pasaporte_url,
      });
    } catch (error) {
      if (client && transactionStarted) {
        await client.query("ROLLBACK");
        transactionStarted = false;
      }

      next(error);
    } finally {
      client?.release();
    }
  }
);

// --------------------------------------------------
// DESCARGAR AUTORIZACIÓN DE TERCEROS
// --------------------------------------------------

app.get(
  "/api/beneficiaries/:id/authorization",
  async (req, res, next) => {
    try {
      const id = Number(req.params.id);

      if (!Number.isInteger(id) || id <= 0) {
        return res.status(400).json({
          message: "Identificador inválido.",
        });
      }

      const result = await pool.query(
        `
        SELECT
          autorizacion_nombre_archivo,
          autorizacion_mime_type,
          autorizacion_archivo

        FROM beneficiaries
        WHERE id = $1
        `,
        [id]
      );

      if (
        !result.rowCount ||
        !result.rows[0].autorizacion_archivo
      ) {
        return res.status(404).json({
          message: "No hay autorización adjunta.",
        });
      }

      const authorization = result.rows[0];

      const safeFilename = String(
        authorization.autorizacion_nombre_archivo || "autorizacion"
      ).replace(/["\\\r\n]/g, "_");

      res.setHeader(
        "Content-Type",
        authorization.autorizacion_mime_type
      );

      res.setHeader(
        "Content-Disposition",
        `attachment; filename="${encodeURIComponent(safeFilename)}"`
      );

      res.send(authorization.autorizacion_archivo);
    } catch (error) {
      next(error);
    }
  }
);

// --------------------------------------------------
// MANEJO GENERAL DE ERRORES
// --------------------------------------------------

app.use((error, _req, res, _next) => {
  console.error("Error en la API:", error.message);

  if (error.code === "LIMIT_FILE_SIZE") {
    return res.status(400).json({
      message: "El archivo supera el límite de 5 MB.",
    });
  }

  if (error instanceof multer.MulterError) {
    return res.status(400).json({
      message: "No se pudo procesar el archivo adjunto.",
    });
  }

  const status = error.message?.includes(
    "Solo se permite PDF"
  )
    ? 400
    : 500;

  res.status(status).json({
    message:
      status === 400
        ? error.message
        : "Ocurrió un error interno en el servidor.",
  });
});

// --------------------------------------------------
// INICIAR SERVIDOR
// --------------------------------------------------

// Columnas del pasaporte subido desde el dispositivo (idempotente).
await pool.query(`
  ALTER TABLE beneficiaries
    ADD COLUMN IF NOT EXISTS pasaporte_nombre_archivo TEXT,
    ADD COLUMN IF NOT EXISTS pasaporte_mime_type TEXT,
    ADD COLUMN IF NOT EXISTS pasaporte_archivo BYTEA,
    ADD COLUMN IF NOT EXISTS pasaporte_token TEXT
`);

app.listen(PORT, () => {
  console.log(`API lista en puerto ${PORT}`);
});
