/**
 * GGLogo — compact terminal-window badge used in the header and as the favicon base.
 *
 * Renders a dark rounded rectangle with:
 *  - macOS-style title-bar dots (red / yellow / green)
 *  - a green ">" prompt
 *  - white bold "GG" monogram
 *  - green blinking-cursor "_"
 */
export function GGLogo({ size = 32 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 40 40"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-label="GeekGully"
    >
      {/* Window body */}
      <rect width="40" height="40" rx="8" fill="#1a1f2e" />

      {/* Title-bar strip */}
      <rect x="0" y="0" width="40" height="13" rx="8" fill="#252b3b" />
      <rect x="0" y="7" width="40" height="6" fill="#252b3b" />

      {/* macOS dots */}
      <circle cx="7"  cy="6.5" r="2.2" fill="#ff5f57" />
      <circle cx="14" cy="6.5" r="2.2" fill="#febc2e" />
      <circle cx="21" cy="6.5" r="2.2" fill="#28c840" />

      {/* Divider */}
      <line x1="0" y1="13" x2="40" y2="13" stroke="#2d3550" strokeWidth="0.8" />

      {/* > prompt */}
      <text
        x="4" y="30"
        fontFamily="'Courier New', Courier, monospace"
        fontSize="14"
        fontWeight="700"
        fill="#22c55e"
      >
        {'>'}
      </text>

      {/* GG monogram */}
      <text
        x="15" y="30"
        fontFamily="'Courier New', Courier, monospace"
        fontSize="14"
        fontWeight="700"
        fill="white"
      >
        GG
      </text>

      {/* Cursor _ */}
      <text
        x="31" y="30"
        fontFamily="'Courier New', Courier, monospace"
        fontSize="14"
        fontWeight="700"
        fill="#22c55e"
      >
        _
      </text>
    </svg>
  );
}

/**
 * GGLogoFull — full branding lockup with terminal badge + wordmark + tagline.
 * Use on landing pages, splash screens, and marketing assets.
 */
export function GGLogoFull({ width = 200 }: { width?: number }) {
  const h = Math.round(width * 1.22); // preserve aspect ratio (~200×244)
  return (
    <svg
      width={width}
      height={h}
      viewBox="0 0 200 244"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-label="GeekGully — Code. Learn. Repeat."
    >
      {/* ── Terminal window ──────────────────────────────────────── */}
      <rect x="4" y="4" width="192" height="138" rx="14" fill="#1a1f2e" />

      {/* Title bar */}
      <rect x="4" y="4" width="192" height="28" rx="14" fill="#252b3b" />
      <rect x="4" y="18"  width="192" height="14" fill="#252b3b" />

      {/* macOS dots */}
      <circle cx="27" cy="18" r="5.5" fill="#ff5f57" />
      <circle cx="46" cy="18" r="5.5" fill="#febc2e" />
      <circle cx="65" cy="18" r="5.5" fill="#28c840" />

      {/* Divider */}
      <line x1="4" y1="32" x2="196" y2="32" stroke="#2d3550" strokeWidth="1.2" />

      {/* > prompt */}
      <text
        x="20" y="95"
        fontFamily="'Courier New', Courier, monospace"
        fontSize="44"
        fontWeight="700"
        fill="#22c55e"
      >
        {'>'}
      </text>

      {/* GG text */}
      <text
        x="68" y="95"
        fontFamily="'Courier New', Courier, monospace"
        fontSize="44"
        fontWeight="700"
        fill="white"
      >
        GG
      </text>

      {/* Cursor */}
      <text
        x="158" y="95"
        fontFamily="'Courier New', Courier, monospace"
        fontSize="44"
        fontWeight="700"
        fill="#22c55e"
      >
        _
      </text>

      {/* ── Wordmark ─────────────────────────────────────────────── */}
      <text
        x="100" y="172"
        textAnchor="middle"
        fontFamily="ui-sans-serif, system-ui, -apple-system, sans-serif"
        fontSize="40"
        fontWeight="800"
        letterSpacing="-1"
      >
        <tspan fill="#1a1f2e">Geek</tspan>
        <tspan fill="#22c55e">Gully</tspan>
      </text>

      {/* ── Tagline ──────────────────────────────────────────────── */}
      <text
        x="100" y="200"
        textAnchor="middle"
        fontFamily="ui-sans-serif, system-ui, -apple-system, sans-serif"
        fontSize="13"
        fill="#9ca3af"
        letterSpacing="0.8"
      >
        Code. Learn. Repeat.
      </text>

      {/* Tagline underline */}
      <line x1="42" y1="206" x2="158" y2="206" stroke="#e5e7eb" strokeWidth="1" />
    </svg>
  );
}
