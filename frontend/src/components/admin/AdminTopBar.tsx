'use client';

// Admin back-office top bar (2026-08-20). Deliberately standalone rather
// than reusing components/layout/TopBar.tsx — that component is mid-edit
// in a concurrent session as of this build (its `rightSlot` prop shape was
// still changing), and the admin shell has no dependency on it: a
// title/subtitle/actions header is all any /admin/* page needs.
import { type ReactNode } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import UserAvatar from '@/components/ui/UserAvatar';

export interface AdminTopBarProps {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
}

export default function AdminTopBar({ title, subtitle, actions }: AdminTopBarProps) {
  const { user } = useAuth();
  return (
    <div className="bg-surface border-b border-border px-6 py-4 flex items-center gap-4">
      <div className="flex-1 min-w-0">
        <h1 className="text-lg font-bold font-headings text-foreground leading-tight truncate">
          {title}
        </h1>
        {subtitle && <div className="text-xs text-muted-foreground mt-0.5">{subtitle}</div>}
      </div>
      {actions}
      {user && (
        <div className="flex items-center gap-2 pl-4 border-l border-border">
          <UserAvatar
            name={user.name ?? user.email}
            src={user.avatarUrl}
            className="w-8 h-8 rounded-sm"
          />
          <div className="hidden sm:block">
            <div className="text-sm font-medium text-foreground leading-tight">
              {user.name ?? user.email}
            </div>
            <div className="text-xs text-muted-foreground">{user.role}</div>
          </div>
        </div>
      )}
    </div>
  );
}
