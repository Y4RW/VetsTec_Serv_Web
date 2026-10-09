require("dotenv").config();

const fs = require("fs");
const path = require("path");
const WebSocket = require("ws");
const { createClient } = require("@supabase/supabase-js");

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SECRET_KEY,
  {
    realtime: {
      transport: WebSocket,
    },
  }
);

async function testStorage() {
  try {
    const filePath = process.argv[2];

    if (!filePath) {
      console.log("❌ Debes indicar una imagen.");
      console.log("Ejemplo:");
      console.log("node test-storage.js /ruta/de/logo.png");
      return;
    }

    if (!fs.existsSync(filePath)) {
      console.log("❌ La imagen no existe.");
      return;
    }

    const extension = path.extname(filePath).toLowerCase();

    const mimeTypes = {
      ".jpg": "image/jpeg",
      ".jpeg": "image/jpeg",
      ".png": "image/png",
      ".webp": "image/webp",
    };

    const contentType = mimeTypes[extension];

    if (!contentType) {
      console.log("❌ Solo se permiten JPG, PNG o WEBP.");
      return;
    }

    const fileSize = fs.statSync(filePath).size;

    if (fileSize > 5 * 1024 * 1024) {
      console.log("❌ La imagen supera los 5 MB.");
      return;
    }

    const fileBuffer = fs.readFileSync(filePath);

    const fileName =
      `pruebas/logo-${Date.now()}${extension}`;

    const { data, error } = await supabase.storage
      .from("logos-negocios")
      .upload(fileName, fileBuffer, {
        contentType,
        upsert: false,
      });

    if (error) {
      throw error;
    }

    const { data: publicData } = supabase.storage
      .from("logos-negocios")
      .getPublicUrl(data.path);

    console.log("\n✅ Imagen subida correctamente");
    console.log("📁 Ruta:", data.path);
    console.log("🌐 URL pública:", publicData.publicUrl);
  } catch (error) {
    console.error("\n❌ Error:");
    console.error(error.message);
  }
}

testStorage();