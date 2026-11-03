import { useEffect, useRef, useState } from 'react';

async function pedir(url, opciones = {}) {
  const r = await fetch(url, {
    credentials: 'same-origin',
    cache: 'no-store',
    ...opciones,
  });

  if (r.status === 401) {
    window.dispatchEvent(new Event('vetstec:sesion-vencida'));
  }

  const j = await r.json().catch(() => null);

  if (!r.ok || j?.success !== true || !j.data) {
    const error = new Error(
      j?.message || 'No se pudo confirmar la operación.'
    );

    error.definitivo = r.status >= 400 &&
      r.status < 500 &&
      r.status !== 408 &&
      j?.success === false;

    throw error;
  }

  return j.data;
}

export default function InventarioProducto({
  idSucursal,
  producto,
  onCerrar,
  onGuardando,
}) {
  const [datos, setDatos] = useState(null);
  const [desde, setDesde] = useState(0);
  const [cargando, setCargando] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState('');
  const [aviso, setAviso] = useState('');
  const [tipo, setTipo] = useState('ENTRADA');
  const [cantidad, setCantidad] = useState('');
  const [motivo, setMotivo] = useState('');
  const [pendiente, setPendiente] = useState(null);
  const [recargar, setRecargar] = useState(0);
  const [rechazado, setRechazado] = useState(false);

  const enviando = useRef(false);
  const montado = useRef(false);

  const base =
    `/api/propietario/sucursales/${idSucursal}/catalogo-productos/${producto.id}/movimientos`;

  useEffect(() => {
    montado.current = true;
    return () => { montado.current = false; };
  }, []);

  useEffect(() => {
    const controller = new AbortController();

    setCargando(true);
    setError('');

    pedir(`${base}?desde=${desde}`, { signal: controller.signal })
      .then(d => {
        if (!controller.signal.aborted) setDatos(d);
      })
      .catch(e => {
        if (!controller.signal.aborted) {
          setDatos(null);
          setError(e.message);
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setCargando(false);
      });

    return () => controller.abort();
  }, [base, desde, recargar]);

  async function registrar(e) {
    e.preventDefault();

    if (
      enviando.current ||
      cargando ||
      !datos ||
      rechazado
    ) return;

    const body = pendiente || {
      solicitud_id: crypto.randomUUID(),
      tipo_movimiento: tipo,
      cantidad,
      motivo,
      stock_esperado: datos.producto.stock_actual,
    };

    setPendiente(body);
    enviando.current = true;
    setGuardando(true);
    onGuardando(true);
    setError('');

    try {
      const respuesta = await pedir(base, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Requested-With': 'VetStec',
        },
        body: JSON.stringify(body),
      });

      if (!montado.current) return;

      setPendiente(null);
      setCantidad('');
      setMotivo('');
      setAviso(
        respuesta.repetida
          ? 'La operación ya estaba registrada; no se duplicó.'
          : 'Movimiento registrado.'
      );
      setDesde(0);
      setRecargar(n => n + 1);
    } catch (e) {
      if (!montado.current) return;

      setError(e.message);

      if (e.definitivo) {
        setPendiente(null);
        setRechazado(true);
      }
    } finally {
      enviando.current = false;
      if (montado.current) setGuardando(false);
      onGuardando(false);
    }
  }

  return (
    <section className="owner-products">
      <h4>Inventario: {producto.nombre_producto}</h4>

      <button
        type="button"
        className="button button-secondary"
        disabled={guardando}
        onClick={() => {
          if (
            pendiente &&
            !window.confirm(
              'El resultado no está confirmado. Si cierras, revisa el historial antes de registrar otra operación. ¿Cerrar?'
            )
          ) return;

          onCerrar();
        }}
      >
        Cerrar inventario
      </button>

      {error && <p className="owner-error" role="alert">{error}</p>}
      {aviso && <p className="owner-success" role="status">{aviso}</p>}
      {cargando && <p role="status">Consultando inventario…</p>}

      {rechazado && (
        <p>
          La operación fue rechazada. Cierra inventario y vuelve a abrirlo
          para revisar los datos antes de intentarlo otra vez.
        </p>
      )}

      {pendiente && !guardando && (
        <p>
          El resultado no está confirmado. Usa “Comprobar operación”
          para reenviar exactamente la misma solicitud sin duplicarla.
        </p>
      )}

      {datos && !cargando && (
        <>
          <p>
            Existencia actual: <strong>{datos.producto.stock_actual}</strong>
            {' · '}Mínimo: {datos.producto.stock_minimo}
          </p>

          <form onSubmit={registrar}>
            <fieldset
              className="owner-edit-fields"
              disabled={guardando || Boolean(pendiente) || rechazado}
            >
              <legend>Registrar movimiento</legend>

              <label className="form-field">
                <span>Tipo</span>
                <select value={tipo} onChange={e => setTipo(e.target.value)}>
                  <option value="ENTRADA">Entrada</option>
                  <option value="SALIDA">Salida</option>
                </select>
              </label>

              <label className="form-field">
                <span>Cantidad de unidades</span>
                <input
                  type="number"
                  min="1"
                  max="2147483647"
                  step="1"
                  required
                  value={cantidad}
                  onChange={e => setCantidad(e.target.value)}
                />
              </label>

              <label className="form-field">
                <span>Motivo</span>
                <input
                  required
                  maxLength={200}
                  value={motivo}
                  onChange={e => setMotivo(e.target.value)}
                />
              </label>

              <p>
                Para corregir un conteo, registra únicamente la diferencia
                como entrada o salida y explica el ajuste en el motivo.
              </p>
            </fieldset>

            <button
              type="submit"
              className="button button-primary"
              disabled={guardando || rechazado}
            >
              {guardando
                ? 'Procesando…'
                : pendiente
                  ? 'Comprobar operación'
                  : 'Registrar movimiento'}
            </button>
          </form>

          <h4>Historial del producto</h4>

          {datos.movimientos.length === 0 ? (
            <p>No hay movimientos registrados.</p>
          ) : (
            <div className="owner-table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Fecha registrada</th>
                    <th>Tipo</th>
                    <th>Cantidad</th>
                    <th>Antes</th>
                    <th>Después</th>
                    <th>Motivo</th>
                    <th>Responsable</th>
                  </tr>
                </thead>
                <tbody>
                  {datos.movimientos.map(m => (
                    <tr key={m.id}>
                      <td>{m.fecha_movimiento || 'Sin fecha'}</td>
                      <td>{m.tipo_movimiento}</td>
                      <td>{m.cantidad}</td>
                      <td>{m.stock_anterior ?? '—'}</td>
                      <td>{m.stock_resultante ?? '—'}</td>
                      <td>{m.motivo || 'Sin motivo'}</td>
                      <td>
                        {m.id_usuario_registro != null
                          ? `Usuario #${m.id_usuario_registro}`
                          : m.id_empleado != null
                            ? `Empleado #${m.id_empleado}`
                            : 'Sin registro'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div className="owner-edit-actions">
            <button
              type="button"
              disabled={guardando || Boolean(pendiente) || desde === 0}
              onClick={() => setDesde(n => Math.max(0, n - 20))}
            >
              Anterior
            </button>
            <button
              type="button"
              disabled={guardando || Boolean(pendiente) || !datos.hayMas}
              onClick={() => setDesde(n => n + 20)}
            >
              Siguiente
            </button>
          </div>
        </>
      )}
    </section>
  );
}