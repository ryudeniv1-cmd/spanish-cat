import { NavLink } from 'react-router-dom';

const tabs = [
  {
    to: '/',
    label: 'Мостик',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
        <circle cx="12" cy="13" r="6.2" />
        <circle cx="12" cy="13" r="1.6" fill="currentColor" stroke="none" />
        <path d="M12 6.8V3.6M12 19.2v3M5.8 13H2.6M21.4 13h-3.2M7.6 8.6 5.4 6.4M16.4 8.6l2.2-2.2" />
      </svg>
    ),
  },
  {
    to: '/archive',
    label: 'Архив',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
        <path d="M5 4.5h10.5a3 3 0 0 1 3 3V20H8a3 3 0 0 1-3-3z" />
        <path d="M8.5 4.5V20M12 9h3.5M12 12.5h3.5" />
      </svg>
    ),
  },
  {
    to: '/map',
    label: 'Карта',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
        <ellipse cx="12" cy="12" rx="9" ry="3.6" transform="rotate(-24 12 12)" />
        <circle cx="12" cy="12" r="2.2" />
        <circle cx="18.5" cy="8.5" r="0.9" fill="currentColor" stroke="none" />
        <circle cx="5.2" cy="15.4" r="0.9" fill="currentColor" stroke="none" />
      </svg>
    ),
  },
  {
    to: '/settings',
    label: 'Системы',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
        <circle cx="12" cy="12" r="3.4" />
        <path d="M12 4.4V2.2M12 21.8v-2.2M4.4 12H2.2M21.8 12h-2.2M6.6 6.6 5 5M19 19l-1.6-1.6M17.4 6.6 19 5M5 19l1.6-1.6" />
      </svg>
    ),
  },
];

export function TabBar() {
  return (
    <nav className="tabbar">
      {tabs.map((t) => (
        <NavLink key={t.to} to={t.to} end={t.to === '/'}>
          {t.icon}
          <span>{t.label}</span>
        </NavLink>
      ))}
    </nav>
  );
}
