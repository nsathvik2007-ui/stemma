import { useEffect, useRef, useState } from 'react';

/* An assignment's brief: the teacher's description and their handout,
   Google Classroom style.

   Role-neutral, like SubmissionPhoto: the handout sits behind the JWT, which
   an <a href> cannot send, so `load` fetches the bytes and they are shown
   through an object URL. Each role passes its own API module's call, and the
   student and teacher modules never meet.

   Images are previewed inline. PDFs open in a new tab, which is opened inside
   the click itself so pop-up blockers allow it, then pointed at the file once
   it has downloaded; Download is there for browsers that won't display one. */

/* Links in the description become clickable. Trailing punctuation stays
   text, so "see https://example.com." doesn't link the full stop. */
const URL_PATTERN = /(https?:\/\/[^\s<>"]*[^\s<>".,;:!?)\]'])/g;

function Linkified({ text }: { text: string }) {
  return (
    <>
      {text.split(URL_PATTERN).map((part, i) =>
        i % 2 === 1 ? (
          <a key={i} href={part} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--vermilion-light)' }}>
            {part}
          </a>
        ) : (
          <span key={i}>{part}</span>
        ),
      )}
    </>
  );
}

export function AssignmentBrief({
  description,
  attachment,
  load,
}: {
  description: string;
  attachment: { name: string; type: 'pdf' | 'image' } | null;
  load: () => Promise<Blob>;
}) {
  const [url, setUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const urlRef = useRef<string | null>(null);

  /* Callers key this component on the attachment's name, so a replaced
     handout mounts a fresh one. Images are fetched straight away for the
     preview; PDFs only when asked for. */
  useEffect(() => {
    let cancelled = false;
    if (attachment?.type === 'image') {
      load()
        .then((blob) => {
          if (cancelled) return;
          urlRef.current = URL.createObjectURL(blob);
          setUrl(urlRef.current);
        })
        .catch(() => !cancelled && setFailed(true));
    }
    return () => {
      cancelled = true;
      if (urlRef.current) URL.revokeObjectURL(urlRef.current);
      urlRef.current = null;
    };
    // Runs once per mount; `load` is a fresh closure every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function fileUrl(): Promise<string> {
    if (urlRef.current) return urlRef.current;
    const blob = await load();
    urlRef.current = URL.createObjectURL(blob);
    setUrl(urlRef.current);
    return urlRef.current;
  }

  async function open() {
    const tab = window.open('', '_blank');
    setBusy(true);
    try {
      const u = await fileUrl();
      if (tab) tab.location.href = u;
      else download(u);
    } catch {
      tab?.close();
      setFailed(true);
    } finally {
      setBusy(false);
    }
  }

  function download(u: string) {
    const a = document.createElement('a');
    a.href = u;
    a.download = attachment?.name ?? 'attachment';
    document.body.appendChild(a);
    a.click();
    a.remove();
  }

  async function onDownload() {
    setBusy(true);
    try {
      download(await fileUrl());
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
    }
  }

  if (!description.trim() && !attachment) return null;

  const action = {
    background: 'none', border: 'none', padding: 0, cursor: 'pointer',
    color: 'var(--bone)', fontSize: 14, fontWeight: 600, fontFamily: 'var(--font-body)',
  } as const;

  return (
    <section
      aria-label="Instructions"
      style={{
        display: 'grid', gap: 16, padding: 22,
        background: 'var(--rail)', border: '1px solid var(--bone-18)',
        borderRadius: 'var(--radius-card)', backdropFilter: 'blur(12px)',
      }}
    >
      {description.trim() && (
        <div style={{ display: 'grid', gap: 8 }}>
          <span className="eyebrow">Instructions</span>
          <p style={{ margin: 0, whiteSpace: 'pre-wrap', lineHeight: 1.6, color: 'var(--bone)', overflowWrap: 'anywhere' }}>
            <Linkified text={description} />
          </p>
        </div>
      )}

      {attachment && (
        <div style={{ display: 'grid', gap: 10 }}>
          <div
            style={{
              display: 'flex', alignItems: 'center', gap: 14, padding: '12px 14px',
              border: '1px solid var(--bone-18)', borderRadius: 'var(--radius-input)',
            }}
          >
            <span
              aria-hidden="true"
              style={{
                fontFamily: 'var(--font-mono)', fontSize: 11, letterSpacing: '0.08em',
                padding: '6px 8px', borderRadius: 6, background: 'var(--vermilion)', color: 'var(--ink)',
              }}
            >
              {attachment.type === 'pdf' ? 'PDF' : 'IMG'}
            </span>
            <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {attachment.name}
            </span>
            <span style={{ display: 'flex', gap: 16 }}>
              <button type="button" style={action} onClick={open} disabled={busy}>
                {busy ? 'Opening…' : 'Open'}
              </button>
              <button type="button" style={{ ...action, color: 'var(--bone-66)' }} onClick={onDownload} disabled={busy}>
                Download
              </button>
            </span>
          </div>

          {attachment.type === 'image' && url && (
            <img
              src={url}
              alt={`Attachment: ${attachment.name}`}
              style={{ width: '100%', maxHeight: 520, objectFit: 'contain', borderRadius: 'var(--radius-input)', border: '1px solid var(--bone-18)' }}
            />
          )}
          {failed && <p className="error" style={{ margin: 0 }}>The attachment could not be loaded.</p>}
        </div>
      )}
    </section>
  );
}
