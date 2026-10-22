import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import './propietario.css';

async function pedir(ruta) {
  const respuesta = await fetch(`/api/propietario/${ruta}`, {
    credentials: 'same-origin', cache: 'no-store',
  });
  const json = await respuesta.json().catch(() => null);
  if (!respuesta.ok || json?.success !== true) {
    throw new Error(json?.message || 'No fue posible consultar la información.');
  }
  return json.data;
}

const nombres = {
  VETERINARIA: 'Veterinaria', ESTETICA: 'Estética canina', AMBAS: 'Veterinaria y estética',
};

export default function PanelPropietario() {
  const { sesion } = useAuth();
  const [datos, setDatos] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');
  const [seleccion, setSeleccion] = useState(null);
  const [productos, setProductos] = useState(null);
  const [cargandoProductos, setCargandoProductos] = useState(false);
  const [errorProductos, setErrorProductos] = useState('');

  const cargar = useCallback(async () => {
    setCargando(true);
    setError('');
    try {
      const respuesta = await pedir('resumen');
      setDatos(respuesta);
      setSeleccion(anterior => respuesta.sucursales.some(s => s.id === anterior)
        ? anterior : (respuesta.sucursales[0]?.id || null));
    } catch (fallo) {
      setDatos(null);
      setError(fallo.message);
    } finally {
      setCargando(false);
    }
  }, [sesion?.usuario?.id]);

  useEffect(() => { cargar(); }, [cargar]);

  const sucursal = datos?.sucursales?.find(s => s.id === seleccion);
  const total = campo => (datos?.sucursales || []).reduce(
    (suma, item) => suma + Number(item[campo] || 0), 0,
  );

  async function mostrarProductos() {
    if (!sucursal || sucursal.estado !== 'APROBADO') return;
    setErrorProductos('');
    setProductos(null);
    setCargandoProductos(true);
    try {
      setProductos(await pedir(`sucursales/${sucursal.id}/productos`));
    } catch (fallo) {
      setErrorProductos(fallo.message);
    } finally {
      setCargandoProductos(false);
    }
  }

  return (
    <section className="owner" aria-labelledby="owner-titulo">
      <div className="owner-heading">
        <div>
          <p className="owner-kicker">Administración del propietario</p>
          <h2 id="owner-titulo">Mis sucursales</h2>
          <p>Vista general de los establecimientos que pertenecen a tu cuenta.</p>
        </div>
        <button type="button" className="button button-secondary"
          disabled={cargando} onClick={cargar}>
          {cargando ? 'Actualizando…' : 'Actualizar datos'}
        </button>
      </div>

      {error && <p role="alert" className="owner-error">
        {error} Puedes <Link to="/contacto">contactar a VetStec</Link> para revisar la propiedad.
      </p>}
      {cargando && <p role="status">Cargando sucursales…</p>}

      {datos && !cargando && <>
        <div className="owner-network">
          <strong>Grupo: {datos.red.nombre}</strong>
          <span>{datos.sucursales.length} sucursal(es) vinculada(s)</span>
        </div>
        <div className="owner-kpis" aria-label="Resumen de todas las sucursales">
          {[
            ['Sucursales', datos.sucursales.length],
            ['Empleados', total('empleados')],
            ['Servicios', total('servicios')],
            ['Productos', total('productos')],
            ['Citas registradas', total('citas')],
            ['Ventas registradas', total('ventas')],
          ].map(([nombre, valor]) => <div className="owner-kpi" key={nombre}>
            <span>{nombre}</span><strong>{valor}</strong>
          </div>)}
        </div>

        <div className="owner-main">
          <div className="owner-branch-list" aria-label="Seleccionar sucursal">
            <h3>Establecimientos</h3>
            {datos.sucursales.map(s => <button key={s.id} type="button"
              aria-pressed={seleccion === s.id}
              className={`owner-branch ${seleccion === s.id ? 'selected' : ''}`}
              onClick={() => { setSeleccion(s.id); setProductos(null); setErrorProductos(''); }}>
              <span><strong>{s.nombre_establecimiento}</strong>
                <small>{s.es_principal ? 'Sucursal principal' : 'Sucursal adicional'}</small></span>
              <span className="owner-state">{s.estado}</span>
            </button>)}
          </div>
          <div className="owner-detail">
            {sucursal ? <>
              <h3>{sucursal.nombre_establecimiento}</h3>
              <p>{nombres[sucursal.tipo_servicio] || 'Tipo no especificado'}</p>
              <dl className="owner-facts">
                <div><dt>Identificador</dt><dd>{sucursal.id}</dd></div>
                <div><dt>Revisión</dt><dd>{sucursal.estado}</dd></div>
                <div><dt>Directorio público</dt><dd>{sucursal.activo_directorio ? 'Visible' : 'No visible'}</dd></div>
                <div><dt>Productos</dt><dd>{sucursal.productos}</dd></div>
                <div><dt>Proveedores</dt><dd>{sucursal.proveedores}</dd></div>
                <div><dt>Citas</dt><dd>{sucursal.citas}</dd></div>
              </dl>
              {sucursal.estado === 'APROBADO' ? <button
                type="button" className="button button-primary" onClick={mostrarProductos}
                disabled={cargandoProductos}>
                {cargandoProductos ? 'Cargando productos…' : 'Ver productos de esta sucursal'}
              </button> : <p>Esta sucursal requiere aprobación antes de operar.</p>}
              {errorProductos && <p role="alert" className="owner-error">{errorProductos}</p>}
              {productos && <div className="owner-products">
                <h4>Productos (máximo 100)</h4>
                {productos.length === 0 ? <p>No hay productos asignados a esta sucursal.</p> :
                  <div className="owner-table-wrap"><table>
                    <thead><tr><th>Producto</th><th>Precio</th><th>Existencia</th></tr></thead>
                    <tbody>{productos.map(p => <tr key={p.id}>
                      <td>{p.nombre_producto}</td>
                      <td>{p.precio_venta == null ? '—' : `$${Number(p.precio_venta).toFixed(2)}`}</td>
                      <td>{p.stock_actual ?? '—'}</td>
                    </tr>)}</tbody>
                  </table></div>}
              </div>}
            </> : <p>Selecciona una sucursal para ver su información.</p>}
          </div>
        </div>
        <p className="owner-note">Para vincular una sucursal nueva debe comprobarse su titularidad
          y conservarse la revisión de VetStec. No se agregan sucursales solo escribiendo un ID.</p>
        <Link to="/contacto">Solicitar revisión para vincular otra sucursal</Link>
      </>}
    </section>
  );
}