import { LogOut, Monitor, Moon, Settings, Sun } from 'lucide-react';
import type { ThemePreference } from '../hooks/useColorScheme';
import type { UserProfile } from '../types';

export function UserMenu({
  user,
  theme,
  onTheme,
  onSettings,
  onLogout,
}: {
  user: UserProfile | null;
  theme: ThemePreference;
  onTheme: (theme: ThemePreference) => void;
  onSettings: () => void;
  onLogout: () => void;
}) {
  return (
    <div className="user-menu" role="menu">
      <div className="user-summary">
        <strong>{user?.displayName ?? 'CADIR user'}</strong>
        <span>{user?.email ?? 'Local workspace'}</span>
      </div>
      <button role="menuitem" onClick={onSettings}>
        <Settings size={16} /> Provider settings
      </button>
      <div className="theme-picker" aria-label="Theme">
        {(
          [
            ['light', Sun, 'Light'],
            ['dark', Moon, 'Dark'],
            ['system', Monitor, 'System'],
          ] as const
        ).map(([value, Icon, label]) => (
          <button
            key={value}
            className={theme === value ? 'selected' : ''}
            aria-label={`${label} theme`}
            title={`${label} theme`}
            onClick={() => onTheme(value)}
          >
            <Icon size={15} />
          </button>
        ))}
      </div>
      <button role="menuitem" onClick={onLogout}>
        <LogOut size={16} /> Sign out
      </button>
    </div>
  );
}
