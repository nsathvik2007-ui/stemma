import { Link } from 'react-router-dom';
import { Mark } from './Mark';

/* The app bar from the artboards: 92px, mark leading a 35px Mentarika
   wordmark, then a glass user pill and a bone Sign out button.

   On hover the two strands of the mark separate — white up, accent down —
   which is the "drifting" verdict phase used as a hover state. Honours
   prefers-reduced-motion via the CSS. */
export function AppBar({
  name,
  role,
  onSignOut,
}: {
  name: string;
  role: 'Student' | 'Teacher';
  onSignOut?: () => void;
}) {
  const initials = name
  .split('@')[0]
  .split(/[.\-_]/)
  .filter(Boolean)
  .slice(0, 2)
  .map((w) => w[0]?.toUpperCase() ?? '')
  .join('');;

  return (
    <header className="appbar">
      <Link to="/" className="appbar-brand">
        <Mark size={48} stroke={6} base="#FFFFFF" accent="var(--vermilion-light)" />
        <span className="appbar-wordmark">Stemma</span>
      </Link>

      <div className="appbar-right">
        <div className="userpill">
          <div className="userpill-blur" />
          <div className="userpill-row">
            <div className="userpill-avatar">{initials}</div>
            <div className="userpill-id">
              <span className="userpill-name">{name}</span>
              <span className="userpill-role">{role}</span>
            </div>
          </div>
        </div>
        <button className="btn-solid" onClick={onSignOut}>Sign out</button>
      </div>
    </header>
  );
}
