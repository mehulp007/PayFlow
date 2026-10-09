import { useChartColors } from '../../app/ThemeProvider';
import { money } from '../../lib/format';

/** Axis labels in lakh and crore: ₹45L, ₹1.2Cr. */
export function axisMoney(paise: number): string {
  const rupees = paise / 100;
  if (Math.abs(rupees) >= 1_00_00_000) return `₹${(rupees / 1_00_00_000).toFixed(1)}Cr`;
  if (Math.abs(rupees) >= 1_00_000) return `₹${Math.round(rupees / 1_00_000)}L`;
  if (Math.abs(rupees) >= 1_000) return `₹${Math.round(rupees / 1_000)}k`;
  return `₹${rupees}`;
}

/** Shared look for chart tooltips, axes and grids in both themes. */
export function useChartStyle() {
  const colors = useChartColors();
  return {
    colors,
    axis: { stroke: colors.grid, tick: { fill: colors.text, fontSize: 11 }, tickLine: false },
    grid: { stroke: colors.grid, strokeDasharray: '3 3', vertical: false },
    tooltip: {
      contentStyle: {
        background: colors.surface,
        border: `1px solid ${colors.grid}`,
        borderRadius: 10,
        fontSize: 12,
        boxShadow: '0 8px 24px rgba(16, 26, 57, 0.12)',
      },
      labelStyle: { color: colors.text, fontWeight: 700 },
      formatter: (value: unknown) => money(Number(value)),
    },
  };
}
