"use client";

import React from "react";
import {
  ScatterChart,
  Scatter,
  XAxis,
  YAxis,
  ZAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  Cell,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";

export interface EfficacyDataPoint {
  id: string;
  modality: "Flower" | "Tincture" | "Edible" | "Vape" | "Topical";
  doseMg: number; // X-axis
  reliefScore: number; // Y-axis (0-10)
  patientCount: number; // Z-axis (bubble size)
}

interface EfficacyScatterProps {
  data: EfficacyDataPoint[];
  title?: string;
  description?: string;
}

// Verdant Apothecary brand colors
const MODALITY_COLORS = {
  Flower: "#10B981", // emerald-500
  Tincture: "#8B5CF6", // violet-500
  Edible: "#F59E0B", // amber-500
  Vape: "#3B82F6", // blue-500
  Topical: "#EC4899", // pink-500
};

export function ModalityEfficacyScatter({
  data,
  title = "Modality Efficacy Mapping",
  description = "Visualizing symptom relief vs. average dose across consumption methods.",
}: EfficacyScatterProps) {
  
  // Group data by modality for rendering different series
  const groupedData = React.useMemo(() => {
    const groups: Record<string, EfficacyDataPoint[]> = {};
    data.forEach((point) => {
      if (!groups[point.modality]) {
        groups[point.modality] = [];
      }
      groups[point.modality].push(point);
    });
    return groups;
  }, [data]);

  const CustomTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload as EfficacyDataPoint;
      return (
        <div className="bg-surface border border-border p-3 rounded-xl shadow-sm text-sm">
          <p className="font-semibold text-text mb-1 flex items-center gap-2">
            <span 
              className="w-2.5 h-2.5 rounded-full" 
              style={{ backgroundColor: MODALITY_COLORS[data.modality] }}
            />
            {data.modality}
          </p>
          <div className="space-y-1 text-text-muted mt-2">
            <p><span className="font-medium text-text">Dose:</span> {data.doseMg} mg</p>
            <p><span className="font-medium text-text">Relief:</span> {data.reliefScore}/10</p>
            <p><span className="font-medium text-text">Sample size:</span> {data.patientCount} patients</p>
          </div>
        </div>
      );
    }
    return null;
  };

  return (
    <Card className="w-full h-full min-h-[400px]">
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="h-[350px] w-full mt-2">
          <ResponsiveContainer width="100%" height="100%">
            <ScatterChart
              margin={{
                top: 20,
                right: 20,
                bottom: 20,
                left: 0,
              }}
            >
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)" opacity={0.5} />
              
              <XAxis 
                type="number" 
                dataKey="doseMg" 
                name="Average Dose" 
                unit="mg" 
                tick={{ fill: 'var(--text-muted)' }}
                tickLine={false}
                axisLine={false}
                domain={['auto', 'auto']}
              />
              
              <YAxis 
                type="number" 
                dataKey="reliefScore" 
                name="Relief Score" 
                tick={{ fill: 'var(--text-muted)' }}
                tickLine={false}
                axisLine={false}
                domain={[0, 10]}
              />
              
              <ZAxis 
                type="number" 
                dataKey="patientCount" 
                range={[50, 400]} // Min/Max bubble sizes
                name="Patients" 
              />
              
              <Tooltip cursor={{ strokeDasharray: '3 3' }} content={<CustomTooltip />} />
              <Legend wrapperStyle={{ paddingTop: '20px' }} />
              
              {Object.entries(groupedData).map(([modality, points]) => (
                <Scatter 
                  key={modality} 
                  name={modality} 
                  data={points} 
                  fill={MODALITY_COLORS[modality as keyof typeof MODALITY_COLORS] || "#94a3b8"}
                  opacity={0.7}
                >
                  {points.map((entry, index) => (
                    <Cell 
                      key={`cell-${index}`} 
                      fill={MODALITY_COLORS[entry.modality] || "#94a3b8"} 
                    />
                  ))}
                </Scatter>
              ))}
            </ScatterChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}
