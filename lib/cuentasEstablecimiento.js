function cuentaDeNegocioSQL(idNegocio, aliasUsuario = 'u') {
  return `(${aliasUsuario}.id_negocio = ${idNegocio} OR EXISTS (
    SELECT 1
    FROM public.redes_sucursales suc
    JOIN public.redes_propietarios prop ON prop.id_red = suc.id_red
    JOIN public.redes_sucursales origen ON origen.id_red = prop.id_red
    WHERE suc.id_negocio = ${idNegocio}
      AND prop.id_usuario = ${aliasUsuario}.id
      AND prop.activo = TRUE
      AND origen.id_negocio = ${aliasUsuario}.id_negocio
      AND ${aliasUsuario}.dos_pasos_activo = FALSE
  ))`;
}

function cuentaVerificadaSQL(idNegocio) {
  return `EXISTS (SELECT 1 FROM public.usuarios_negocio u
    WHERE ${cuentaDeNegocioSQL(idNegocio)}
      AND u.activo = TRUE AND u.correo_verificado = TRUE)`;
}

module.exports = { cuentaDeNegocioSQL, cuentaVerificadaSQL };