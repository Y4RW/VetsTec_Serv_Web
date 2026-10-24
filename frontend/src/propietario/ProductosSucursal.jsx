import { useCallback, useEffect, useRef, useState } from 'react';

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
  const [cargando, setCargando] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [bloqueado, setBloqueado] = useState(false);
  const [error, setError] = useState('');
  const [aviso, setAviso] = useState('');

  const lectura = useRef(null);
  const enviando = useRef(false);
  const montado = useRef(false);

  const base =
    `/api/propietario/sucursales/${idSucursal}/catalogo-productos`;

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
          ? 'Producto eliminado.'
          : 'Producto guardado.'
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

  return (
    <section
      className="owner-products"
      aria-labelledby={`productos-${idSucursal}`}
    >
      <h4 id={`productos-${idSucursal}`}>
        Productos de esta sucursal
      </h4>

      {aviso && (
        <p className="owner-success" role="status">{aviso}</p>
      )}

      {error && (
        <p className="owner-error" role="alert">{error}</p>
      )}

      {bloqueado && (
        <p>
          Antes de reintentar, recarga la lista para comprobar el resultado.
          Copia los datos del formulario que quieras conservar:
          la recarga lo cerrará.
        </p>
      )}

      <div className="owner-edit-actions">
        <button
          type="button"
          className="button button-secondary"
          disabled={ocupado}
          onClick={() => {
            if (
              form &&
              !window.confirm('Recargar cerrará el formulario. ¿Continuar?')
            ) return;

            cargar(consulta);
          }}
        >
          Recargar lista
        </button>

        <button
          type="button"
          className="button button-primary"
          disabled={ocupado || bloqueado || !datos || Boolean(form)}
          onClick={() => {
            setForm(nuevo());
            setAviso('');
          }}
        >
          Agregar producto
        </button>
      </div>

      <form
        className="owner-edit-actions"
        onSubmit={e => {
          e.preventDefault();
          setConsulta({ q: busqueda.trim(), desde: 0 });
        }}
      >
        <label className="form-field">
          <span>Buscar por nombre o código de barras</span>
          <input
            value={busqueda}
            maxLength={150}
            disabled={ocupado || Boolean(form)}
            onChange={e => setBusqueda(e.target.value)}
          />
        </label>

        <button
          type="submit"
          className="button button-secondary"
          disabled={ocupado || Boolean(form)}
        >
          Buscar
        </button>
      </form>

      {form && (
        <form
          className="register-card"
          onSubmit={e => {
            e.preventDefault();
            escribir(form.id ? 'PATCH' : 'POST', form);
          }}
        >
          <h4>{form.id ? 'Editar producto' : 'Nuevo producto'}</h4>

          <p>
            Existencia: {form.stock_actual ?? 0}.
            Las existencias se administran mediante movimientos de inventario.
          </p>

          <fieldset
            className="owner-edit-fields"
            disabled={ocupado || bloqueado}
          >
            <legend>Datos del producto</legend>

            <div className="register-form-grid">
              {[
                ['codigo_barras', 'Código de barras', 'text', 100],
                ['nombre_producto', 'Nombre', 'text', 150],
                ['precio_compra', 'Precio de compra', 'number'],
                ['precio_venta', 'Precio de venta', 'number'],
                ['stock_minimo', 'Existencia mínima', 'number'],
                ['fecha_caducidad', 'Fecha de caducidad (opcional)', 'date'],
              ].map(([campo, etiqueta, tipo, max]) => (
                <label className="form-field" key={campo}>
                  <span>{etiqueta}</span>
                  <input
                    type={tipo}
                    value={form[campo]}
                    maxLength={max}
                    required={campo !== 'fecha_caducidad'}
                    min={tipo === 'number' ? '0' : undefined}
                    max={
                      tipo === 'number'
                        ? campo === 'stock_minimo'
                          ? '2147483647'
                          : '99999999.99'
                        : undefined
                    }
                    step={
                      tipo === 'number'
                        ? campo === 'stock_minimo' ? '1' : '0.01'
                        : undefined
                    }
                    onChange={e => setForm(f => ({
                      ...f,
                      [campo]: e.target.value,
                    }))}
                  />
                </label>
              ))}

              <label className="form-field">
                <span>Tipo de uso</span>
                <select
                  value={form.tipo_uso}
                  onChange={e => setForm(f => ({
                    ...f,
                    tipo_uso: e.target.value,
                  }))}
                >
                  <option value="VETERINARIA">Veterinaria</option>
                  <option value="ESTETICA">Estética</option>
                  <option value="AMBOS">Ambos</option>
                </select>
              </label>

              <label className="form-field">
                <span>Categoría (opcional)</span>
                <select
                  value={form.id_categoria}
                  onChange={e => setForm(f => ({
                    ...f,
                    id_categoria: e.target.value,
                  }))}
                >
                  <option value="">Sin categoría</option>
                  {datos?.categorias.map(c => (
                    <option key={c.id} value={c.id}>
                      {c.nombre_categoria} ({c.aplica_a})
                    </option>
                  ))}
                </select>
              </label>

              <label className="form-field">
                <span>Proveedor (opcional)</span>
                <select
                  value={form.id_proveedor}
                  onChange={e => setForm(f => ({
                    ...f,
                    id_proveedor: e.target.value,
                  }))}
                >
                  <option value="">Sin proveedor</option>
                  {datos?.proveedores.map(p => (
                    <option key={p.id} value={p.id}>
                      {p.nombre_empresa}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <button type="submit" className="button button-primary">
              {guardando ? 'Guardando…' : 'Guardar producto'}
            </button>
          </fieldset>

          <button
            type="button"
            className="button button-secondary"
            disabled={ocupado}
            onClick={() => setForm(null)}
          >
            Cerrar formulario
          </button>
        </form>
      )}

      {cargando && <p role="status">Cargando productos…</p>}

      {datos && (
        <>
          <p>
            {datos.total} resultado(s). Hasta 20 productos por página.
          </p>

          {datos.productos.length === 0 ? (
            <p>No hay productos para esta búsqueda.</p>
          ) : (
            <div className="owner-table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Código</th>
                    <th>Producto</th>
                    <th>Precio de venta</th>
                    <th>Existencia</th>
                    <th>Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {datos.productos.map(p => (
                    <tr key={p.id}>
                      <td>{p.codigo_barras}</td>
                      <td>{p.nombre_producto}</td>
                      <td>${Number(p.precio_venta).toFixed(2)}</td>
                      <td>
                        {p.stock_actual}
                        {p.stock_actual <= p.stock_minimo && ' · Stock bajo'}
                      </td>
                      <td>
                        <button
                          type="button"
                          disabled={ocupado || bloqueado || Boolean(form)}
                          onClick={() => editar(p)}
                        >
                          Editar
                        </button>

                        <button
                          type="button"
                          disabled={
                            ocupado ||
                            bloqueado ||
                            Boolean(form) ||
                            p.stock_actual !== 0
                          }
                          onClick={() => {
                            if (
                              window.confirm(
                                `¿Eliminar “${p.nombre_producto}”? Solo se permite sin existencias ni movimientos.`
                              )
                            ) {
                              escribir('DELETE', p);
                            }
                          }}
                        >
                          Eliminar
                        </button>
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
              className="button button-secondary"
              disabled={ocupado || Boolean(form) || consulta.desde === 0}
              onClick={() => setConsulta(c => ({
                ...c,
                desde: Math.max(0, c.desde - 20),
              }))}
            >
              Anterior
            </button>

            <button
              type="button"
              className="button button-secondary"
              disabled={ocupado || Boolean(form) || !datos.hayMas}
              onClick={() => setConsulta(c => ({
                ...c,
                desde: c.desde + 20,
              }))}
            >
              Siguiente
            </button>
          </div>
        </>
      )}
    </section>
  );
}