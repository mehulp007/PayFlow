import { useNavigate } from 'react-router';
import { ArrowRight } from 'lucide-react';
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { useAnalytics } from '../../app/queries';
import { PanelTitle } from '../../components';
import { periodLabel } from '../../lib/period';
import { axisMoney, useChartStyle } from '../analytics/chartStyle';

/** Gross pay and employer cost for every calculated month, linking to the full analytics page. */
export default function CostTrend() {
  const navigate = useNavigate();
  const analytics = useAnalytics();
  const style = useChartStyle();
  const trend = (analytics.data?.trend ?? []).map(point => ({
    ...point,
    label: periodLabel(point.year, point.month).slice(0, 3),
  }));
  if (trend.length < 2) return null;
  return (
    <section className="panel chart-panel cost-trend">
      <PanelTitle
        title="Payroll cost trend"
        description={`${trend.length} calculated months`}
        action={
          <button className="text-button" onClick={() => navigate('/analytics')}>
            Open analytics <ArrowRight size={15} />
          </button>
        }
      />
      <div className="chart" style={{ height: 190 }}>
        <ResponsiveContainer>
          <AreaChart data={trend} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id="trend-gross" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={style.colors.primary} stopOpacity={0.28} />
                <stop offset="100%" stopColor={style.colors.primary} stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid {...style.grid} />
            <XAxis dataKey="label" {...style.axis} />
            {/* A close-up of the trend: the axis starts just below the lowest month instead of at zero. */}
            <YAxis
              tickFormatter={axisMoney}
              width={60}
              domain={[(min: number) => Math.floor(min * 0.9), 'auto']}
              {...style.axis}
            />
            <Tooltip {...style.tooltip} />
            <Area
              type="monotone"
              dataKey="employerCost"
              name="Employer cost"
              stroke={style.colors.violet}
              strokeWidth={2}
              fill="none"
            />
            <Area
              type="monotone"
              dataKey="gross"
              name="Gross pay"
              stroke={style.colors.primary}
              strokeWidth={2.5}
              fill="url(#trend-gross)"
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </section>
  );
}
