module.exports = function registrarVerificacion(
  app,
  { pool, bcrypt, crypto, emailTransporter }
) {
  function fallo(status, message, retryAfter) {
    return Object.assign(new Error(message), {
      status,
      retryAfter,
    });
  }

  function leerCorreo(valor) {
    if (typeof valor !== "string") {
      throw fallo(400, "Escribe un correo válido.");
    }

    const correo = valor.trim().toLowerCase();

    if (
      correo.length > 150 ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(correo)
    ) {
      throw fallo(400, "Escribe un correo válido.");
    }

    return correo;
  }

  function responderError(res, error) {
    if (!error.status) {
      console.error("Error de verificación:", error.message);
    }

    if (error.retryAfter) {
      res.set("Retry-After", String(error.retryAfter));
    }

    return res.status(error.status || 500).json({
      success: false,
      message: error.status
        ? error.message
        : "No fue posible completar la operación. Intenta nuevamente.",
      ...(error.retryAfter
        ? { retryAfter: error.retryAfter }
        : {}),
    });
  }

  async function conUsuario(correo, operacion, conexion) {
    const client = conexion || await pool.connect();

    try {
      await client.query("BEGIN");

      const resultado = await client.query(
        `
        SELECT
          u.id,
          u.correo,
          u.correo_verificado,
          n.nombre_establecimiento
        FROM usuarios_negocio u
        INNER JOIN configuracion_negocio n
          ON n.id = u.id_negocio
        WHERE LOWER(u.correo) = LOWER($1)
        LIMIT 1
        FOR UPDATE OF u
        `,
        [correo]
      );

      if (!resultado.rowCount) {
        throw fallo(404, "No existe una cuenta con ese correo.");
      }

      const respuesta = await operacion(
        client,
        resultado.rows[0]
      );

      await client.query("COMMIT");

      return respuesta;
    } catch (error) {
      await client.query("ROLLBACK").catch(() => {});
      throw error;
    } finally {
      if (!conexion) {
        client.release();
      }
    }
  }

  async function crearYEnviarCodigoVerificacion(
    correo,
    conexion
  ) {
    correo = leerCorreo(correo);

    return conUsuario(
      correo,
      async (client, usuario) => {
        if (usuario.correo_verificado) {
          return {
            success: true,
            yaVerificado: true,
            message: "El correo ya se encuentra verificado.",
          };
        }

        const ultimo = await client.query(
          `
          SELECT GREATEST(
            0,
            CEIL(
              EXTRACT(
                EPOCH FROM (
                  fecha_creacion
                  + INTERVAL '60 seconds'
                  - clock_timestamp()::timestamp
                )
              )
            )
          )::int AS espera
          FROM tokens_seguridad
          WHERE id_usuario = $1
            AND tipo = 'VERIFICAR_CORREO'
          ORDER BY fecha_creacion DESC, id DESC
          LIMIT 1
          `,
          [usuario.id]
        );

        const espera = Number(
          ultimo.rows[0]?.espera || 0
        );

        if (espera > 0) {
          throw fallo(
            429,
            `Espera ${espera} segundos para solicitar otro código.`,
            espera
          );
        }

        const codigo = crypto
          .randomInt(100000, 1000000)
          .toString();

        const hash = await bcrypt.hash(codigo, 10);

        await client.query(
          `
          UPDATE tokens_seguridad
          SET usado = TRUE
          WHERE id_usuario = $1
            AND tipo = 'VERIFICAR_CORREO'
            AND usado = FALSE
          `,
          [usuario.id]
        );

        await client.query(
          `
          INSERT INTO tokens_seguridad (
            id_usuario,
            tipo,
            codigo_hash,
            fecha_expiracion,
            usado,
            intentos,
            fecha_creacion
          )
          VALUES (
            $1,
            'VERIFICAR_CORREO',
            $2,
            clock_timestamp()::timestamp
              + INTERVAL '10 minutes',
            FALSE,
            0,
            clock_timestamp()::timestamp
          )
          `,
          [usuario.id, hash]
        );

        await emailTransporter.sendMail({
          from: `"VetStec" <${process.env.EMAIL_USER}>`,
          to: usuario.correo,
          subject: "Verifica tu correo - VetStec",
          text: [
            "Hola.",
            "",
            `Gracias por registrar ${usuario.nombre_establecimiento} en VetStec.`,
            "",
            `Tu código de verificación es: ${codigo}`,
            "",
            "Tiene una vigencia de 10 minutos.",
            "Usa el código del correo más reciente.",
            "",
            "Si no realizaste este registro, puedes ignorar este mensaje.",
            "",
            "Equipo VetStec",
          ].join("\n"),
        });

        return {
          success: true,
          retryAfter: 60,
          message: "Se envió un código al correo registrado.",
        };
      },
      conexion
    );
  }

  app.post(
    "/api/enviar-codigo-verificacion",
    async (req, res) => {
      try {
        const resultado =
          await crearYEnviarCodigoVerificacion(
            req.body?.correo
          );

        return res.json(resultado);
      } catch (error) {
        return responderError(res, error);
      }
    }
  );

  app.post("/api/verificar-correo", async (req, res) => {
    try {
      const correo = leerCorreo(req.body?.correo);
      const valor = req.body?.codigo;

      const codigo = ["string", "number"].includes(
        typeof valor
      )
        ? String(valor).trim()
        : "";

      if (!/^\d{6}$/.test(codigo)) {
        throw fallo(
          400,
          "El código debe contener 6 dígitos."
        );
      }

      const resultado = await conUsuario(
        correo,
        async (client, usuario) => {
          if (usuario.correo_verificado) {
            return {
              success: true,
              yaVerificado: true,
              message: "El correo ya se encuentra verificado.",
            };
          }

          const tokens = await client.query(
            `
            SELECT *,
              fecha_expiracion
                <= clock_timestamp()::timestamp AS expirado
            FROM tokens_seguridad
            WHERE id_usuario = $1
              AND tipo = 'VERIFICAR_CORREO'
              AND usado = FALSE
            ORDER BY fecha_creacion DESC, id DESC
            LIMIT 1
            `,
            [usuario.id]
          );

          if (!tokens.rowCount) {
            return {
              status: 400,
              success: false,
              message:
                "No hay un código vigente. Solicita uno nuevo.",
            };
          }

          const token = tokens.rows[0];

          if (token.expirado) {
            await client.query(
              `
              UPDATE tokens_seguridad
              SET usado = TRUE
              WHERE id = $1
              `,
              [token.id]
            );

            return {
              status: 400,
              success: false,
              message:
                "El código ha expirado. Solicita uno nuevo.",
            };
          }

          if (token.intentos >= 5) {
            return {
              status: 429,
              success: false,
              message:
                "Se alcanzó el límite de intentos. Solicita un nuevo código.",
            };
          }

          const correcto = await bcrypt.compare(
            codigo,
            token.codigo_hash
          );

          if (!correcto) {
            await client.query(
              `
              UPDATE tokens_seguridad
              SET intentos = intentos + 1
              WHERE id = $1
              `,
              [token.id]
            );

            return {
              status: 400,
              success: false,
              message: "El código no es correcto.",
            };
          }

          await client.query(
            `
            UPDATE usuarios_negocio
            SET correo_verificado = TRUE
            WHERE id = $1
            `,
            [usuario.id]
          );

          await client.query(
            `
            UPDATE tokens_seguridad
            SET usado = TRUE
            WHERE id = $1
            `,
            [token.id]
          );

          return {
            success: true,
            message: "Correo verificado correctamente.",
          };
        }
      );

      const { status = 200, ...body } = resultado;

      return res.status(status).json(body);
    } catch (error) {
      return responderError(res, error);
    }
  });

  return crearYEnviarCodigoVerificacion;
};