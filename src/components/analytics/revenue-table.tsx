"use client";

import React from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export interface ProviderRevenue {
  id: string;
  name: string;
  specialty: string;
  patients: number;
  mrr: number; // Monthly Recurring Revenue
  growth: number; // Percentage growth
  status: "Active" | "Onboarding" | "Inactive";
}

interface RevenueTableProps {
  data: ProviderRevenue[];
  title?: string;
  description?: string;
}

export function RevenueByProviderTable({
  data,
  title = "Revenue by Provider",
  description = "Monthly recurring revenue and patient volume across your clinical team.",
}: RevenueTableProps) {
  
  // Format currency
  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(value);
  };

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="text-xs text-text-muted uppercase tracking-wider bg-[var(--surface-muted)]/50 border-b border-border">
              <tr>
                <th scope="col" className="px-6 py-4 font-semibold rounded-tl-xl">Provider</th>
                <th scope="col" className="px-6 py-4 font-semibold text-right">Patients</th>
                <th scope="col" className="px-6 py-4 font-semibold text-right">MRR</th>
                <th scope="col" className="px-6 py-4 font-semibold text-right">Growth (MoM)</th>
                <th scope="col" className="px-6 py-4 font-semibold text-center rounded-tr-xl">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {data.map((provider) => (
                <tr key={provider.id} className="hover:bg-[var(--accent)]/5 transition-colors group">
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="flex flex-col">
                      <span className="font-semibold text-text group-hover:text-[var(--accent)] transition-colors">
                        {provider.name}
                      </span>
                      <span className="text-xs text-text-muted">{provider.specialty}</span>
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-right font-medium text-text">
                    {provider.patients.toLocaleString()}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-right font-semibold text-[var(--accent)]">
                    {formatCurrency(provider.mrr)}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-right">
                    <div className={`flex items-center justify-end gap-1 font-medium ${provider.growth >= 0 ? "text-emerald-500" : "text-red-500"}`}>
                      {provider.growth >= 0 ? "+" : ""}
                      {provider.growth}%
                      {provider.growth >= 0 ? (
                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
                        </svg>
                      ) : (
                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 17h8m0 0V9m0 8l-8-8-4 4-6-6" />
                        </svg>
                      )}
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-center">
                    <Badge 
                      tone={
                        provider.status === "Active" ? "success" :
                        provider.status === "Onboarding" ? "info" : "neutral"
                      }
                    >
                      {provider.status}
                    </Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}
