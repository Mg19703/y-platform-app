import React, { useState, useEffect, useRef } from 'react';
import { Mic, Play, Pause, Send, Shield, CheckCircle, RefreshCcw, Info, User, BarChart2, Clock, Heart, Loader2, Users, Sparkles, HelpCircle, MessageSquare, BookOpen, MessageCircle, AlertTriangle } from 'lucide-react';
import { SpeechRecognition } from '@capacitor-community/speech-recognition';

/**
 * Custom hook to manage speech recognition using Capacitor plugin
 */
function useSpeechRecognition(onResult) {
    const [isListening, setIsListening] = useState(false);
    const resultCallbackRef = useRef(onResult);

    useEffect(() => {
        resultCallbackRef.current = onResult;
    }, [onResult]);

    const start = async () => {
        try {
            // Request permissions
            const permission = await SpeechRecognition.requestPermissions();
            if (permission.speechRecognition !== 'granted') {
                console.error('Speech recognition permission denied');
                return;
            }

            // Check if available
            const available = await SpeechRecognition.available();
            if (!available.available) {
                console.error('Speech recognition not available');
                return;
            }

            setIsListening(true);

            // Start listening
            await SpeechRecognition.start({
                language: 'en-US',
                maxResults: 1,
                prompt: 'Speak now...',
                partialResults: true,
                popup: false,
            });

            // Listen for results
            SpeechRecognition.addListener('partialResults', (data) => {
                if (data.matches && data.matches.length > 0) {
                    resultCallbackRef.current(data.matches[0]);
                }
            });

        } catch (error) {
            console.error('Speech recognition error:', error);
            setIsListening(false);
        }
    };

    const stop = async () => {
        try {
            await SpeechRecognition.stop();
            setIsListening(false);
        } catch (error) {
            console.error('Error stopping speech recognition:', error);
        }
    };

    useEffect(() => {
        return () => {
            SpeechRecognition.removeAllListeners();
        };
    }, []);

    return { start, stop, isListening };
}


// --- API CONFIGURATION ---
const apiKey = "AIzaSyA-jcq2_RnnOb5dUM7jnjrRUZqxf9TW85s"; // Injected by environment

async function callGemini(prompt) {
  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-09-2025:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }]
        })
      }
    );
    const data = await response.json();
    return data.candidates?.[0]?.content?.parts?.[0]?.text || "";
  } catch (error) {
    console.error("AI Error:", error);
    return null;
  }
}

// --- DATA ---

const TOPICS = [
  "Immigration Policy",
  "Climate Change",
  "Healthcare Access",
  "Economic Fairness"
];

const PHASES = [
  {
    id: 1,
    title: "Curiosity Ignition",
    goal: "Surface initial views and motivations without debate",
    staticPrompt: (t) => `To get us started, could you share a personal story? When did "${t}" start to matter to you personally?`
  },
  {
    id: 2,
    title: "Context Exchange",
    goal: "Share lived context or formative experience",
    staticPrompt: (t) => `Can you describe an experience that shaped how YOU see this issue? What was happening in your life at the time?`
  },
  {
    id: 3,
    title: "Perspective Mirror",
    goal: "Reflect back what you heard (active listening check)",
    staticPrompt: (t) => `Before exploring differences, reflect back what you heard the other person say. Focus on their values.`
  },
  {
    id: 4,
    title: "Gentle Contrast",
    goal: "Notice differences without arguing",
    staticPrompt: (t) => `Where do you think your perspectives diverge? Not what's 'right' or 'wrong' — just where you differ.`
  },
  {
    id: 5,
    title: "Shared Insight",
    goal: "Find overlap or human commonality",
    staticPrompt: (t) => `Despite your different perspectives, what do you hear in common?`
  },
  {
    id: 6,
    title: "Reflection & Close",
    goal: "Capture takeaway and update Civility Profile",
    staticPrompt: (t) => `What surprised you about the other perspective? What might you carry forward?`
  }
];

// --- AI SERVICES ---

// 1. Guide Safety Check (Runs on every message)
const runSafetyCheck = async (text) => {
  const prompt = `
    You are "Guide", a facilitator for a conflict resolution platform.
    Analyze this message for hostility, insults, or dismissiveness.
    Message: "${text}"
    Return JSON: { "status": "approved" } OR { "status": "rejected", "title": "Issue", "message": "Feedback" }
  `;
  const res = await callGemini(prompt);
  try { return JSON.parse(res.replace(/```json|```/g, '').trim()); }
  catch (e) { return { status: 'approved' }; }
};

// 2. Guide Transition Logic (Runs at end of phase)
const generateGuideGuidance = async (history, currentPhase, nextPhase, topic) => {
  const context = history.map(m => `${m.sender === 'A' ? 'User A' : 'User B'}: ${m.text}`).join('\n');

  const prompt = `
    You are "Guide", the facilitator of a structured dialogue about ${topic}.
    The previous goal was: "${currentPhase.goal}".
    The NEXT goal is: "${nextPhase.goal}".

    Transcript:
    ${context}

    Task:
    1. Briefly acknowledge the perspectives just shared (1 sentence).
    2. Transition naturally to the next step.
    3. Ask the specific question/prompt for the next phase based on the transcript.

    Constraints:
    - Do NOT say "Phase X" or "The next phase is...".
    - Do NOT use labels like "Curiosity Ignition".
    - Make the transition feel like a natural conversation flow.
    - Keep it encouraging and concise.
  `;

  return await callGemini(prompt) || `Let's move on. ${nextPhase.goal}`;
};

// 3. Guide Q&A Logic (Runs when user asks Guide - Public or Private)
const generateGuideAnswer = async (history, question, topic, phase) => {
  const context = history.map(m => `${m.sender === 'A' ? 'User A' : m.sender === 'B' ? 'User B' : 'Guide'}: ${m.text}`).join('\n');

  const prompt = `
    You are "Guide", a neutral, helpful facilitator in a dialogue about ${topic}.
    Current Phase: ${phase.title} (${phase.goal}).

    The user just asked you: "${question}"

    Context of conversation so far:
    ${context}

    Task:
    Answer the user's question or clarify the current task.
    - If they are stuck, give a small hint.
    - If they are confused, clarify the goal.
    - Do NOT take sides on the topic.
    - Be brief (max 2 sentences).
  `;

  return await callGemini(prompt) || "I'm here to help you understand each other better.";
};

// --- COMPONENTS ---

const Button = ({ children, onClick, variant = 'primary', className = '', disabled = false }) => {
  const variants = {
    primary: "bg-indigo-600 text-white hover:bg-indigo-700 shadow-md shadow-indigo-200",
    secondary: "bg-emerald-600 text-white hover:bg-emerald-700 shadow-md shadow-emerald-200",
    outline: "border-2 border-slate-200 text-slate-600 hover:border-indigo-600 hover:text-indigo-600",
    guide: "bg-amber-100 text-amber-800 hover:bg-amber-200 border border-amber-200",
    guideActive: "bg-amber-500 text-white hover:bg-amber-600 shadow-md shadow-amber-200"
  };
  return (
    <button onClick={onClick} disabled={disabled} className={`px-4 py-3 rounded-xl font-medium transition-all flex items-center justify-center gap-2 ${variants[variant]} ${disabled ? 'opacity-50' : ''} ${className}`}>
      {children}
    </button>
  );
};

export default function YPlatformApp() {
  const [appState, setAppState] = useState('onboarding');
  const [topic, setTopic] = useState('');
  const [messages, setMessages] = useState([]);

  // Conversation State
  const [phase, setPhase] = useState(1);
  const [turn, setTurn] = useState('A'); // 'A' or 'B'
  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [reviewMode, setReviewMode] = useState(false);
  const [transcribedText, setTranscribedText] = useState("");
  const [interactionMode, setInteractionMode] = useState('partner'); // 'partner' | 'public_guide' | 'private_guide'

  // AI State
  const [moderationError, setModerationError] = useState(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [privateHint, setPrivateHint] = useState(null);

  const scrollRef = useRef(null);

  // Hook to handle speech recognition
  const { start, stop } = useSpeechRecognition(setTranscribedText);

  // Auto-scroll
  useEffect(() => {
    scrollRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isProcessing, privateHint]);

  // Recording Timer
  useEffect(() => {
    let timer;
    if (isRecording) {
      timer = setInterval(() => setRecordingTime(t => t + 1), 1000);
    }
    return () => { clearInterval(timer); };
  }, [isRecording]);

  // --- HANDLERS ---

  const handleStartRecording = async (mode) => {
    setInteractionMode(mode);
    setRecordingTime(0);
    setTranscribedText("");
    setReviewMode(false);
    setIsRecording(true);
    await start(); // Call the native start recording function
  };

  const handleStopRecording = async () => {
    setIsRecording(false);
    setReviewMode(true);
    await stop();
  };

  const handleStart = (selectedTopic) => {
    setTopic(selectedTopic);
    setAppState('chat');
    // Initial Guide Welcome - Natural Language
    const phase1Prompt = PHASES[0].staticPrompt(selectedTopic);
    setMessages([{
      id: 'init',
      sender: 'guide',
      text: `Welcome. I am "Guide". I'll be facilitating your dialogue on "${selectedTopic}". ${phase1Prompt}`,
      phase: 1
    }]);
  };

  const handleSend = async () => {
    setIsProcessing(true);
    setModerationError(null);

    if (interactionMode === 'private_guide') {
      // --- USER ASKING GUIDE (PRIVATE HINT) ---

      // 1. Get Guide Response (DO NOT add to public messages array)
      const currentP = PHASES.find(p => p.id === phase);
      const guideAnswer = await generateGuideAnswer(messages, transcribedText, topic, currentP);

      // 2. Set private hint state for temporary display
      setPrivateHint(guideAnswer);

      // 3. Reset to normal mode
      setTranscribedText("");
      setRecordingTime(0);
      setReviewMode(false);
      setIsProcessing(false);
      setInteractionMode('partner');

    } else if (interactionMode === 'public_guide') {
      // --- USER ASKING GUIDE (PUBLIC CLARIFICATION) ---

      // 1. Add User Question locally (to public history)
      const userQuestionMsg = {
        id: Date.now(),
        sender: turn, // A or B
        text: transcribedText,
        phase: phase,
        isToGuide: true,
        audioLength: recordingTime
      };
      setMessages(prev => [...prev, userQuestionMsg]);

      // 2. Get Guide Response (to public history)
      const currentP = PHASES.find(p => p.id === phase);
      const guideAnswer = await generateGuideAnswer(messages, transcribedText, topic, currentP);

      setMessages(prev => [...prev, {
        id: Date.now() + 1,
        sender: 'guide',
        text: guideAnswer,
        phase: phase
      }]);

      // 3. Reset but DO NOT switch turn (dialogue is paused)
      setTranscribedText("");
      setRecordingTime(0);
      setReviewMode(false);
      setIsProcessing(false);
      setInteractionMode('partner'); // Reset to normal mode

    } else {
      // --- NORMAL PARTNER MESSAGE ---

      // 1. Safety Check
      const safety = await runSafetyCheck(transcribedText);
      if (safety.status === 'rejected') {
        setModerationError(safety);
        setIsProcessing(false);
        return;
      }

      // 2. Commit Message
      const newMsg = {
        id: Date.now(),
        sender: turn,
        text: transcribedText,
        phase: phase,
        audioLength: recordingTime
      };

      const updatedHistory = [...messages, newMsg];
      setMessages(updatedHistory);
      setTranscribedText("");
      setRecordingTime(0);
      setReviewMode(false);

      // 3. Turn Management
      if (turn === 'A') {
        setTurn('B');
        setIsProcessing(false);
      } else {
        // Phase Complete (Both A and B have spoken)
        if (phase < 6) {
          // 4. Generate Guide Transition
          const currentP = PHASES.find(p => p.id === phase);
          const nextP = PHASES.find(p => p.id === phase + 1);

          const guidance = await generateGuideGuidance(updatedHistory, currentP, nextP, topic);

          setMessages(prev => [...prev, {
            id: Date.now() + 1,
            sender: 'guide',
            text: guidance,
            phase: phase + 1 // Mark as start of next phase
          }]);

          setPhase(p => p + 1);
          setTurn('A');
        } else {
          setTimeout(() => setAppState('profile'), 2000);
        }
        setIsProcessing(false);
      }
    }

    // Clear private hint if a normal message was sent
    if (interactionMode === 'partner') {
        setPrivateHint(null);
    }
  };

  // --- RENDERERS ---

  if (appState === 'onboarding') return <OnboardingView onStart={handleStart} />;
  if (appState === 'profile') return <CivilityProfileView />;

  const currentP = PHASES.find(p => p.id === phase);
  const isGuideMode = interactionMode !== 'partner';
  const isPrivateMode = interactionMode === 'private_guide';
  const accentColor = isPrivateMode ? 'amber' : isGuideMode ? 'amber' : turn === 'A' ? 'indigo' : 'emerald';


  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-50 via-white to-purple-50 flex items-center justify-center p-0 font-sans text-slate-800">
      <div className="w-full h-screen bg-white flex flex-col overflow-hidden relative">

        {/* HEADER */}
        <div className="bg-gradient-to-r from-indigo-600 to-purple-600 px-6 py-6 pt-12 z-10 shadow-lg">
          <div className="flex justify-between items-center mb-3">
            <h1 className="text-2xl font-bold text-white flex items-center gap-2">
              Y Platform
            </h1>
            <span className="text-xs font-bold text-white/80 bg-white/20 px-3 py-1.5 rounded-full backdrop-blur">
              {topic}
            </span>
          </div>

          <div className="flex items-center gap-3">
             <div className="flex-1 h-2 bg-white/20 rounded-full overflow-hidden backdrop-blur">
               <div className="h-full bg-white transition-all duration-500 rounded-full" style={{ width: `${(phase/6)*100}%` }} />
             </div>
             <span className="text-sm font-semibold text-white/90">Phase {phase}/6</span>
          </div>
        </div>

        {/* CHAT FEED */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4 bg-gradient-to-b from-slate-50 to-white">
          {messages.map((msg) => {
            if (msg.sender === 'guide') {
              return (
                <div key={msg.id} className="flex gap-3 bg-gradient-to-br from-amber-50 to-yellow-50 border border-amber-200 p-5 rounded-2xl shadow-sm animate-in fade-in zoom-in-95">
                   <Sparkles className="text-amber-500 shrink-0 mt-1" size={22} />
                   <div>
                     <p className="text-xs font-bold text-amber-700 uppercase mb-2 tracking-wide">Guide</p>
                     <p className="text-base text-slate-700 leading-relaxed">{msg.text}</p>
                   </div>
                </div>
              );
            }

            const isA = msg.sender === 'A';

            // Public Clarification Request
            if (msg.isToGuide) {
               return (
                <div key={msg.id} className={`flex ${isA ? 'justify-start' : 'justify-end'}`}>
                  <div className="bg-slate-100 border border-slate-200 text-slate-600 rounded-2xl p-3 max-w-[80%] shadow-inner">
                    <div className="flex items-center gap-2 mb-1">
                       <MessageCircle size={12} className="text-slate-400" />
                       <span className="text-[10px] font-bold uppercase text-slate-400">Public Clarification from {isA ? 'A' : 'B'}</span>
                    </div>
                     <p className="text-xs italic">" {msg.text || '(Voice Query)'} "</p>
                  </div>
                </div>
               )
            }

            return (
              <div key={msg.id} className={`flex ${isA ? 'justify-start' : 'justify-end'}`}>
                <div className={`max-w-[85%] rounded-2xl p-4 shadow-md border-2 ${
                  isA
                    ? 'bg-gradient-to-br from-indigo-50 to-indigo-100 border-indigo-200 text-slate-800 rounded-tl-none'
                    : 'bg-gradient-to-br from-emerald-50 to-emerald-100 border-emerald-200 text-slate-800 rounded-tr-none'
                }`}>
                  <div className="flex items-center gap-2 mb-2">
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold text-white shadow-md ${isA ? 'bg-gradient-to-br from-indigo-500 to-indigo-600' : 'bg-gradient-to-br from-emerald-500 to-emerald-600'}`}>
                      {isA ? 'A' : 'B'}
                    </div>
                    <span className="text-xs font-bold uppercase opacity-70 tracking-wide">
                      {isA ? 'User A' : 'User B'}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 text-sm opacity-60 font-medium">
                     <Play size={12} fill="currentColor" /> Voice Note • {msg.audioLength}s
                  </div>
                </div>
              </div>
            );
          })}

          {isProcessing && (
            <div className="flex justify-center py-4">
              <div className="flex items-center gap-2 text-xs text-indigo-500 bg-white px-3 py-1 rounded-full shadow-sm border border-indigo-50">
                <Loader2 className="animate-spin" size={12} />
                Guide is analyzing...
              </div>
            </div>
          )}
          <div ref={scrollRef} />
        </div>

        {/* CONTROLS */}
        <div className="bg-gradient-to-t from-white to-slate-50 p-5 border-t border-slate-200 shadow-lg">

          {/* PRIVATE HINT DISPLAY */}
          {privateHint && interactionMode === 'partner' && (
            <div className="mb-4 bg-amber-50 border border-amber-100 rounded-xl p-3 flex gap-3 animate-in slide-in-from-bottom-2">
              <BookOpen className="text-amber-500 shrink-0" size={18} />
              <div>
                <h4 className="text-xs font-bold text-amber-800">Private Hint from Guide</h4>
                <p className="text-xs text-amber-700 mt-1">{privateHint}</p>
                <button onClick={() => setPrivateHint(null)} className="mt-2 text-[10px] font-bold text-amber-600 hover:underline">Got it, close</button>
              </div>
            </div>
          )}

          {/* MODERATION ERROR */}
          {moderationError && (
            <div className="mb-4 bg-red-50 border border-red-100 rounded-xl p-3 flex gap-3 animate-in slide-in-from-bottom-2">
              <Shield className="text-red-500 shrink-0" size={18} />
              <div>
                <h4 className="text-xs font-bold text-red-800">{moderationError.title}</h4>
                <p className="text-xs text-red-700 mt-1">{moderationError.message}</p>
                <button onClick={() => setModerationError(null)} className="mt-2 text-[10px] font-bold text-red-600 hover:underline">Dismiss & Retry</button>
              </div>
            </div>
          )}

          {/* RECORDING UI */}
          {!reviewMode ? (
            <div className="flex flex-col items-center">
              {isRecording ? (
                <div className="w-full flex flex-col items-center">
                  <div className={`text-2xl font-mono font-medium mb-4 ${
                    accentColor === 'amber' ? 'text-amber-500' : turn === 'A' ? 'text-indigo-500' : 'text-emerald-500'
                  }`}>
                    {Math.floor(recordingTime / 60)}:{(recordingTime % 60).toString().padStart(2, '0')}
                  </div>
                  <div className="flex gap-1 h-8 items-center mb-6">
                     {[...Array(15)].map((_, i) => (
                       <div key={i} className={`w-1 rounded-full animate-pulse ${
                         accentColor === 'amber' ? 'bg-amber-300' : turn === 'A' ? 'bg-indigo-300' : 'bg-emerald-300'
                       }`}
                         style={{ height: `${20 + Math.random() * 80}%`, animationDelay: `${i * 0.05}s` }} />
                     ))}
                  </div>
                  <button onClick={handleStopRecording}
                    className={`w-16 h-16 rounded-full text-white flex items-center justify-center shadow-lg hover:scale-105 transition-transform ${
                      accentColor === 'amber' ? 'bg-amber-500 shadow-amber-200' : turn === 'A' ? 'bg-indigo-500 shadow-indigo-200' : 'bg-emerald-500 shadow-emerald-200'
                    }`}>
                    <div className="w-6 h-6 bg-white rounded-sm" />
                  </button>
                  <p className="text-xs text-slate-400 mt-3">Tap to stop recording</p>
                </div>
              ) : (
                <div className="w-full space-y-3">
                  <div className={`p-4 rounded-2xl border-2 text-center text-sm font-semibold shadow-sm mb-4 ${turn === 'A' ? 'bg-gradient-to-r from-indigo-50 to-indigo-100 border-indigo-200 text-indigo-700' : 'bg-gradient-to-r from-emerald-50 to-emerald-100 border-emerald-200 text-emerald-700'}`}>
                    It is <strong>{turn === 'A' ? 'User A' : 'User B'}'s</strong> turn to speak
                  </div>

                  <button onClick={() => handleStartRecording('partner')}
                    className={`w-full py-5 rounded-2xl text-white font-bold text-lg flex items-center justify-center gap-3 shadow-xl hover:shadow-2xl hover:scale-[1.02] active:scale-[0.98] transition-all mb-3 ${turn === 'A' ? 'bg-gradient-to-r from-indigo-600 to-indigo-700' : 'bg-gradient-to-r from-emerald-600 to-emerald-700'}`}>
                    <Mic size={24} />
                    Record {turn === 'A' ? 'User A' : 'User B'}
                  </button>

                  <div className="flex gap-3">
                    {/* Public Clarification Button */}
                    <button onClick={() => handleStartRecording('public_guide')}
                      className="flex-1 px-4 py-4 rounded-xl bg-gradient-to-br from-amber-50 to-yellow-50 text-amber-700 border-2 border-amber-200 font-semibold flex flex-col items-center justify-center gap-2 shadow-md hover:shadow-lg active:scale-95 transition-all">
                      <MessageCircle size={20} />
                      <span className="text-xs">Public</span>
                    </button>

                    {/* Private Hint Button */}
                    <button onClick={() => handleStartRecording('private_guide')}
                      className="flex-1 px-4 py-4 rounded-xl bg-gradient-to-br from-amber-50 to-yellow-50 text-amber-700 border-2 border-amber-200 font-semibold flex flex-col items-center justify-center gap-2 shadow-md hover:shadow-lg active:scale-95 transition-all">
                      <BookOpen size={20} />
                      <span className="text-xs">Private</span>
                    </button>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-3">
              <div className="flex items-center justify-between bg-slate-50 p-3 rounded-xl border border-slate-200">
                 <div className="flex items-center gap-3">
                   <div className={`w-8 h-8 rounded-full flex items-center justify-center ${accentColor === 'amber' ? 'bg-amber-100 text-amber-600' : turn === 'A' ? 'bg-indigo-100 text-indigo-600' : 'bg-emerald-100 text-emerald-600'}`}>
                     <Play size={14} fill="currentColor" />
                   </div>
                   <p className="text-sm font-medium text-slate-800 truncate">{transcribedText || "No transcription available."}</p>
                 </div>
                 <button onClick={() => setReviewMode(false)} className="text-slate-400 hover:text-red-500 shrink-0">
                   <RefreshCcw size={18} />
                 </button>
              </div>
              <Button onClick={handleSend} variant={accentColor === 'amber' ? 'guideActive' : turn === 'A' ? 'primary' : 'secondary'} className="w-full" disabled={!transcribedText}>
                {isPrivateMode ? 'Get Private Hint from Guide' : isGuideMode ? 'Send Public Clarification' : `Send as ${turn === 'A' ? 'User A' : 'User B'}`}
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// --- SUB-VIEWS ---

function OnboardingView({ onStart }) {
  const [topic, setTopic] = useState('');
  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-600 via-purple-600 to-pink-500 flex items-center justify-center p-6">
      <div className="w-full max-w-md bg-white p-8 rounded-3xl shadow-2xl text-center">
        <div className="mb-8">
          <h1 className="text-5xl font-bold bg-gradient-to-r from-indigo-600 to-purple-600 bg-clip-text text-transparent mb-3">Y</h1>
          <p className="text-slate-600 text-lg font-medium">Platform for Better Dialogue</p>
        </div>
        <div className="text-left space-y-3 mb-8">
          <label className="text-sm font-bold text-slate-700 uppercase ml-1 tracking-wide">Choose a Topic</label>
          {TOPICS.map(t => (
            <button key={t} onClick={() => setTopic(t)} className={`w-full p-5 rounded-2xl border-2 text-left font-semibold transition-all shadow-sm ${topic === t ? 'border-indigo-500 bg-gradient-to-r from-indigo-50 to-purple-50 text-indigo-700 shadow-lg scale-[1.02]' : 'border-slate-200 text-slate-700 hover:border-indigo-300 hover:shadow-md active:scale-95'}`}>
              {t}
            </button>
          ))}
        </div>
        <button onClick={() => onStart(topic)} disabled={!topic} className={`w-full py-5 rounded-2xl font-bold text-lg flex items-center justify-center gap-2 shadow-xl transition-all ${!topic ? 'bg-slate-200 text-slate-400 cursor-not-allowed' : 'bg-gradient-to-r from-indigo-600 to-purple-600 text-white hover:shadow-2xl hover:scale-[1.02] active:scale-95'}`}>
          Begin Dialogue
        </button>
      </div>
    </div>
  );
}

function CivilityProfileView() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-green-500 via-emerald-500 to-teal-500 flex items-center justify-center p-6">
      <div className="w-full max-w-md bg-white rounded-3xl shadow-2xl overflow-hidden text-center p-10">
        <div className="w-20 h-20 bg-gradient-to-br from-green-400 to-emerald-500 text-white rounded-full flex items-center justify-center mx-auto mb-6 shadow-lg">
          <CheckCircle size={40} />
        </div>
        <h2 className="text-3xl font-bold text-slate-800 mb-3">Dialogue Complete!</h2>
        <p className="text-slate-600 mb-8 text-lg">Guide successfully facilitated your conversation through all phases.</p>
        <button onClick={() => window.location.reload()} className="w-full py-4 rounded-2xl font-bold text-lg bg-gradient-to-r from-indigo-600 to-purple-600 text-white shadow-xl hover:shadow-2xl hover:scale-[1.02] active:scale-95 transition-all">
          Start New Dialogue
        </button>
      </div>
    </div>
  );
}
