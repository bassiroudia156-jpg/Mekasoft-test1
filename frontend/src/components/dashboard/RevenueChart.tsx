import Icon from '@/components/ui/Icon';
import Card from '@/components/ui/Card';
import AnimatedNumber from '@/components/ui/AnimatedNumber';

export interface RevenueBar {
  day: string;
  /** 0-100, bar height as a percentage of the chart's max — a genuinely
   * dynamic per-render value, so this stays an inline style rather than a
   * static Tailwind class (see CLAUDE.md "no inline styles" — that rule
   * targets fixed design values, not computed chart data). */
  value: number;
  amount: string;
}

export interface RevenueChartProps {
  title?: string;
  total: number;
  currency?: string;
  trendLabel?: string;
  bars: RevenueBar[];
}

const DEFAULT_BARS: RevenueBar[] = [
  { day: 'Lun', value: 60, amount: '120k' },
  { day: 'Mar', value: 85, amount: '170k' },
  { day: 'Mer', value: 45, amount: '90k' },
  { day: 'Jeu', value: 100, amount: '200k' },
  { day: 'Ven', value: 75, amount: '150k' },
  { day: 'Sam', value: 90, amount: '180k' },
  { day: 'Dim', value: 30, amount: '60k' },
];

export default function RevenueChart({
  title = 'Recettes semaine',
  total,
  currency = 'FCFA',
  trendLabel,
  bars = DEFAULT_BARS,
}: RevenueChartProps) {
  return (
    <Card className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
            {title}
          </div>
          <div className="text-2xl font-bold font-headings text-foreground">
            <AnimatedNumber value={total} />{' '}
            <span className="text-base font-medium text-muted-foreground">{currency}</span>
          </div>
        </div>
        {trendLabel && (
          <div className="flex items-center gap-1 text-success text-xs font-medium bg-success/10 px-2.5 py-1 rounded-sm">
            <Icon i="trending-up" size={12} />
            {trendLabel}
          </div>
        )}
      </div>
      {/* Bars */}
      <div className="flex items-end gap-2 h-28">
        {bars.map((b) => (
          <div key={b.day} className="flex flex-col items-center gap-1 flex-1">
            <div
              className="w-full rounded-sm bg-primary/10 flex items-end"
              style={{ height: '96px' }}
            >
              <div className="w-full rounded-sm bg-primary" style={{ height: `${b.value}%` }} />
            </div>
            <span className="text-xs text-muted-foreground">{b.day}</span>
          </div>
        ))}
      </div>
    </Card>
  );
}
