// Shared display-label derivation for a caller's org role — used by
// Sidebar, ManagerProfilePanel and EditProfileModal's read-only "Rôle" row
// so the three don't each re-implement the same jobTitle/orgRole fallback
// (mirrors TeamManagementModal's per-member label logic, which stays local
// to that file since it has team-mate data, not the caller's own).
export function orgRoleLabel(orgRole: string | null, jobTitle: string | null): string {
  if (jobTitle) return jobTitle;
  if (orgRole === 'OWNER') return 'Gérant';
  if (orgRole === 'ADMIN') return 'Administrateur';
  if (orgRole === 'MEMBER') return 'Membre';
  return 'Utilisateur';
}
