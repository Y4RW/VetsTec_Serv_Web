import { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

export default function MapPicker({
  initialLat,
  initialLng,
  message,
  onConfirm,
  onClose,
}) {
  const container = useRef(null);
  const dialog = useRef(null);
  const closeButton = useRef(null);
  const map = useRef(null);
  const marker = useRef(null);

  const valido =
    initialLat !== '' &&
    initialLng !== '' &&
    initialLat != null &&
    initialLng != null &&
    Number.isFinite(Number(initialLat)) &&
    Math.abs(Number(initialLat)) <= 90 &&
    Number.isFinite(Number(initialLng)) &&
    Math.abs(Number(initialLng)) <= 180;

  const [seleccionado, setSeleccionado] = useState(valido);

  const [coordsTexto, setCoordsTexto] = useState(
    valido
      ? `${Number(initialLat).toFixed(5)}, ${Number(initialLng).toFixed(5)}`
      : ''
  );

  useEffect(() => {
    const anterior = document.activeElement;
    const overflow = document.body.style.overflow;

    document.body.style.overflow = 'hidden';
    closeButton.current?.focus();

    return () => {
      document.body.style.overflow = overflow;
      anterior?.focus();
    };
  }, []);

  useEffect(() => {
    const centro = valido
      ? [Number(initialLat), Number(initialLng)]
      : [19.4326, -99.1332];

    const instancia = L.map(container.current).setView(
      centro,
      valido ? 17 : 11
    );

    map.current = instancia;
    setSeleccionado(valido);

    L.tileLayer(
      'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
      {
        maxZoom: 19,
        attribution:
          '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      }
    ).addTo(instancia);

    const icon = L.divIcon({
      className: 'vetstec-map-marker',
      html: '📍',
      iconSize: [32, 32],
      iconAnchor: [16, 30],
    });

    marker.current = L.marker(centro, {
      icon,
      draggable: true,
      title: 'Ubicación del establecimiento',
    }).addTo(instancia);

  marker.current.on('dragend', () => {
      const p = marker.current.getLatLng().wrap();
      setCoordsTexto(`${p.lat.toFixed(5)}, ${p.lng.toFixed(5)}`);
      setSeleccionado(true);
    });

    instancia.on('click', (e) => {
      marker.current.setLatLng(e.latlng);
      const p = e.latlng.wrap();
      setCoordsTexto(`${p.lat.toFixed(5)}, ${p.lng.toFixed(5)}`);
      setSeleccionado(true);
    });

    const resize = new ResizeObserver(() => {
      instancia.invalidateSize();
    });

    resize.observe(container.current);

    return () => {
      resize.disconnect();
      instancia.remove();
      map.current = null;
      marker.current = null;
    };
  }, [initialLat, initialLng, valido]);

  function teclado(e) {
    if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
    }

    if (e.key !== 'Tab') return;

    const elementos = [
      ...dialog.current.querySelectorAll(
        'button:not(:disabled), a[href], [tabindex="0"]'
      ),
    ].filter((el) => el.offsetParent !== null);

    const primero = elementos[0];
    const ultimo = elementos[elementos.length - 1];

    if (e.shiftKey && document.activeElement === primero) {
      e.preventDefault();
      ultimo?.focus();
    }

    if (!e.shiftKey && document.activeElement === ultimo) {
      e.preventDefault();
      primero?.focus();
    }
  }

  return (
    <div className="map-modal-backdrop">
      <div
        className="map-modal"
        ref={dialog}
        role="dialog"
        aria-modal="true"
        aria-labelledby="map-title"
        onKeyDownCapture={teclado}
      >
        <div className="map-modal-header">
          <div>
            <h3 id="map-title">Confirma la ubicación</h3>

            <p>
              {message ||
                'Haz clic en el mapa o arrastra el marcador hasta tu establecimiento.'}
            </p>

            <p>
              También puedes mover el mapa con las flechas y
              pulsar «Marcar centro del mapa».
            </p>
          </div>

          <button
            ref={closeButton}
            type="button"
            className="map-close"
            onClick={onClose}
            aria-label="Cerrar mapa"
          >
            ×
          </button>
        </div>

        <div
          ref={container}
          className="map-picker"
          aria-label="Mapa del establecimiento"
        />

    <p className="sr-only" aria-live="polite">
              {coordsTexto
                ? `Coordenadas marcadas: ${coordsTexto}`
                : 'Aún no hay coordenadas marcadas en el mapa.'}
            </p>

            <div className="map-modal-actions">
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => {
                  const centroActual = map.current.getCenter();
                  marker.current.setLatLng(centroActual);
                  const p = centroActual.wrap();
                  setCoordsTexto(`${p.lat.toFixed(5)}, ${p.lng.toFixed(5)}`);
                  setSeleccionado(true);
                }}
              >
                Marcar centro del mapa
              </button>

          <button
            type="button"
            className="btn btn-secondary"
            onClick={onClose}
          >
            Cancelar
          </button>

          <button
            type="button"
            className="btn btn-primary"
            disabled={!seleccionado}
            onClick={() => {
             const punto = marker.current.getLatLng().wrap();

              onConfirm({
                latitud: punto.lat.toFixed(6),
                longitud: punto.lng.toFixed(6),
              });
            }}
          >
            Confirmar ubicación
          </button>
        </div>
      </div>
    </div>
  );
}
