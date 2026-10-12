import { useEffect, useState } from 'react';

/* The handwritten page as it was handed in.

   Photos sit behind GET /api/submissions/{id}/image/, which needs the JWT, and
   an <img src> cannot send an Authorization header. So the bytes are fetched
   with the token and shown through an object URL, which is revoked when the
   component goes away.

   `load` is passed in rather than imported so this component stays role-neutral:
   student screens hand it studentApi.photo, teacher screens teacherApi.photo,
   and the two API modules never meet (frontend/WIRING.md §1).

   Rotation. A phone held flat over a page cannot tell which way is up, so the
   EXIF orientation it writes is often wrong — both test photos are stored
   upright but tagged "rotate 90°". Ignoring EXIF would break photos taken the
   normal way instead, so neither default is right for everyone; the viewer
   turns the page a quarter at a time. It redraws to a canvas rather than using
   a CSS transform, so the layout box and the full-size link follow the turn. */

/* Redrawing a 12-megapixel phone photo at full size took over two seconds a
   turn. 2400px on the long side is still sharp enough to read handwriting at
   full size, and redraws in a fraction of that. */
const MAX_SIDE = 2400;

async function rotatedUrl(blob: Blob, degrees: number): Promise<string> {
  if (degrees === 0) return URL.createObjectURL(blob);

  const bitmap = await createImageBitmap(blob, { imageOrientation: 'from-image' });
  const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
  const w = Math.round(bitmap.width * scale);
  const h = Math.round(bitmap.height * scale);
  const quarterTurn = degrees % 180 !== 0;
  const canvas = document.createElement('canvas');
  canvas.width = quarterTurn ? h : w;
  canvas.height = quarterTurn ? w : h;

  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('no 2d context');
  ctx.translate(canvas.width / 2, canvas.height / 2);
  ctx.rotate((degrees * Math.PI) / 180);
  ctx.drawImage(bitmap, -w / 2, -h / 2, w, h);
  bitmap.close();

  const out = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, 'image/jpeg', 0.92),
  );
  if (!out) throw new Error('canvas export failed');
  return URL.createObjectURL(out);
}

export function SubmissionPhoto({
  load,
  caption,
  alt,
}: {
  load: () => Promise<Blob>;
  caption: string;
  alt: string;
}) {
  const [blob, setBlob] = useState<Blob | null>(null);
  const [rotation, setRotation] = useState(0);
  const [url, setUrl] = useState<string | null>(null);
  const [shown, setShown] = useState(0);
  const [failed, setFailed] = useState(false);

  /* Fetch the bytes once per mount. `load` is a fresh closure every render,
     so it is deliberately not a dependency. */
  useEffect(() => {
    let cancelled = false;
    load()
      .then((b) => {
        if (!cancelled) setBlob(b);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* Derive the displayed image from the bytes and the current turn, and revoke
     each object URL once it is replaced or the component unmounts. */
  useEffect(() => {
    if (!blob) return;
    let made: string | null = null;
    let cancelled = false;
    rotatedUrl(blob, rotation)
      .then((u) => {
        made = u;
        if (cancelled) URL.revokeObjectURL(u);
        else {
          setUrl(u);
          setShown(rotation);
        }
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
      if (made) URL.revokeObjectURL(made);
    };
  }, [blob, rotation]);

  return (
    <figure style={{ margin: 0, display: 'grid', gap: 8 }}>
      <figcaption
        style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}
      >
        <span className="field-label">{caption}</span>
        {url && (
          <span style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
            {(
              [
                ['↺', 270, 'Rotate the photo a quarter turn anticlockwise'],
                ['↻', 90, 'Rotate the photo a quarter turn clockwise'],
              ] as const
            ).map(([glyph, step, label]) => (
              <button
                key={glyph}
                type="button"
                onClick={() => setRotation((r) => (r + step) % 360)}
                aria-label={label}
                title={label}
                style={{
                  background: 'none', border: 'none', padding: '2px 4px', cursor: 'pointer',
                  color: 'var(--bone-66)', fontSize: 17, lineHeight: 1,
                }}
              >
                {glyph}
              </button>
            ))}
            <a
              href={url}
              target="_blank"
              rel="noreferrer"
              style={{ color: 'var(--bone-55)', fontSize: 13, textDecoration: 'none' }}
            >
              Open full size →
            </a>
          </span>
        )}
      </figcaption>

      {failed ? (
        <p
          style={{
            margin: 0, padding: '18px 20px', borderRadius: 'var(--radius-card)',
            border: '1px solid var(--bone-18)', background: 'var(--rail)',
            color: 'var(--bone-66)', fontSize: 14,
          }}
        >
          The photo could not be loaded.
        </p>
      ) : url ? (
        <img
          src={url}
          alt={alt}
          aria-busy={shown !== rotation}
          style={{
            width: '100%', display: 'block', borderRadius: 'var(--radius-card)',
            border: '1px solid var(--bone-18)',
            /* Dimmed while the next turn is drawn, so a click visibly lands. */
            opacity: shown !== rotation ? 0.45 : 1,
            transition: 'opacity 120ms ease',
          }}
        />
      ) : (
        /* Shaped like the photo it stands in for, not a spinner. */
        <div
          aria-busy="true"
          aria-label="Loading photo"
          style={{
            aspectRatio: '4 / 3', borderRadius: 'var(--radius-card)',
            border: '1px solid var(--bone-18)', background: 'var(--card)',
          }}
        />
      )}
    </figure>
  );
}
