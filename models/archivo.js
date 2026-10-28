
const { DataTypes } = require("sequelize");
const sequelize = require("../sequelize");

const Archivo = sequelize.define(
  "Archivo",
  {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },

    usuario_id: {
      type: DataTypes.INTEGER,
      allowNull: false
    },

    nombre: {
      type: DataTypes.STRING,
      allowNull: false
    },

    nombre_archivo: {
      type: DataTypes.STRING,
      allowNull: false
    },

    tipo: {
      type: DataTypes.STRING,
      allowNull: false
    },

    fecha: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW
    }
  },
  {
    tableName: "archivos",
    timestamps: false
  }
);

module.exports = Archivo;
