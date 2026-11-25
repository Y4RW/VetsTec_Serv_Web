import { useCallback, useEffect, useRef, useState } from 'react';
import InventarioProducto from './InventarioProducto';

const nuevo = () => ({
  codigo_barras: '',
  nombre_producto: '',
  id_categoria: '',
  id_proveedor: '',
  tipo_uso: 'AMBOS',
  precio_compra: '',
  precio_venta: '',
  stock_minimo: '5',
  fecha_caducidad: '',
});

async function consultar(url, opciones = {}) {
  const r = await fetch(url, {
    credentials: 'same-origin',
    cache: 'no-store',
    ...opciones,
  });

  if (r.status === 401) {
    window.dispatchEvent(new Event('vetstec:sesion-vencida'));
  }

  const j = await r.json().catch(() => null);

  if (
    !r.ok ||
    j?.success !== true ||
    !j.data ||
    !Number.isInteger(j.totalSucursal)
  ) {
    throw new Error(
      j?.message ||
      'No fue posible confirmar la operación. Recarga la lista antes de reintentar.'
    );
  }

  return j;
}

export default function ProductosSucursal({
  idSucursal,
  onTotal,
  onGuardando,
}) {
  const [datos, setDatos] = useState(null);
  const [busqueda, setBusqueda] = useState('');
  const [consulta, setConsulta] = useState({ q: '', desde: 0 });
  const [form, setForm] = useState(null);
  const [inventario, setInventario] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [bloqueado, setBloqueado] = useState(false);
  const [error, setError] = useState('');
  const [aviso, setAviso] = useState('');

  const lectura = useRef(null);
  const enviando = useRef(false);
  const montado = useRef(false);

  const base = `/api/propietario/sucursales/${idSucursal}/catalogo-productos`;

  const cargar = useCallback(async ({ q, desde }) => {
    lectura.current?.abort();

    const controller = new AbortController();
    lectura.current = controller;

    setCargando(true);
    setError('');
    setDatos(null);

    try {
      const params = new URLSearchParams({
        q,
        desde: String(desde),
      });

      const j = await consultar(`${base}?${params}`, {
        signal: controller.signal,
      });

      if (!montado.current || controller.signal.aborted) return;

      setDatos(j.data);
      setForm(null);
      setBloqueado(false);
      onTotal(idSucursal, j.totalSucursal);
    } catch (e) {
      if (montado.current && !controller.signal.aborted) {
        setError(e.message);
      }
    } finally {
      if (montado.current && !controller.signal.aborted) {
        setCargando(false);
      }
    }
  }, [base, idSucursal, onTotal]);

  useEffect(() => {
    montado.current = true;
    cargar(consulta);

    return () => {
      montado.current = false;
      lectura.current?.abort();
    };
  }, [cargar, consulta]);

  async function escribir(metodo, producto) {
    if (enviando.current || cargando || bloqueado) return;

    enviando.current = true;
    setGuardando(true);
    onGuardando(true);
    setError('');
    setAviso('');

    const body = metodo === 'DELETE'
      ? { version: producto.version }
      : Object.fromEntries(
          Object.keys(nuevo()).map(c => [c, producto[c]])
        );

    if (metodo === 'PATCH') {
      body.version = producto.version;
    }

    try {
      const j = await consultar(
        `${base}${metodo === 'POST' ? '' : `/${producto.id}`}`,
        {
          method: metodo,
          headers: {
            'Content-Type': 'application/json',
            'X-Requested-With': 'VetStec',
          },
          body: JSON.stringify(body),
        }
      );

      if (!montado.current) return;

      onTotal(idSucursal, j.totalSucursal);
      setForm(null);
      setAviso(
        metodo === 'DELETE'
          ? 'Producto eliminado del catálogo.'
          : 'Producto guardado correctamente.'
      );

      const primera = { q: consulta.q, desde: 0 };

      if (consulta.desde !== 0) {
        setConsulta(primera);
      } else {
        await cargar(primera);
      }
    } catch (e) {
      if (montado.current) {
        setError(e.message);
        setBloqueado(true);
      }
    } finally {
      enviando.current = false;

      if (montado.current) {
        setGuardando(false);
      }

      onGuardando(false);
    }
  }

  function editar(p) {
    setAviso('');
    setError('');

    setForm({
      ...Object.fromEntries(
        Object.keys(nuevo()).map(c => [c, p[c] ?? ''])
      ),
      id: p.id,
      version: p.version,
      stock_actual: p.stock_actual,
    });
  }

  const ocupado = guardando || cargando;

  if (inventario) {
    return (
      <InventarioProducto
        key={inventario.id}
        idSucursal={idSucursal}
        producto={inventario}
        onGuardando={onGuardando}
        onCerrar={() => {
          setInventario(null);
          cargar(consulta);
        }}
      />
    );
  }

  const conStockBajo = (datos?.productos || []).filter(
    p => p.stock_actual <= p.stock_minimo
  ).length;

  return (
    <section
      className="owner-products own-module"
      aria-labelledby={`productos-${idSucursal}`}
    >
      <div className="own-module-header">
        <div>
          <h4 id={`productos-${idSucursal}`}>Catálogo e inventario de productos</h4>
          <p>Administra precios, alertas de stock mínimo y movimientos de entrada/salida.</p>
        </div>

        <div className="own-module-actions">
          <button
            type="button"
            className="own-btn own-btn-secondary"
            disabled={ocupado}
            onClick={() => {
              if (form && !window.confirm('Recargar cerrará el formulario abierto. ¿Continuar?')) return;
              cargar(consulta);
            }}
          >
            ↻ Actualizar
          </button>

          <button
            type="button"
            className="own-btn own-btn-primary"
            disabled={ocupado || bloqueado || !datos || Boolean(form)}
            onClick={() => {
              setForm(nuevo());
              setAviso('');
            }}
          >
            + Nuevo producto
          </button>
        </div>
      </div>

      {aviso && (
        <div className="own-alert own-alert-success" role="status">
          <span>✓ {aviso}</span>
          <button type="button" className="own-alert-dismiss" onClick={() => setAviso('')} aria-label="Cerrar aviso">×</button>
        </div>
      )}

      {error && (
        <p className="own-alert own-alert-danger" role="alert">{error}</p>
      )}

      {bloqueado && (
        <div className="own-alert own-alert-warning">
          Antes de reintentar, pulsa <strong>Actualizar</strong> para verificar el estado actual (copia los datos del formulario si deseas conservarlos).
        </div>
      )}

      <form
        className="own-search-bar"
        onSubmit={e => {
          e.preventDefault();
          setConsulta({ q: busqueda.trim(), desde: 0 });
        }}
      >
        <div className="own-search-input-wrap">
          <span className="own-search-icon" aria-hidden="true">🔎</span>
          <input
            type="search"
            value={busqueda}
            maxLength={150}
            placeholder="Buscar por nombre o código de barras…"
            aria-label="Buscar por nombre o código de barras"
            disabled={ocupado || Boolean(form)}
            onChange={e => setBusqueda(e.target.value)}
          />
        </div>

        <button
          type="submit"
          className="own-btn own-btn-secondary"
          disabled={ocupado || Boolean(form)}
        >
          Buscar
        </button>

        {(consulta.q || busqueda) && (
          <button
            type="button"
            className="own-btn own-btn-ghost"
            disabled={ocupado || Boolean(form)}
            onClick={() => {
              setBusqueda('');
              if (consulta.q) setConsulta({ q: '', desde: 0 });
            }}
          >
            Limpiar
          </button>
        )}
      </form>

      {form && (
        <form
          className="own-form-panel"
          onSubmit={e => {
            e.preventDefault();
            escribir(form.id ? 'PATCH' : 'POST', form);
          }}
        >
          <div className="own-form-panel-head">
            <div>
              <span className="own-eyebrow">{form.id ? 'Edición de artículo' : 'Alta de artículo'}</span>
              <h4>{form.id ? 'Editar producto' : 'Registrar nuevo producto'}</h4>
            </div>
            <button
              type="button"
              className="own-btn own-btn-sm own-btn-ghost"
              disabled={ocupado}
              onClick={() => setForm(null)}
            >
              ✕ Cerrar
            </button>
          </div>

          <div className="own-info-banner own-info-banner-compact">
            <span>
              📦 Existencia actual: <strong>{form.stock_actual ?? 0} unidades</strong>. Para sumar o descontar existencias usa el botón <strong>Movimientos</strong> en la tabla.
            </span>
          </div>

          <fieldset className="own-fieldset" disabled={ocupado || bloqueado}>
            <div className="own-form-grid">
              <label className="own-field">
                <span>Nombre del producto *</span>
                <input
                  type="text"
                  required
                  maxLength={150}
                  placeholder="Ej. Croquetas Adulto Razas Pequeñas 3 kg"
                  value={form.nombre_producto}
                  onChange={e => setForm(f => ({ ...f, nombre_producto: e.target.value }))}
                />
              </label>

              <label className="own-field">
                <span>Código de barras / SKU *</span>
                <input
                  type="text"
                  required
                  maxLength={100}
                  placeholder="Ej. 7501234567890"
                  value={form.codigo_barras}
                  onChange={e => setForm(f => ({ ...f, codigo_barras: e.target.value }))}
                />
              </label>

              <label className="own-field">
                <span>Precio de compra ($ MXN) *</span>
                <input
                  type="number"
                  required
                  min="0"
                  max="99999999.99"
                  step="0.01"
                  placeholder="0.00"
                  value={form.precio_compra}
                  onChange={e => setForm(f => ({ ...f, precio_compra: e.target.value }))}
                />
              </label>

              <label className="own-field">
                <span>Precio de venta ($ MXN) *</span>
                <input
                  type="number"
                  required
                  min="0"
                  max="99999999.99"
                  step="0.01"
                  placeholder="0.00"
                  value={form.precio_venta}
                  onChange={e => setForm(f => ({ ...f, precio_venta: e.target.value }))}
                />
              </label>

              <label className="own-field">
                <span>Alerta de stock mínimo *</span>
                <input
                  type="number"
                  required
                  min="0"
                  max="2147483647"
                  step="1"
                  value={form.stock_minimo}
                  onChange={e => setForm(f => ({ ...f, stock_minimo: e.target.value }))}
                />
              </label>

              <label className="own-field">
                <span>Fecha de caducidad (opcional)</span>
                <input
                  type="date"
                  value={form.fecha_caducidad}
                  onChange={e => setForm(f => ({ ...f, fecha_caducidad: e.target.value }))}
                />
              </label>

              <label className="own-field">
                <span>Área de uso</span>
                <select
                  value={form.tipo_uso}
                  onChange={e => setForm(f => ({ ...f, tipo_uso: e.target.value }))}
                >
                  <option value="VETERINARIA">Veterinaria</option>
                  <option value="ESTETICA">Estética</option>
                  <option value="AMBOS">Ambas áreas</option>
                </select>
              </label>

              <label className="own-field">
                <span>Categoría (opcional)</span>
                <select
                  value={form.id_categoria}
                  onChange={e => setForm(f => ({ ...f, id_categoria: e.target.value }))}
                >
                  <option value="">Sin categoría</option>
                  {datos?.categorias.map(c => (
                    <option key={c.id} value={c.id}>
                      {c.nombre_categoria} ({c.aplica_a})
                    </option>
                  ))}
                </select>
              </label>

              <label className="own-field own-field-full">
                <span>Proveedor (opcional)</span>
                <select
                  value={form.id_proveedor}
                  onChange={e => setForm(f => ({ ...f, id_proveedor: e.target.value }))}
                >
                  <option value="">Sin proveedor asignado</option>
                  {datos?.proveedores.map(p => (
                    <option key={p.id} value={p.id}>
                      {p.nombre_empresa}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <div className="own-form-footer">
              <button
                type="button"
                className="own-btn own-btn-secondary"
                disabled={ocupado}
                onClick={() => setForm(null)}
              >
                Cancelar
              </button>
              <button type="submit" className="own-btn own-btn-primary">
                {guardando ? 'Guardando…' : '✓ Guardar producto'}
              </button>
            </div>
          </fieldset>
        </form>
      )}

      {cargando && (
        <div className="own-loading-card" role="status">
          <span className="own-spinner" aria-hidden="true" />
          <span>Cargando catálogo de productos…</span>
        </div>
      )}

      {datos && (
        <>
          {conStockBajo > 0 && (
            <div className="own-alert own-alert-warning">
              <span>
                ⚠️ Tienes <strong>{conStockBajo}</strong> producto(s) en esta página con existencia igual o menor al mínimo configurado.
              </span>
            </div>
          )}

          {datos.productos.length === 0 ? (
            <div className="own-empty-box">
              <p>
                {consulta.q
                  ? `No se encontraron productos para “${consulta.q}”.`
                  : 'Todavía no hay productos registrados en esta sucursal.'}
              </p>
              {!consulta.q && !form && (
                <button
                  type="button"
                  className="own-btn own-btn-primary"
                  onClick={() => setForm(nuevo())}
                >
                  + Registrar mi primer producto
                </button>
              )}
            </div>
          ) : (
            <div className="own-table-card">
              <div className="owner-table-wrap">
                <table className="own-table">
                  <thead>
                    <tr>
                      <th>Producto</th>
                      <th>Código</th>
                      <th>Precio de venta</th>
                      <th>Existencia</th>
                      <th>Acciones</th>
                    </tr>
                  </thead>
                  <tbody>
                    {datos.productos.map(p => {
                      const agotado = p.stock_actual === 0;
                      const bajo = !agotado && p.stock_actual <= p.stock_minimo;
                      return (
                        <tr key={p.id}>
                          <td>
                            <strong>{p.nombre_producto}</strong>
                          </td>
                          <td>
                            <code className="own-code-chip">{p.codigo_barras}</code>
                          </td>
                          <td>
                            <strong className="own-price-tag">
                              ${Number(p.precio_venta).toFixed(2)}
                            </strong>
                          </td>
                          <td>
                            <span
                              className={`own-badge ${
                                agotado
                                  ? 'own-badge-danger'
                                  : bajo
                                    ? 'own-badge-warning'
                                    : 'own-badge-success'
                              }`}
                            >
                              {agotado
                                ? 'Agotado (0)'
                                : bajo
                                  ? `⚠️ Stock bajo (${p.stock_actual} / mín. ${p.stock_minimo})`
                                  : `✓ ${p.stock_actual} uds.`}
                            </span>
                          </td>
                          <td>
                            <div className="own-row-actions">
                              <button
                                type="button"
                                className="own-btn own-btn-sm own-btn-teal"
                                disabled={ocupado || bloqueado || Boolean(form)}
                                onClick={() => setInventario(p)}
                              >
                                📦 Movimientos
                              </button>

                              <button
                                type="button"
                                className="own-btn own-btn-sm own-btn-secondary"
                                disabled={ocupado || bloqueado || Boolean(form)}
                                onClick={() => editar(p)}
                              >
                                ✎ Editar
                              </button>

                              <button
                                type="button"
                                className="own-btn own-btn-sm own-btn-danger-ghost"
                                title={p.stock_actual !== 0 ? 'Solo se puede eliminar cuando la existencia es 0' : undefined}
                                disabled={ocupado || bloqueado || Boolean(form) || p.stock_actual !== 0}
                                onClick={() => {
                                  if (
                                    window.confirm(
                                      `¿Eliminar “${p.nombre_producto}”? Solo se permite cuando no tiene existencias ni movimientos previos.`
                                    )
                                  ) {
                                    escribir('DELETE', p);
                                  }
                                }}
                              >
                                Eliminar
                              </button>
                            </div>
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
            <span className="own-pagination-meta">
              {datos.total} producto(s) encontrado(s) · Hasta 20 por página.
            </span>

            <div className="own-pagination-buttons">
              <button
                type="button"
                className="own-btn own-btn-sm own-btn-secondary"
                disabled={ocupado || Boolean(form) || consulta.desde === 0}
                onClick={() => setConsulta(c => ({
                  ...c,
                  desde: Math.max(0, c.desde - 20),
                }))}
              >
                ← Anterior
              </button>

              <button
                type="button"
                className="own-btn own-btn-sm own-btn-secondary"
                disabled={ocupado || Boolean(form) || !datos.hayMas}
                onClick={() => setConsulta(c => ({
                  ...c,
                  desde: c.desde + 20,
                }))}
              >
                Siguiente →
              </button>
            </div>
          </div>
        </>
      )}
    </section>
  );
}