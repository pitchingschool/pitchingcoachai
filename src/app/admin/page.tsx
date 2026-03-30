"use client";

import { useState, useCallback } from "react";
import Link from "next/link";

interface Lead {
  id: string;
  created_at: string;
  first_name: string;
  email: string;
  phone: string | null;
  age: number;
  source: string | null;
  analyses?: { overall_score: number | null } | null;
}

interface AdminData {
  leads: Lead[];
  stats: { total: number; last7: number; last30: number; avgScore: number | null; totalAnalyses: number };
  dailyCounts: { [date: string]: number };
  ageDistribution?: { [age: string]: number };
  sourceDistribution?: { [source: string]: number };
  dripStats?: { [stage: string]: number };
}

export default function AdminPage() {
  const [password, setPassword] = useState("");
  const [authed, setAuthed] = useState(false);
  const [data, setData] = useState<AdminData | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const login = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/admin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      if (!res.ok) {
        setError("Incorrect password");
        setLoading(false);
        return;
      }
      const json = await res.json();
      setData(json);
      setAuthed(true);
    } catch {
      setError("Connection error");
    }
    setLoading(false);
  }, [password]);

  const exportCSV = useCallback(() => {
    if (!data?.leads) return;
    const headers = ["Date", "Name", "Email", "Phone", "Age", "Source", "Score"];
    const rows = data.leads.map((l) => [
      new Date(l.created_at).toLocaleDateString(),
      l.first_name,
      l.email,
      l.phone || "",
      String(l.age || ""),
      l.source || "",
      String(l.analyses?.overall_score || ""),
    ]);
    const csv = [headers, ...rows].map((r) => r.map((v) => `"${v.replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `pitchingcoachai-leads-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }, [data]);

  if (!authed) {
    return (
      <div className="min-h-screen bg-brand-dark flex items-center justify-center px-6">
        <div className="max-w-sm w-full">
          <Link href="/" className="text-xl font-bold tracking-tight block text-center mb-8">
            PitchingCoach<span className="text-brand-red">AI</span> <span className="text-white/40 text-sm">Admin</span>
          </Link>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && login()}
            placeholder="Admin password"
            className="w-full px-4 py-3 rounded-xl bg-white/5 border border-white/10 text-white mb-3 focus:outline-none focus:border-brand-red"
          />
          <button onClick={login} disabled={loading} className="w-full py-3 rounded-xl bg-brand-red text-white font-bold hover:bg-red-700 transition disabled:opacity-50">
            {loading ? "Loading..." : "Log In"}
          </button>
          {error && <p className="text-red-400 text-sm mt-2 text-center">{error}</p>}
        </div>
      </div>
    );
  }

  const s = data!.stats;

  return (
    <div className="min-h-screen bg-brand-dark">
      <nav className="flex items-center justify-between px-6 py-4 max-w-6xl mx-auto">
        <Link href="/" className="text-xl font-bold tracking-tight">
          PitchingCoach<span className="text-brand-red">AI</span> <span className="text-white/40 text-sm">Admin</span>
        </Link>
        <button onClick={exportCSV} className="text-sm px-4 py-2 rounded-lg bg-white/10 text-white/60 hover:bg-white/20 transition">
          Export CSV
        </button>
      </nav>

      <div className="max-w-6xl mx-auto px-6 py-8">
        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-8">
          {[
            { label: "Total Leads", value: s.total },
            { label: "Last 7 Days", value: s.last7 },
            { label: "Last 30 Days", value: s.last30 },
            { label: "Analyses", value: s.totalAnalyses },
            { label: "Avg Score", value: s.avgScore ?? "—" },
          ].map((stat) => (
            <div key={stat.label} className="bg-white/5 border border-white/10 rounded-xl p-4 text-center">
              <div className="text-2xl font-bold">{stat.value}</div>
              <div className="text-xs text-white/40">{stat.label}</div>
            </div>
          ))}
        </div>

        {/* Chart — simple bar chart */}
        {data?.dailyCounts && (
          <div className="bg-white/5 border border-white/10 rounded-xl p-4 mb-8">
            <h3 className="text-sm font-bold text-white/40 mb-3">Leads Per Day (Last 30 Days)</h3>
            <div className="flex items-end gap-[2px] h-24">
              {Object.entries(data.dailyCounts).map(([date, count]) => {
                const max = Math.max(...Object.values(data.dailyCounts), 1);
                const h = (count / max) * 100;
                return (
                  <div key={date} className="flex-1 group relative">
                    <div className="bg-brand-red rounded-t" style={{ height: `${Math.max(h, 2)}%` }} />
                    <div className="hidden group-hover:block absolute bottom-full left-1/2 -translate-x-1/2 mb-1 bg-black text-white text-[10px] px-2 py-1 rounded whitespace-nowrap">
                      {date.slice(5)}: {count}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Age + Source + Drip breakdown */}
        <div className="grid md:grid-cols-3 gap-4 mb-8">
          {/* Age Distribution */}
          {data?.ageDistribution && (
            <div className="bg-white/5 border border-white/10 rounded-xl p-4">
              <h3 className="text-sm font-bold text-white/40 mb-3">Age Distribution</h3>
              <div className="space-y-1">
                {Object.entries(data.ageDistribution)
                  .sort(([a], [b]) => Number(a) - Number(b))
                  .map(([age, count]) => {
                    const max = Math.max(...Object.values(data.ageDistribution!), 1);
                    const pct = (count / max) * 100;
                    return (
                      <div key={age} className="flex items-center gap-2">
                        <span className="text-xs text-white/50 w-6 text-right">{age}</span>
                        <div className="flex-1 bg-white/5 rounded-full h-3">
                          <div className="bg-brand-red rounded-full h-3" style={{ width: `${pct}%` }} />
                        </div>
                        <span className="text-xs text-white/40 w-6">{count}</span>
                      </div>
                    );
                  })}
              </div>
            </div>
          )}

          {/* Source Distribution */}
          {data?.sourceDistribution && (
            <div className="bg-white/5 border border-white/10 rounded-xl p-4">
              <h3 className="text-sm font-bold text-white/40 mb-3">Traffic Sources</h3>
              <div className="space-y-1">
                {Object.entries(data.sourceDistribution)
                  .sort(([, a], [, b]) => b - a)
                  .map(([source, count]) => {
                    const max = Math.max(...Object.values(data.sourceDistribution!), 1);
                    const pct = (count / max) * 100;
                    return (
                      <div key={source} className="flex items-center gap-2">
                        <span className="text-xs text-white/50 w-20 truncate">{source}</span>
                        <div className="flex-1 bg-white/5 rounded-full h-3">
                          <div className="bg-blue-500 rounded-full h-3" style={{ width: `${pct}%` }} />
                        </div>
                        <span className="text-xs text-white/40 w-6">{count}</span>
                      </div>
                    );
                  })}
              </div>
            </div>
          )}

          {/* Drip Email Progress */}
          {data?.dripStats && (
            <div className="bg-white/5 border border-white/10 rounded-xl p-4">
              <h3 className="text-sm font-bold text-white/40 mb-3">Email Drip Progress</h3>
              <div className="space-y-2">
                {[
                  { stage: "0", label: "Welcome sent" },
                  { stage: "1", label: "Email 2 sent" },
                  { stage: "2", label: "Email 3 sent" },
                  { stage: "3", label: "Email 4 sent" },
                  { stage: "4", label: "Sequence complete" },
                ].map(({ stage, label }) => (
                  <div key={stage} className="flex items-center justify-between">
                    <span className="text-xs text-white/50">{label}</span>
                    <span className="text-sm font-bold">{data.dripStats![stage] || 0}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Leads table */}
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-white/40 border-b border-white/10">
                <th className="pb-2 pr-4">Date</th>
                <th className="pb-2 pr-4">Name</th>
                <th className="pb-2 pr-4">Email</th>
                <th className="pb-2 pr-4">Phone</th>
                <th className="pb-2 pr-4">Age</th>
                <th className="pb-2 pr-4">Source</th>
                <th className="pb-2">Score</th>
              </tr>
            </thead>
            <tbody>
              {data?.leads.map((lead) => (
                <tr key={lead.id} className="border-b border-white/5 hover:bg-white/5">
                  <td className="py-2 pr-4 text-white/50">{new Date(lead.created_at).toLocaleDateString()}</td>
                  <td className="py-2 pr-4 font-medium">{lead.first_name}</td>
                  <td className="py-2 pr-4 text-white/60">{lead.email}</td>
                  <td className="py-2 pr-4 text-white/50">{lead.phone || "—"}</td>
                  <td className="py-2 pr-4 text-white/50">{lead.age}</td>
                  <td className="py-2 pr-4 text-white/50">{lead.source || "—"}</td>
                  <td className="py-2 font-bold">{lead.analyses?.overall_score ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {data?.leads.length === 0 && (
            <p className="text-center text-white/30 py-8">No leads yet</p>
          )}
        </div>
      </div>
    </div>
  );
}
