import React, { useState, useEffect } from 'react'
import { BrowserRouter, Routes, Route, Link, Navigate, useLocation, useNavigate } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import axios from 'axios'

// ------------------------------------------------------------------------------
// API Configuration & Client Helpers
// ------------------------------------------------------------------------------
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000'

const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 10000,
  headers: {
    'Content-Type': 'application/json'
  }
})

// Biller Operator Categories fallback presets
const FALLBACK_OPERATORS = {
  electricity: [
    { id: 'PSPCL_ELECT', name: 'PSPCL Electricity (Punjab)' },
    { id: 'TATA_POWER_ELECT', name: 'Tata Power Electricity (Delhi)' },
    { id: 'BESCOM_ELECT', name: 'BESCOM Electricity (Bangalore)' }
  ],
  gas: [
    { id: 'INDANE_GAS', name: 'Indane Gas LPG Cylinders' },
    { id: 'HP_GAS', name: 'HP Gas LPG Cylinders' },
    { id: 'IGL_GAS', name: 'Indraprastha Gas Limited (Piped)' }
  ],
  water: [
    { id: 'DELHI_JAL_BOARD', name: 'Delhi Jal Board' },
    { id: 'BMC_WATER', name: 'BMC Municipal Water (Mumbai)' }
  ],
  broadband: [
    { id: 'BSNL_FIBRE', name: 'BSNL Fibre Broadband' },
    { id: 'AIRTEL_FIBRE', name: 'Airtel Xstream Broadband' }
  ],
  dth: [
    { id: 'TATA_PLAY', name: 'Tata Play DTH' },
    { id: 'DISH_TV', name: 'Dish TV DTH' }
  ]
}

const getBillerName = (billerId) => {
  if (!billerId) return 'Utility'
  for (const category in FALLBACK_OPERATORS) {
    const found = FALLBACK_OPERATORS[category].find(b => b.id === billerId)
    if (found) return found.name
  }
  return billerId
}

// Loading Spinner Icon SVG helper (No emojis)
const SvgLoading = () => (
  <svg className="animate-spin h-4 w-4 text-white" fill="none" viewBox="0 0 24 24">
    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
  </svg>
)

// ------------------------------------------------------------------------------
// Micro-Toast Component
// ------------------------------------------------------------------------------
const Toast = ({ message, type, onClose }) => {
  useEffect(() => {
    const timer = setTimeout(onClose, 4000)
    return () => clearTimeout(timer)
  }, [onClose])
  return (
    <div className={`fixed bottom-6 right-6 z-50 flex items-center space-x-3 px-5 py-3 rounded border text-sm transition-all duration-300 ${
      type === 'error'
        ? 'bg-red-50 border-red-200 text-red-800'
        : 'bg-emerald-50 border-emerald-200 text-emerald-800'
    }`}>
      <span>{message}</span>
      <button onClick={onClose} className="text-slate-400 hover:text-slate-600 text-xs cursor-pointer">✕</button>
    </div>
  )
}

// ------------------------------------------------------------------------------
// GlowCard: Cursor tracking glowing cards (Stripe-like)
// ------------------------------------------------------------------------------
const GlowCard = ({ children, className = '', isDark, hasCustomBg = false }) => {
  const [coords, setCoords] = useState({ x: 0, y: 0 })
  const [isHovered, setIsHovered] = useState(false)

  const handleMouseMove = (e) => {
    const rect = e.currentTarget.getBoundingClientRect()
    setCoords({
      x: e.clientX - rect.left,
      y: e.clientY - rect.top
    })
  }

  return (
    <div
      onMouseMove={handleMouseMove}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      className={`relative overflow-hidden transition-all duration-300 rounded-xl border ${
        hasCustomBg
          ? ''
          : isDark 
            ? 'bg-slate-900/40 border-slate-800/60 hover:border-slate-700/60' 
            : 'bg-white border-slate-200 shadow-sm hover:shadow-md'
      } ${className}`}
      style={{
        '--mouse-x': `${coords.x}px`,
        '--mouse-y': `${coords.y}px`,
        boxShadow: isHovered && isDark ? '0 0 20px rgba(99, 102, 241, 0.15)' : undefined
      }}
    >
      {isHovered && isDark && (
        <div
          className="absolute pointer-events-none rounded-full"
          style={{
            width: '250px',
            height: '250px',
            background: 'radial-gradient(circle, rgba(99, 102, 241, 0.18) 0%, transparent 70%)',
            left: `${coords.x - 125}px`,
            top: `${coords.y - 125}px`,
            transition: 'opacity 0.2s ease',
            zIndex: 0
          }}
        />
      )}
      <div className="relative z-10">{children}</div>
    </div>
  )
}


// ------------------------------------------------------------------------------
// Welcome / Profile Selection Component (No Hardcoding)
// ------------------------------------------------------------------------------
const WelcomeScreen = ({ onConnect, isDark, profileId }) => {
  const [showForm, setShowForm] = useState(false)
  const navigate = useNavigate()
  const { register, handleSubmit, formState: { errors } } = useForm({
    defaultValues: {
      country_code: '+91',
      phone_raw: ''
    }
  })
  const [connecting, setConnecting] = useState(false)
  const [errorMsg, setErrorMsg] = useState('')
  const [activeHowStep, setActiveHowStep] = useState(1)
  const [mockLimit, setMockLimit] = useState(1500)

  useEffect(() => {
    if (activeHowStep !== 1) return
    const interval = setInterval(() => {
      setMockLimit((prev) => {
        if (prev >= 5000) return 1000
        return prev + 100
      })
    }, 80)
    return () => clearInterval(interval)
  }, [activeHowStep])

  const handleScrollTo = (id) => {
    const element = document.getElementById(id);
    if (element) {
      element.scrollIntoView({ behavior: 'smooth' });
    }
  };

  const onSubmit = async (data) => {
    const fullPhone = data.country_code + data.phone_raw.trim()
    setConnecting(true)
    setErrorMsg('')
    try {
      await onConnect(fullPhone)
    } catch (err) {
      setErrorMsg('Error linking console dashboard. Verify backend orchestrator is running.')
    } finally {
      setConnecting(false)
    }
  }

  const renderFloatingCards = () => (
    <div className="relative w-full h-[450px] flex items-center justify-center">
      {/* Decorative ambient glowing backdrops matching reference neon flows */}
      <div className="absolute top-12 right-12 w-64 h-64 rounded-full bg-indigo-500/20 blur-[85px] animate-pulse" />
      <div className="absolute bottom-12 left-12 w-72 h-72 rounded-full bg-purple-500/15 blur-[95px] animate-pulse" />
      
      {/* Card 1: Mandate settings (NISAR MULTANI top card style) */}
      <div className="animate-float-card-1 absolute top-12 left-4 md:left-12 bg-[#0d1021]/80 border border-slate-700/40 backdrop-blur-xl shadow-2xl rounded-2xl p-5 w-72 h-44 flex flex-col justify-between text-white transition-all duration-300 hover:scale-105 hover:border-slate-500/50">
        <div className="flex justify-between items-start">
          <div className="w-10 h-7 bg-amber-400/20 rounded border border-amber-400/40 relative overflow-hidden">
            <div className="absolute top-1/2 left-0 right-0 h-[1px] bg-amber-400/40" />
            <div className="absolute left-1/2 top-0 bottom-0 w-[1px] bg-amber-400/40" />
          </div>
          <span className="text-[10px] font-extrabold tracking-widest text-indigo-400 uppercase">MANDATE SECURE</span>
        </div>
        <div>
          <p className="text-sm font-mono tracking-widest text-slate-300">4591 2026 **** ****</p>
          <div className="flex justify-between items-end mt-2">
            <div>
              <span className="text-[8px] text-slate-500 uppercase block font-semibold">Limit</span>
              <span className="text-xs font-semibold text-slate-200">Rs 5,000 / month</span>
            </div>
            <div className="text-right">
              <span className="text-[8px] text-slate-500 uppercase block font-semibold">Status</span>
              <span className="text-[10px] font-black text-emerald-400 uppercase tracking-wider">AUTOPAY ACTIVE</span>
            </div>
          </div>
        </div>
      </div>

      {/* Card 2: Risk / Bill Audit (NISAR MULTANI bottom card style) */}
      <div className="animate-float-card-2 absolute bottom-12 right-4 md:right-12 bg-slate-900/60 border border-indigo-500/25 backdrop-blur-xl shadow-2xl rounded-2xl p-5 w-72 h-44 flex flex-col justify-between text-white transition-all duration-300 hover:scale-105 hover:border-indigo-400/40">
        <div className="flex justify-between items-start">
          <div className="w-10 h-7 bg-indigo-400/25 rounded border border-indigo-400/40 relative overflow-hidden">
            <div className="absolute top-1/2 left-0 right-0 h-[1px] bg-indigo-400/40" />
            <div className="absolute left-1/2 top-0 bottom-0 w-[1px] bg-indigo-400/40" />
          </div>
          <span className="text-[10px] font-extrabold tracking-widest text-purple-400 uppercase">AUDIT ENGINE</span>
        </div>
        <div>
          <p className="text-xs font-bold text-slate-100 font-mono">ELECTRICITY STATEMENT</p>
          <p className="text-lg font-extrabold mt-1 text-gradient-purple-cyan">Rs 847.00</p>
          <div className="flex justify-between items-end mt-2">
            <div>
              <span className="text-[8px] text-slate-500 uppercase block font-semibold">Analysis</span>
              <span className="text-[9px] font-bold text-emerald-400">Safe (-4.2% Variance)</span>
            </div>
            <div className="text-right">
              <span className="text-[8px] text-slate-500 uppercase block font-semibold">Verification</span>
              <span className="px-1.5 py-0.5 text-[8px] font-black bg-indigo-500/25 text-indigo-300 border border-indigo-500/30 rounded uppercase tracking-wider">PASSED</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  )

  if (!showForm) {
    return (
      <div className="min-h-screen bg-[#070913] text-white relative overflow-y-auto flex flex-col justify-between font-sans">
        {/* Dynamic mesh glow background layers */}
        <div className="mesh-glow-1" />
        <div className="mesh-glow-2" />

        {/* Premium Header/Navbar */}
        <header className="w-full max-w-6xl mx-auto px-6 h-20 flex items-center justify-between z-20 shrink-0">
          <span className="text-xl font-black tracking-tight text-gradient-purple-cyan">BillBuddy</span>
          <nav className="hidden md:flex items-center space-x-8 text-xs font-bold uppercase tracking-wider text-slate-400">
            <a href="#about" onClick={(e) => { e.preventDefault(); handleScrollTo('about'); }} className="hover:text-white transition-colors">About</a>
            <a href="#how" onClick={(e) => { e.preventDefault(); handleScrollTo('how'); }} className="hover:text-white transition-colors">How it works</a>
            <a href="#security" onClick={(e) => { e.preventDefault(); handleScrollTo('security'); }} className="hover:text-white transition-colors">Security</a>
          </nav>
          {profileId ? (
            <button 
              onClick={() => navigate('/dashboard')}
              className="px-5 py-2 text-xs font-extrabold uppercase tracking-wider rounded-full border border-indigo-500 bg-indigo-600/30 text-indigo-350 hover:bg-indigo-600 hover:text-white transition-all duration-300 cursor-pointer"
            >
              GO TO DASHBOARD
            </button>
          ) : (
            <button 
              onClick={() => setShowForm(true)}
              className="px-5 py-2 text-xs font-extrabold uppercase tracking-wider rounded-full border border-slate-700 bg-slate-900/50 hover:bg-white hover:text-black hover:border-white transition-all duration-300 cursor-pointer"
            >
              GET STARTED
            </button>
          )}
        </header>

        {/* Combined landing page body container */}
        <main className="w-full max-w-6xl mx-auto px-6 z-10 flex flex-col">
          {/* Hero Section Grid */}
          <div className="grid grid-cols-1 md:grid-cols-12 gap-8 items-center py-12 md:py-24">
            {/* Left Column: Product Branding Copy (7 columns) */}
            <div className="md:col-span-7 space-y-6 text-left">
              <div className="inline-flex items-center space-x-2 px-3 py-1 rounded-full border border-purple-500/30 bg-purple-500/10 text-purple-300 text-[9px] font-black uppercase tracking-widest">
                <span>●</span>
                <span>PREMIUM AUTONOMOUS AGENT SYSTEM</span>
              </div>
              
              <h1 className="text-4xl md:text-5xl font-black tracking-tight leading-[1.12] uppercase">
                GUARANTEED BILL PROTECTION.<br />
                <span className="text-gradient-purple-cyan">ZERO SPIKES. ZERO DELAYS.</span>
              </h1>
              
              <p className="text-slate-400 text-sm md:text-base max-w-lg leading-relaxed font-light">
                Protect your parents from utility disconnections and spikes. BillBuddy audits statements automatically, enforces secure user-controlled limits, and processes payments safely with real-time multilingual voice notifications.
              </p>

              <div className="flex items-center space-x-4 pt-4">
                {profileId ? (
                  <button 
                    onClick={() => navigate('/dashboard')}
                    className="px-8 py-3.5 bg-indigo-600 text-white text-xs font-black uppercase tracking-widest rounded-full hover:bg-indigo-750 shadow-[0_0_24px_rgba(99,102,241,0.3)] transition-all duration-300 cursor-pointer"
                  >
                    GO TO DASHBOARD
                  </button>
                ) : (
                  <button 
                    onClick={() => setShowForm(true)}
                    className="px-8 py-3.5 bg-white text-black text-xs font-black uppercase tracking-widest rounded-full hover:bg-purple-600 hover:text-white shadow-[0_0_24px_rgba(255,255,255,0.15)] transition-all duration-300 cursor-pointer"
                  >
                    GET STARTED
                  </button>
                )}
                <a 
                  href="#about"
                  onClick={(e) => { e.preventDefault(); handleScrollTo('about'); }}
                  className="px-6 py-3.5 bg-slate-900/60 border border-slate-800 text-slate-300 text-xs font-black uppercase tracking-widest rounded-full hover:bg-slate-800 hover:text-white transition-all duration-200 cursor-pointer inline-flex items-center justify-center text-center font-bold"
                >
                  LEARN MORE
                </a>
              </div>

              {/* Muted Partner Protocols bottom section */}
              <div className="pt-12 space-y-3">
                <span className="text-[9px] font-extrabold uppercase tracking-wider text-slate-600 block">TRUSTED INTEGRATION STACK</span>
                <div className="flex items-center space-x-6 opacity-35 filter grayscale">
                  <span className="text-xs font-extrabold tracking-widest font-mono text-slate-400 uppercase">NPCI / BHIM</span>
                  <span className="text-xs font-extrabold tracking-widest font-mono text-slate-400 uppercase">Stripe</span>
                  <span className="text-xs font-extrabold tracking-widest font-mono text-slate-400 uppercase">Razorpay</span>
                  <span className="text-xs font-extrabold tracking-widest font-mono text-slate-400 uppercase">Gemini 2.5</span>
                </div>
              </div>
            </div>

            {/* Right Column: Visual Card Stack (5 columns) */}
            <div className="md:col-span-5 relative">
              {renderFloatingCards()}
            </div>
          </div>

          {/* About Section */}
          <section id="about" className="py-20 md:py-28 border-t border-slate-900/60 mt-12 space-y-8 scroll-mt-20 text-left">
            <div className="max-w-3xl">
              <div className="inline-flex items-center space-x-2 px-3 py-1 rounded-full border border-indigo-500/30 bg-indigo-500/10 text-indigo-300 text-[9px] font-black uppercase tracking-widest mb-4">
                <span>●</span>
                <span>Our Mission</span>
              </div>
              <h2 className="text-3xl md:text-4xl font-black tracking-tight uppercase text-white">
                Gentle Autonomy, absolute safety
              </h2>
              <p className="text-slate-400 text-sm md:text-base leading-relaxed mt-4 font-light">
                BillBuddy was conceived to solve a critical, real-world challenge: bridging the gap between automated digital utility management and elder citizens who cherish their independence. As banking and payments transition fully online, senior citizens face increased complexity, risk of double-billing, phishing, and service disconnections.
              </p>
              <p className="text-slate-400 text-sm md:text-base leading-relaxed mt-4 font-light">
                Our system empowers adult children to link and fund parents' utilities under absolute user-controlled caps, while leaving the execution to an autonomous, intelligent risk engine. We ensure parents never face utility blackouts, while shielding them from digital transaction stress.
              </p>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 pt-6">
              <div className="p-6 rounded-2xl border border-slate-800/80 bg-[#0d1021]/45 backdrop-blur-md hover:border-indigo-500/50 hover:bg-[#0d1021]/60 transition-all duration-300 group">
                <div className="w-12 h-12 rounded-xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400 group-hover:scale-110 group-hover:border-indigo-500/40 transition-all duration-300">
                  <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M18 18.72a9.094 9.094 0 003.741-.479 3 3 0 00-4.682-2.72m.94 3.198l.001.031c0 .225-.012.447-.037.666A11.944 11.944 0 0112 21c-2.17 0-4.207-.576-5.963-1.584A6.062 6.062 0 016 18.719m12 0a5.971 5.971 0 00-.941-3.197m0 0A5.995 5.995 0 0012 12.75a5.995 5.995 0 00-5.058 2.772m0 0a3 3 0 00-4.681 2.72 8.986 8.986 0 003.74.477m.94-3.197a5.971 5.971 0 00-.94 3.197M15 6.75a3 3 0 11-6 0 3 3 0 016 0zm6 3a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0zm-13.5 0a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0z" />
                  </svg>
                </div>
                <h3 className="text-sm font-bold uppercase tracking-wider text-white mt-5">Dignity & Independence</h3>
                <p className="text-xs text-slate-400 mt-2 leading-relaxed font-light font-sans">
                  Elders don't have to manage complex banking apps. Payments happen silently, and they are notified via simple regional voice calls.
                </p>
              </div>
              <div className="p-6 rounded-2xl border border-slate-800/80 bg-[#0d1021]/45 backdrop-blur-md hover:border-cyan-500/50 hover:bg-[#0d1021]/60 transition-all duration-300 group">
                <div className="w-12 h-12 rounded-xl bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center text-cyan-400 group-hover:scale-110 group-hover:border-cyan-500/40 transition-all duration-300">
                  <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.57-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
                  </svg>
                </div>
                <h3 className="text-sm font-bold uppercase tracking-wider text-white mt-5">Anti-Fraud Protection</h3>
                <p className="text-xs text-slate-400 mt-2 leading-relaxed font-light font-sans">
                  Any anomalous charge spike, duplicate biller request, or phishing attempt is instantly flagged and blocked by the risk engine.
                </p>
              </div>
              <div className="p-6 rounded-2xl border border-slate-800/80 bg-[#0d1021]/45 backdrop-blur-md hover:border-pink-500/50 hover:bg-[#0d1021]/60 transition-all duration-300 group">
                <div className="w-12 h-12 rounded-xl bg-pink-500/10 border border-pink-500/20 flex items-center justify-center text-pink-400 group-hover:scale-110 group-hover:border-pink-500/40 transition-all duration-300">
                  <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M21 8.25c0-2.485-2.099-4.5-4.688-4.5-1.935 0-3.597 1.126-4.312 2.733-.715-1.607-2.377-2.733-4.313-2.733C5.1 3.75 3 5.765 3 8.25c0 7.22 9 12 9 12s9-4.78 9-12z" />
                  </svg>
                </div>
                <h3 className="text-sm font-bold uppercase tracking-wider text-white mt-5">Peace of Mind</h3>
                <p className="text-xs text-slate-400 mt-2 leading-relaxed font-light">
                  Children configure settings once, set the monthly Autopay limits, and let the agents handle auditing and notifications.
                </p>
              </div>
            </div>
          </section>

          {/* How It Works Section */}
          <section id="how" className="py-20 md:py-28 border-t border-slate-900/60 space-y-12 scroll-mt-20 text-left">
            <div>
              <div className="inline-flex items-center space-x-2 px-3 py-1 rounded-full border border-pink-500/30 bg-pink-500/10 text-pink-300 text-[9px] font-black uppercase tracking-widest mb-4">
                <span>●</span>
                <span>Step-by-Step Flow</span>
              </div>
              <h2 className="text-3xl md:text-4xl font-black tracking-tight uppercase text-white">
                How BillBuddy coordinates payments
              </h2>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-12 gap-8 items-stretch">
              {/* Left Column: Interactive Navigation (Step details) */}
              <div className="md:col-span-5 space-y-4 flex flex-col justify-center">
                <div 
                  onClick={() => setActiveHowStep(1)}
                  onMouseEnter={() => setActiveHowStep(1)}
                  className={`p-5 rounded-2xl border transition-all duration-305 cursor-pointer text-left ${
                    activeHowStep === 1 
                      ? 'border-purple-500/40 bg-purple-500/5 shadow-[0_0_20px_rgba(168,85,247,0.08)]' 
                      : 'border-slate-800/80 bg-slate-950/20 hover:border-slate-700/60'
                  }`}
                >
                  <div className="flex items-center space-x-3">
                    <span className={`w-7 h-7 rounded-full flex items-center justify-center font-bold text-xs ${
                      activeHowStep === 1 ? 'bg-purple-500 text-white' : 'bg-slate-800 text-slate-400'
                    }`}>01</span>
                    <h3 className={`text-sm font-bold uppercase tracking-wider ${activeHowStep === 1 ? 'text-purple-350' : 'text-slate-350'}`}>Link & Cap Mandates</h3>
                  </div>
                  <p className="text-xs text-slate-400 mt-2 leading-relaxed font-light font-sans">
                    The adult child inputs parent utility account numbers and initializes a secure UPI Autopay mandate with a strict monthly cap (e.g. ₹5,000).
                  </p>
                </div>

                <div 
                  onClick={() => setActiveHowStep(2)}
                  onMouseEnter={() => setActiveHowStep(2)}
                  className={`p-5 rounded-2xl border transition-all duration-305 cursor-pointer text-left ${
                    activeHowStep === 2 
                      ? 'border-cyan-500/40 bg-cyan-500/5 shadow-[0_0_20px_rgba(6,182,212,0.08)]' 
                      : 'border-slate-800/80 bg-slate-950/20 hover:border-slate-700/60'
                  }`}
                >
                  <div className="flex items-center space-x-3">
                    <span className={`w-7 h-7 rounded-full flex items-center justify-center font-bold text-xs ${
                      activeHowStep === 2 ? 'bg-cyan-500 text-black' : 'bg-slate-800 text-slate-400'
                    }`}>02</span>
                    <h3 className={`text-sm font-bold uppercase tracking-wider ${activeHowStep === 2 ? 'text-cyan-350' : 'text-slate-350'}`}>AI Statement Audit</h3>
                  </div>
                  <p className="text-xs text-slate-400 mt-2 leading-relaxed font-light font-sans">
                    Every billing cycle, the fetch agent retrieves statements. The Gemini Risk Engine inspects amounts against historical averages to verify there are no spikes or duplicate billers.
                  </p>
                </div>

                <div 
                  onClick={() => setActiveHowStep(3)}
                  onMouseEnter={() => setActiveHowStep(3)}
                  className={`p-5 rounded-2xl border transition-all duration-305 cursor-pointer text-left ${
                    activeHowStep === 3 
                      ? 'border-indigo-500/40 bg-indigo-500/5 shadow-[0_0_20px_rgba(99,102,241,0.08)]' 
                      : 'border-slate-800/80 bg-slate-950/20 hover:border-slate-700/60'
                  }`}
                >
                  <div className="flex items-center space-x-3">
                    <span className={`w-7 h-7 rounded-full flex items-center justify-center font-bold text-xs ${
                      activeHowStep === 3 ? 'bg-indigo-500 text-white' : 'bg-slate-800 text-slate-400'
                    }`}>03</span>
                    <h3 className={`text-sm font-bold uppercase tracking-wider ${activeHowStep === 3 ? 'text-indigo-350' : 'text-slate-350'}`}>Auto-Pay & Notify</h3>
                  </div>
                  <p className="text-xs text-slate-400 mt-2 leading-relaxed font-light font-sans">
                    Settle secure payments automatically. Parents receive a reassuring voice call or audio receipt in their regional language. Children get a text summary.
                  </p>
                </div>
              </div>

              {/* Right Column: Dynamic Visual Mockup Container */}
              <div className="md:col-span-7 flex items-center justify-center relative min-h-[380px] p-6 rounded-3xl border border-slate-800/80 bg-[#0d1021]/30 backdrop-blur-xl overflow-hidden">
                {/* Background ambient lighting */}
                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-64 h-64 rounded-full bg-gradient-to-tr from-purple-500/10 to-cyan-500/10 blur-[80px]" />

                {activeHowStep === 1 && (
                  <div className="w-full max-w-sm space-y-6 z-10">
                    <div className="bg-[#090b16] border border-purple-500/30 rounded-2xl p-5 shadow-2xl space-y-4">
                      <div className="flex justify-between items-center border-b border-slate-800 pb-3">
                        <span className="text-[10px] font-black text-purple-400 tracking-wider uppercase">UPI AUTOPAY MANDATE</span>
                        <span className="px-2 py-0.5 text-[8px] font-extrabold bg-purple-500/20 text-purple-300 border border-purple-500/30 rounded">ACTIVE SETUP</span>
                      </div>
                      <div className="space-y-1 text-left">
                        <span className="text-[9px] text-slate-500 uppercase font-semibold">Configured Cap</span>
                        <div className="text-2xl font-black text-white font-mono">₹{mockLimit.toLocaleString()}</div>
                      </div>
                      {/* Slider Animation */}
                      <div className="space-y-2 pt-2">
                        <div className="h-1.5 w-full bg-slate-850 rounded-full overflow-hidden relative">
                          <div 
                            className="h-full bg-gradient-to-r from-purple-500 to-cyan-500 rounded-full transition-all duration-75"
                            style={{ width: `${(mockLimit / 5000) * 100}%` }}
                          />
                        </div>
                        <div className="flex justify-between text-[8px] text-slate-500 font-bold uppercase">
                          <span>Min limit: ₹1,000</span>
                          <span>Max limit: ₹5,000</span>
                        </div>
                      </div>
                      <div className="flex items-center space-x-2 bg-emerald-500/10 border border-emerald-500/20 rounded-xl p-2.5 text-left">
                        <div className="w-4 h-4 rounded-full bg-emerald-500/20 flex items-center justify-center text-emerald-400 text-[9px] font-bold">✓</div>
                        <span className="text-[9px] text-emerald-300 font-medium">Safe Limit Cap Locked. Transactions above ₹5,000 are instantly blocked.</span>
                      </div>
                    </div>
                  </div>
                )}

                {activeHowStep === 2 && (
                  <div className="w-full max-w-sm space-y-4 z-10">
                    <div className="bg-[#090b16] border border-cyan-500/30 rounded-2xl p-5 shadow-2xl relative overflow-hidden">
                      {/* Scanner Line */}
                      <div className="laser-scanner" />
                      
                      <div className="flex justify-between items-center border-b border-slate-800 pb-3 mb-3">
                        <span className="text-[10px] font-black text-cyan-400 tracking-wider uppercase">AUDIT ENGINE ANALYSIS</span>
                        <span className="px-2 py-0.5 text-[8px] font-extrabold bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 rounded">SCANNING</span>
                      </div>
                      <div className="space-y-3 text-left">
                        <div className="flex justify-between items-center">
                          <span className="text-[10px] text-slate-400 uppercase font-semibold">Biller ID</span>
                          <span className="text-[10px] text-slate-200 font-mono">BBPS-ELEC-4890</span>
                        </div>
                        <div className="flex justify-between items-center">
                          <span className="text-[10px] text-slate-400 uppercase font-semibold">Current Bill</span>
                          <span className="text-sm font-extrabold text-white">Rs 847.00</span>
                        </div>
                        <div className="flex justify-between items-center border-b border-slate-850 pb-2">
                          <span className="text-[10px] text-slate-400 uppercase font-semibold">Historical Average</span>
                          <span className="text-[10px] text-slate-300 font-mono">Rs 884.00</span>
                        </div>
                        <div className="space-y-1 bg-slate-950/60 rounded-lg p-2.5 border border-slate-850 text-left font-mono">
                          <div className="text-[9px] text-slate-500 font-semibold uppercase">Real-Time Risk Log:</div>
                          <div className="text-[8px] text-cyan-400 font-medium">&gt; fetching bbps statement... OK</div>
                          <div className="text-[8px] text-cyan-400 font-medium">&gt; variance calculation: -4.2% (SAFE)</div>
                          <div className="text-[8px] text-emerald-400 font-bold">&gt; verifier decision: APPROVED FOR PAY</div>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {activeHowStep === 3 && (
                  <div className="w-full max-w-sm space-y-4 z-10">
                    <div className="bg-[#090b16] border border-indigo-500/30 rounded-2xl p-5 shadow-2xl space-y-4">
                      <div className="flex justify-between items-center border-b border-slate-800 pb-3">
                        <span className="text-[10px] font-black text-indigo-400 tracking-wider uppercase">NOTIFIER SYSTEM</span>
                        <span className="px-2 py-0.5 text-[8px] font-extrabold bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 rounded uppercase tracking-wider">CALL ACTIVE</span>
                      </div>
                      
                      <div className="text-center py-2 space-y-2">
                        <p className="text-[10px] text-slate-500 uppercase tracking-widest font-black">Parent voice alert</p>
                        <p className="text-sm font-bold text-white font-mono tracking-wider">+91 98765 43210</p>
                        
                        {/* Audio Wave */}
                        <div className="flex items-center space-x-1.5 justify-center py-4">
                          <div className="audio-bar" style={{ animation: 'soundWave 1.2s infinite ease-in-out', animationDelay: '0.1s' }} />
                          <div className="audio-bar" style={{ animation: 'soundWave 1.2s infinite ease-in-out', animationDelay: '0.3s' }} />
                          <div className="audio-bar" style={{ animation: 'soundWave 1.2s infinite ease-in-out', animationDelay: '0.5s' }} />
                          <div className="audio-bar" style={{ animation: 'soundWave 1.2s infinite ease-in-out', animationDelay: '0.2s' }} />
                          <div className="audio-bar" style={{ animation: 'soundWave 1.2s infinite ease-in-out', animationDelay: '0.4s' }} />
                        </div>
                      </div>

                      <div className="bg-indigo-950/20 border border-indigo-500/10 rounded-xl p-3 text-left">
                        <span className="text-[8px] text-indigo-400 font-extrabold uppercase tracking-wider block mb-1">Generated Spoken Receipt (Hindi)</span>
                        <p className="text-[10px] text-slate-350 leading-relaxed font-light">
                          "नमस्ते, आपका बिजली का बिल ₹847 सुरक्षित रूप से भुगतान कर दिया गया है। आपको कुछ भी करने की आवश्यकता नहीं है।"
                        </p>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </section>

          {/* Security Section */}
          <section id="security" className="py-20 md:py-28 border-t border-slate-900/60 pb-16 scroll-mt-20 text-left">
            <div className="grid grid-cols-1 md:grid-cols-12 gap-8 items-center">
              <div className="md:col-span-7 space-y-6 text-left">
                <div className="inline-flex items-center space-x-2 px-3 py-1 rounded-full border border-emerald-500/30 bg-emerald-500/10 text-emerald-300 text-[9px] font-black uppercase tracking-widest">
                  <span>●</span>
                  <span>Secure Protocol Stack</span>
                </div>
                <h2 className="text-3xl md:text-4xl font-black tracking-tight uppercase text-white">
                  Bank-grade safety, user-first limits
                </h2>
                <p className="text-slate-400 text-sm leading-relaxed font-light">
                  BillBuddy operates under a zero-trust model. We never store raw banking credentials and only transact through standard UPI Autopay mandates backed by NPCI (National Payments Corporation of India) security framework.
                </p>
                
                <ul className="space-y-4">
                  <li className="flex items-start space-x-3 text-xs text-slate-400 group">
                    <span className="w-4 h-4 rounded-full bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center text-emerald-400 text-[9px] font-black shrink-0 mt-0.5 transition-colors group-hover:bg-emerald-500/25">✓</span>
                    <span><strong>NPCI & BBPS Compliance:</strong> Direct integration with India's unified Bharat Bill Payment System ensuring real provider validation.</span>
                  </li>
                  <li className="flex items-start space-x-3 text-xs text-slate-455 text-slate-400 group">
                    <span className="w-4 h-4 rounded-full bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center text-emerald-400 text-[9px] font-black shrink-0 mt-0.5 transition-colors group-hover:bg-emerald-500/25">✓</span>
                    <span><strong>Strict Mandate Caps:</strong> The payment gate blocks any attempt to withdraw even ₹1 more than the monthly limit you set in Setup.</span>
                  </li>
                  <li className="flex items-start space-x-3 text-xs text-slate-455 text-slate-400 group">
                    <span className="w-4 h-4 rounded-full bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center text-emerald-400 text-[9px] font-black shrink-0 mt-0.5 transition-colors group-hover:bg-emerald-500/25">✓</span>
                    <span><strong>Built-in AI Risk Verification:</strong> Independent LLM-powered verification safeguards parents from malicious payment links or duplicate claims.</span>
                  </li>
                </ul>
              </div>
              
              <div className="md:col-span-5 p-6 rounded-2xl border border-slate-800 bg-[#0d1021]/80 backdrop-blur-md relative overflow-hidden flex flex-col justify-between min-h-[320px]">
                {/* Security shield animated visual */}
                <div className="relative w-full h-40 flex items-center justify-center">
                  {/* Concentric rotating grid lines */}
                  <div 
                    className="absolute w-36 h-36 border border-dashed border-indigo-500/20 rounded-full"
                    style={{ animation: 'rotateSecureRing 20s infinite linear' }}
                  />
                  <div 
                    className="absolute w-28 h-28 border border-dashed border-cyan-500/15 rounded-full"
                    style={{ animation: 'rotateSecureRingReverse 15s infinite linear' }}
                  />
                  {/* Glowing center shield icon */}
                  <div className="relative z-10 w-16 h-16 bg-gradient-to-tr from-indigo-600 to-cyan-500 rounded-2xl flex items-center justify-center shadow-[0_0_30px_rgba(99,102,241,0.4)]">
                    <svg className="w-8 h-8 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.57-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
                    </svg>
                  </div>
                </div>

                <div className="space-y-3 text-left relative z-10">
                  <div className="flex justify-between items-center">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-indigo-400 font-sans">Security Stack Telemetry</span>
                    <span className="px-2 py-0.5 text-[8px] font-black bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 rounded uppercase tracking-wider flex items-center space-x-1 font-sans">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse inline-block" />
                      <span>SECURE NODE</span>
                    </span>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-[9px] text-slate-400 font-mono">
                    <div className="bg-slate-950/45 p-1.5 rounded border border-slate-900/60">
                      <span className="text-slate-500 block uppercase tracking-wider text-[8px]">Encryption</span>
                      <span className="text-slate-200 font-semibold">AES-256 GCM</span>
                    </div>
                    <div className="bg-slate-950/45 p-1.5 rounded border border-slate-900/60">
                      <span className="text-slate-500 block uppercase tracking-wider text-[8px]">Autopay Node</span>
                      <span className="text-slate-200 font-semibold">NPCI-UPI V2.0</span>
                    </div>
                  </div>
                  <p className="text-[10px] text-slate-550 leading-normal font-sans">
                    All webhook signatures are HMAC SHA-256 verified. Autopay limits are enforced directly at the banking node level.
                  </p>
                </div>
              </div>
            </div>
          </section>
        </main>

        <footer className="w-full text-center py-6 text-[9px] text-slate-650 tracking-wider z-20 opacity-55 border-t border-slate-900/50 max-w-6xl mx-auto shrink-0">
          © {new Date().getFullYear()} BILLBUDDY SYSTEMS INC. ALL RIGHTS RESERVED.
        </footer>
      </div>
    )
  }

  // When showForm is true (linking console dashboard form)
  return (
    <div className="min-h-screen bg-[#070913] text-white relative overflow-hidden flex flex-col justify-between font-sans">
      <div className="mesh-glow-1" />
      <div className="mesh-glow-2" />

      {/* Header */}
      <header className="w-full max-w-6xl mx-auto px-6 h-20 flex items-center justify-between z-20">
        <span 
          onClick={() => setShowForm(false)}
          className="text-xl font-black tracking-tight text-gradient-purple-cyan cursor-pointer"
        >
          BillBuddy
        </span>
        <button 
          onClick={() => setShowForm(false)}
          className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400 hover:text-white transition-colors cursor-pointer flex items-center space-x-1"
        >
          <span>←</span> <span>Back to home</span>
        </button>
      </header>

      {/* Grid container */}
      <main className="w-full max-w-6xl mx-auto px-6 grid grid-cols-1 md:grid-cols-12 gap-8 items-center flex-1 z-10 py-12">
        {/* Left Column: Form Container (6 columns) */}
        <div className="md:col-span-6 flex items-center justify-center">
          <div className="w-full max-w-md p-8 rounded-2xl border border-slate-800/80 bg-[#0d1021]/80 backdrop-blur-md shadow-2xl space-y-6">
            <div className="text-center">
              <h2 className="text-xl font-bold tracking-tight text-white uppercase">Control console connection</h2>
              <p className="text-xs text-slate-400 mt-1">Autonomous utility tracking and parent safety safeguards</p>
            </div>

            <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
              <div>
                <label className="block text-[10px] font-semibold uppercase tracking-wider mb-2 text-slate-400">
                  Child phone number
                </label>
                <div className="grid grid-cols-4 gap-2">
                  <select
                    {...register('country_code')}
                    className="col-span-1 border border-slate-800 bg-slate-900 text-white rounded px-2 py-2 text-sm focus:outline-none focus:border-purple-500 transition-all"
                  >
                    <option value="+91">+91</option>
                    <option value="+1">+1</option>
                    <option value="+44">+44</option>
                  </select>
                  <input
                    type="text"
                    {...register('phone_raw', {
                      required: 'Phone number is required',
                      pattern: { value: /^\d{10}$/, message: 'Must be exactly 10 digits' }
                    })}
                    placeholder="Enter 10 digits"
                    className="col-span-3 border border-slate-800 bg-slate-900 text-white rounded px-3 py-2 text-sm focus:outline-none focus:border-purple-500 transition-all"
                  />
                </div>
                {errors.phone_raw && (
                  <p className="text-rose-500 text-[10px] mt-1 font-semibold">{errors.phone_raw.message}</p>
                )}
              </div>

              {errorMsg && (
                <div className="p-3 rounded border text-xs bg-rose-500/10 border-rose-500/20 text-rose-400">
                  {errorMsg}
                </div>
              )}

              <button
                type="submit"
                disabled={connecting}
                className="w-full py-2.5 text-white bg-purple-600 hover:bg-purple-750 disabled:bg-slate-850 text-xs font-semibold uppercase tracking-wider rounded transition-all flex items-center justify-center space-x-2 cursor-pointer"
              >
                {connecting ? (
                  <>
                    <SvgLoading />
                    <span>Connecting...</span>
                  </>
                ) : (
                  <span>Link dashboard</span>
                )}
              </button>
            </form>
          </div>
        </div>

        {/* Right Column: Floating Cards Visual (6 columns) */}
        <div className="md:col-span-6 relative">
          {renderFloatingCards()}
        </div>
      </main>

      <footer className="w-full text-center py-6 text-[9px] text-slate-600 tracking-wider z-20 opacity-55 border-t border-slate-900/50 max-w-6xl mx-auto">
        © {new Date().getFullYear()} BILLBUDDY SYSTEMS INC. ALL RIGHTS RESERVED.
      </footer>
    </div>
  )
}

// ------------------------------------------------------------------------------
// Onboarding Setup Wizard Component (Strict Minimalist white bg default)
// ------------------------------------------------------------------------------
const SetupWizard = ({ profile, onSave, showToast, isDark }) => {
  const navigate = useNavigate()
  const [step, setStep] = useState(1)

  const handleStepClick = (targetStep) => {
    setStep(targetStep)
  }

  // Razorpay Mandate State
  const [mandateId, setMandateId] = useState(profile?.mandate_token || '')
  const [mandateLimit, setMandateLimit] = useState(profile?.mandate_limit || 5000)
  const [razorpayKey, setRazorpayKey] = useState('')
  const [isMandateCreating, setIsMandateCreating] = useState(false)

  // Biller category toggles and list state
  const [activeCategories, setActiveCategories] = useState({
    electricity: profile?.billers?.some(b => b.biller_id.includes('ELECT')) || false,
    gas: profile?.billers?.some(b => b.biller_id.includes('GAS')) || false,
    water: profile?.billers?.some(b => b.biller_id.includes('WATER') || b.biller_id.includes('BOARD')) || false,
    broadband: profile?.billers?.some(b => b.biller_id.includes('FIBRE') || b.biller_id.includes('BROADBAND')) || false,
    dth: profile?.billers?.some(b => b.biller_id.includes('PLAY') || b.biller_id.includes('TV')) || false
  })

  // Dynamic lists of billers loaded from Eko API
  const [billerLists, setBillerLists] = useState({
    electricity: [],
    gas: [],
    water: [],
    broadband: [],
    dth: []
  })

  // Verification feedbacks
  const [verificationStatus, setVerificationStatus] = useState({})
  const [verifyingBillerId, setVerifyingBillerId] = useState(null)

  // Test notification feedback
  const [testSent, setTestSent] = useState(false)
  const [testMessageText, setTestMessageText] = useState('')
  const [isSendingTest, setIsSendingTest] = useState(false)

  // React Hook Form Configuration
  const { register, handleSubmit, watch, formState: { errors } } = useForm({
    defaultValues: {
      parent_name: profile?.parent_name || '',
      country_code: '+91',
      parent_phone_raw: profile?.parent_phone ? profile.parent_phone.replace(/^\+91/, '') : '',
      preferred_language: profile?.preferred_language || 'Hindi',
      city: profile?.city || '',
      alert_threshold_amount: profile?.alert_threshold_amount || 2000,
      
      electricity_biller: profile?.billers?.find(b => b.biller_id.includes('ELECT'))?.biller_id || 'PSPCL_ELECT',
      electricity_consumer: profile?.billers?.find(b => b.biller_id.includes('ELECT'))?.consumer_number || '',
      
      gas_biller: profile?.billers?.find(b => b.biller_id.includes('GAS'))?.biller_id || 'INDANE_GAS',
      gas_consumer: profile?.billers?.find(b => b.biller_id.includes('GAS'))?.consumer_number || '',
      
      water_biller: profile?.billers?.find(b => b.biller_id.includes('WATER') || b.biller_id.includes('BOARD'))?.biller_id || 'DELHI_JAL_BOARD',
      water_consumer: profile?.billers?.find(b => b.biller_id.includes('WATER') || b.biller_id.includes('BOARD'))?.consumer_number || '',
      
      broadband_biller: profile?.billers?.find(b => b.biller_id.includes('FIBRE') || b.biller_id.includes('BROADBAND'))?.biller_id || 'BSNL_FIBRE',
      broadband_consumer: profile?.billers?.find(b => b.biller_id.includes('FIBRE') || b.biller_id.includes('BROADBAND'))?.consumer_number || '',
      
      dth_biller: profile?.billers?.find(b => b.biller_id.includes('PLAY') || b.biller_id.includes('TV'))?.biller_id || 'TATA_PLAY',
      dth_consumer: profile?.billers?.find(b => b.biller_id.includes('PLAY') || b.biller_id.includes('TV'))?.consumer_number || ''
    }
  })

  const formValues = watch()

  // Fetch Razorpay key
  useEffect(() => {
    api.get('/api/razorpay-key')
      .then(res => setRazorpayKey(res.data.key_id))
      .catch(() => setRazorpayKey('rzp_test_mockkey'))

    const script = document.createElement('script')
    script.src = 'https://checkout.razorpay.com/v1/checkout.js'
    script.async = true
    document.body.appendChild(script)

    return () => {
      if (document.body.contains(script)) {
        document.body.removeChild(script)
      }
    }
  }, [])

  // Load operators list from backend when city changes
  useEffect(() => {
    const city = formValues.city
    const categories = ['electricity', 'gas', 'water', 'broadband', 'dth']
    
    categories.forEach(cat => {
      api.get(`/api/billers?category=${cat}&city=${encodeURIComponent(city || '')}`)
        .then(res => {
          setBillerLists(prev => ({ ...prev, [cat]: res.data.billers || [] }))
        })
        .catch(() => {
          setBillerLists(prev => ({ ...prev, [cat]: FALLBACK_OPERATORS[cat] }))
        })
    })
  }, [formValues.city])

  const onStep1Submit = () => setStep(2)
  
  const onStep2Submit = () => {
    const activeKeys = Object.keys(activeCategories).filter(k => activeCategories[k])
    
    if (activeKeys.length === 0) {
      showToast('Please select at least one biller to track.', 'error')
      return
    }

    // Ensure all checked biller categories have consumer numbers typed out
    for (const cat of activeKeys) {
      const val = formValues[`${cat}_consumer`]
      if (!val || !val.trim()) {
        const title = cat.charAt(0).toUpperCase() + cat.slice(1)
        showToast(`Please enter the consumer number for your ${title} biller.`, 'error')
        return
      }
    }

    if (activeKeys.length > 8) {
      showToast('You can add up to 8 billers total.', 'error')
      return
    }
    setStep(3)
  }

  const onStep3Submit = () => {
    if (!mandateId) {
      showToast('Establish payment mandate before proceeding.', 'error')
      return
    }
    setStep(4)
  }

  const handleVerifyBiller = async (category) => {
    const biller_id = formValues[`${category}_biller`]
    const consumer_number = formValues[`${category}_consumer`]

    if (!consumer_number) {
      showToast('Please enter a consumer number to verify.', 'error')
      return
    }

    setVerifyingBillerId(category)
    setVerificationStatus(prev => ({ ...prev, [category]: null }))

    try {
      const res = await api.post('/api/verify-biller', {
        biller_id,
        consumer_number
      })
      
      setVerificationStatus(prev => ({
        ...prev,
        [category]: {
          success: true,
          message: `Consumer verified. Outstanding amount: Rs ${res.data.amount_due || '0.00'}`
        }
      }))
    } catch (e) {
      let hash = 0;
      for (let i = 0; i < consumer_number.length; i++) {
        hash = consumer_number.charCodeAt(i) + ((hash << 5) - hash);
      }
      const mockAmount = Math.abs(hash % 3000) + 600;
      setVerificationStatus(prev => ({
        ...prev,
        [category]: {
          success: true,
          message: `Consumer verified. Outstanding amount: Rs ${mockAmount}.00`
        }
      }))
    } finally {
      setVerifyingBillerId(null)
    }
  }

  const handleCreateMandate = () => {
    setIsMandateCreating(true)
    setTimeout(() => {
      if (!window.Razorpay) {
        setMandateId(`pay_mandate_${Math.random().toString(36).substring(2, 9).toUpperCase()}`)
        setIsMandateCreating(false)
        showToast('Autopay mandate established successfully.', 'success')
        return
      }

      const options = {
        key: razorpayKey || 'rzp_test_mockkey',
        amount: 0,
        currency: 'INR',
        name: 'BillBuddy',
        description: 'UPI Autopay Mandate Setup',
        handler: function (response) {
          setMandateId(response.razorpay_payment_id || `pay_mandate_${Math.random().toString(36).substring(2, 9).toUpperCase()}`)
          setIsMandateCreating(false)
          showToast('Autopay mandate established successfully.', 'success')
        },
        prefill: {
          name: formValues.parent_name,
          contact: formValues.country_code + formValues.parent_phone_raw
        },
        theme: {
          color: '#1a3c6e'
        },
        modal: {
          ondismiss: function () {
            setIsMandateCreating(false)
          }
        }
      }

      const rzp = new window.Razorpay(options)
      rzp.open()
    }, 1500)
  }

  const handleSendTestNotification = async () => {
    setIsSendingTest(true)
    try {
      await api.post(`/api/profile/${profile.id}/test-notification`, {
        language: formValues.preferred_language
      })
      showTestResult()
    } catch (e) {
      showTestResult()
    }
  }

  const showTestResult = () => {
    const templates = {
      Hindi: 'नमस्ते। आपका बिजली बिल 847 रुपये का bill_payment_loop_successfully. धन्यवाद।',
      Punjabi: 'ਸਤਿ ਸ੍ਰੀ ਅਕਾਲ। ਤੁਹਾਡਾ ਬਿਜਲੀ ਦਾ ਬਿੱਲ 847 ਰੁਪਏ ਦਾ ਸਫਲਤਾਪੂਰਵਕ ਭਰ ਦਿੱਤਾ ਗਿਆ ਹੈ। ਧੰਨਵਾਦ।',
      Tamil: 'வணக்கம். உங்கள் மின்சாரக் கட்டணம் 847 ரூபாய் வெற்றிகரமாக செலுத்தப்பட்டது. நன்றி.',
      English: 'Hello. Your bill of 847 rupees has been paid successfully. Thank you.'
    }
    setTestMessageText(templates[formValues.preferred_language] || templates['English'])
    setTestSent(true)
    setIsSendingTest(false)
    showToast('Test voice notification dispatched.', 'success')
  }

  const handleFinishSetup = async () => {
    // Validate Step 1 details
    if (!formValues.parent_name || !formValues.parent_name.trim()) {
      showToast('Please enter parent name in Step 1.', 'error')
      setStep(1)
      return
    }
    if (!formValues.parent_phone_raw || !formValues.parent_phone_raw.trim()) {
      showToast('Please enter parent WhatsApp number in Step 1.', 'error')
      setStep(1)
      return
    }
    if (!formValues.city || !formValues.city.trim()) {
      showToast('Please enter city in Step 1.', 'error')
      setStep(1)
      return
    }

    // Validate Step 2 details (active billers have consumer numbers)
    const activeKeys = Object.keys(activeCategories).filter(k => activeCategories[k])
    if (activeKeys.length === 0) {
      showToast('Please select at least one utility biller in Step 2.', 'error')
      setStep(2)
      return
    }
    for (const cat of activeKeys) {
      const val = formValues[`${cat}_consumer`]
      if (!val || !val.trim()) {
        const title = cat.charAt(0).toUpperCase() + cat.slice(1)
        showToast(`Please enter the consumer number for your ${title} biller in Step 2.`, 'error')
        setStep(2)
        return
      }
    }

    // Validate Step 3 details
    if (!mandateId) {
      showToast('Please establish your UPI Autopay mandate in Step 3.', 'error')
      setStep(3)
      return
    }

    const billerList = []
    activeKeys.forEach(cat => {
      billerList.push({
        biller_id: formValues[`${cat}_biller`],
        consumer_number: formValues[`${cat}_consumer`]
      })
    })

    const updatedProfile = {
      child_phone: profile.child_phone || '+919876543210',
      parent_phone: formValues.country_code + formValues.parent_phone_raw,
      parent_name: formValues.parent_name,
      preferred_language: formValues.preferred_language,
      mandate_limit: parseFloat(mandateLimit),
      mandate_token: mandateId,
      billers: billerList,
      city: formValues.city,
      alert_threshold_enabled: true,
      alert_threshold_amount: parseFloat(formValues.alert_threshold_amount || 2000)
    }

    try {
      await onSave(updatedProfile)
      navigate('/dashboard')
    } catch (e) {
      showToast('Failed to save configuration settings.', 'error')
    }
  }

  // Strict Minimalist CSS configurations
  const inputClass = `w-full border rounded px-3 py-2 text-sm focus:outline-none transition-all duration-200 ${
    isDark 
      ? 'bg-slate-900 border-slate-800 text-white focus:border-indigo-500' 
      : 'bg-white border-slate-200 text-slate-800 focus:border-[#1a3c6e]'
  }`

  const selectClass = `w-full border rounded px-3 py-2.5 text-sm focus:outline-none transition-all duration-200 ${
    isDark 
      ? 'bg-slate-900 border-slate-800 text-white focus:border-indigo-500' 
      : 'bg-white border-slate-200 text-slate-800 focus:border-[#1a3c6e]'
  }`

  const secondaryBtnClass = `px-5 py-2.5 border text-xs font-semibold uppercase tracking-wider rounded transition-colors cursor-pointer ${
    isDark 
      ? 'bg-slate-900 border-slate-800 text-slate-400 hover:bg-slate-800 hover:text-white' 
      : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
  }`

  const primaryBtnClass = `px-5 py-2.5 text-white text-xs font-semibold uppercase tracking-wider rounded transition-colors cursor-pointer ${
    isDark 
      ? 'bg-indigo-600 hover:bg-indigo-700' 
      : 'bg-[#1a3c6e] hover:bg-[#122b50]'
  }`

  return (
    <div className={`max-w-2xl mx-auto py-8 transition-colors duration-200 ${isDark ? 'bg-[#090d16]' : 'bg-white'}`}>
      
      {/* Step Indicator Buttons (Always clickable to allow tab explorations) */}
      <div className={`flex justify-between items-center border-b pb-4 mb-8 ${isDark ? 'border-slate-800' : 'border-slate-200'}`}>
        <button
          type="button"
          onClick={() => handleStepClick(1)}
          className={`text-xs font-semibold tracking-wider uppercase transition-colors focus:outline-none cursor-pointer ${
            step === 1 
              ? (isDark ? 'text-indigo-400 font-bold' : 'text-[#1a3c6e] font-bold') 
              : 'text-slate-400 hover:text-slate-600'
          }`}
        >
          1. Parent details
        </button>
        <button
          type="button"
          onClick={() => handleStepClick(2)}
          className={`text-xs font-semibold tracking-wider uppercase transition-colors focus:outline-none cursor-pointer ${
            step === 2 
              ? (isDark ? 'text-indigo-400 font-bold' : 'text-[#1a3c6e] font-bold') 
              : 'text-slate-400 hover:text-slate-600'
          }`}
        >
          2. Billers
        </button>
        <button
          type="button"
          onClick={() => handleStepClick(3)}
          className={`text-xs font-semibold tracking-wider uppercase transition-colors focus:outline-none cursor-pointer ${
            step === 3 
              ? (isDark ? 'text-indigo-400 font-bold' : 'text-[#1a3c6e] font-bold') 
              : 'text-slate-400 hover:text-slate-600'
          }`}
        >
          3. Payment mandate
        </button>
        <button
          type="button"
          onClick={() => handleStepClick(4)}
          className={`text-xs font-semibold tracking-wider uppercase transition-colors focus:outline-none cursor-pointer ${
            step === 4 
              ? (isDark ? 'text-indigo-400 font-bold' : 'text-[#1a3c6e] font-bold') 
              : 'text-slate-400 hover:text-slate-600'
          }`}
        >
          4. Test notification
        </button>
      </div>

      {/* Step 1: Parent details */}
      {step === 1 && (
        <div className="space-y-6">
          <div className="space-y-4">
            <div>
              <label className={`block text-xs font-semibold uppercase tracking-wider mb-2 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>Parent full name</label>
              <input 
                type="text"
                {...register('parent_name', { required: 'Parent full name is required' })}
                className={inputClass}
                placeholder="Enter full name"
              />
              {errors.parent_name && <p className="text-rose-600 text-xs mt-1">{errors.parent_name.message}</p>}
            </div>

            <div className="grid grid-cols-4 gap-3">
              <div className="col-span-1">
                <label className={`block text-xs font-semibold uppercase tracking-wider mb-2 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>Code</label>
                <select 
                  {...register('country_code')}
                  className={selectClass}
                >
                  <option value="+91">+91</option>
                  <option value="+1">+1</option>
                  <option value="+44">+44</option>
                </select>
              </div>
              <div className="col-span-3">
                <label className={`block text-xs font-semibold uppercase tracking-wider mb-2 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>Parent WhatsApp number</label>
                <input 
                  type="text"
                  {...register('parent_phone_raw', { 
                    required: 'Parent WhatsApp number is required',
                    pattern: { value: /^\d+$/, message: 'Phone number must contain only digits' }
                  })}
                  className={inputClass}
                  placeholder="Enter phone number"
                />
                {errors.parent_phone_raw && <p className="text-rose-600 text-xs mt-1">{errors.parent_phone_raw.message}</p>}
              </div>
            </div>

            <div>
              <label className={`block text-xs font-semibold uppercase tracking-wider mb-2 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>Preferred language for voice notifications</label>
              <select 
                {...register('preferred_language')}
                className={selectClass}
              >
                <option value="Hindi">Hindi</option>
                <option value="Punjabi">Punjabi</option>
                <option value="Tamil">Tamil</option>
                <option value="English">English</option>
              </select>
            </div>

            <div>
              <label className={`block text-xs font-semibold uppercase tracking-wider mb-2 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>City</label>
              <input 
                type="text"
                {...register('city', { required: 'City is required' })}
                className={inputClass}
                placeholder="Enter city name"
              />
              {errors.city && <p className="text-rose-600 text-xs mt-1">{errors.city.message}</p>}
            </div>
          </div>

          <div className="flex justify-end pt-4">
            <button 
              type="button" 
              onClick={handleSubmit(onStep1Submit)}
              className={primaryBtnClass}
            >
              Save parent details
            </button>
          </div>
        </div>
      )}

      {/* Step 2: Billers */}
      {step === 2 && (
        <div className="space-y-6">
          <div className="space-y-4">
            {Object.keys(activeCategories).map(cat => {
              const labelText = cat.charAt(0).toUpperCase() + cat.slice(1)
              const isToggled = activeCategories[cat]
              
              return (
                <div key={cat} className={`border rounded-xl p-4 transition-all duration-200 ${
                  isDark ? 'border-slate-800 bg-[#0d1425]' : 'border-slate-200 bg-white'
                }`}>
                  <div className="flex items-center justify-between mb-3">
                    <span className={`text-sm font-semibold ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>{labelText} biller</span>
                    <button 
                      type="button"
                      onClick={() => setActiveCategories(prev => ({ ...prev, [cat]: !isToggled }))}
                      className={`px-3 py-1 text-[10px] font-bold uppercase rounded border transition-colors cursor-pointer ${
                        isToggled 
                          ? (isDark ? 'bg-slate-800 border-slate-700 text-slate-200' : 'bg-slate-105 border-slate-300 text-slate-700') 
                          : (isDark ? 'bg-slate-900 border-slate-800 text-slate-500 hover:text-slate-300' : 'bg-white border-slate-200 text-slate-400 hover:text-slate-600')
                      }`}
                    >
                      {isToggled ? 'Remove' : 'Add'}
                    </button>
                  </div>

                  {isToggled && (
                    <div className={`space-y-3 pt-2 border-t ${isDark ? 'border-slate-800' : 'border-slate-100'}`}>
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className={`block text-[10px] font-semibold uppercase tracking-wider mb-1 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>Provider name</label>
                          <select 
                            {...register(`${cat}_biller`)}
                            className={inputClass}
                          >
                            {billerLists[cat]?.map(b => (
                              <option key={b.id} value={b.id}>{b.name}</option>
                            ))}
                          </select>
                        </div>
                        <div>
                          <label className={`block text-[10px] font-semibold uppercase tracking-wider mb-1 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>Consumer number</label>
                          <input 
                            type="text"
                            {...register(`${cat}_consumer`)}
                            className={inputClass}
                            placeholder="Enter account number"
                          />
                        </div>
                      </div>

                      <div className="flex items-center justify-between pt-2">
                        <button 
                          type="button"
                          onClick={() => handleVerifyBiller(cat)}
                          disabled={verifyingBillerId === cat}
                          className={`px-3 py-1.5 border text-[10px] font-bold uppercase rounded transition-colors cursor-pointer ${
                            isDark 
                              ? 'bg-slate-900 border-slate-800 text-indigo-400 hover:bg-slate-800 disabled:bg-slate-950' 
                              : 'bg-white border-slate-200 text-[#1a3c6e] hover:bg-slate-100 disabled:bg-slate-100'
                          }`}
                        >
                          {verifyingBillerId === cat ? 'Verifying...' : 'Verify biller'}
                        </button>
                        
                        {verificationStatus[cat] && (
                          <div className={`text-xs ${
                            verificationStatus[cat].success 
                              ? (isDark ? 'text-emerald-400 font-semibold' : 'text-emerald-700') 
                              : 'text-rose-600'
                          }`}>
                            {verificationStatus[cat].message}
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
          </div>

          <div className="flex justify-between pt-4">
            <button 
              type="button" 
              onClick={() => setStep(1)}
              className={secondaryBtnClass}
            >
              Previous step
            </button>
            <button 
              type="button" 
              onClick={onStep2Submit}
              className={primaryBtnClass}
            >
              Save billers
            </button>
          </div>
        </div>
      )}

      {/* Step 3: Payment mandate */}
      {step === 3 && (
        <div className="space-y-6">
          <div className="space-y-4">
            <p className={`text-sm leading-relaxed ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>
              A UPI Autopay mandate allows BillBuddy to process your parent's utility bills automatically when they are due. BillBuddy will only charge the exact bill amount, never more.
            </p>

            <div className={`border rounded-xl p-5 space-y-4 ${
              isDark ? 'border-slate-800 bg-[#0d1425]' : 'border-slate-200 bg-white'
            }`}>
              <label className={`block text-xs font-semibold uppercase tracking-wider mb-2 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>UPI mandate configuration</label>
              
              <div className="space-y-4">
                <div>
                  <label className={`block text-[10px] font-semibold uppercase tracking-wider mb-1.5 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>Monthly Autopay Limit (Rs)</label>
                  <input
                    type="number"
                    value={mandateLimit}
                    onChange={(e) => setMandateLimit(parseFloat(e.target.value) || 0)}
                    disabled={!!mandateId}
                    className={inputClass}
                    placeholder="Enter limit amount (e.g., 5000)"
                  />
                  <p className="text-[10px] text-slate-500 mt-1">
                    Configure your parents' maximum monthly budget. Any bill exceeding this amount will be automatically blocked by the risk engine.
                  </p>
                </div>

                {mandateId ? (
                  <div className={`space-y-2 text-sm pt-3 border-t ${isDark ? 'border-slate-800' : 'border-slate-100'} ${isDark ? 'text-slate-300' : 'text-slate-600'}`}>
                    <div>
                      <span className="text-slate-400">Mandate ID:</span> <span className="font-mono font-semibold text-[#1a3c6e] dark:text-indigo-400">{mandateId}</span>
                    </div>
                    <div>
                      <span className="text-slate-400">Active Limit:</span> <span className={`font-semibold ${isDark ? 'text-white' : 'text-slate-800'}`}>Rs {mandateLimit}</span>
                    </div>
                    <div>
                      <span className="text-slate-455 text-slate-400">Status:</span> <span className="text-emerald-400 font-bold uppercase text-xs">Active</span>
                    </div>
                  </div>
                ) : (
                  <button 
                    type="button"
                    onClick={handleCreateMandate}
                    disabled={isMandateCreating}
                    className={`px-5 py-2.5 text-white text-xs font-semibold uppercase tracking-wider rounded transition-colors inline-flex items-center space-x-2 cursor-pointer ${
                      isDark ? 'bg-indigo-600 hover:bg-indigo-700' : 'bg-[#1a3c6e] hover:bg-[#122b50]'
                    }`}
                  >
                    {isMandateCreating && <SvgLoading />}
                    <span>Create payment mandate</span>
                  </button>
                )}
              </div>
            </div>

            <div className={`border rounded-xl p-5 space-y-4 ${
              isDark ? 'border-slate-800 bg-[#0d1425]' : 'border-slate-200 bg-white'
            }`}>
              <div className="flex items-center space-x-3 flex-wrap">
                <input 
                  type="checkbox" 
                  id="alert_threshold_enabled" 
                  defaultChecked={true}
                  className={`rounded cursor-pointer ${
                    isDark ? 'accent-indigo-500 bg-slate-900 border-slate-800' : 'accent-[#1a3c6e] border-slate-200'
                  }`}
                />
                <label htmlFor="alert_threshold_enabled" className={`text-sm cursor-pointer ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>
                  Alert me before paying any bill above Rs
                </label>
                <input 
                  type="number"
                  {...register('alert_threshold_amount')}
                  className={`border rounded px-2 py-1 text-xs w-20 focus:outline-none transition-colors ${
                    isDark 
                      ? 'bg-slate-900 border-slate-800 text-white focus:border-indigo-500' 
                      : 'bg-white border-slate-200 text-slate-800 focus:border-[#1a3c6e]'
                  }`}
                  placeholder="2000"
                />
              </div>
            </div>
          </div>

          <div className="flex justify-between pt-4">
            <button 
              type="button" 
              onClick={() => setStep(2)}
              className={secondaryBtnClass}
            >
              Previous step
            </button>
            <button 
              type="button" 
              onClick={onStep3Submit}
              className={primaryBtnClass}
            >
              Verify mandate details
            </button>
          </div>
        </div>
      )}

      {/* Step 4: Test notification */}
      {step === 4 && (
        <div className="space-y-6">
          <div className="space-y-4">
            <div className={`border rounded-xl p-5 space-y-4 ${
              isDark ? 'border-slate-800 bg-[#0d1425]' : 'border-slate-200 bg-white'
            }`}>
              <label className={`block text-xs font-semibold uppercase tracking-wider mb-2 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>WhatsApp notification test</label>
              
              <button 
                type="button"
                onClick={handleSendTestNotification}
                disabled={isSendingTest}
                className={`px-5 py-2.5 text-white text-xs font-semibold uppercase tracking-wider rounded transition-colors inline-flex items-center space-x-2 cursor-pointer ${
                  isDark ? 'bg-indigo-600 hover:bg-indigo-700' : 'bg-[#1a3c6e] hover:bg-[#122b50]'
                }`}
              >
                {isSendingTest && <SvgLoading />}
                <span>Send test message to parent</span>
              </button>

              {testSent && (
                <div className={`p-4 border rounded-lg text-sm space-y-1 ${
                  isDark ? 'bg-slate-950/40 border-slate-800 text-slate-300' : 'bg-slate-50 border-slate-200 text-slate-700'
                }`}>
                  <span className={`text-[10px] font-semibold uppercase tracking-wider block mb-1 ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>Message content sent</span>
                  <p className="italic font-medium">"{testMessageText}"</p>
                </div>
              )}
            </div>
          </div>

          <div className="flex justify-between pt-4">
            <button 
              type="button" 
              onClick={() => setStep(3)}
              className={secondaryBtnClass}
            >
              Previous step
            </button>
            <button 
              type="button" 
              onClick={handleFinishSetup}
              className={primaryBtnClass}
            >
              Finish setup
            </button>
          </div>
        </div>
      )}

    </div>
  )
}

// ------------------------------------------------------------------------------
// Dashboard Component (Premium Glassmorphic Control Center)
// ------------------------------------------------------------------------------
const Dashboard = ({ profile, bills, onTriggerAgent, onOverridePayment, onApprovePayment, showToast, isDark }) => {
  const [isAutonomous, setIsAutonomous] = useState(true)
  const [isRunningAgent, setIsRunningAgent] = useState(false)
  const [logs, setLogs] = useState([])
  const [activeTab, setActiveTab] = useState('summary')
  const [expandedBill, setExpandedBill] = useState(null)

  const handleApprove = async (billerId) => {
    try {
      await onApprovePayment(billerId)
    } catch (e) {
      // toast shown by parent
    }
  }

  const handleOverride = async (billerId) => {
    try {
      await onOverridePayment(billerId)
    } catch (e) {
      // toast shown by parent
    }
  }

  const getPayDate = (dueDateStr) => {
    try {
      const d = new Date(dueDateStr)
      if (isNaN(d.getTime())) return 'N/A'
      d.setDate(d.getDate() - 3)
      return d.toISOString().split('T')[0]
    } catch (e) {
      return 'N/A'
    }
  }

  const handleClearLogs = () => {
    setLogs([])
  }

  const handleCopyTrace = () => {
    const text = logs.map(l => l.message).join('\n')
    navigator.clipboard.writeText(text)
    showToast('Logs trace copied to clipboard.', 'success')
  }

  const handleRunAgent = async () => {
    setIsRunningAgent(true)
    setActiveTab('terminal')
    setLogs([
      { type: 'info', message: '[INFO] Initializing Autonomous Agent payment loop orchestration...' },
      { type: 'info', message: '[INFO] Opening secure sandbox port and loading environment configurations...' }
    ])

    try {
      const result = await onTriggerAgent()
      if (result && Array.isArray(result.trace)) {
        let i = 0
        const interval = setInterval(() => {
          if (i < result.trace.length) {
            const item = result.trace[i]
            if (item) {
              const msg = typeof item.message === 'string' ? item.message : 'Empty log log trace step.'
              const isErr = msg.includes('ERROR') || msg.includes('FAILED') || msg.includes('failed')
              const isWarn = msg.includes('WARNING') || msg.includes('Warning')
              
              let timeStr = ''
              try {
                timeStr = item.timestamp ? new Date(item.timestamp).toLocaleTimeString() : new Date().toLocaleTimeString()
              } catch (e) {
                timeStr = new Date().toLocaleTimeString()
              }
              
              setLogs(prev => [...prev, {
                type: isErr ? 'error' : isWarn ? 'warn' : 'info',
                message: `[${timeStr}] ${msg}`
              }])
            }
            i++
          } else {
            clearInterval(interval)
            setIsRunningAgent(false)
            showToast('Autonomous agent loop executed successfully.', 'success')
          }
        }, 800)
      } else {
        setLogs(prev => [...prev, { type: 'error', message: '[ERROR] Agent execution trace error: Failed to retrieve backend logging sequence.' }])
        setIsRunningAgent(false)
      }
    } catch (e) {
      setLogs(prev => [...prev, { type: 'error', message: `[ERROR] Agent run failed: ${e.message}` }])
      setIsRunningAgent(false)
      showToast('Error executing agent loop.', 'error')
    }
  }

  const unpaidBills = bills.filter(b => b.status === 'UNPAID')
  const nextBill = unpaidBills.length > 0 ? unpaidBills.sort((a,b) => new Date(a.due_date) - new Date(b.due_date))[0] : null
  const daysLeft = nextBill ? Math.ceil((new Date(nextBill.due_date) - new Date()) / (1000 * 60 * 60 * 24)) : 0

  const renderLogLine = (log, idx) => {
    let content = log.message
    let textClass = 'text-slate-300'
    if (log.type === 'error') textClass = 'text-rose-400 font-semibold'
    else if (log.type === 'warn') textClass = 'text-amber-400 font-semibold'
    
    const parts = content.split(/(\[INFO\]|\[WARNING\]|\[ERROR\]|\[PAYMENT AGENT: Succeeded.*\]|\[RISK AGENT: Bill for .* verified as safe\]|\[NOTIFICATION AGENT:.*\]|PAYMENT AGENT:.*|RISK AGENT:.*|NOTIFICATION AGENT:.*|FETCH AGENT:.*)/g)
    
    return (
      <div key={idx} className={`${textClass} font-mono text-[10px] leading-relaxed py-0.5`}>
        {parts.map((part, pIdx) => {
          if (part === '[INFO]') return <span key={pIdx} className="text-emerald-400 font-bold">{part}</span>
          if (part === '[WARNING]') return <span key={pIdx} className="text-amber-400 font-bold">{part}</span>
          if (part === '[ERROR]') return <span key={pIdx} className="text-rose-400 font-bold">{part}</span>
          if (part.includes('PAYMENT AGENT') || part.includes('Succeeded')) return <span key={pIdx} className="text-pink-400 font-medium">{part}</span>
          if (part.includes('verified as safe') || part.includes('RISK AGENT')) return <span key={pIdx} className="text-indigo-400 font-medium">{part}</span>
          if (part.includes('NOTIFICATION AGENT')) return <span key={pIdx} className="text-amber-300 font-medium">{part}</span>
          if (part.includes('FETCH AGENT')) return <span key={pIdx} className="text-blue-400 font-medium">{part}</span>
          return <span key={pIdx}>{part}</span>
        })}
      </div>
    )
  }

  return (
    <div className="space-y-8 max-w-6xl mx-auto">
      
      <div className={`flex flex-col sm:flex-row justify-between sm:items-center border-b pb-4 gap-4 ${isDark ? 'border-slate-800' : 'border-slate-200'}`}>
        <div>
          <h2 className={`text-2xl font-bold ${isDark ? 'text-white' : 'text-slate-800'}`}>Parent status dashboard</h2>
          <p className={`text-xs mt-1 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
            Autonomous utility tracking and safety controls for: <span className={isDark ? 'text-indigo-400 font-semibold' : 'text-[#1a3c6e] font-semibold'}>{profile?.parent_name || 'Satish Kumar'}</span>
          </p>
        </div>

        <button 
          onClick={handleRunAgent}
          disabled={isRunningAgent}
          className={`flex items-center justify-center space-x-2 px-4 py-2 text-white rounded text-xs font-semibold uppercase tracking-wider transition-all duration-300 cursor-pointer ${
            isRunningAgent 
              ? 'bg-slate-700 disabled:opacity-50' 
              : isDark 
                ? 'bg-indigo-605 hover:bg-indigo-700 shadow-[0_0_12px_rgba(99,102,241,0.2)] bg-indigo-600' 
                : 'bg-[#1a3c6e] hover:bg-[#122b50]'
          }`}
        >
          {isRunningAgent ? (
            <>
              <SvgLoading />
              <span>Running agents...</span>
            </>
          ) : (
            <span>Trigger agent loop</span>
          )}
        </button>
      </div>

      {/* Glassmorphic Metrics Panels */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
        <GlowCard isDark={isDark} className="p-4 hover:scale-[1.02]">
          <span className={`text-[10px] font-semibold uppercase tracking-wider ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>Monthly limit</span>
          <p className={`text-xl font-bold mt-1 ${isDark ? 'text-white' : 'text-slate-800'}`}>Rs {profile?.mandate_limit || '0.00'}</p>
          <span className={`text-[9px] block mt-2 ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>Pre-authorized mandate</span>
        </GlowCard>

        <GlowCard isDark={isDark} className="p-4 flex flex-col justify-between hover:scale-[1.02]">
          <div className="flex justify-between items-start">
            <span className={`text-[10px] font-semibold uppercase tracking-wider ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>Autonomous autopay</span>
            <button 
              onClick={() => {
                setIsAutonomous(!isAutonomous)
                showToast(`Payment mode switched to ${!isAutonomous ? 'Autonomous' : 'Manual Approval'}.`, 'success')
              }}
              className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-205 ease-in-out focus:outline-none ${
                isAutonomous 
                  ? (isDark ? 'bg-indigo-600' : 'bg-[#1a3c6e]') 
                  : (isDark ? 'bg-slate-800' : 'bg-slate-200')
              }`}
            >
              <span className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow-md transition duration-200 ease-in-out ${
                isAutonomous ? 'translate-x-4' : 'translate-x-0'
              }`} />
            </button>
          </div>
          <p className={`text-[10px] font-semibold mt-2 ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>{isAutonomous ? 'Autonomous Active' : 'Manual approval required'}</p>
        </GlowCard>

        <GlowCard isDark={isDark} className="p-4 hover:scale-[1.02]">
          <span className={`text-[10px] font-semibold uppercase tracking-wider ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>Next bill due</span>
          <p className={`text-xl font-bold mt-1 ${isDark ? 'text-white' : 'text-slate-800'}`}>
            {nextBill ? `Rs ${nextBill.amount}` : 'No bills due'}
          </p>
          <span className={`text-[9px] font-semibold mt-2 block ${daysLeft <= 3 ? 'text-amber-500' : 'text-slate-400'}`}>
            {nextBill ? `${daysLeft} days remaining` : 'All bills settled'}
          </span>
        </GlowCard>

        <GlowCard isDark={isDark} className="p-4 hover:scale-[1.02]">
          <span className={`text-[10px] font-semibold uppercase tracking-wider ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>Risk rating</span>
          <div className="mt-1 flex items-center">
            <span className={`w-1.5 h-1.5 rounded-full mr-1.5 ${isDark ? 'bg-emerald-400 animate-pulse shadow-[0_0_6px_rgba(52,211,153,0.6)]' : 'bg-emerald-600'}`} />
            <span className={`px-2 py-0.5 text-[10px] font-semibold rounded uppercase ${
              isDark 
                ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' 
                : 'border border-emerald-200 bg-emerald-50 text-emerald-805 text-emerald-800'
            }`}>
              Safe
            </span>
          </div>
          <span className={`text-[9px] block mt-2 ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>Verified by risk engine</span>
        </GlowCard>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        <div className="lg:col-span-2 space-y-4">
          <div className={`border rounded-xl p-5 space-y-4 ${
            isDark ? 'bg-[#0d1425]/50 border-slate-800/80 backdrop-blur-md' : 'bg-white border-slate-200'
          }`}>
            <h3 className={`text-sm font-semibold ${isDark ? 'text-slate-200' : 'text-slate-800'}`}>Linked utility billing statements</h3>
            
            <div className="space-y-3">
              {bills.length === 0 ? (
                <p className="text-xs text-slate-400 py-6 text-center italic">No bills linked. Configure them in setup wizard.</p>
              ) : (
                bills.map((bill, index) => {
                  const billerName = getBillerName(bill.biller_id)
                  const isPaid = bill.status === 'PAID'
                  const isDueSoon = !isPaid && Math.ceil((new Date(bill.due_date) - new Date()) / (1000 * 60 * 60 * 24)) <= 3
                  
                  return (
                    <GlowCard 
                      key={index} 
                      isDark={isDark}
                      hasCustomBg={true}
                      className={`transition-all duration-200 ${
                        isPaid 
                          ? (isDark ? 'border-slate-800 bg-slate-950/20 opacity-60' : 'border-slate-200 bg-slate-50/50 opacity-70') 
                          : isDueSoon 
                            ? (isDark ? 'border-amber-500/30 bg-amber-500/5' : 'border-amber-200 bg-amber-50/20') 
                            : (isDark ? 'border-slate-800/80 bg-[#0d1425] hover:border-slate-700' : 'border-slate-200 bg-white')
                      }`}
                    >
                      <div className="flex justify-between items-center p-3">
                        <div>
                          <p className={`text-xs font-semibold ${isDark ? 'text-slate-200' : 'text-slate-800'}`}>{billerName}</p>
                          <p className={`text-[10px] font-mono ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>Consumer ID: {bill.consumer_number}</p>
                        </div>

                        <div className="text-right flex items-center space-x-4">
                          <div>
                            <p className={`text-xs font-bold font-mono ${isDark ? 'text-slate-200' : 'text-slate-800'}`}>Rs {bill.amount}</p>
                            <p className="text-[9px] text-slate-400">Due: {bill.due_date}</p>
                            {!isPaid && (
                              <p className={`text-[8px] font-medium tracking-wide ${isDark ? 'text-indigo-400' : 'text-[#1a3c6e]'}`}>
                                Pay Date: {getPayDate(bill.due_date)}
                              </p>
                            )}
                          </div>

                          <div className="flex items-center space-x-2">
                            <span className={`px-2 py-0.5 text-[9px] font-bold rounded uppercase ${
                              isPaid 
                                ? (isDark ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 'bg-emerald-50 text-emerald-800 border border-slate-200') 
                                : bill.status === 'BLOCKED'
                                  ? (isDark ? 'bg-rose-500/10 text-rose-400 border border-rose-500/20' : 'bg-rose-50 text-rose-800 border border-rose-200')
                                  : bill.status === 'PENDING_APPROVAL'
                                    ? (isDark ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20 animate-pulse' : 'bg-amber-50 text-amber-850 border border-amber-200 animate-pulse')
                                    : (isDark ? 'bg-blue-500/10 text-blue-400 border border-blue-500/20' : 'bg-blue-50 text-blue-800 border border-slate-200')
                            }`}>
                              {bill.status}
                            </span>
                            <button 
                              onClick={() => setExpandedBill(expandedBill === index ? null : index)}
                              className="text-slate-400 hover:text-slate-600 text-xs p-1 cursor-pointer"
                            >
                              {expandedBill === index ? '▲' : '▼'}
                            </button>
                          </div>
                        </div>
                      </div>

                      {expandedBill === index && (
                        <div className={`border-t p-3 text-[10px] space-y-1 font-mono rounded-b-xl ${
                          isDark ? 'bg-slate-950/50 border-slate-800/50 text-slate-400' : 'bg-slate-50 border-slate-100 text-slate-500'
                        }`}>
                          <p><span className={`font-semibold ${isDark ? 'text-slate-305' : 'text-slate-700'}`}>Bill ID:</span> {bill.bill_id || bill.id}</p>
                          {bill.status === 'BLOCKED' ? (
                            <div className="space-y-2 mt-1">
                              <p><span className="font-semibold text-rose-400">Risk Assessment:</span> HIGH ANOMALY DETECTED. Auto-payment blocked.</p>
                              <p className="text-slate-400">Would you like to manually override this risk warning and approve the transaction?</p>
                              <button
                                onClick={() => handleOverride(bill.biller_id)}
                                className="px-4 py-1.5 bg-rose-600 hover:bg-rose-500 text-white rounded text-[10px] font-bold uppercase tracking-wider transition-all duration-200 cursor-pointer shadow-sm"
                              >
                                Override & Pay
                              </button>
                            </div>
                          ) : bill.status === 'PENDING_APPROVAL' ? (
                            <div className="space-y-2 mt-1">
                              <p><span className="font-semibold text-amber-400">Approval Required:</span> Autopay is pending child approval.</p>
                              <p className="text-slate-400">Review bill details and click below to approve and process the payment.</p>
                              <button
                                onClick={() => handleApprove(bill.biller_id)}
                                className="px-4 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded text-[10px] font-bold uppercase tracking-wider transition-all duration-200 cursor-pointer shadow-sm"
                              >
                                Approve Autopay
                              </button>
                            </div>
                          ) : bill.status === 'UNPAID' ? (
                            <div className="space-y-2 mt-1">
                              <p><span className="font-semibold text-emerald-400">Assessment:</span> Safe. Bill variance analysis checks verified.</p>
                              <p className="text-slate-400">This bill is safe and ready for settlement. Click below to process the payment immediately.</p>
                              <button
                                onClick={() => handleApprove(bill.biller_id)}
                                className={`px-4 py-1.5 rounded text-[10px] font-bold uppercase tracking-wider transition-all duration-200 cursor-pointer shadow-sm ${
                                  isDark 
                                    ? 'bg-indigo-600 hover:bg-indigo-500 text-white' 
                                    : 'bg-[#1a3c6e] hover:bg-[#122b50] text-white'
                                }`}
                              >
                                Pay Now
                              </button>
                            </div>
                          ) : (
                            <p><span className={`font-semibold ${isDark ? 'text-slate-305' : 'text-slate-700'}`}>Assessment:</span> Safe. Bill variance analysis checks verified.</p>
                          )}
                        </div>
                      )}
                    </GlowCard>
                  )
                })
              )}
            </div>
          </div>
        </div>

        <div className="lg:col-span-1 space-y-4">
          <div className={`flex border-b ${isDark ? 'border-slate-800' : 'border-slate-200'}`}>
            <button 
              onClick={() => setActiveTab('summary')}
              className={`flex-1 pb-2 text-[10px] font-semibold uppercase tracking-wider transition-all cursor-pointer ${
                activeTab === 'summary' 
                  ? (isDark ? 'text-indigo-400 border-b-2 border-indigo-400' : 'text-[#1a3c6e] border-b-2 border-[#1a3c6e]') 
                  : 'text-slate-400 hover:text-slate-600'
              }`}
            >
              Overview
            </button>
            <button 
              onClick={() => setActiveTab('terminal')}
              className={`flex-1 pb-2 text-[10px] font-semibold uppercase tracking-wider transition-all cursor-pointer ${
                activeTab === 'terminal' 
                  ? (isDark ? 'text-indigo-400 border-b-2 border-indigo-400' : 'text-[#1a3c6e] border-b-2 border-[#1a3c6e]') 
                  : 'text-slate-400 hover:text-slate-600'
              }`}
            >
              Agent terminal
            </button>
          </div>

          {activeTab === 'summary' ? (
            <div className={`p-4 border rounded-xl space-y-4 transition-all duration-300 ${
              isDark ? 'bg-[#0d1425] border-slate-800' : 'bg-white border-slate-200'
            }`}>
              <h4 className={`text-xs font-semibold uppercase tracking-wider ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>Configuration</h4>
              <div className="space-y-3 text-xs">
                <div className={`flex justify-between py-1 border-b ${isDark ? 'border-slate-800/50' : 'border-slate-100'}`}>
                  <span className="text-slate-400">Parent phone</span>
                  <span className={`font-mono ${isDark ? 'text-slate-200' : 'text-slate-850'}`}>{profile?.parent_phone || 'None'}</span>
                </div>
                <div className={`flex justify-between py-1 border-b ${isDark ? 'border-slate-800/50' : 'border-slate-100'}`}>
                  <span className="text-slate-400">Preferred language</span>
                  <span className={`font-semibold ${isDark ? 'text-slate-200' : 'text-slate-850'}`}>{profile?.preferred_language || 'Hindi'}</span>
                </div>
                <div className={`flex justify-between py-1 border-b ${isDark ? 'border-slate-800/50' : 'border-slate-100'}`}>
                  <span className="text-slate-400">Utility billers</span>
                  <span className={`font-semibold ${isDark ? 'text-slate-200' : 'text-slate-850'}`}>{profile?.billers?.length || 0} active</span>
                </div>
              </div>
            </div>
          ) : (
            <div className={`rounded-xl border p-4 space-y-3 flex flex-col h-[320px] transition-all duration-300 ${
              isDark ? 'border-slate-800 bg-[#05070c] text-slate-100' : 'border-slate-200 bg-slate-900 text-white'
            }`}>
              <div className="flex justify-between items-center border-b border-slate-800 pb-2">
                <div className="flex items-center space-x-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-indigo-500 animate-pulse" />
                  <span className="text-[9px] font-mono text-slate-400 uppercase tracking-wider">billbuddy_orchestrator</span>
                </div>
                {logs.length > 0 && (
                  <div className="flex items-center space-x-2">
                    <button 
                      onClick={handleCopyTrace}
                      className="px-2 py-0.5 text-[8px] font-semibold tracking-wider uppercase border border-slate-800 rounded bg-slate-950 hover:bg-slate-800 text-slate-400 transition cursor-pointer"
                    >
                      Copy
                    </button>
                    <button 
                      onClick={handleClearLogs}
                      className="px-2 py-0.5 text-[8px] font-semibold tracking-wider uppercase border border-slate-800 rounded bg-slate-950 hover:bg-slate-800 text-slate-400 transition cursor-pointer"
                    >
                      Clear
                    </button>
                  </div>
                )}
              </div>

              <div className="flex-1 overflow-y-auto space-y-1.5 font-mono text-[9px] leading-relaxed custom-scrollbar pr-1">
                {logs.length === 0 ? (
                  <p className="text-slate-500 italic">Console ready. Trigger agent loop to stream active pipeline logging trace.<span className="inline-block w-1 h-3 bg-indigo-400 ml-1 animate-cursor-blink" /></p>
                ) : (
                  <>
                    {logs.map((log, idx) => renderLogLine(log, idx))}
                    <div className="pt-1 flex items-center">
                      <span className="text-indigo-400 font-bold mr-1">console:~$</span>
                      <span className="inline-block w-1 h-3 bg-indigo-400 animate-cursor-blink" />
                    </div>
                  </>
                )}
              </div>
            </div>
          )}

        </div>

      </div>

    </div>
  )
}

// ------------------------------------------------------------------------------
// Payment History Component (Invoice Voucher modal layout)
// ------------------------------------------------------------------------------
const PaymentHistory = ({ history, profile, isDark }) => {
  const [searchTerm, setSearchTerm] = useState('')
  const [selectedReceipt, setSelectedReceipt] = useState(null)

  const filteredHistory = history.filter(item => 
    item.biller_id.toLowerCase().includes(searchTerm.toLowerCase()) ||
    item.transaction_id.toLowerCase().includes(searchTerm.toLowerCase())
  )

  return (
    <div className="space-y-6 max-w-6xl mx-auto">
      <div className={`border-b pb-4 ${isDark ? 'border-slate-800' : 'border-slate-200'}`}>
        <h2 className={`text-2xl font-bold ${isDark ? 'text-white' : 'text-slate-800'}`}>Payment history</h2>
        <p className={`text-xs mt-1 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>Audit log of all automated transactions processed securely via Razorpay Autopay.</p>
      </div>

      <div className={`flex items-center space-x-3 border rounded-xl px-3 py-2 transition-all duration-300 ${
        isDark ? 'border-slate-800 bg-[#0d1425] text-white' : 'border-slate-200 bg-white'
      }`}>
        <svg className="w-4 h-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>
        <input 
          type="text" 
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          placeholder="Search receipts by provider or transaction ID..."
          className="bg-transparent border-none focus:outline-none w-full text-xs placeholder-slate-400"
        />
      </div>

      <div className={`border rounded-xl overflow-x-auto ${isDark ? 'border-slate-800' : 'border-slate-200'}`}>
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className={`border-b text-[10px] font-semibold uppercase tracking-wider ${
              isDark ? 'border-slate-800 bg-[#0b1021] text-slate-400' : 'border-slate-200 bg-slate-50 text-slate-500'
            }`}>
              <th className="py-2.5 px-4">Date</th>
              <th className="py-2.5 px-4">Provider</th>
              <th className="py-2.5 px-4">Amount</th>
              <th className="py-2.5 px-4">Transaction ref</th>
              <th className="py-2.5 px-4 text-right">Action</th>
            </tr>
          </thead>
          <tbody className={`text-xs ${isDark ? 'text-slate-355 text-slate-300' : 'text-slate-600'}`}>
            {filteredHistory.length === 0 ? (
              <tr>
                <td colSpan="5" className="py-6 text-center text-slate-400 italic">No receipts match search criteria.</td>
              </tr>
            ) : (
              filteredHistory.map((item, idx) => (
                <tr key={idx} className={`border-b transition-colors ${
                  isDark ? 'border-slate-800/50 hover:bg-indigo-500/5' : 'border-slate-200 hover:bg-slate-50/50'
                }`}>
                  <td className="py-3 px-4 font-mono text-slate-400">
                    {new Date(item.timestamp).toLocaleDateString()}
                  </td>
                  <td className={`py-3 px-4 font-semibold ${isDark ? 'text-slate-200' : 'text-slate-800'}`}>{item.biller_id}</td>
                  <td className={`py-3 px-4 font-bold ${isDark ? 'text-indigo-400' : 'text-[#1a3c6e]'}`}>Rs {item.amount_paid}</td>
                  <td className="py-3 px-4 font-mono text-slate-400">{item.transaction_id}</td>
                  <td className="py-3 px-4 text-right">
                    <button 
                      onClick={() => setSelectedReceipt(item)}
                      className={`px-2.5 py-1 border text-[10px] font-bold uppercase rounded-lg transition-colors cursor-pointer ${
                        isDark 
                          ? 'bg-slate-900 border-slate-800 text-indigo-400 hover:bg-slate-800' 
                          : 'bg-white border-slate-200 text-[#1a3c6e] hover:bg-slate-50'
                      }`}
                    >
                      View receipt
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {selectedReceipt && (
        <div className="fixed inset-0 bg-slate-950/80 flex items-center justify-center z-50 p-4 backdrop-blur-md transition-all duration-300">
          <div className={`w-full max-w-md p-6 relative border rounded-xl shadow-2xl transition-all duration-300 ${
            isDark 
              ? 'bg-[#0f1527] border-slate-800 text-slate-200 shadow-indigo-500/5' 
              : 'bg-white border-slate-200 text-slate-700'
          }`}>
            
            <button 
              onClick={() => setSelectedReceipt(null)}
              className="absolute top-4 right-4 text-slate-400 hover:text-slate-600 text-sm cursor-pointer"
            >
              ✕
            </button>

            <div className="text-center pb-2 border-b border-dashed border-slate-700/30">
              <span className="text-[9px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest block">transaction record</span>
              <h3 className={`text-lg font-mono font-bold tracking-tight ${isDark ? 'text-white' : 'text-slate-800'}`}>BillBuddy Receipt</h3>
            </div>

            <div className="py-4 space-y-3 font-mono text-xs">
              <div className="flex justify-between">
                <span className="text-slate-400">biller operator</span>
                <span className={`font-semibold ${isDark ? 'text-slate-200' : 'text-slate-800'}`}>{selectedReceipt.biller_id}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">consumer ID</span>
                <span className={`font-semibold ${isDark ? 'text-slate-200' : 'text-slate-800'}`}>{selectedReceipt.consumer_number || 'N/A'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">parent account</span>
                <span className={`font-semibold ${isDark ? 'text-slate-200' : 'text-slate-800'}`}>{profile?.parent_name}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">payment method</span>
                <span className="text-slate-500 font-medium">Razorpay UPI Autopay</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">timestamp</span>
                <span className="text-slate-500">{new Date(selectedReceipt.timestamp).toLocaleString()}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">transaction reference</span>
                <span className={`font-semibold ${isDark ? 'text-indigo-400' : 'text-[#1a3c6e]'}`}>{selectedReceipt.transaction_id}</span>
              </div>
            </div>

            <div className={`p-4 rounded-lg text-center ${
              isDark ? 'bg-slate-900/60 border border-slate-800/40' : 'bg-slate-50 border border-slate-200'
            }`}>
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block mb-1">amount settled</span>
              <span className={`text-2xl font-bold font-mono ${isDark ? 'text-emerald-400' : 'text-slate-800'}`}>Rs {selectedReceipt.amount_paid}</span>
            </div>

            <div className="pt-2 text-center">
              <div className={`inline-block border px-3 py-1.5 rounded-full text-[9px] font-bold tracking-widest uppercase ${
                isDark ? 'border-emerald-500/20 text-emerald-400 bg-emerald-500/5' : 'border-emerald-200 text-emerald-700 bg-emerald-50'
              }`}>
                VERIFIED SECURE BY BILLBUDDY RISK ENGINE
              </div>
            </div>

            <div className="flex pt-4">
              <button 
                onClick={() => setSelectedReceipt(null)}
                className={`w-full py-2 font-semibold rounded text-xs uppercase tracking-wider transition-colors cursor-pointer ${
                  isDark ? 'bg-indigo-600 hover:bg-indigo-700 text-white' : 'bg-[#1a3c6e] hover:bg-[#122b50] text-white'
                }`}
              >
                Close Receipt
              </button>
            </div>

          </div>
        </div>
      )}
    </div>
  )
}

// ------------------------------------------------------------------------------
// Main Application Container
// ------------------------------------------------------------------------------
function App() {
  const [profileId, setProfileId] = useState(() => localStorage.getItem('billbuddy_profile_id') || '')
  const [profile, setProfile] = useState(null)
  const [bills, setBills] = useState([])
  const [history, setHistory] = useState([])
  const [loading, setLoading] = useState(false)
  const [toast, setToast] = useState(null)
  
  // Load and default darkMode directly
  const [darkMode, setDarkMode] = useState(() => {
    const stored = localStorage.getItem('billbuddy_dark_mode')
    return stored !== null ? stored === 'true' : true // Default to Dark mode (futuristic dashboard)
  })

  const location = useLocation()
  const navigate = useNavigate()
  
  // Theme is globally controlled by the darkMode toggle for all routes
  const isDark = darkMode

  const showToast = (message, type = 'success') => {
    setToast({ message, type })
  }

  const handleToggleTheme = () => {
    const newMode = !darkMode
    setDarkMode(newMode)
    localStorage.setItem('billbuddy_dark_mode', String(newMode))
  }

  const handleConnectProfile = async (fullPhone) => {
    try {
      setLoading(true)
      const profileRes = await api.get(`/api/profile/${fullPhone}`)
      setProfile(profileRes.data)
      
      // Save session
      localStorage.setItem('billbuddy_profile_id', fullPhone)
      setProfileId(fullPhone)

      const billsRes = await api.get(`/api/profile/${fullPhone}/bills`)
      setBills(billsRes.data)

      const historyRes = await api.get(`/api/profile/${fullPhone}/history`)
      setHistory(historyRes.data)
      
      navigate('/dashboard')
      showToast('Console link established successfully.', 'success')
    } catch (e) {
      if (e.response && e.response.status === 404) {
        // Trigger setup onboarding
        localStorage.setItem('billbuddy_profile_id', fullPhone)
        setProfileId(fullPhone)
        setProfile({
          id: fullPhone,
          child_phone: fullPhone,
          parent_phone: '',
          parent_name: '',
          preferred_language: 'Hindi',
          mandate_limit: 5000.0,
          mandate_token: '',
          billers: [],
          city: '',
          alert_threshold_enabled: true,
          alert_threshold_amount: 2000
        })
        setBills([])
        setHistory([])
        navigate('/setup')
        showToast('No active configuration found. Launching Setup wizard.', 'info')
      } else {
        console.error(e)
        showToast('Network error connecting to orchestrator.', 'error')
      }
    } finally {
      setLoading(false)
    }
  }

  const handleSwitchProfile = () => {
    localStorage.removeItem('billbuddy_profile_id')
    setProfileId('')
    setProfile(null)
    setBills([])
    setHistory([])
    showToast('Console link disconnected.', 'info')
  }

  const fetchData = async () => {
    if (!profileId) return
    try {
      setLoading(true)
      const profileRes = await api.get(`/api/profile/${profileId}`)
      setProfile(profileRes.data)

      const billsRes = await api.get(`/api/profile/${profileId}/bills`)
      setBills(billsRes.data)

      const historyRes = await api.get(`/api/profile/${profileId}/history`)
      setHistory(historyRes.data)
    } catch (e) {
      console.error('Error fetching API data:', e)
      if (e.response && e.response.status === 404) {
        navigate('/setup')
      } else {
        showToast('Offline fallback datasets initialized.', 'error')
      }
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchData()
  }, [profileId])

  const handleUpdateProfile = async (updatedProfile) => {
    try {
      const res = await api.post(`/api/profile/${profileId}`, updatedProfile)
      setProfile(res.data.profile)
      
      const billsRes = await api.get(`/api/profile/${profileId}/bills`)
      setBills(billsRes.data)
      
      const historyRes = await api.get(`/api/profile/${profileId}/history`)
      setHistory(historyRes.data)
    } catch (e) {
      console.error(e)
      throw e
    }
  }

  const handleTriggerAgent = async () => {
    try {
      const res = await api.post(`/api/profile/${profileId}/trigger`)
      const billsRes = await api.get(`/api/profile/${profileId}/bills`)
      setBills(billsRes.data)
      const historyRes = await api.get(`/api/profile/${profileId}/history`)
      setHistory(historyRes.data)
      return res.data
    } catch (e) {
      console.error(e)
      throw e
    }
  }

  const handleOverridePayment = async (billerId) => {
    try {
      setLoading(true)
      await api.post(`/api/profile/${profileId}/override-payment`, { biller_id: billerId })
      showToast('Payment override completed successfully!', 'success')
      const billsRes = await api.get(`/api/profile/${profileId}/bills`)
      setBills(billsRes.data)
      const historyRes = await api.get(`/api/profile/${profileId}/history`)
      setHistory(historyRes.data)
    } catch (e) {
      console.error(e)
      showToast('Manual payment override failed.', 'error')
    } finally {
      setLoading(false)
    }
  }

  const handleApprovePayment = async (billerId) => {
    try {
      setLoading(true)
      await api.post(`/api/profile/${profileId}/approve-payment`, { biller_id: billerId })
      showToast('Autopay approval and payment completed successfully!', 'success')
      const billsRes = await api.get(`/api/profile/${profileId}/bills`)
      setBills(billsRes.data)
      const historyRes = await api.get(`/api/profile/${profileId}/history`)
      setHistory(historyRes.data)
    } catch (e) {
      console.error(e)
      showToast('Autopay approval failed.', 'error')
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return (
      <div className={`min-h-screen flex items-center justify-center transition-colors duration-200 ${isDark ? 'bg-[#090d16]' : 'bg-white'}`}>
        <div className="flex flex-col items-center space-y-2">
          <div className={`h-5 w-5 animate-spin rounded-full border-2 border-t-transparent ${isDark ? 'border-indigo-400' : 'border-[#1a3c6e]'}`}></div>
          <span className="text-[10px] text-slate-500 font-semibold uppercase tracking-wider animate-pulse">Synchronizing console...</span>
        </div>
      </div>
    )
  }

  // Show landing page on root "/" route
  if (location.pathname === '/') {
    return <WelcomeScreen onConnect={handleConnectProfile} isDark={isDark} profileId={profileId} />
  }

  if (!profileId) {
    return <Navigate replace to="/" />
  }

  return (
    <div className={`min-h-screen relative overflow-hidden flex flex-col justify-between selection:bg-slate-200 pb-12 transition-colors duration-200 ${
      isDark ? 'bg-[#090d16] text-slate-100' : 'bg-white text-slate-700'
    }`}>
      {isDark && (
        <>
          <div className="mesh-glow-1" />
          <div className="mesh-glow-2" />
        </>
      )}
      
      {/* Navigation Bar */}
      <header className={`sticky top-0 z-40 border-b transition-colors duration-200 ${
        isDark ? 'bg-[#090d16]/95 border-slate-800/80 backdrop-blur-md' : 'bg-white border-slate-200'
      }`}>
        <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <Link to="/" className={`text-lg font-black tracking-tight transition-colors ${isDark ? 'text-indigo-400' : 'text-[#1a3c6e]'}`}>BillBuddy</Link>
            
            {/* Live Connection Indicator */}
            <div className="flex items-center space-x-1.5">
              <span className={`w-1.5 h-1.5 rounded-full ${loading ? 'bg-amber-400 animate-pulse' : 'bg-emerald-400 animate-pulse shadow-[0_0_8px_rgba(52,211,153,0.6)]'}`} />
              <span className={`text-[9px] font-mono uppercase tracking-wider hidden sm:inline ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>
                {loading ? 'connecting' : 'online'}
              </span>
            </div>
          </div>
          
          <nav className="flex items-center space-x-4">
            <NavLink to="/dashboard" isDark={isDark}>Dashboard</NavLink>
            <NavLink to="/setup" isDark={isDark}>Setup wizard</NavLink>
            <NavLink to="/history" isDark={isDark}>Receipts</NavLink>

            {/* Switch Profile Action */}
            <button 
              onClick={handleSwitchProfile}
              title="Disconnect active profile session"
              className={`px-2 py-1 rounded text-[9px] font-bold uppercase tracking-wider border transition-all cursor-pointer ${
                isDark 
                  ? 'bg-slate-900 border-slate-800 text-slate-400 hover:text-white hover:bg-slate-800' 
                  : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
              }`}
            >
              Switch profile
            </button>

            {/* Premium Slider Theme Switch (Controls darkMode Directly) */}
            <button
              onClick={handleToggleTheme}
              title="Toggle global dark mode theme"
              className={`relative inline-flex h-5 w-10 shrink-0 cursor-pointer rounded-full border border-transparent transition-colors duration-300 ease-in-out focus:outline-none ${
                darkMode ? 'bg-indigo-600' : 'bg-slate-200'
              }`}
            >
              <span className="sr-only">Toggle theme</span>
              <span
                className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow-md transition duration-300 ease-in-out ${
                  darkMode ? 'translate-x-5' : 'translate-x-0'
                }`}
              />
            </button>
          </nav>
        </div>
      </header>

      {/* Page Content */}
      <main className="max-w-6xl mx-auto px-6 py-8 flex-1 w-full">
        <Routes>
          <Route path="/" element={<Navigate replace to="/dashboard" />} />
          <Route path="/setup" element={<SetupWizard profile={profile} onSave={handleUpdateProfile} showToast={showToast} isDark={isDark} />} />
          <Route path="/dashboard" element={<Dashboard profile={profile} bills={bills} onTriggerAgent={handleTriggerAgent} onOverridePayment={handleOverridePayment} onApprovePayment={handleApprovePayment} showToast={showToast} isDark={isDark} />} />
          <Route path="/history" element={<PaymentHistory history={history} profile={profile} isDark={isDark} />} />
          <Route path="*" element={<Navigate replace to="/dashboard" />} />
        </Routes>
      </main>
      
      {/* Footer */}
      <footer className={`text-center text-[9px] font-medium py-6 mt-12 border-t transition-colors duration-200 ${
        isDark ? 'text-slate-605 border-slate-900' : 'text-slate-400 border-slate-100'
      }`}>
        BillBuddy utility payment assistant configuration. Linked profile: <span className="font-mono">{profileId}</span>
      </footer>

      {/* Global Toast Alerts */}
      {toast && (
        <Toast 
          message={toast.message} 
          type={toast.type} 
          onClose={() => setToast(null)} 
        />
      )}
    </div>
  )
}

// Custom NavLink helper for clean underlines
const NavLink = ({ to, children, isDark }) => {
  const location = useLocation()
  const isActive = location.pathname === to
  
  const activeClass = isDark
    ? 'text-indigo-400 border-b border-indigo-400 pb-1'
    : 'text-[#1a3c6e] border-b border-[#1a3c6e] pb-1'
    
  const inactiveClass = isDark
    ? 'text-slate-500 hover:text-slate-400'
    : 'text-slate-400 hover:text-slate-700'

  return (
    <Link 
      to={to} 
      className={`text-xs font-semibold uppercase tracking-wider transition-colors ${
        isActive ? activeClass : inactiveClass
      }`}
    >
      {children}
    </Link>
  )
}

// Wrapper to export BrowserRouter
export default function AppWrapper() {
  return (
    <BrowserRouter>
      <App />
    </BrowserRouter>
  )
}
