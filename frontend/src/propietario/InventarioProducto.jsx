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
          : 'Movimiento de inventario registrado.'
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

  const stockActual = datos?.producto?.stock_actual ?? producto.stock_actual ?? 0;
  const stockMinimo = datos?.producto?.stock_minimo ?? producto.stock_minimo ?? 0;
  const cantNum = Number(cantidad);
  const stockProyectado = Number.isInteger(cantNum) && cantNum > 0
    ? (tipo === 'ENTRADA' ? stockActual + cantNum : stockActual - cantNum)
    : null;

  return (
    <section className="owner-products own-module">
      <div className="own-module-header">
        <div>
          <span className="own-eyebrow">Control de existencias</span>
          <h4>📦 {producto.nombre_producto}</h4>
          {producto.codigo_barras && (
            <p>Código: <code className="own-code-chip">{producto.codigo_barras}</code></p>
          )}
        </div>

        <div className="own-module-actions">
          <button
            type="button"
            className="own-btn own-btn-secondary"
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
            ← Volver a productos
          </button>
        </div>
      </div>

      {error && <p className="own-alert own-alert-danger" role="alert">{error}</p>}
      {aviso && (
        <div className="own-alert own-alert-success" role="status">
          <span>✓ {aviso}</span>
          <button type="button" className="own-alert-dismiss" onClick={() => setAviso('')} aria-label="Cerrar aviso">×</button>
        </div>
      )}

      {rechazado && (
        <div className="own-alert own-alert-warning">
          La operación fue rechazada. Vuelve a productos y abre nuevamente este inventario para sincronizar la existencia antes de reintentar.
        </div>
      )}

      {pendiente && !guardando && (
        <div className="own-alert own-alert-warning">
          El resultado quedó pendiente de confirmación. Pulsa <strong>Comprobar operación</strong> para verificarlo sin duplicar el movimiento.
        </div>
      )}

      {cargando && (
        <div className="own-loading-card" role="status">
          <span className="own-spinner" aria-hidden="true" />
          <span>Consultando existencias e historial…</span>
        </div>
      )}

      {datos && !cargando && (
        <>
          <div className="own-stock-summary">
            <div className="own-stock-box">
              <span>Existencia actual</span>
              <strong>{datos.producto.stock_actual}</strong>
            </div>
            <div className="own-stock-box">
              <span>Stock mínimo</span>
              <strong>{datos.producto.stock_minimo}</strong>
            </div>
            <div className="own-stock-box">
              <span>Estado</span>
              <div>
                <span
                  className={`own-badge ${
                    stockActual === 0
                      ? 'own-badge-danger'
                      : stockActual <= stockMinimo
                        ? 'own-badge-warning'
                        : 'own-badge-success'
                  }`}
                >
                  {stockActual === 0
                    ? 'Sin existencias'
                    : stockActual <= stockMinimo
                      ? '⚠️ Stock bajo'
                      : '✓ Óptimo'}
                </span>
              </div>
            </div>
          </div>

          <form className="own-form-panel" onSubmit={registrar}>
            <fieldset
              className="own-fieldset"
              disabled={guardando || Boolean(pendiente) || rechazado}
            >
              <legend className="own-fieldset-legend">Registrar movimiento de inventario</legend>

              <div className="own-segmented" role="group" aria-label="Tipo de movimiento">
                <button
                  type="button"
                  aria-pressed={tipo === 'ENTRADA'}
                  className={`own-segment-btn ${tipo === 'ENTRADA' ? 'is-entrada' : ''}`}
                  onClick={() => setTipo('ENTRADA')}
                >
                  📥 Entrada (+ sumar unidades)
                </button>
                <button
                  type="button"
                  aria-pressed={tipo === 'SALIDA'}
                  className={`own-segment-btn ${tipo === 'SALIDA' ? 'is-salida' : ''}`}
                  onClick={() => setTipo('SALIDA')}
                >
                  📤 Salida (− descontar unidades)
                </button>
              </div>

              <div className="own-form-grid">
                <label className="own-field">
                  <span>Cantidad de unidades *</span>
                  <input
                    type="number"
                    min="1"
                    max="2147483647"
                    step="1"
                    required
                    placeholder="Ej. 10"
                    value={cantidad}
                    onChange={e => setCantidad(e.target.value)}
                  />
                </label>

                <label className="own-field">
                  <span>Motivo del movimiento *</span>
                  <input
                    required
                    maxLength={200}
                    placeholder={tipo === 'ENTRADA' ? 'Ej. Compra a proveedor, reposición' : 'Ej. Venta en mostrador, uso interno, merma'}
                    value={motivo}
                    onChange={e => setMotivo(e.target.value)}
                  />
                </label>
              </div>

              <p className="own-field-hint">
                {stockProyectado !== null ? (
                  <>
                    Resultado estimado tras guardar:{' '}
                    <strong className={stockProyectado < 0 ? 'own-text-danger' : ''}>
                      {stockProyectado} unidades
                    </strong>.{' '}
                  </>
                ) : null}
                Para corregir un conteo físico, ingresa únicamente la diferencia como entrada o salida.
              </p>
            </fieldset>

            <div className="own-form-footer">
              <button
                type="submit"
                className="own-btn own-btn-primary"
                disabled={guardando || rechazado || (stockProyectado !== null && stockProyectado < 0)}
              >
                {guardando
                  ? 'Procesando…'
                  : pendiente
                    ? 'Comprobar operación'
                    : tipo === 'ENTRADA'
                      ? '+ Registrar entrada'
                      : '− Registrar salida'}
              </button>
            </div>
          </form>

          <div className="own-subsection">
            <div className="own-subsection-head">
              <div>
                <h5>Historial de movimientos</h5>
                <p>Registro cronológico de entradas, salidas y ajustes.</p>
              </div>
            </div>

            {datos.movimientos.length === 0 ? (
              <div className="own-empty-box">
                <p>Aún no hay movimientos registrados para este producto.</p>
              </div>
            ) : (
              <div className="own-table-card">
                <div className="owner-table-wrap">
                  <table className="own-table">
                    <thead>
                      <tr>
                        <th>Fecha</th>
                        <th>Movimiento</th>
                        <th>Unidades</th>
                        <th>Cambio de stock</th>
                        <th>Motivo</th>
                        <th>Registrado por</th>
                      </tr>
                    </thead>
                    <tbody>
                      {datos.movimientos.map(m => {
                        const esEntrada = m.tipo_movimiento === 'ENTRADA';
                        return (
                          <tr key={m.id}>
                            <td>{m.fecha_movimiento || 'Sin fecha'}</td>
                            <td>
                              <span className={`own-badge ${esEntrada ? 'own-badge-success' : 'own-badge-danger'}`}>
                                {esEntrada ? '📥 Entrada' : '📤 Salida'}
                              </span>
                            </td>
                            <td>
                              <strong>
                                {esEntrada ? `+${m.cantidad}` : `-${m.cantidad}`}
                              </strong>
                            </td>
                            <td>
                              {m.stock_anterior ?? '—'} → <strong>{m.stock_resultante ?? '—'}</strong>
                            </td>
                            <td>{m.motivo || 'Sin motivo'}</td>
                            <td>
                              <small className="own-cell-sub">
                                {m.id_usuario_registro != null
                                  ? `Usuario #${m.id_usuario_registro}`
                                  : m.id_empleado != null
                                    ? `Empleado #${m.id_empleado}`
                                    : 'Sistema'}
                              </small>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            <div className="own-pagination">
              <span className="own-pagination-meta">Mostrando bloques de hasta 20 movimientos</span>
              <div className="own-pagination-buttons">
                <button
                  type="button"
                  className="own-btn own-btn-sm own-btn-secondary"
                  disabled={guardando || Boolean(pendiente) || desde === 0}
                  onClick={() => setDesde(n => Math.max(0, n - 20))}
                >
                  ← Anterior
                </button>
                <button
                  type="button"
                  className="own-btn own-btn-sm own-btn-secondary"
                  disabled={guardando || Boolean(pendiente) || !datos.hayMas}
                  onClick={() => setDesde(n => n + 20)}
                >
                  Siguiente →
                </button>
              </div>
            </div>
          </div>
        </>
      )}
    </section>
  );
}