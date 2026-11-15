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
  const [selected, setSelected] = useState(null);
  const [offer, setOffer] = useState(null);
  const [language, setLanguage] = useState("English");
  const [reminders, setReminders] = useState([]);
  const [reminder, setReminder] = useState("");

  useEffect(() => {
    try {
      setHistory(JSON.parse(localStorage.getItem("ks-farm-connect-history") || "[]"));
      setProfile(JSON.parse(localStorage.getItem("ks-farmer-profile") || "{}"));
      setReminders(JSON.parse(localStorage.getItem("ks-farm-connect-reminders") || "[]"));
    } catch { /* browser storage is optional */ }
  }, []);

  function saveProfile(e) {
    e.preventDefault();
    localStorage.setItem("ks-farmer-profile", JSON.stringify({ ...profile, language }));
  }

  function schedule(contact) {
    if (!request.trim()) return;
    setSelected(contact); setOffer(null);
    window.setTimeout(() => setOffer({ price: "₹2,200/qtl", delivery: "tomorrow afternoon" }), 400);
  }

  function approve(status = "Farmer approved · demo confirmation", contact = selected) {
    if (!contact || !request.trim()) return;
    const item = { id: Date.now(), contact: contact.name, category, request: request.trim(), language, urgent, status, at: new Date().toLocaleString("en-IN") };
    const next = [item, ...history].slice(0, 20);
    setHistory(next); localStorage.setItem("ks-farm-connect-history", JSON.stringify(next)); setRequest(""); setSelected(null); setOffer(null);
  }

  function addReminder(e) {
    e.preventDefault(); if (!reminder.trim()) return;
    const next = [{ id: Date.now(), text: reminder.trim(), due: "Best effort · check when app opens" }, ...reminders].slice(0, 10);
    setReminders(next); localStorage.setItem("ks-farm-connect-reminders", JSON.stringify(next)); setReminder("");
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
        {selected && <div className="mt-4 rounded-xl border border-cyan-400/30 bg-cyan-500/10 p-4 text-sm"><b>Simulated supplier conversation: {selected.name}</b>{offer ? <><div className="mt-2">Available · ₹2,200/qtl · delivery tomorrow afternoon</div><div className="mt-3 flex flex-wrap gap-2"><button onClick={() => approve()} className="rounded-lg bg-emerald-500 px-3 py-2 text-xs font-semibold text-slate-950">Approve exact offer</button><button onClick={() => approve("No answer · retry scheduled in 5 minutes")} className="rounded-lg border border-amber-400/40 px-3 py-2 text-xs text-amber-200">Retry in 5 minutes</button><button onClick={() => { setSelected(CONTACTS.find((c) => c.name !== selected.name)); setOffer(null); }} className="rounded-lg border border-white/10 px-3 py-2 text-xs text-slate-300">Try alternate</button></div></> : <div className="mt-2 text-xs text-slate-400">Checking availability, price, and delivery…</div>}</div>}
        <div className="mt-4 grid gap-2 sm:grid-cols-[160px_160px_1fr]">
          <select value={category} onChange={(e) => setCategory(e.target.value)} className="rounded-xl border border-white/10 bg-[#0b1712] px-3 py-2 text-sm"><option>Seed store</option><option>Transport</option><option>Equipment</option></select>
          <select value={language} onChange={(e) => setLanguage(e.target.value)} className="rounded-xl border border-white/10 bg-[#0b1712] px-3 py-2 text-sm"><option>English</option><option>Hindi</option><option>Kannada</option></select>
          <input value={request} onChange={(e) => setRequest(e.target.value)} placeholder="Need 5 kg tomato seed by Friday…" className="rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-sm outline-none focus:border-emerald-400" />
        </div>
        <label className="mt-3 flex items-center gap-2 text-xs text-slate-300"><input type="checkbox" checked={urgent} onChange={(e) => setUrgent(e.target.checked)} className="accent-rose-500" /> Farm operations emergency (retry and backup contact)</label>
        <div className="mt-3 flex items-center gap-2 text-xs text-slate-400"><CalendarClock size={14} /> Now or schedule later · Hindi · Kannada · English</div>
      </section>
    </div>
    <section className="card p-5"><div className="flex items-center justify-between"><h3 className="text-lg font-semibold">Request history</h3><span className="text-xs text-slate-500">Saved on this device</span></div>{history.length ? <div className="mt-3 space-y-2">{history.map((item) => <div key={item.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm"><span><b>{item.contact}</b> · {item.request}</span><span className="flex items-center gap-1 text-xs text-emerald-300"><CheckCircle2 size={13} /> {item.status}</span></div>)}</div> : <div className="mt-3 flex items-center gap-2 text-sm text-slate-400"><Plus size={15} /> Your supplier requests will appear here.</div>}</section>
    <section className="card p-5"><h3 className="flex items-center gap-2 text-lg font-semibold"><CalendarClock size={17} className="text-emerald-400" /> Reminders</h3><form onSubmit={addReminder} className="mt-3 flex gap-2"><input value={reminder} onChange={(e) => setReminder(e.target.value)} placeholder="Call transport supplier tomorrow" className="min-w-0 flex-1 rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-sm" /><button className="rounded-xl bg-emerald-500 px-3 text-sm font-semibold text-slate-950">Add</button></form>{reminders.length ? <div className="mt-3 space-y-2">{reminders.map((r) => <div key={r.id} className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm"><div>{r.text}</div><div className="text-[11px] text-amber-300">{r.due}</div></div>)}</div> : <p className="mt-3 text-sm text-slate-400">No reminders yet.</p>}</section>
  </div>;
}
