import { useState } from 'react';
import { NavLink, Outlet } from 'react-router-dom';

const navItems = [
  { to: '/', label: 'Inicio', end: true },
  { to: '/directorio', label: 'Directorio' },
  { to: '/contacto', label: 'Contacto' },
];

export default function PublicLayout() {
  const [menuOpen, setMenuOpen] = useState(false);

  const closeMenu = () => setMenuOpen(false);

  return (
    <div className="site-shell">
      <a className="skip-link" href="#contenido-principal">
        Saltar al contenido
      </a>

      <header className="public-header">
        <div className="container header-inner">
          <NavLink className="brand" to="/" onClick={closeMenu} aria-label="VetStec, ir al inicio">
            <span className="brand-symbol" aria-hidden="true">V</span>
            <span className="brand-name">Vet<span>Stec</span></span>
          </NavLink>

          <button
            className="menu-toggle"
            type="button"
            aria-expanded={menuOpen}
            aria-controls="public-navigation"
            onClick={() => setMenuOpen((open) => !open)}
          >
            <span className="sr-only">Abrir o cerrar menú</span>
            <span aria-hidden="true">☰</span>
          </button>

          <nav
            id="public-navigation"
            className={`public-nav ${menuOpen ? 'is-open' : ''}`}
            aria-label="Navegación principal"
          >
            {navItems.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                onClick={closeMenu}
                className={({ isActive }) => (isActive ? 'nav-link active' : 'nav-link')}
              >
                {item.label}
              </NavLink>
            ))}
          </nav>
        </div>
      </header>

      <main id="contenido-principal">
        <Outlet />
      </main>

      <footer className="public-footer">
        <div className="container footer-inner">
          <div>
            <strong>VetStec</strong>
            <p>Tecnología para una atención veterinaria y estética mejor organizada.</p>
          </div>
          <p className="footer-copy">© {new Date().getFullYear()} VetStec</p>
        </div>
      </footer>
    </div>
  );
}
