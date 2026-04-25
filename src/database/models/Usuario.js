// src/database/models/Usuario.js (Limpiado)
const { DataTypes } = require('sequelize');
const bcrypt = require('bcryptjs');

module.exports = (sequelize) => {
  const Usuario = sequelize.define('Usuario', {
    id:               { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },

    // --- Identidad / login ---
    nombre:           { type: DataTypes.STRING, allowNull: false },
    nombre_canon:     { type: DataTypes.STRING, allowNull: false }, // lower(nombre)
    password:         { type: DataTypes.STRING, allowNull: false },
    email:            { type: DataTypes.STRING, allowNull: true, validate: { isEmail: true } },
    rol:              { type: DataTypes.STRING, allowNull: false },
    permisos:         { type: DataTypes.JSON },

    // --- Tenancy & Sync (ELIMINADO) ---
    // cloud_tenant_id:     ELIMINADO
    // cloud_user_id:       ELIMINADO
    // sync_enabled:        ELIMINADO
    // sync_api_url:        ELIMINADO
    // license_key:         ELIMINADO
    // subscription_status: ELIMINADO

    // --- Configs locales y de Hardware ---
    config_puerto_scanner:   { type: DataTypes.STRING },
    config_puerto_impresora: { type: DataTypes.STRING },
    config_balanza:          { type: DataTypes.JSON },
    config_balanza_conexion: { type: DataTypes.JSON },
    config_arqueo_caja:      { type: DataTypes.JSON },
    
    // --- Configs de Negocio (Local) ---
    config_redondeo_automatico: { type: DataTypes.JSON, defaultValue: { habilitado: false } },
    // I-2: ORM-level bounds as defense-in-depth (handler validates first)
    config_recargo_credito:    { type: DataTypes.FLOAT, defaultValue: 0, validate: { min: 0, max: 100 } },
    config_descuento_efectivo: { type: DataTypes.FLOAT, defaultValue: 0, validate: { min: 0, max: 100 } },
    nombre_negocio:            { type: DataTypes.STRING },
    slogan_negocio:            { type: DataTypes.STRING },
    footer_ticket:             { type: DataTypes.STRING },
    logo_url:                  { type: DataTypes.STRING },
    direccion_negocio:         { type: DataTypes.STRING, allowNull: true },

    // --- Config Gmail (recuperación de contraseña) ---
    config_gmail_user: { type: DataTypes.STRING, allowNull: true },
    config_gmail_pass: { type: DataTypes.STRING, allowNull: true }, // app password

    // --- Token de recuperación de contraseña ---
    recovery_token:         { type: DataTypes.STRING, allowNull: true },
    recovery_token_expires: { type: DataTypes.DATE,   allowNull: true },

    // --- Acceso remoto ---
    remote_access_enabled: { type: DataTypes.BOOLEAN, defaultValue: false },
    remote_access_port:    { type: DataTypes.INTEGER, defaultValue: 4827 },
    remote_access_token:   { type: DataTypes.STRING,  allowNull: true },

    // --- Configs MercadoPago (Se mantiene) ---
    mp_access_token:         { type: DataTypes.STRING },
    mp_pos_id:               { type: DataTypes.STRING },
    mp_user_id:              { type: DataTypes.STRING },
    // Comportamiento por medio de pago: { qr_mode, debit_mode, credit_mode, point_device_id }
    mp_payment_config:       { type: DataTypes.JSON, allowNull: true, defaultValue: null },

    // --- AFIP (ELIMINADO) ---
    // facturacion_activa:  ELIMINADO
    // afip_cuit:           ELIMINADO
    // afip_pto_vta:        ELIMINADO
    // afip_cert_path:      ELIMINADO
    // afip_key_path:       ELIMINADO

  }, {
    tableName: 'Usuario',
    timestamps: true,
    paranoid: true,
    defaultScope: {
      attributes: { exclude: ['password'] }
    },
    scopes: {
      withPassword: { attributes: {} }
    },
    indexes: [
      // Unicidad de usuario local (case-insensitive)
      { unique: true, fields: ['nombre_canon'] }, // Modificado
      { fields: ['rol'] },
      { fields: ['updatedAt'] },
      { fields: ['deletedAt'] },
      // Índices de sync/cloud eliminados
    ]
  });

  // Normalizar nombre antes de validar/guardar
  Usuario.addHook('beforeValidate', (user) => {
    if (user.nombre) {
      user.nombre = String(user.nombre).trim();
      user.nombre_canon = user.nombre.toLowerCase();
    }
  });

  // Método de instancia para validar password
  Usuario.prototype.validPassword = async function (plain) {
    return bcrypt.compare(plain, this.password);
  };

  return Usuario;
};