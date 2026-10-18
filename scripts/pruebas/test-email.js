require("dotenv").config();

const nodemailer = require("nodemailer");

const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_APP_PASSWORD,
  },
});

async function probarCorreo() {
  try {
    const destinatario = process.argv[2];

    if (!destinatario) {
      console.log("❌ Debes indicar un correo destinatario.");
      console.log(
        "Ejemplo: node test-email.js correo@ejemplo.com"
      );
      return;
    }

    await transporter.verify();

    console.log("✅ Conexión con el servidor de correo correcta.");

    const info = await transporter.sendMail({
      from: `"VetStec" <${process.env.EMAIL_USER}>`,
      to: destinatario,
      subject: "Prueba de correo - VetStec",
      text: `
Hola.

Este es un correo de prueba enviado desde el sistema VetStec.

Si recibiste este mensaje, el servicio de correo está funcionando correctamente.

Equipo VetStec
      `,
    });

    console.log("✅ Correo enviado correctamente.");
    console.log("📨 ID:", info.messageId);
  } catch (error) {
    console.error("❌ Error al enviar correo:");
    console.error(error.message);
  }
}

probarCorreo();