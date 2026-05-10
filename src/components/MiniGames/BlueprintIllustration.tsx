/** Visual target for Blind Architect (SVG). Index matches BLUEPRINTS order in BlindArchitect. */

const STROKE = "#1e3a5f";
const FILL_SOFT = "#e8eef5";

type Props = { index: number; className?: string; "aria-label"?: string };

export default function BlueprintIllustration({ index, className = "", "aria-label": ariaLabel }: Props) {
  const i = ((index % 6) + 6) % 6;

  return (
    <svg
      viewBox="0 0 200 200"
      className={className}
      role="img"
      aria-label={ariaLabel ?? "Target structure blueprint"}
    >
      <rect width="200" height="200" fill="#fafbfc" rx="12" />
      {i === 0 && <Blueprint0 />}
      {i === 1 && <Blueprint1 />}
      {i === 2 && <Blueprint2 />}
      {i === 3 && <Blueprint3 />}
      {i === 4 && <Blueprint4 />}
      {i === 5 && <Blueprint5 />}
    </svg>
  );
}

function Blueprint0() {
  return (
    <g stroke={STROKE} strokeWidth="2.5" fill={FILL_SOFT}>
      <rect x="40" y="130" width="120" height="28" rx="2" />
      <rect x="65" y="92" width="70" height="38" rx="2" />
      <polygon points="100,92 55,92 100,48 145,92" fill={FILL_SOFT} />
      <circle cx="100" cy="38" r="8" fill="#fff" />
    </g>
  );
}

function Blueprint1() {
  return (
    <g stroke={STROKE} strokeWidth="2.5" fill={FILL_SOFT}>
      <circle cx="45" cy="100" r="28" />
      <circle cx="100" cy="100" r="28" />
      <circle cx="155" cy="100" r="28" />
    </g>
  );
}

function Blueprint2() {
  return (
    <g stroke={STROKE} strokeWidth="2.5" fill={FILL_SOFT}>
      <rect x="92" y="40" width="16" height="120" rx="2" />
      <rect x="35" y="88" width="130" height="22" rx="2" />
    </g>
  );
}

function Blueprint3() {
  return (
    <g stroke={STROKE} strokeWidth="2.5" fill={FILL_SOFT}>
      <circle cx="100" cy="100" r="72" fill="#fff" />
      <rect x="62" y="62" width="76" height="76" rx="2" fill={FILL_SOFT} />
      <polygon points="100,118 88,102 112,102" fill={STROKE} />
    </g>
  );
}

function Blueprint4() {
  return (
    <g stroke={STROKE} strokeWidth="2.5" fill={FILL_SOFT}>
      <rect x="35" y="135" width="130" height="28" rx="2" />
      <rect x="50" y="95" width="100" height="32" rx="2" />
      <rect x="85" y="45" width="30" height="44" rx="2" />
    </g>
  );
}

function Blueprint5() {
  return (
    <g stroke={STROKE} strokeWidth="2.5" fill={FILL_SOFT}>
      <rect x="55" y="105" width="90" height="65" rx="2" />
      <polygon points="100,105 45,105 100,55 155,105" fill={FILL_SOFT} />
      <rect x="72" y="125" width="22" height="22" rx="2" fill="#fff" />
      <rect x="106" y="125" width="22" height="22" rx="2" fill="#fff" />
    </g>
  );
}
