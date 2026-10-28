const jwt = require("jsonwebtoken");

const verificarToken = (req, res, next) => {
  const authHeader = req.headers.authorization;

  if (!authHeader) {
    return res.status(401).json({
      status: 401,
      message: "Token no proporcionado",
      data: null
    });
  }

  const token = authHeader.split(" ")[1];

  try {
    const usuario = jwt.verify(token, process.env.JWT_SECRET);

    req.usuario = usuario;

    next();

  } catch (error) {
  console.error("Error al verificar JWT:", error.name, error.message);

  return res.status(401).json({
    status: 401,
    message: "Token inválido o expirado",
    data: null
  });
}
};

module.exports = verificarToken;