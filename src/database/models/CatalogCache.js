const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const CatalogCache = sequelize.define('CatalogCache', {
    barcode:        { type: DataTypes.STRING(60), primaryKey: true },
    canonical_name: { type: DataTypes.STRING },
    department:     { type: DataTypes.STRING },
    family:         { type: DataTypes.STRING },
    brand:          { type: DataTypes.STRING },
    unit:           { type: DataTypes.STRING },
    size:           { type: DataTypes.STRING },
    confidence:     { type: DataTypes.FLOAT, defaultValue: 0 },
    sources_count:  { type: DataTypes.INTEGER, defaultValue: 0 },
    // miss=true means the API returned 404; avoids re-querying for unknown barcodes
    miss:           { type: DataTypes.BOOLEAN, defaultValue: false },
    cached_at:      { type: DataTypes.DATE },
  }, {
    tableName: 'catalog_cache',
    timestamps: false,
  });
  return CatalogCache;
};
