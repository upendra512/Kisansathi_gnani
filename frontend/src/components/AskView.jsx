import React, { useEffect, useRef, useState } from "react";
import { Mic, Square, ArrowRight, MessageCircleQuestion, CloudSun, Droplets, IndianRupee, Loader2, Send, RotateCcw,
  LayoutDashboard, Network, Volume2, Headphones, Bot, X } from "lucide-react";
import { startRecording } from "../recorder.js";
import { Pill, inr, NODE_META, graphNodeFor } from "./ui.jsx";
import { t } from "../i18n.js";

const EXAMPLES = [
  ["🍅", "कल टमाटर पर दवा छिड़कूं? और कहाँ बेचूं?", "Spray + sell tomato"],
  ["🌾", "क्या आज गेहूं में सिंचाई करनी चाहिए?", "Irrigate wheat?"],
  ["🌱", "Where should I sell my paddy for the best price?", "Best paddy mandi"],
  ["🌿", "ನಾಳೆ ಟೊಮೇಟೊಗೆ ಔಷಧಿ ಸಿಂಪಡಿಸಬಹುದೇ? ಮತ್ತು ಎಲ್ಲಿ ಮಾರಾಟ ಮಾಡಲಿ?", "Kannada · tomato"],
];
const EXAMPLES_KN = [
  ["🌿", "ನಾಳೆ ಟೊಮೇಟೊಗೆ ಔಷಧಿ ಸಿಂಪಡಿಸಬಹುದೇ?", "ಸಿಂಪಡಣೆ"],
  ["💧", "ಗೋಧಿ ಬೆಳೆಗೆ ಈಗ ನೀರಾವರಿ ಬೇಕೇ?", "ನೀರಾವರಿ"],
  ["🌱", "ಭತ್ತವನ್ನು ಹತ್ತಿರದಲ್ಲಿ ಎಲ್ಲಿ ಮಾರಾಟ ಮಾಡಲಿ?", "ಮಾರುಕಟ್ಟೆ ಬೆಲೆ"],
];

// Keep a turn open through normal pauses; the farmer explicitly taps stop to send.
const MAX_MS = 60000;

export default function AskView({ onAsk, running, result, chat = [], pending = null, steps = [], error = "", lang = "auto",
  onReset, onOpenDashboard, onOpenTrace }) {
  const [text, setText] = useState("");
  const [rec, setRec] = useState(null);
  const [secs, setSecs] = useState(0);
  const [level, setLevel] = useState(0);
  const [micError, setMicError] = useState("");
  const [speaking, setSpeaking] = useState(false);
  const [handsFree, setHandsFree] = useState(false);
  const timer = useRef();
  const recRef = useRef(null);
  const startingRef = useRef(false);
  const sendingRef = useRef(false);
  const autoStartTimer = useRef();
  const mountedRef = useRef(true);
  const threadEnd = useRef(null);
  const voiceMode = chat.length > 0 && [...chat].reverse().find((m) => m.role === "farmer")?.voice;

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      clearInterval(timer.current);
      clearTimeout(autoStartTimer.current);
      const active = recRef.current;
      recRef.current = null;
      if (active) active.stop().catch(() => {});
    };
  }, []);
  useEffect(() => { threadEnd.current?.scrollIntoView({ behavior: "smooth", block: "nearest" }); }, [chat.length, running, steps.length]);

  async function stopAndSend() {
    const r = recRef.current;
    if (!r || sendingRef.current) return;
    sendingRef.current = true;
    clearInterval(timer.current);
    recRef.current = null;
    setRec(null);
    setLevel(0);
    try {
      const blob = await r.stop();
      if (blob.size <= 44) {
        setMicError("I didn't hear anything. Tap the mic and try again, or type your answer.");
      } else {
        onAsk(text, blob);
        setText("");
      }
    } catch (e) {
      setMicError(`Could not finish the recording: ${e.message || "please try again"}`);
    } finally {
      sendingRef.current = false;
    }
  }

  async function switchToTyping() {
    const r = recRef.current;
    if (!r) return;
    clearInterval(timer.current);
    recRef.current = null;
    setRec(null);
    setLevel(0);
    try { await r.stop(); } catch { /* keep the text composer usable */ }
  }

  async function cancelRecording() {
    const r = recRef.current;
    if (!r) return;
    clearInterval(timer.current);
    recRef.current = null;
    setRec(null);
    setLevel(0);
    try { await r.stop(); } catch { /* microphone cleanup is best effort */ }
    setMicError("");
  }

  async function startMic() {
    if (startingRef.current || sendingRef.current || recRef.current || running) return;
    startingRef.current = true;
    setMicError("");
    try {
      const r = await startRecording();
      if (!mountedRef.current) { startingRef.current = false; await r.stop(); return; }
      recRef.current = r;
      startingRef.current = false;
      setRec(r);
      setSecs(0);
      const started = Date.now();
      timer.current = setInterval(() => {
        const lv = r.level();
        setSecs((s) => s + 0.1);
        setLevel(lv);
        if (Date.now() - started > MAX_MS) stopAndSend();
      }, 100);
    } catch (e) {
      startingRef.current = false;
      const permissionError = e?.name === "NotAllowedError" || e?.name === "PermissionDeniedError";
      const deviceError = e?.name === "NotFoundError" || e?.name === "DevicesNotFoundError";
      setMicError(permissionError
        ? "Microphone permission was blocked. Allow microphone access in your browser, or type your answer."
        : deviceError
          ? "No microphone was found. Connect a microphone, or type your answer."
          : `Microphone could not start: ${e?.message || e?.name || "unknown error"}. You can type your answer.`);
    }
  }

  function toggleMic() {
    if (running) return;
    if (recRef.current) stopAndSend();
    else startMic();
  }

  // After the agent finishes speaking a follow-up question, listen again automatically (hands-free voice turn).
  function onAgentAudioEnd(msg) {
    setSpeaking(false);
    if (handsFree && voiceMode && msg.kind !== "answer") {
      clearTimeout(autoStartTimer.current);
      autoStartTimer.current = setTimeout(() => startMic(), 350);
    }
  }
  // No voice reply (speech off)? still reopen the mic for voice users after a question.
  const last = chat[chat.length - 1];
  useEffect(() => {
    if (!running && last?.role === "agent" && last.kind !== "answer" && !last.tts && handsFree && voiceMode && !recRef.current) {
      const t = setTimeout(startMic, 500);
      return () => clearTimeout(t);
    }
  }, [running, chat.length, handsFree]); // eslint-disable-line react-hooks/exhaustive-deps

  function submitText(e) {
    e.preventDefault();
    if (running || !text.trim()) return;
    onAsk(text, null);
    setText("");
  }

  const state = rec ? "listening" : running ? "thinking" : speaking ? "speaking" : pending ? "your-turn" : "idle";
  const STATE_LABEL_EN = {
    listening: ["Listening…", "सुन रहा हूँ…", "text-[#f43f5e]"],
    thinking: ["Thinking — fetching live data", "सोच रहा हूँ…", "text-cyan-400"],
    speaking: ["Speaking", "बोल रहा हूँ", "text-emerald-400"],
    "your-turn": ["Your turn — answer by voice or text", "आपकी बारी — बोलकर या लिखकर जवाब दें", "text-[#f59e0b]"],
    idle: ["Ready", "तैयार", "text-slate-400"],
  }[state];
  const STATE_LABEL_KN = {
    listening: ["ಕೇಳುತ್ತಿದ್ದೇನೆ…", "ಕೇಳುತ್ತಿದ್ದೇನೆ…", "text-[#f43f5e]"],
    thinking: ["ಲೈವ್ ಮಾಹಿತಿ ಪರಿಶೀಲಿಸಲಾಗುತ್ತಿದೆ", "ಯೋಚಿಸುತ್ತಿದ್ದೇನೆ…", "text-cyan-400"],
    speaking: ["ಮಾತನಾಡುತ್ತಿದ್ದೇನೆ", "ಮಾತನಾಡುತ್ತಿದ್ದೇನೆ", "text-emerald-400"],
    "your-turn": ["ಈಗ ನಿಮ್ಮ ಸರದಿ — ಮಾತನಾಡಿ ಅಥವಾ ಬರೆಯಿರಿ", "ನಿಮ್ಮ ಸರದಿ", "text-[#f59e0b]"],
    idle: ["ಸಿದ್ಧ", "ಸಿದ್ಧ", "text-slate-400"],
  }[state];
  const STATE_LABEL = lang === "kn" ? STATE_LABEL_KN : STATE_LABEL_EN;
  const examples = lang === "kn" ? EXAMPLES_KN : EXAMPLES;
  const lastStep = steps[steps.length - 1];

  const cur = result?.current;
  const irr = result?.analysis?.irrigation;
  const best = result?.analysis?.market?.best;
  const gain = result?.analysis?.market?.extra_gain_per_qtl;

  const MicButton = ({ big = false }) => (
    <button
      type="button"
      onClick={toggleMic}
      disabled={running}
      title={rec ? "Stop & send" : "Speak"}
      className={`relative grid shrink-0 place-items-center rounded-full text-white transition-all duration-200 ease-in-out ${
        big ? "h-32 w-32" : "h-12 w-12"} ${rec ? "mic-rec bg-[#f43f5e]" : "mic-ring bg-emerald-500 text-slate-950 hover:bg-emerald-400"} disabled:opacity-40`}
      style={rec ? { transform: `scale(${1 + level * 0.15})` } : undefined}
    >
      {big ? (
        <span className="flex flex-col items-center gap-1">
          {rec ? <Square size={30} fill="white" /> : running ? <Loader2 size={34} className="animate-spin" /> : <Mic size={36} />}
          <span className={`text-[11px] font-semibold tracking-wider ${lang === "kn" ? "kn" : ""}`}>{rec ? `${secs.toFixed(1)}s · ${lang === "kn" ? "ನಿಲ್ಲಿಸಿ" : "STOP"}` : running ? (lang === "kn" ? "ಯೋಚಿಸುತ್ತಿದೆ" : "THINKING") : lang === "kn" ? t(lang, "tap_to_speak") : "TAP TO SPEAK"}</span>
        </span>
      ) : rec ? <Square size={18} fill="white" /> : running ? <Loader2 size={20} className="animate-spin" /> : <Mic size={22} />}
    </button>
  );

  return (
    <div className="space-y-6">
      {chat.length === 0 ? (
        /* ---------------- first turn: hero ---------------- */
        <section className="card relative overflow-hidden px-6 py-10 text-center md:px-12">
          <div className="pointer-events-none absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-emerald-500/5 to-transparent" />
          <Pill tone="slate" className={`relative ${lang === "kn" ? "kn" : ""}`}>🎙️ {lang === "kn" ? "Gnani Prisma ಧ್ವನಿ · Timbre ಉತ್ತರಗಳು · ಕನ್ನಡ" : "Gnani Prisma voice input · Timbre voice replies · हिंदी / English"}</Pill>
          <div className="relative mx-auto mt-8 grid place-items-center"><MicButton big /></div>
          <h1 className="relative mt-6 text-3xl font-extrabold text-slate-100 md:text-4xl">
            {lang === "kn" ? <span className="kn">ಮಾತನಾಡಿ ಕೇಳಿ</span> : <><span className="hi">बोलकर पूछें</span> <span className="font-light text-slate-500">/ Tap to speak</span></>}
          </h1>
          <p className={`${lang === "kn" ? "kn" : "hi"} relative mx-auto mt-2 max-w-2xl text-slate-400`}>
            {lang === "kn" ? "ಸಿಂಪಡಣೆಗೆ ಸೂಕ್ತ ಸಮಯ, ನೀರಾವರಿ ಮತ್ತು ಹತ್ತಿರದ ಮಾರುಕಟ್ಟೆ ಬೆಲೆಗಳು — ಲೈವ್ ಮಾಹಿತಿಯಿಂದ" : "छिड़काव का सही समय, सिंचाई, और नज़दीकी मंडियों का शुद्ध भाव — सब लाइव डेटा से"}
          </p>
          {micError && <p className="relative mt-2 text-sm text-rose-400">{micError}</p>}
            <form onSubmit={submitText}
            className="relative mx-auto mt-8 flex max-w-3xl flex-col gap-2 rounded-2xl border border-emerald-500/20 bg-[#0f201b]/60 p-2 shadow-card sm:flex-row">
            <div className="flex flex-1 items-center gap-2 px-3">
              <MessageCircleQuestion size={20} className="text-emerald-400" />
              <input value={text} onChange={(e) => setText(e.target.value)} placeholder={lang === "kn" ? t(lang, "spray_example") : "कल टमाटर पर दवा छिड़कूं? और कहाँ बेचूं?"}
                className={`${lang === "kn" ? "kn" : "hi"} w-full bg-transparent py-3 text-lg outline-none`} />
            </div>
            <button disabled={running}
              className="flex items-center justify-center gap-2 rounded-xl bg-emerald-500 px-6 py-3 font-semibold text-slate-950 transition-all duration-200 ease-in-out hover:bg-emerald-400 disabled:opacity-60">
              {lang === "kn" ? "ಕಿಸಾನ್‌ಸಾಥಿಯನ್ನು ಕೇಳಿ" : <>Ask KisanSaathi <span className="hi">(पूछें)</span></>} <ArrowRight size={18} />
            </button>
          </form>
          <div className="relative mt-5 flex flex-wrap items-center justify-center gap-2">
            <span className={`label mr-1 ${lang === "kn" ? "kn" : ""}`}>{lang === "kn" ? "ಉದಾಹರಣೆಗಳು:" : "Try:"}</span>
            {examples.map(([e, q, en]) => (
              <button key={q} disabled={running} onClick={() => { setText(""); onAsk(q, null, true); }}
                className={`${lang === "kn" ? "kn" : "hi"} rounded-full border border-emerald-500/15 bg-[#0f201b]/60 px-3 py-1.5 text-sm text-slate-200 transition-all duration-200 ease-in-out hover:border-emerald-400`}>
                {e} {q} <span className="text-emerald-400">({en})</span>
              </button>
            ))}
          </div>
        </section>
      ) : (
        /* ---------------- ongoing voice conversation (one screen for the whole query) ---------------- */
        <section className="card mesh relative flex min-h-[560px] flex-col overflow-hidden">
          {/* status bar with live orb */}
          <div className="flex items-center gap-3 border-b border-emerald-500/10 bg-[#09120e]/60 px-5 py-3">
            <span className="relative grid h-9 w-9 place-items-center">
              <span className={`absolute inset-0 rounded-full ${state === "listening" ? "animate-ping bg-[#f43f5e]/40" : state === "thinking" ? "animate-pulse bg-cyan-400/30" : state === "speaking" ? "animate-ping bg-emerald-400/30" : state === "your-turn" ? "animate-pulse bg-[#f59e0b]/30" : ""}`} />
              <span className="relative grid h-9 w-9 place-items-center rounded-full border border-emerald-500/30 bg-[#0a1310] text-emerald-400"><Bot size={18} /></span>
            </span>
            <div className="min-w-0 flex-1">
              <div className={`text-sm font-semibold ${STATE_LABEL[2]} ${lang === "kn" ? "kn" : ""}`}>{STATE_LABEL[0]} <span className={`${lang === "kn" ? "kn" : "hi"} font-normal text-slate-500`}>· {STATE_LABEL[1]}</span></div>
              <div className="truncate font-mono text-[11px] text-slate-500">
                {running && lastStep ? `${(NODE_META[lastStep.node] || {}).en || lastStep.node} — ${lastStep.detail}` : `KisanSaathi voice agent · ${chat.filter((m) => m.role === "farmer").length} turn(s)`}
              </div>
            </div>
            <label className="hidden cursor-pointer items-center gap-1.5 text-xs text-slate-400 sm:flex" title={lang === "kn" ? "ಮುಂದಿನ ಪ್ರಶ್ನೆಯ ನಂತರ ಮೈಕ್ ಸ್ವಯಂಚಾಲಿತವಾಗಿ ತೆರೆಯುತ್ತದೆ." : "Automatically opens the mic after an agent reply; tap the mic to send your answer"}>
              <Headphones size={14} /> {lang === "kn" ? "ಹ್ಯಾಂಡ್ಸ್-ಫ್ರೀ" : "Auto-listen"}
              <input type="checkbox" checked={handsFree} onChange={(e) => setHandsFree(e.target.checked)} className="h-4 w-4 accent-emerald-500" />
            </label>
            <button onClick={onReset} disabled={running}
              className="flex items-center gap-1 rounded-full border border-emerald-500/20 px-3 py-1.5 text-xs text-slate-300 transition-all duration-200 ease-in-out hover:bg-emerald-500/10 disabled:opacity-40">
              <RotateCcw size={12} /> {t(lang, "new_chat")}
            </button>
          </div>

          {/* thread */}
          <div className="flex-1 space-y-3 overflow-y-auto px-4 py-5 md:px-6" style={{ maxHeight: "62vh" }}>
            {chat.map((m, i) => {
              const isLast = i === chat.length - 1;
              if (m.role === "farmer") {
                return (
                  <div key={i} className="fade-up flex justify-end">
                    <div className={`${lang === "kn" ? "kn" : "hi"} max-w-[80%] rounded-2xl rounded-br-md bg-emerald-500 px-4 py-2.5 text-[15px] text-slate-950 shadow-glow`}>
                      {m.voice && <Mic size={13} className="mr-1.5 inline -translate-y-px" />}{m.text}
                    </div>
                  </div>
                );
              }
              const r = m.result;
              return (
                <div key={i} className="fade-up flex justify-start gap-2">
                  <span className="mt-1 grid h-7 w-7 shrink-0 place-items-center rounded-full border border-emerald-500/30 bg-[#0a1310] text-emerald-400"><Bot size={14} /></span>
                  <div className={`max-w-[85%] rounded-2xl rounded-bl-md border px-4 py-3 ${m.kind === "question" ? "border-[#f59e0b]/30 bg-[#f59e0b]/10" : "border-emerald-500/20 bg-[#0a1310]/80"}`}>
                    {m.kind === "question" && <div className="mb-1 font-mono text-[10px] uppercase tracking-wider text-[#f59e0b]">Follow-up question</div>}
                    <div className={`${lang === "kn" ? "kn" : "hi"} text-[15px] leading-relaxed text-slate-100`}>{m.text}</div>
                    {r && (
                      <div className="mt-3 grid grid-cols-3 gap-2">
                        {[
                          ["Spray", r.facts?.spray_window || "—", "text-emerald-400"],
                          ["Root moisture", r.analysis?.irrigation?.root_zone_moisture_pct != null ? `${r.analysis.irrigation.root_zone_moisture_pct}%` : "—", "text-cyan-400"],
                          ["Best mandi", r.analysis?.market?.best ? `${inr(r.analysis.market.best.net_price ?? r.analysis.market.best.modal_price)}` : "—", "text-emerald-400"],
                        ].map(([k, v, c]) => (
                          <div key={k} className="glass-inset px-2.5 py-2">
                            <div className="text-[10px] uppercase tracking-wider text-slate-500">{k}</div>
                            <div className={`truncate font-mono text-sm ${c}`}>{v}</div>
                          </div>
                        ))}
                      </div>
                    )}
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      {m.tts && (
                        <audio
                          key={`a-${i}`}
                          src={`data:${m.ttsMime || "audio/wav"};base64,${m.tts}`}
                          autoPlay={isLast}
                          controls
                          onPlay={() => setSpeaking(true)}
                          onEnded={() => onAgentAudioEnd(m)}
                          onPause={() => setSpeaking(false)}
                          className="h-8 max-w-[240px]"
                        />
                      )}
                      {r && (
                        <>
                          <button onClick={onOpenDashboard} className="flex items-center gap-1 rounded-full bg-emerald-500 px-3 py-1.5 text-xs font-semibold text-slate-950 transition-all duration-200 ease-in-out hover:bg-emerald-400">
                            <LayoutDashboard size={13} /> {lang === "kn" ? <span className="kn">ಪೂರ್ಣ ಡ್ಯಾಶ್‌ಬೋರ್ಡ್</span> : "Full dashboard"}
                          </button>
                          <button onClick={onOpenTrace} className="flex items-center gap-1 rounded-full border border-emerald-500/30 px-3 py-1.5 text-xs text-emerald-300 transition-all duration-200 ease-in-out hover:bg-emerald-500/10">
                            <Network size={13} /> {lang === "kn" ? <span className="kn">ಏಜೆಂಟ್ ಟ್ರೇಸ್</span> : "Agent trace"}
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
            {running && (
              <div className="flex justify-start gap-2">
                <span className="mt-1 grid h-7 w-7 shrink-0 place-items-center rounded-full border border-cyan-400/30 bg-[#0a1310] text-cyan-400"><Loader2 size={14} className="animate-spin" /></span>
                <div className="max-w-[85%] rounded-2xl rounded-bl-md border border-cyan-400/20 bg-cyan-400/5 px-4 py-3">
                  <div className="flex gap-1">
                    {[0, 1, 2].map((d) => <span key={d} className="h-2 w-2 animate-bounce rounded-full bg-cyan-400" style={{ animationDelay: `${d * 120}ms` }} />)}
                  </div>
                  <div className="mt-2 space-y-0.5 font-mono text-[11px] text-slate-400">
                    {steps.slice(-4).map((st, i) => (
                      <div key={i} className="truncate"><span className={st.status === "fail" ? "text-[#f43f5e]" : st.status === "warn" ? "text-[#f59e0b]" : "text-emerald-400"}>●</span> {(NODE_META[st.node] || {}).en || st.node}</div>
                    ))}
                  </div>
                </div>
              </div>
            )}
            {error && <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-2 text-sm text-rose-400">{error}</div>}
            <div ref={threadEnd} />
          </div>

          {/* composer: voice + text, always available */}
          <form onSubmit={submitText} className="flex items-center gap-3 border-t border-emerald-500/10 bg-[#09120e]/70 px-4 py-3">
            <MicButton />
            {rec ? (
              <div className="flex flex-1 items-center gap-3">
                <div className="flex h-8 flex-1 items-center gap-0.5 overflow-hidden">
                  {Array.from({ length: 40 }).map((_, i) => (
                    <span key={i} className="w-1 rounded-full bg-[#f43f5e] transition-all duration-100"
                      style={{ height: `${Math.max(8, Math.min(100, level * 100 * (0.5 + Math.abs(Math.sin(i * 1.7 + secs * 6)))))}%` }} />
                  ))}
                </div>
                <span className="font-mono text-xs text-[#f43f5e]">{secs.toFixed(1)}s</span>
                <button type="button" onClick={cancelRecording} className="flex shrink-0 items-center gap-1 rounded-lg border border-rose-400/30 px-2 py-1 text-xs text-rose-300 hover:bg-rose-500/10"><X size={13} /> Cancel</button>
                <span className={`hidden text-xs text-slate-500 md:inline ${lang === "kn" ? "kn" : ""}`}>{lang === "kn" ? "ಮಾತು ನಿಲ್ಲಿಸಿದಾಗ ರೆಕಾರ್ಡಿಂಗ್ ನಿಲ್ಲುತ್ತದೆ · ಕಳುಹಿಸಲು ■ ಒತ್ತಿ" : "stops when you pause · tap ■ to send"}</span>
              </div>
            ) : (
              <>
                <input value={text} onChange={(e) => setText(e.target.value)} disabled={running}
                  placeholder={lang === "kn" ? (pending ? t(lang, "answer_prompt") : t(lang, "follow_up")) : pending ? "बोलकर या लिखकर जवाब दें… / Speak or type your answer…" : "Ask a follow-up… / और पूछें…"}
                  className={`${lang === "kn" ? "kn" : "hi"} min-w-0 flex-1 rounded-xl border border-emerald-500/15 bg-[#0a1310]/80 px-4 py-3 text-[15px] outline-none transition-all duration-200 ease-in-out focus:border-emerald-400`} />
                <button disabled={running || !text.trim()}
                  className="grid h-12 w-12 shrink-0 place-items-center rounded-full border border-emerald-500/30 bg-emerald-500/10 text-emerald-300 transition-all duration-200 ease-in-out hover:bg-emerald-500 hover:text-slate-950 disabled:opacity-40">
                  <Send size={18} />
                </button>
              </>
            )}
          </form>
          {micError && <p className="px-5 pb-3 text-sm text-rose-400">{micError}</p>}
        </section>
      )}

      <section className="grid gap-4 md:grid-cols-3">
        <div className="card p-5">
          <div className="flex items-center justify-between">
            <span className="label flex items-center gap-1.5"><CloudSun size={14} /> Live weather / <span className="hi">मौसम</span></span>
            <Pill tone="slate">Open-Meteo</Pill>
          </div>
          {cur ? (
            <>
              <div className="mt-3 text-4xl font-bold">{cur.temperature_2m == null ? "—" : `${Math.round(cur.temperature_2m)}°C`}</div>
              <div className="mt-3 grid grid-cols-2 gap-2 border-t border-emerald-500/10 pt-3 text-sm">
                <div><div className="text-xs text-slate-400">Humidity</div><b>{cur.relative_humidity_2m == null ? "—" : `${Math.round(cur.relative_humidity_2m)}%`}</b></div>
                <div><div className="text-xs text-slate-400">Wind</div><b>{cur.wind_speed_10m == null ? "—" : `${Math.round(cur.wind_speed_10m)} km/h`}</b></div>
              </div>
            </>
          ) : <Empty />}
        </div>
        <div className="card p-5">
          <div className="flex items-center justify-between">
            <span className="label flex items-center gap-1.5"><Droplets size={14} /> Soil moisture / <span className="hi">नमी</span></span>
            {irr && <Pill tone={irr.code === "irrigate_now" ? "amber" : "green"}>{irr.code.replace("_", " ")}</Pill>}
          </div>
          {irr ? (
            <>
              <div className="mt-3 text-4xl font-bold">{irr.root_zone_moisture_pct ?? "—"}%<span className="ml-2 text-sm font-normal text-slate-400">root zone</span></div>
              <div className="mt-3 border-t border-emerald-500/10 pt-3 text-sm text-slate-200">{irr.decision}</div>
            </>
          ) : <Empty />}
        </div>
        <div className="card p-5">
          <div className="flex items-center justify-between">
            <span className="label flex items-center gap-1.5"><IndianRupee size={14} /> Best net mandi / <span className="hi">मंडी</span></span>
            <Pill tone="slate">Agmarknet</Pill>
          </div>
          {best ? (
            <>
              <div className="mt-3 text-4xl font-bold">{inr(best.net_price ?? best.modal_price)}<span className="ml-1 text-sm font-normal text-slate-400">/qtl net</span></div>
              <div className="mt-3 border-t border-emerald-500/10 pt-3 text-sm">
                <b>{best.market}</b> · {best.distance_km ?? "—"} km
                {gain ? <span className="ml-2 text-emerald-400">+{inr(gain)} vs nearest</span> : null}
              </div>
            </>
          ) : <Empty />}
        </div>
      </section>
    </div>
  );
}

function Empty() {
  return <div className="mt-4 text-sm text-slate-500">Ask a question to load live data for your farm.</div>;
}
