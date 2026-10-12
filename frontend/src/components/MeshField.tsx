/* The background field shared by Home, Classroom, Submit and Submission.
   Five blurred masses, all one hue (#FF6B3D, the mark's accent strand), over
   ink, plus SVG grain, a vertical scrim and a 190px app-bar scrim.

   Each screen needs its own grain filter id — reusing one id across screens
   makes the second instance render the first one's filter. Pass `id`.

   Note the cards and rail that sit on top MUST stay translucent. With opaque
   panels most of the field paints behind them and cannot be seen; the
   translucency is structural here, not decoration. (design/NEXT.md) */
export function MeshField({ id }: { id: string }) {
  return (
    <div className="mesh" aria-hidden="true">
      <div className="mesh-mass mesh-mass-1" />
      <div className="mesh-mass mesh-mass-2" />
      <div className="mesh-mass mesh-mass-3" />
      <div className="mesh-mass mesh-mass-4" />
      <div className="mesh-mass mesh-mass-5" />
      <svg className="mesh-grain">
        <filter id={`grain-${id}`}>
          <feTurbulence type="fractalNoise" baseFrequency="0.8" numOctaves="4" />
        </filter>
        <rect width="100%" height="100%" filter={`url(#grain-${id})`} />
      </svg>
      <div className="mesh-scrim" />
      <div className="mesh-bar-scrim" />
    </div>
  );
}
