import React, { useEffect, useState } from "react";
import Header from "./components/Header.jsx";
import Sidebar from "./components/Sidebar.jsx";
import AskView from "./components/AskView.jsx";
import TraceView from "./components/TraceView.jsx";
import Dashboard from "./components/Dashboard.jsx";
import Home from "./components/Home.jsx";
import FarmConnect from "./components/FarmConnect.jsx";
import { askAgent, getHealth, reverseGeocode } from "./api.js";
import { t } from "./i18n.js";

const PAGE_BACKGROUNDS = {
  home: "/bg-fields.jpg",
  ask: "/bg-tractor.jpg",
  trace: "/bg-valley.jpg",
  dashboard: "/bg-tractor.jpg",
  farmconnect: "/bg-tractor.jpg",
};

function EmptyState({ what, hi, onAsk, lang }) {
  return (
    <div className="card grid min-h-[420px] place-items-center p-10 text-center">
      <div>
        <div className="text-5xl">🌾</div>
        <div className="mt-4 text-xl font-bold text-slate-100">{lang === "kn" ? "ಇನ್ನೂ ಪ್ರಶ್ನೆ ಕೇಳಿಲ್ಲ" : "No question asked yet"}</div>
        <div className={`${lang === "kn" ? "kn" : "hi"} mt-1 text-slate-400`}>{lang === "kn" ? "ಇನ್ನೂ ಯಾವುದೇ ಪ್ರಶ್ನೆ ಕೇಳಿಲ್ಲ" : "अभी तक कोई प्रश्न नहीं पूछा गया"}</div>
        <p className="mx-auto mt-3 max-w-md text-sm text-slate-300">
          {lang === "kn" ? "ಕಿಸಾನ್‌ಸಾಥಿಗೆ ಪ್ರಶ್ನೆ ಕೇಳಿದ ಕೂಡಲೇ " : `The ${what} (`}<span className={lang === "kn" ? "kn" : "hi"}>{lang === "kn" ? "ಲೈವ್ ಮಾಹಿತಿ" : hi}</span>{lang === "kn" ? " ಇಲ್ಲಿ ಕಾಣಿಸುತ್ತದೆ." : ") fills in live as soon as you ask KisanSaathi a question."}
        </p>
        <button onClick={onAsk} className="mt-6 rounded-xl bg-forest-800 px-6 py-3 font-semibold text-slate-950 hover:bg-forest-700">
          {lang === "kn" ? "ಪ್ರಶ್ನೆ ಕೇಳಿ" : <>Ask a question / <span className="hi">प्रश्न पूछें</span></>}
        </button>
      </div>
    </div>
  );
}

export default function App() {
  const [health, setHealth] = useState(null);
  const [view, setView] = useState("home");
  const [lang, setLang] = useState("auto");
  const [profile, setProfile] = useState({ location: "", coords: null, speak: true });
  // Conversation memory: what the agent has learned from the farmer, and its last question
  const [known, setKnown] = useState({});
  const [asked, setAsked] = useState(null);
  const [chat, setChat] = useState([]);
  const [pending, setPending] = useState(null);
  const [geo, setGeo] = useState({ status: "idle" });
  const [steps, setSteps] = useState([]);
  const [result, setResult] = useState(null);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState("");

  function resetChat() {
    if (running) return;
    setKnown({});
    setAsked(null);
    setChat([]);
    setPending(null);
    setSteps([]);
    setResult(null);
    setError("");
  }

  useEffect(() => { getHealth().then(setHealth).catch(() => setHealth({})); }, []);
  useEffect(() => {
    document.documentElement.lang = lang === "kn" ? "kn" : lang === "hi" ? "hi" : "en";
  }, [lang]);

  // Live location: ask the device for GPS, then name the place via reverse geocoding (no hard-coded default).
  function locateMe() {
    if (!navigator.geolocation) { setGeo({ status: "unsupported" }); return; }
    setGeo({ status: "locating" });
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const { latitude: lat, longitude: lon, accuracy } = pos.coords;
        setProfile((p) => ({ ...p, coords: { lat, lon, accuracy } }));
        setGeo({ status: "ok" });
        try {
          const r = await reverseGeocode(lat, lon);
          if (r.ok) {
            const label = [r.place.name, r.place.district].filter(Boolean).join(", ");
            setProfile((p) => (p.coords && p.coords.lat === lat ? { ...p, location: label } : p));
          }
        } catch { /* name is cosmetic; coordinates are what the agent uses */ }
      },
      (err) => setGeo({ status: err.code === 1 ? "denied" : "error", message: err.message }),
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 300000 },
    );
  }
  useEffect(() => { locateMe(); }, []);

  async function onAsk(query, audioBlob, fresh = false) {
    if (running) return;
    const k = fresh ? {} : known, a = fresh ? null : asked, h = fresh ? [] : chat;
    if (fresh) resetChat();
    setRunning(true);
    setError("");
    setSteps([]);
    setView("ask"); // the whole query stays on one conversation screen
    // show the farmer's turn immediately (voice transcript replaces the placeholder when it arrives)
    setChat([...h, { role: "farmer", text: query || "🎙️ …", voice: !!audioBlob }]);
    try {
      await askAgent(
        { query: query || "", location: profile.coords ? "" : profile.location, lat: profile.coords?.lat, lon: profile.coords?.lon,
          history: JSON.stringify(h), known: JSON.stringify(k), asked: a || "", place_label: profile.location || "", lang, speak: profile.speak },
        audioBlob,
        (ev) => {
          if (ev.type === "step") setSteps((s) => [...s, ev.step]);
          if (ev.type === "result") {
            const r = ev.result;
            const said = query || r.plan?.transcript || "🎙️";
            const isQuestion = r.status === "need_info";
            const isChat = r.status === "chat";
            setChat([...h, { role: "farmer", text: said, voice: !!audioBlob },
              { role: "agent", text: r.advisory?.summary || "", kind: isQuestion ? "question" : isChat ? "chat" : "answer",
                tts: r.tts || null, ttsMime: r.tts_mime || "audio/wav",
                result: isQuestion || isChat ? null : r }]);
            setKnown(r.slots || {});
            setAsked(r.asked || null);
            if (isQuestion) {
              setPending(r);
            } else if (isChat) {
              setPending(null);
            } else {
              setPending(null);
              setResult(r);
            }
          }
          if (ev.type === "error") setError(`Agent error: ${ev.error}`);
        },
      );
    } catch (e) {
      setError(`Could not reach the KisanSaathi server: ${e.message}`);
    }
    setRunning(false);
  }

  return (
    <div className="relative min-h-screen text-slate-100">
      <div className="pointer-events-none fixed inset-0 z-0 overflow-hidden bg-[#050b08]" aria-hidden="true">
        <div key={view} className="farm-background-enter absolute inset-0 bg-cover bg-center" style={{ backgroundImage: `url('${PAGE_BACKGROUNDS[view] || PAGE_BACKGROUNDS.home}')` }} />
        <div className="absolute inset-0 bg-[#06110c]/60" />
        <div className="absolute inset-0 bg-gradient-to-b from-[#06110c]/50 via-[#06110c]/65 to-[#040605]/90" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_rgba(13,34,26,.24),_transparent_65%)]" />
      </div>
      <div className="relative z-10">
      <Header view={view} setView={setView} health={health} lang={lang} setLang={setLang} hasResult={!!result} running={running} />
      {view === "home" ? (
        <main className="mx-auto max-w-[1600px] px-3 py-5 md:px-6">
          <Home profile={profile} setProfile={setProfile} geo={geo} onLocate={locateMe} health={health} lang={lang}
            onAskQuestion={(q) => { setView("ask"); if (q) onAsk(q, null, true); }} />
        </main>
      ) : (
      <main className="mx-auto grid max-w-[1440px] gap-6 px-4 py-6 md:px-8 lg:grid-cols-[320px_1fr]">
        <Sidebar profile={profile} setProfile={setProfile} place={result?.place} geo={geo} onLocate={locateMe} known={known} onReset={resetChat} running={running} lang={lang} />
        <div className="order-1 min-w-0 lg:order-2">
          {view === "ask" && <AskView onAsk={onAsk} running={running} result={result} chat={chat} pending={pending} steps={steps} error={error} lang={lang}
            onReset={resetChat} onOpenDashboard={() => setView("dashboard")} onOpenTrace={() => setView("trace")} />}
          {view === "farmconnect" && <FarmConnect lang={lang} />}
          {view === "trace" && (steps.length || running || error
            ? <TraceView steps={steps} running={running} result={running ? null : result} error={error} lang={result?.plan?.language || lang} onOpenDashboard={() => setView("dashboard")} />
            : <EmptyState what="agent trace" hi="एजेंट ट्रेस" onAsk={() => setView("ask")} lang={lang} />)}
          {view === "dashboard" && (result
            ? <Dashboard result={result} steps={result.trace || steps} lang={lang} onOpenTrace={() => setView("trace")} />
            : <EmptyState what="advisory dashboard" hi="सलाह डैशबोर्ड" onAsk={() => setView("ask")} lang={lang} />)}
        </div>
      </main>
      )}
      <footer className="mt-8 border-t border-emerald-950/40 bg-[#09120e]/60 px-4 py-4 text-center font-mono text-[11px] text-slate-500 backdrop-blur-md md:px-8">
        KisanSaathi · Agmarknet mandi prices · Open-Meteo weather and soil estimates · Gnani voice AI
      </footer>
      </div>
    </div>
  );
}
