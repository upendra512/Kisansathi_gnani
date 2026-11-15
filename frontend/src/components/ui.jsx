import React from "react";
import { CheckCircle2, AlertTriangle, XCircle, RefreshCw } from "lucide-react";

export const NODE_META = {
  planner: { en: "Planner (Gemini)", hi: "योजना", kn: "ಯೋಜನೆ", tag: "INTENT_PARSE" },
  converse: { en: "Conversation (Gemini)", hi: "बातचीत", kn: "ಸಂಭಾಷಣೆ", tag: "CHAT" },
  check_slots: { en: "Check what's known", hi: "जानकारी जाँच", kn: "ತಿಳಿದಿರುವುದನ್ನು ಪರಿಶೀಲಿಸಿ", tag: "SLOT_CHECK" },
  ask_farmer: { en: "Ask the farmer", hi: "किसान से प्रश्न", kn: "ರೈತರನ್ನು ಕೇಳಿ", tag: "CLARIFY" },
  locate: { en: "Geocode farmer", hi: "स्थान", kn: "ಸ್ಥಳ", tag: "GEO_RESOLVE" },
  fetch_parallel: { en: "Parallel fetch", hi: "समानांतर डेटा", kn: "ಒಟ್ಟಿಗೆ ಮಾಹಿತಿ ಪಡೆಯಿರಿ", tag: "ASYNC_JOIN" },
  fetch_weather: { en: "Weather + soil feed", hi: "मौसम व मिट्टी", kn: "ಹವಾಮಾನ ಮತ್ತು ಮಣ್ಣು", tag: "OPEN_METEO" },
  fetch_mandi: { en: "Mandi price feed", hi: "मंडी भाव", kn: "ಮಾರುಕಟ್ಟೆ ಬೆಲೆ", tag: "AGMARKNET" },
  verify_commodity: { en: "Verify commodity", hi: "फसल मिलान", kn: "ಬೆಳೆ ಪರಿಶೀಲನೆ", tag: "FUZZY_MATCH" },
  self_correct: { en: "Self-correction", hi: "स्व-सुधार", kn: "ಸ್ವಯಂ ತಿದ್ದುಪಡಿ", tag: "AUTONOMOUS_FALLBACK" },
  geocode_mandis: { en: "Geocode mandis", hi: "मंडी स्थान", kn: "ಮಾರುಕಟ್ಟೆ ಸ್ಥಳ", tag: "GEO_PARALLEL" },
  rank_markets: { en: "Rank by net price", hi: "शुद्ध भाव", kn: "ನಿವ್ವಳ ಬೆಲೆ ಪ್ರಕಾರ", tag: "NET_PRICE" },
  engine: { en: "Deterministic engine", hi: "गणना इंजन", kn: "ಲೆಕ್ಕಾಚಾರದ ಎಂಜಿನ್", tag: "VPD · ET₀ · ₹" },
  synthesize: { en: "Synthesizer (Gemini)", hi: "सलाह लेखन", kn: "ಸಲಹೆ ರಚನೆ", tag: "PLACEHOLDER_GEN" },
  guardrail: { en: "Guardrail verifier", hi: "सत्यापन", kn: "ಪರಿಶೀಲನೆ", tag: "ZERO_HALLUCINATION" },
};

export function graphNodeFor(step) {
  if (step.node.startsWith("fetch_")) return "fetch_data";
  if (step.node === "verify_commodity") return "resolve_commodity";
  if (step.node === "self_correct") return step.detail.includes("neighbouring") ? "expand_states" : "widen_radius";
  return step.node;
}

export function StatusIcon({ status, selfCorrect, size = 18 }) {
  if (selfCorrect) return <RefreshCw size={size} className="text-amber-600" />;
  if (status === "fail") return <XCircle size={size} className="text-rose-400" />;
  if (status === "warn") return <AlertTriangle size={size} className="text-amber-500" />;
  return <CheckCircle2 size={size} className="text-emerald-400" />;
}

export function Pill({ children, tone = "green", className = "" }) {
  const tones = {
    green: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
    amber: "bg-amber-500/10 text-amber-400 border-amber-500/30",
    red: "bg-rose-500/10 text-rose-400 border-rose-500/30",
    slate: "bg-emerald-500/5 text-slate-300 border-emerald-500/15",
    dark: "bg-cyan-500/10 text-cyan-400 border-cyan-500/20 font-mono",
  };
  return (
    <span className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-medium ${tones[tone]} ${className}`}>
      {children}
    </span>
  );
}

export function SectionTitle({ icon: Icon, en, hi, right, lang }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <div className="flex items-center gap-2.5">
        {Icon && (
          <span className="grid h-9 w-9 place-items-center rounded-xl bg-forest-50 text-emerald-400">
            <Icon size={18} />
          </span>
        )}
        <div>
          <div className={`font-semibold text-slate-100 leading-tight ${lang === "kn" ? "kn" : ""}`}>{en}</div>
          {hi && <div className={`${lang === "kn" ? "kn" : "hi"} text-xs text-slate-400`}>{hi}</div>}
        </div>
      </div>
      {right}
    </div>
  );
}

export const fmtTime = (ts) => {
  if (!ts) return "—";
  const d = new Date(ts);
  return d.toLocaleString("en-IN", { weekday: "short", hour: "2-digit", minute: "2-digit", hour12: false });
};

export const inr = (n) => (n === null || n === undefined || n === "—" ? "—" : `₹${Number(n).toLocaleString("en-IN")}`);
