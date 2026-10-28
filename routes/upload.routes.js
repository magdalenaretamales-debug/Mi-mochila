
const express = require("express");
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const { Op } = require("sequelize");

const verificarToken = require("../middlewares/auth.middleware");
const Archivo = require("../models/Archivo");

const router = express.Router();

const carpetaUploads = path.resolve("uploads");

fs.mkdirSync(carpetaUploads, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, carpetaUploads);
  },
  filename: (req, file, cb) => {
    cb(null, `${Date.now()}-${require("crypto").randomUUID()}${path.extname(file.originalname).toLowerCase()}`);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const tiposPermitidos = [
      "application/pdf",
      "image/jpeg",
      "image/png"
    ];

    if (tiposPermitidos.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error("Tipo de archivo no permitido. Usa PDF, JPG o PNG."));
    }
  }
});

function obtenerUsuarioId(req) {
  return req.usuario?.id ?? req.usuario?.usuario_id ?? req.usuario?.userId;
}

function responderErrorMulter(error, res) {
  if (!error) return false;

  const mensaje = error instanceof multer.MulterError &&
    error.code === "LIMIT_FILE_SIZE"
    ? "El archivo supera el tamaño máximo permitido de 5 MB"
    : error.message;

  res.status(400).json({
    status: 400,
    message: mensaje,
    data: null
  });

  return true;
}

// Subir un archivo y registrar sus datos en PostgreSQL
router.post("/upload", verificarToken, (req, res) => {
  upload.single("archivo")(req, res, async (error) => {
    if (responderErrorMulter(error, res)) return;

    if (!req.file) {
      return res.status(400).json({
        status: 400,
        message: "Debes seleccionar un archivo",
        data: null
      });
    }

    const usuarioId = obtenerUsuarioId(req);

    if (!usuarioId) {
      fs.unlink(req.file.path, () => {});
      return res.status(401).json({
        status: 401,
        message: "No se pudo identificar al usuario autenticado",
        data: null
      });
    }

    try {
      const nombre = String(req.body.nombre || req.file.originalname)
        .trim()
        .slice(0, 255);

      const archivo = await Archivo.create({
        usuario_id: usuarioId,
        nombre: nombre || req.file.originalname,
        nombre_archivo: req.file.filename,
        tipo: req.file.mimetype
      });

      return res.status(201).json({
        status: 201,
        message: "Archivo subido correctamente",
        data: archivo
      });
    } catch (err) {
      fs.unlink(req.file.path, () => {});
      console.error("Error al registrar archivo:", err.message);

      return res.status(500).json({
        status: 500,
        message: "No se pudo registrar el archivo en la base de datos",
        data: null
      });
    }
  });
});

// Listar los archivos del usuario autenticado
router.get("/archivos", verificarToken, async (req, res) => {
  try {
    const usuarioId = obtenerUsuarioId(req);
    if (!usuarioId) {
      return res.status(401).json({ message: "Usuario no identificado" });
    }

    const archivos = await Archivo.findAll({
      where: { usuario_id: usuarioId },
      attributes: ["id", "nombre", "nombre_archivo", "tipo", "fecha"],
      order: [["fecha", "DESC"]]
    });

    res.json({ status: 200, data: archivos });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Error al listar archivos" });
  }
});

// Cambiar el nombre visible
router.patch("/archivos/:id", verificarToken, async (req, res) => {
  try {
    const usuarioId = obtenerUsuarioId(req);
    const nombre = String(req.body.nombre || "").trim();

    if (!usuarioId || !nombre || nombre.length > 255) {
      return res.status(400).json({
        message: "Indica un nombre válido de hasta 255 caracteres"
      });
    }

    const archivo = await Archivo.findOne({
      where: { id: req.params.id, usuario_id: usuarioId }
    });

    if (!archivo) {
      return res.status(404).json({ message: "Archivo no encontrado" });
    }

    archivo.nombre = nombre;
    await archivo.save();

    res.json({ status: 200, message: "Nombre actualizado", data: archivo });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Error al renombrar archivo" });
  }
});

// Abrir un archivo en el navegador
router.get("/archivos/:id/ver", verificarToken, async (req, res) => {
  try {
    const usuarioId = obtenerUsuarioId(req);
    const archivo = await Archivo.findOne({
      where: { id: req.params.id, usuario_id: usuarioId }
    });

    if (!archivo) {
      return res.status(404).json({ message: "Archivo no encontrado" });
    }

    const ruta = path.join(carpetaUploads, path.basename(archivo.nombre_archivo));

    if (!fs.existsSync(ruta)) {
      return res.status(404).json({ message: "El archivo físico no existe" });
    }

    res.type(archivo.tipo);
    res.setHeader("Content-Disposition", "inline");
    res.sendFile(ruta);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Error al abrir archivo" });
  }
});

// Descargar un archivo
router.get("/archivos/:id/descargar", verificarToken, async (req, res) => {
  try {
    const usuarioId = obtenerUsuarioId(req);
    const archivo = await Archivo.findOne({
      where: { id: req.params.id, usuario_id: usuarioId }
    });

    if (!archivo) {
      return res.status(404).json({ message: "Archivo no encontrado" });
    }

    const ruta = path.join(carpetaUploads, path.basename(archivo.nombre_archivo));

    if (!fs.existsSync(ruta)) {
      return res.status(404).json({ message: "El archivo físico no existe" });
    }

    res.download(ruta, archivo.nombre_archivo);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Error al descargar archivo" });
  }
});

// Eliminar registro y archivo físico
router.delete("/archivos/:id", verificarToken, async (req, res) => {
  try {
    const usuarioId = obtenerUsuarioId(req);
    const archivo = await Archivo.findOne({
      where: { id: req.params.id, usuario_id: usuarioId }
    });

    if (!archivo) {
      return res.status(404).json({ message: "Archivo no encontrado" });
    }

    const ruta = path.join(carpetaUploads, path.basename(archivo.nombre_archivo));

    await archivo.destroy();

    if (fs.existsSync(ruta)) {
      await fs.promises.unlink(ruta);
    }

    res.json({ status: 200, message: "Archivo eliminado correctamente" });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Error al eliminar archivo" });
  }
});

module.exports = router;
