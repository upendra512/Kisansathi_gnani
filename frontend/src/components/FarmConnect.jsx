import React, { useEffect, useState } from "react";
import { CalendarClock, CheckCircle2, PhoneCall, Plus, UserRound } from "lucide-react";

const CONTACTS = [
  { name: "Krishi Beej Kendra", kind: "Seed store", detail: "Seeds · fertiliser", phone: "Demo contact" },
  { name: "Bengal Farm Transport", kind: "Transport", detail: "Pickup · delivery", phone: "Demo contact" },
  { name: "Kisan Equipment Hub", kind: "Equipment", detail: "Pump · sprayer", phone: "Demo contact" },
];

export default function FarmConnect({ lang = "auto" }) {
  const [request, setRequest] = useState("");
  const [category, setCategory] = useState("Seed store");
  const [urgent, setUrgent] = useState(false);
  const [history, setHistory] = useState([]);
  const [profile, setProfile] = useState({ name: "", farm: "", crops: "" });

  useEffect(() => {
    try {
      setHistory(JSON.parse(localStorage.getItem("ks-farm-connect-history") || "[]"));
      setProfile(JSON.parse(localStorage.getItem("ks-farmer-profile") || "{}"));
    } catch { /* browser storage is optional */ }
  }, []);

  function saveProfile(e) {
    e.preventDefault();
    localStorage.setItem("ks-farmer-profile", JSON.stringify(profile));
  }

  function schedule(contact) {
    if (!request.trim()) return;
    const item = { id: Date.now(), contact: contact.name, category, request: request.trim(), urgent, status: "Demo request scheduled", at: new Date().toLocaleString("en-IN") };
    const next = [item, ...history].slice(0, 20);
    setHistory(next); localStorage.setItem("ks-farm-connect-history", JSON.stringify(next)); setRequest("");
  }

  return <div className="space-y-5">
    <div className="card border-amber-400/30 bg-amber-500/10 p-4 text-sm text-amber-200">Demo mode: supplier calls are simulated. No real call or booking is placed.</div>
    <div className="grid gap-5 xl:grid-cols-[280px_1fr]">
      <section className="card p-4">
        <div className="flex items-center gap-2 text-sm font-semibold"><UserRound size={17} className="text-emerald-400" /> Farmer profile</div>
        <form onSubmit={saveProfile} className="mt-4 space-y-2">
          {[["name", "Name"], ["farm", "Village / farm"], ["crops", "Crops"]].map(([key, label]) => <input key={key} value={profile[key] || ""} onChange={(e) => setProfile({ ...profile, [key]: e.target.value })} placeholder={label} className="w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-sm outline-none focus:border-emerald-400" />)}
          <button className="w-full rounded-xl bg-emerald-500 py-2 text-sm font-semibold text-slate-950">Save profile</button>
        </form>
      </section>
      <section className="card p-5">
        <div className="flex items-center gap-2 text-lg font-semibold"><PhoneCall size={19} className="text-emerald-400" /> Farm Connect</div>
        <p className="mt-1 text-sm text-slate-400">Prepare a supplier request in your chosen language and schedule a demo call.</p>
        <div className="mt-4 grid gap-2 sm:grid-cols-3">{CONTACTS.map((c) => <button key={c.name} onClick={() => schedule(c)} className="rounded-xl border border-white/10 bg-white/5 p-3 text-left hover:border-emerald-400/40"><div className="font-semibold text-slate-100">{c.name}</div><div className="mt-1 text-xs text-slate-400">{c.kind} · {c.detail}</div></button>)}</div>
        <div className="mt-4 grid gap-2 sm:grid-cols-[160px_1fr]">
          <select value={category} onChange={(e) => setCategory(e.target.value)} className="rounded-xl border border-white/10 bg-[#0b1712] px-3 py-2 text-sm"><option>Seed store</option><option>Transport</option><option>Equipment</option></select>
          <input value={request} onChange={(e) => setRequest(e.target.value)} placeholder="Need 5 kg tomato seed by Friday…" className="rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-sm outline-none focus:border-emerald-400" />
        </div>
        <label className="mt-3 flex items-center gap-2 text-xs text-slate-300"><input type="checkbox" checked={urgent} onChange={(e) => setUrgent(e.target.checked)} className="accent-rose-500" /> Farm operations emergency (retry and backup contact)</label>
        <div className="mt-3 flex items-center gap-2 text-xs text-slate-400"><CalendarClock size={14} /> Now or schedule later · Hindi · Kannada · English</div>
      </section>
    </div>
    <section className="card p-5"><div className="flex items-center justify-between"><h3 className="text-lg font-semibold">Request history</h3><span className="text-xs text-slate-500">Saved on this device</span></div>{history.length ? <div className="mt-3 space-y-2">{history.map((item) => <div key={item.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm"><span><b>{item.contact}</b> · {item.request}</span><span className="flex items-center gap-1 text-xs text-emerald-300"><CheckCircle2 size={13} /> {item.status}</span></div>)}</div> : <div className="mt-3 flex items-center gap-2 text-sm text-slate-400"><Plus size={15} /> Your supplier requests will appear here.</div>}</section>
  </div>;
}
