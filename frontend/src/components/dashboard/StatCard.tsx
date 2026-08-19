import Icon from '@/components/ui/Icon';
import Card from '@/components/ui/Card';
import AnimatedNumber from '@/components/ui/AnimatedNumber';

type StatStatus = 'default' | 'success' | 'warning' | 'accent';

export interface StatCardProps {
  label: string;
  /** A number animates in via AnimatedNumber; a string (e.g. "—" for "no
   * data yet") renders as-is, unanimated. */
  value: number | string;
  /** Only used when `value` is a number — e.g. formatCompactAmount for FCFA. */
  format?: (n: number) => string;
  sub: string;
  status?: StatStatus;
  icon: string;
}

const STATUS_STYLES: Record<StatStatus, { bar: string; label: string }> = {
  default: { bar: 'bg-primary', label: 'text-primary' },
  success: { bar: 'bg-success', label: 'text-success' },
  warning: { bar: 'bg-warning', label: 'text-warning' },
  accent: { bar: 'bg-accent', label: 'text-accent' },
};

export default function StatCard({
  label,
  value,
  format,
  sub,
  status = 'default',
  icon,
}: StatCardProps) {
  const styles = STATUS_STYLES[status];
  return (
    <Card className="flex flex-col gap-3 flex-1">
      <div className="flex items-center justify-between">
        <span className={`text-xs font-medium uppercase tracking-widest ${styles.label}`}>
          {label}
        </span>
        <div className={`w-7 h-7 rounded-sm flex items-center justify-center ${styles.bar}`}>
          <Icon i={icon} size={14} className="text-primary-foreground" />
        </div>
      </div>
      <div className="text-4xl font-bold font-headings text-foreground leading-none">
        {typeof value === 'number' ? <AnimatedNumber value={value} format={format} /> : value}
      </div>
      <div className="text-muted-foreground text-sm">{sub}</div>
      <div className={`h-0.5 w-full rounded-full ${styles.bar} opacity-40`} />
    </Card>
  );
}
