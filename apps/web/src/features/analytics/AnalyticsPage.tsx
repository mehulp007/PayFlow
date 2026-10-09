import { useNavigate } from 'react-router';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  Legend,
  Line,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { BarChart3, Building2, Landmark, Users, Wallet } from 'lucide-react';
import { useReportError } from '../../app/FeedbackProvider';
import { useAnalytics } from '../../app/queries';
import { EmptyState, Heading, PanelTitle, Pill, StatCard } from '../../components';
import { count, money, statusLabel, titleCase } from '../../lib/format';
import { periodLabel } from '../../lib/period';
import { axisMoney, useChartStyle } from './chartStyle';

const shortMonth = (year: number, month: number) => `${periodLabel(year, month).slice(0, 3)} ’${String(year).slice(2)}`;

export function AnalyticsPage() {
  const navigate = useNavigate();
  const analytics = useAnalytics();
  const style = useChartStyle();
  const { colors } = style;
  useReportError(analytics.error);
  const data = analytics.data;
  if (!data) return null;

  const latest = data.trend.at(-1);
  const trend = data.trend.map(point => ({ ...point, label: shortMonth(point.year, point.month) }));
  const statutory = data.statutory.filter(item => item.amount > 0);

  return (
    <>
      <Heading
        eyebrow="ANALYTICS / PAYROLL COST"
        title="Analytics"
        description={
          data.latest
            ? `Every calculated month, with breakdowns for ${periodLabel(data.latest.year, data.latest.month)}.`
            : 'Charts appear once a pay run has been calculated.'
        }
      />
      {!latest || !data.latest ? (
        <section className="panel">
          <EmptyState
            icon={BarChart3}
            title="No calculated months yet"
            action={
              <button className="button primary" onClick={() => navigate('/payroll')}>
                Open pay runs
              </button>
            }
          >
            Calculate a pay run to see cost trends, department splits and statutory contributions.
          </EmptyState>
        </section>
      ) : (
        <>
          <div className="stats-grid">
            <StatCard
              label="Gross pay"
              value={latest.gross}
              icon={Wallet}
              foot={`${periodLabel(latest.year, latest.month)} · ${statusLabel(latest.status)}`}
            />
            <StatCard
              label="Employer cost"
              value={latest.employerCost}
              icon={Landmark}
              tone="violet"
              foot="Gross plus employer contributions"
            />
            <StatCard
              label="People paid"
              value={count(latest.headcount)}
              icon={Users}
              tone="mint"
              foot={`${data.departments.length} departments`}
            />
            <StatCard
              label="Cost per person"
              value={latest.headcount ? Math.round(latest.employerCost / latest.headcount) : 0}
              icon={Building2}
              tone="rose"
              foot="Average monthly employer cost"
            />
          </div>
          <section className="panel chart-panel">
            <PanelTitle title="Monthly payroll cost" description="Gross and net pay, with the employer’s total cost" />
            <div className="chart" style={{ height: 300 }}>
              <ResponsiveContainer>
                <ComposedChart data={trend} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                  <CartesianGrid {...style.grid} />
                  <XAxis dataKey="label" {...style.axis} />
                  <YAxis tickFormatter={axisMoney} width={64} {...style.axis} />
                  <Tooltip {...style.tooltip} cursor={{ fill: colors.grid, opacity: 0.35 }} />
                  <Legend wrapperStyle={{ fontSize: 12, color: colors.text }} />
                  <Bar dataKey="gross" name="Gross pay" fill={colors.primary} radius={[5, 5, 0, 0]} maxBarSize={36} />
                  <Bar dataKey="net" name="Net pay" fill={colors.mint} radius={[5, 5, 0, 0]} maxBarSize={36} />
                  <Line
                    type="monotone"
                    dataKey="employerCost"
                    name="Employer cost"
                    stroke={colors.violet}
                    strokeWidth={2.5}
                    dot={{ r: 3 }}
                  />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </section>
          <div className="two-column">
            <section className="panel chart-panel">
              <PanelTitle title="Cost by department" description="Gross pay in the latest month" />
              <div className="chart" style={{ height: Math.max(180, data.departments.length * 44) }}>
                <ResponsiveContainer>
                  <BarChart
                    data={data.departments}
                    layout="vertical"
                    margin={{ top: 0, right: 16, left: 8, bottom: 0 }}
                  >
                    <CartesianGrid {...style.grid} horizontal={false} vertical />
                    <XAxis type="number" tickFormatter={axisMoney} {...style.axis} />
                    <YAxis type="category" dataKey="department" width={92} {...style.axis} />
                    <Tooltip {...style.tooltip} cursor={{ fill: colors.grid, opacity: 0.35 }} />
                    <Bar dataKey="gross" name="Gross pay" fill={colors.primary} radius={[0, 5, 5, 0]} maxBarSize={22} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </section>
            <section className="panel chart-panel">
              <PanelTitle title="Statutory contributions" description="Employee and employer shares together" />
              <div className="donut-layout">
                <div className="chart donut">
                  <PieChart width={210} height={210}>
                    <Pie
                      data={statutory}
                      dataKey="amount"
                      nameKey="label"
                      innerRadius="58%"
                      outerRadius="88%"
                      paddingAngle={2}
                      stroke="none"
                    >
                      {statutory.map((item, index) => (
                        <Cell key={item.label} fill={colors.series[index % colors.series.length]} />
                      ))}
                    </Pie>
                    <Tooltip {...style.tooltip} />
                  </PieChart>
                </div>
                <ul className="chart-legend">
                  {statutory.map((item, index) => (
                    <li key={item.label}>
                      <span style={{ background: colors.series[index % colors.series.length] }} />
                      {item.label}
                      <strong>{money(item.amount, true)}</strong>
                    </li>
                  ))}
                </ul>
              </div>
            </section>
          </div>
          <div className="two-column">
            <section className="panel chart-panel">
              <PanelTitle title="Headcount by level" description="Active people, Associate to Managing Director" />
              <div className="chart" style={{ height: 240 }}>
                <ResponsiveContainer>
                  <BarChart data={data.levels} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                    <CartesianGrid {...style.grid} />
                    <XAxis dataKey="level" tickFormatter={(level: number) => `L${level}`} {...style.axis} />
                    <YAxis allowDecimals={false} width={40} {...style.axis} />
                    <Tooltip
                      {...style.tooltip}
                      formatter={(value: unknown) => count(Number(value))}
                      labelFormatter={(level: unknown) => data.levels.find(item => item.level === level)?.label ?? ''}
                      cursor={{ fill: colors.grid, opacity: 0.35 }}
                    />
                    <Bar dataKey="count" name="People" fill={colors.sky} radius={[5, 5, 0, 0]} maxBarSize={34} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </section>
            <section className="panel chart-panel">
              <PanelTitle title="Employment types" description="Who is on the payroll, and how" />
              <div className="donut-layout">
                <div className="chart donut">
                  <PieChart width={210} height={210}>
                    <Pie
                      data={data.employmentTypes}
                      dataKey="count"
                      nameKey="type"
                      innerRadius="58%"
                      outerRadius="88%"
                      paddingAngle={2}
                      stroke="none"
                    >
                      {data.employmentTypes.map((item, index) => (
                        <Cell key={item.type} fill={colors.series[index % colors.series.length]} />
                      ))}
                    </Pie>
                    <Tooltip
                      {...style.tooltip}
                      formatter={(value: unknown, name: unknown) => [count(Number(value)), titleCase(String(name))]}
                    />
                  </PieChart>
                </div>
                <ul className="chart-legend">
                  {data.employmentTypes.map((item, index) => (
                    <li key={item.type}>
                      <span style={{ background: colors.series[index % colors.series.length] }} />
                      {titleCase(item.type)}
                      <strong>{count(item.count)}</strong>
                    </li>
                  ))}
                </ul>
              </div>
            </section>
          </div>
          <section className="panel">
            <PanelTitle
              title="Biggest changes from last month"
              description="Gross pay against the previous approved month: joiners, unpaid leave, revisions and bonuses"
            />
            {data.changes.length ? (
              <div className="table-scroll">
                <table>
                  <thead>
                    <tr>
                      <th>Employee</th>
                      <th>Department</th>
                      <th>Last month</th>
                      <th>This month</th>
                      <th>Change</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.changes.map(row => {
                      const change = Math.round(((row.current - row.previous) / row.previous) * 100);
                      return (
                        <tr key={row.employeeId} onClick={() => navigate(`/people?employee=${row.employeeId}`)}>
                          <td>
                            <strong>{row.name}</strong>
                            <small>{row.employeeId}</small>
                          </td>
                          <td>{row.department}</td>
                          <td className="numeric">{money(row.previous)}</td>
                          <td className="numeric">{money(row.current)}</td>
                          <td>
                            <Pill tone={Math.abs(change) > 25 ? 'warning' : change < 0 ? 'neutral' : 'info'}>
                              {change > 0 ? '+' : ''}
                              {change}%
                            </Pill>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="table-empty">No changes against the previous approved month.</p>
            )}
          </section>
        </>
      )}
    </>
  );
}
