'use strict';
const bcrypt = require('bcrypt');

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up (queryInterface, Sequelize) {
    // Genera el hash de la contraseña de forma segura
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash('admin123', salt); // ¡Cambia 'admin123' por una contraseña segura!

    // Inserta el Usuario administrador en la tabla 'Usuario'
    await queryInterface.bulkInsert('Usuario', [{
      nombre: 'admin', // Puedes cambiar el nombre de Usuario
      password: hashedPassword,
      rol: 'administrador',
      // Los permisos son null para el admin, ya que tiene acceso a todo.
      permisos: null, 
      createdAt: new Date(),
      updatedAt: new Date()
    }], {});
  },

  async down (queryInterface, Sequelize) {
    // Esto le dice a Sequelize cómo deshacer el seeder (borrando el Usuario)
    await queryInterface.bulkDelete('Usuario', { nombre: 'admin' });
  }
};