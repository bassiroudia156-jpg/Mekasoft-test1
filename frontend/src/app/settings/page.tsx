// /settings retired 2026-08-19 — its two sections split between /export
// (Rapport mensuel, Export de données) and /profile (Atelier, Abonnement).
// Kept as a redirect, not a deletion, so old bookmarks/deep-links (emails
// sent before this change, browser history) still land somewhere useful
// instead of 404ing.
import { redirect } from 'next/navigation';

export default function SettingsRedirectPage() {
  redirect('/profile');
}
