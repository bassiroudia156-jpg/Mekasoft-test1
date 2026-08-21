// Banani's mock UserAvatar renders a demographic-tagged stock photo
// (gender/ageGroup/heritage props) from its own asset service — that
// service isn't available outside the Banani editor and stock headshots
// aren't appropriate for real user data anyway. This is an intentional
// substitution: an initials avatar driven by the account's real name/email,
// same footprint (rounded box, configurable size via className).
//
// Phase 8: optional `src` renders the account's real photo (OAuth prefill
// or user upload via EditProfileModal) when present, falling back to
// initials otherwise — no existing caller passes `src` yet, so this is
// additive.
import { useState } from 'react';
import clsx from 'clsx';

export interface UserAvatarProps {
  /** Display name or email to derive initials from. */
  name: string;
  /** Real photo URL — omit/null to always show initials. `| undefined` so
   * callers can pass `user?.avatarUrl` directly under exactOptionalPropertyTypes. */
  src?: string | null | undefined;
  className?: string;
}

const PALETTE = [
  'bg-primary text-primary-foreground',
  'bg-accent text-accent-foreground',
  'bg-success text-success-foreground',
  'bg-warning text-warning-foreground',
];

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return (parts[0]!.charAt(0) + parts[parts.length - 1]!.charAt(0)).toUpperCase();
}

function colorFor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) >>> 0;
  return PALETTE[hash % PALETTE.length]!;
}

export default function UserAvatar({ name, src, className }: UserAvatarProps) {
  // 2026-08-20 fix — an OAuth-provided photo URL (Google, etc.) can go
  // stale/expire or 404 after the fact; without this, a broken `src` fell
  // through to the browser's native "broken image" icon instead of the
  // initials fallback below (reported: admin dashboard top bar, but this
  // component is shared by every avatar in the app). `key={src}` resets
  // the failed flag if a fresher `src` is ever passed in for the same user.
  const [failed, setFailed] = useState(false);
  if (src && !failed) {
    return (
      <img
        key={src}
        src={src}
        alt=""
        aria-hidden="true"
        onError={() => setFailed(true)}
        className={clsx('object-cover shrink-0', className)}
      />
    );
  }

  return (
    <div
      className={clsx(
        'flex items-center justify-center font-headings font-bold shrink-0',
        colorFor(name),
        className,
      )}
      aria-hidden="true"
    >
      {initials(name)}
    </div>
  );
}
