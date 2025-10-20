import React from 'react';
import { Link, useLocation } from 'react-router-dom';

const NavLink = ({ to, label }: { to: string; label: string }) => {
  const location = useLocation();
  const active = location.pathname === to;
  return (
    <Link className={`nav-link ${active ? 'active' : ''}`} to={to}>
      {label}
    </Link>
  );
};

export function Sidebar(): JSX.Element {
  return (
    <aside className="sidebar">
      <div className="brand">Элл</div>
      <nav>
        <NavLink to="/projects" label="Проекты" />
        <NavLink to="/clients" label="Клиенты" />
        <NavLink to="/services" label="Услуги" />
        <NavLink to="/analytics" label="Аналитика" />
        <NavLink to="/settings" label="Настройки" />
      </nav>
    </aside>
  );
}
