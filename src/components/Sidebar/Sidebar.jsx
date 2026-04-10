import { IconLogin2, IconLogout } from '@tabler/icons-react';
import './Sidebar.css';

export function Sidebar({
  mode,
  onModeChange,
  canShowLogout = false,
  onLogout = () => {},
  canShowLogin = false,
  onLogin = () => {},
}) {
  return (
    <nav className="sidebar">
      <button
        className={`sidebar__btn${mode === 'timeline' ? ' is-active' : ''}`}
        onClick={() => onModeChange('timeline')}
        title="Timelines"
      >
        <svg viewBox="0 0 24 24">
          <line x1="4" y1="6" x2="20" y2="6" />
          <line x1="4" y1="12" x2="16" y2="12" />
          <line x1="4" y1="18" x2="12" y2="18" />
          <circle cx="4" cy="6" r="1.5" fill="currentColor" stroke="none" />
          <circle cx="4" cy="12" r="1.5" fill="currentColor" stroke="none" />
          <circle cx="4" cy="18" r="1.5" fill="currentColor" stroke="none" />
        </svg>
      </button>
      <button
        className={`sidebar__btn${mode === 'orgchart' ? ' is-active' : ''}`}
        onClick={() => onModeChange('orgchart')}
        title="Org Charts"
      >
        <svg viewBox="0 0 24 24">
          <rect x="8" y="2" width="8" height="5" rx="1.5" />
          <rect x="1" y="17" width="8" height="5" rx="1.5" />
          <rect x="15" y="17" width="8" height="5" rx="1.5" />
          <line x1="12" y1="7" x2="12" y2="12" />
          <line x1="5" y1="12" x2="19" y2="12" />
          <line x1="5" y1="12" x2="5" y2="17" />
          <line x1="19" y1="12" x2="19" y2="17" />
        </svg>
      </button>
      <div className="sidebar__footer">
        {canShowLogout && (
          <button
            className="sidebar__btn sidebar__btn--logout"
            onClick={onLogout}
            title="Logout"
            aria-label="Logout"
          >
            <IconLogout size={20} stroke={1.8} aria-hidden="true" />
          </button>
        )}
        {!canShowLogout && canShowLogin && (
          <button
            className="sidebar__btn sidebar__btn--login"
            onClick={onLogin}
            title="Log in"
            aria-label="Log in"
          >
            <IconLogin2 size={20} stroke={1.8} aria-hidden="true" />
          </button>
        )}
      </div>
    </nav>
  );
}
