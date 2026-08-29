import { NavLink } from 'react-router-dom';
import { haptic } from '../telegram';

const tabs = [
  {
    to: '/',
    label: 'Today',
    icon: (
      // восход: горизонт, солнце и лучи
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
        <path d="M7 16.2a5 5 0 0 1 10 0" />
        <path d="M2.8 16.2h2.4M18.8 16.2h2.4M12 4.6v2.2M5.9 7.1l1.6 1.6M18.1 7.1l-1.6 1.6" />
        <path d="M3.4 20h17.2" />
      </svg>
    ),
  },
  {
    to: '/lexicon',
    label: 'Lexicon',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
        <path d="M5 4.5h10.5a3 3 0 0 1 3 3V20H8a3 3 0 0 1-3-3z" />
        <path d="M8.5 4.5V20M12 9h3.5M12 12.5h3.5" />
      </svg>
    ),
  },
  {
    to: '/galaxy',
    label: 'Galaxy',
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
    to: '/armory',
    label: 'Armory',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
        <path d="M12 2.8v13.4" strokeWidth="2.2" strokeLinecap="round" />
        <path d="M8.5 16.8h7M12 16.8v2.4" />
        <circle cx="12" cy="21" r="1.1" fill="currentColor" stroke="none" />
      </svg>
    ),
  },
  {
    to: '/settings',
    label: 'Settings',
    icon: (
      // ползунки — не спутать с солнцем на Today
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
        <path d="M4 7h11M19.5 7H21M4 12h3M11.5 12H21M4 17h9M17.5 17H21" />
        <circle cx="17.2" cy="7" r="2.3" />
        <circle cx="9.2" cy="12" r="2.3" />
        <circle cx="15.2" cy="17" r="2.3" />
      </svg>
    ),
  },
];

export function TabBar() {
  return (
    <nav className="tabbar">
      {tabs.map((t) => (
        <NavLink key={t.to} to={t.to} end={t.to === '/'} onClick={() => haptic('tap', 'nav')}>
          {t.icon}
          <span>{t.label}</span>
        </NavLink>
      ))}
    </nav>
  );
}
