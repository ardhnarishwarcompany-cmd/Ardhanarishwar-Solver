import "./brand.css";

export default function BrandLogo({ size = 44, float = false, className = "" }) {
  return (
    <span
      className={`brand-logo ${float ? "brand-float" : ""} ${className}`}
      style={{ width: size, height: size }}
    >
      <img src="/logo.png" alt="Ardhnarishwar" draggable="false" />
    </span>
  );
}

export function UserAvatar({ size = 44 }) {
  return (
    <span className="user-avatar" style={{ width: size, height: size }}>
      <svg viewBox="0 0 64 64" width="100%" height="100%" aria-label="You">
        <defs>
          <radialGradient id="uaBg" cx="30%" cy="22%" r="95%">
            <stop offset="0" stopColor="#c4b5fd" />
            <stop offset=".5" stopColor="#6d28d9" />
            <stop offset="1" stopColor="#0f766e" />
          </radialGradient>
          <linearGradient id="uaFig" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#ffffff" />
            <stop offset="1" stopColor="#ddd6fe" />
          </linearGradient>
        </defs>
        <circle cx="32" cy="32" r="32" fill="url(#uaBg)" />
        <path d="M9 60c1-14 10-22 23-22s22 8 23 22z" fill="url(#uaFig)" />
        <circle cx="32" cy="24" r="11" fill="url(#uaFig)" />
        <ellipse cx="26" cy="16" rx="8" ry="4" fill="#fff" opacity=".22" />
      </svg>
    </span>
  );
}
