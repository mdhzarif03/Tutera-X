// The Tutera-X mark: an open book whose centre fold reads as a "T", with an amber spark.

export function LogoMark({ className = "h-9 w-9" }: { className?: string }) {
  return (
    <svg viewBox="0 0 48 48" className={className} aria-hidden="true" focusable="false">
      <defs>
        <linearGradient id="tx-logo-g" x1="0" y1="0" x2="48" y2="48" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#6366f1" />
          <stop offset="1" stopColor="#a855f7" />
        </linearGradient>
      </defs>
      <rect width="48" height="48" rx="14" fill="url(#tx-logo-g)" />
      <path
        d="M10 15.5c4.6-2.3 9.4-2.3 14 .9 4.6-3.2 9.4-3.2 14-.9v19.2c-4.6-2.3-9.4-2.3-14 .9-4.6-3.2-9.4-3.2-14-.9V15.5Z"
        fill="#fff"
        fillOpacity=".96"
      />
      <path d="M24 16.4v19.4" stroke="#6366f1" strokeWidth="2.2" strokeLinecap="round" />
      <circle cx="37.5" cy="11" r="3.2" fill="#fbbf24" />
    </svg>
  );
}

export function Logo({
  inverse = false,
  showWordmark = true,
  className = "",
}: {
  inverse?: boolean;
  showWordmark?: boolean;
  className?: string;
}) {
  return (
    <div className={`flex items-center gap-2.5 ${className}`}>
      <LogoMark className="h-9 w-9 shrink-0 drop-shadow-sm" />
      {showWordmark ? (
        <span className={`text-lg font-bold tracking-tight ${inverse ? "text-white" : "text-slate-900"}`}>
          Tutera<span className={inverse ? "text-amber-300" : "text-amber-500"}>-X</span>
        </span>
      ) : null}
    </div>
  );
}
