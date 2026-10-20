export function BrandLogo({ className = '' }: { className?: string }) {
  return (
    <svg
      className={`astra-logo ${className}`}
      viewBox="235 135 790 550"
      role="img"
      aria-label="ASTRA Ticketing System"
      focusable="false"
    >
      <image href="/astra-brand-sheet.png" width="1254" height="1254" />
    </svg>
  );
}

export default function BrandMark() {
  return (
    <span className="brand-mark astra-mark" aria-hidden="true">
      <svg viewBox="420 140 450 340" role="presentation" focusable="false">
        <image href="/astra-brand-sheet.png" width="1254" height="1254" />
      </svg>
    </span>
  );
}
