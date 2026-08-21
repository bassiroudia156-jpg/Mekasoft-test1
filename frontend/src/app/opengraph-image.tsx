// Open Graph / Twitter share image (2026-08-20 SEO pass) — generated at
// request time via next/og's ImageResponse (Satori under the hood), not a
// static binary: the file-convention name (`opengraph-image.tsx`) is picked
// up automatically by Next's Metadata API for both `og:image` and (absent a
// dedicated twitter-image.tsx) the Twitter card, on every page that doesn't
// override it with its own. Brand colors pulled straight from
// globals.css's --color-primary/--color-accent tokens rather than
// duplicating a PNG export of them.
import { ImageResponse } from 'next/og';

export const runtime = 'edge';
export const alt = 'MekaSoft — Logiciel de gestion pour garages automobiles';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export default function OpengraphImage() {
  return new ImageResponse(
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        padding: '90px',
        background: '#152a4e',
        fontFamily: 'sans-serif',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 18, marginBottom: 48 }}>
        <div
          style={{
            width: 60,
            height: 60,
            borderRadius: 14,
            background: '#de6a34',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 34,
            fontWeight: 700,
            color: '#ffffff',
          }}
        >
          M
        </div>
        <div style={{ fontSize: 34, fontWeight: 700, color: '#ffffff', display: 'flex' }}>
          MekaSoft
        </div>
      </div>
      <div
        style={{
          fontSize: 58,
          fontWeight: 700,
          color: '#ffffff',
          display: 'flex',
          maxWidth: 950,
          lineHeight: 1.15,
        }}
      >
        Gérez votre garage. Simplement.
      </div>
      <div
        style={{
          fontSize: 27,
          color: '#f5f4f0',
          marginTop: 28,
          display: 'flex',
          maxWidth: 820,
          opacity: 0.85,
        }}
      >
        Clients, véhicules, réparations, devis et factures réunis au même endroit.
      </div>
    </div>,
    { ...size },
  );
}
