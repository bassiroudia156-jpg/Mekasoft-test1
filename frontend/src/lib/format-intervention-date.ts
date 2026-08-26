// "Auj. 09h14" / "Hier 17h55" / "14/05 11h00" — matches the date format
// used across Banani's InterventionsList/InterventionDetailsView mocks.
// Shared by the interventions list, detail, and devis pages.
export function formatInterventionDate(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const time = d
    .toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
    .replace(':', 'h');

  if (d.toDateString() === now.toDateString()) return `Auj. ${time}`;

  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (d.toDateString() === yesterday.toDateString()) return `Hier ${time}`;

  const dm = d.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' });
  return `${dm} ${time}`;
}
