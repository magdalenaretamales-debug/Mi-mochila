const connection = require("../db");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { enviarCodigoRecuperacion } = require("../services/email.service");

const codigosRecuperacion = new Map();

const login = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        status: 400,
        message: "El email y la contraseña son obligatorios",
        data: null
      });
    }

    const resultado = await connection.query(
      "SELECT id, nombre, email, password FROM usuarios WHERE email = $1",
      [email]
    );

    if (resultado.rows.length === 0) {
      return res.status(401).json({
        status: 401,
        message: "Credenciales incorrectas",
        data: null
      });
    }

    const usuario = resultado.rows[0];

    const passwordCorrecta = await bcrypt.compare(
      password,
      usuario.password
    );

    if (!passwordCorrecta) {
      return res.status(401).json({
        status: 401,
        message: "Credenciales incorrectas",
        data: null
      });
    }

    const token = jwt.sign(
      {
        id: usuario.id,
        email: usuario.email
      },
      process.env.JWT_SECRET,
      {
        expiresIn: "1h"
      }
    );

    res.status(200).json({
      status: 200,
      message: "Login exitoso",
      data: {
        token,
        usuario: {
          id: usuario.id,
          nombre: usuario.nombre,
          email: usuario.email
        }
      }
    });

  } catch (error) {
    console.error("Error en login:", error.message);

    res.status(500).json({
      status: 500,
      message: "Error al iniciar sesión",
      data: null
    });
  }
};

const recuperar = async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({
        status: 400,
        message: "El correo electrónico es obligatorio",
        data: null
      });
    }

    const resultado = await connection.query(
      "SELECT id, nombre, email FROM usuarios WHERE email = $1",
      [email]
    );

    if (resultado.rows.length === 0) {
      return res.status(404).json({
        status: 404,
        message: "No existe un usuario registrado con ese correo",
        data: null
      });
    }

    const usuario = resultado.rows[0];

    const codigo = Math.floor(
      100000 + Math.random() * 900000
    ).toString();

    const expiracion = Date.now() + 10 * 60 * 1000;

    codigosRecuperacion.set(usuario.email, {
      codigo: codigo,
      expiracion: expiracion
    });

    await enviarCodigoRecuperacion(
      usuario.email,
      codigo
    );

    console.log(
      `Código de recuperación generado para ${usuario.email}: ${codigo}`
    );

    res.status(200).json({
      status: 200,
      message: "Se ha enviado un código de recuperación a tu correo",
      data: null
    });

  } catch (error) {
    console.error("Error en recuperación:", error.message);

    res.status(500).json({
      status: 500,
      message: "No se pudo enviar el código de recuperación",
      data: null
    });
  }
};

const cambiarContrasena = async (req, res) => {
  try {
    const { email, codigo, nuevaPassword } = req.body;

    if (!email || !codigo || !nuevaPassword) {
      return res.status(400).json({
        status: 400,
        message: "El correo, el código y la nueva contraseña son obligatorios",
        data: null
      });
    }

    const recuperacion = codigosRecuperacion.get(email);

    if (!recuperacion) {
      return res.status(400).json({
        status: 400,
        message: "Código de recuperación inválido o inexistente",
        data: null
      });
    }

    if (Date.now() > recuperacion.expiracion) {
      codigosRecuperacion.delete(email);

      return res.status(400).json({
        status: 400,
        message: "El código de recuperación ha expirado",
        data: null
      });
    }

    if (recuperacion.codigo !== codigo) {
      return res.status(400).json({
        status: 400,
        message: "El código de recuperación es incorrecto",
        data: null
      });
    }

    if (nuevaPassword.length < 8) {
      return res.status(400).json({
        status: 400,
        message: "La contraseña debe tener al menos 8 caracteres",
        data: null
      });
    }

    const passwordEncriptada = await bcrypt.hash(
      nuevaPassword,
      10
    );

    const resultado = await connection.query(
      "UPDATE usuarios SET password = $1 WHERE email = $2 RETURNING id, nombre, email",
      [passwordEncriptada, email]
    );

    if (resultado.rows.length === 0) {
      return res.status(404).json({
        status: 404,
        message: "Usuario no encontrado",
        data: null
      });
    }

    codigosRecuperacion.delete(email);

    res.status(200).json({
      status: 200,
      message: "Contraseña actualizada correctamente",
      data: resultado.rows[0]
    });

  } catch (error) {
    console.error("Error al cambiar contraseña:", error.message);

    res.status(500).json({
      status: 500,
      message: "No se pudo actualizar la contraseña",
      data: null
    });
  }
};

const registrar = async (req, res) => {
  try {
    const { nombre, email, password } = req.body;

    if (!nombre || !email || !password) {
      return res.status(400).json({
        status: 400,
        message: "Todos los campos son obligatorios",
        data: null
      });
    }

    const nombreLimpio = nombre.trim();
    const emailLimpio = email.trim().toLowerCase();

    if (!nombreLimpio) {
      return res.status(400).json({
        status: 400,
        message: "Debes ingresar tu nombre",
        data: null
      });
    }

    const cumpleRequisitos =
      password.length >= 8 &&
      /[A-Z]/.test(password) &&
      /[a-z]/.test(password) &&
      /[0-9]/.test(password) &&
      /[^A-Za-z0-9]/.test(password);

    if (!cumpleRequisitos) {
      return res.status(400).json({
        status: 400,
        message: "La contraseña debe tener al menos 8 caracteres, mayúscula, minúscula, número y carácter especial",
        data: null
      });
    }

    const existente = await connection.query(
      "SELECT id FROM usuarios WHERE LOWER(email) = $1",
      [emailLimpio]
    );

    if (existente.rows.length > 0) {
      return res.status(409).json({
        status: 409,
        message: "Ya existe una cuenta con ese correo",
        data: null
      });
    }

    const passwordEncriptada = await bcrypt.hash(password, 10);

    const resultado = await connection.query(
      `INSERT INTO usuarios (nombre, email, password)
       VALUES ($1, $2, $3)
       RETURNING id, nombre, email`,
      [nombreLimpio, emailLimpio, passwordEncriptada]
    );

    return res.status(201).json({
      status: 201,
      message: "Cuenta creada correctamente",
      data: resultado.rows[0]
    });

  } catch (error) {
    console.error("Error al registrar usuario:", error.message);

    if (error.code === "23505") {
      return res.status(409).json({
        status: 409,
        message: "Ya existe una cuenta con ese correo",
        data: null
      });
    }

    return res.status(500).json({
      status: 500,
      message: "No se pudo crear la cuenta",
      data: null
    });
  }
};

module.exports = {
  login,
  registrar,
  recuperar,
  cambiarContrasena
};