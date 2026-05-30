"use client";

import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { RevenueDataPoint } from "@/lib/types";
import { formatCurrency } from "@/lib/utils";

export function RevenueChart({ data }: { data: RevenueDataPoint[] }) {
  return (
    <ResponsiveContainer width="100%" height={280}>
      <AreaChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id="revenueFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="#0d9488" stopOpacity={0.3} />
            <stop offset="95%" stopColor="#0d9488" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
        <XAxis dataKey="date" tick={{ fontSize: 11 }} stroke="#94a3b8" />
        <YAxis
          tick={{ fontSize: 11 }}
          stroke="#94a3b8"
          tickFormatter={(v) => `${Math.round(v / 1000)}k`}
        />
        <Tooltip formatter={(v) => formatCurrency(Number(v))} />
        <Area
          type="monotone"
          dataKey="revenue"
          stroke="#0d9488"
          fill="url(#revenueFill)"
          strokeWidth={2}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}
