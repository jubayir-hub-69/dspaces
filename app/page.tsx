"use client";

import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { useState, useEffect } from "react";
import { useWallet } from "@solana/wallet-adapter-react";

const WalletMultiButton = dynamic(
  () => import("@solana/wallet-adapter-react-ui").then((mod) => mod.WalletMultiButton),
  { ssr: false }
);

export default function Home() {
  const router = useRouter();
  const { connected, publicKey } = useWallet();

  const [roomId, setRoomId] = useState("");
  const [userName, setUserName] = useState("");
  const [email, setEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [otpSent, setOtpSent] = useState(false);
  const [emailAuthenticated, setEmailAuthenticated] = useState(false);
  const [loggedInEmail, setLoggedInEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [statusMsg, setStatusMsg] = useState("");

  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const joinId = urlParams.get("room") || urlParams.get("id");
    if (joinId) setRoomId(joinId);

    const savedEmail = localStorage.getItem("dspaces_email");
    if (savedEmail) {
      setEmailAuthenticated(true);
      setLoggedInEmail(savedEmail);
      if (!userName) setUserName(savedEmail.split("@")[0]);
    }
  }, []);

  const handleSendOTP = async () => {
    if (!email.trim()) {
      alert("Please enter a valid email address.");
      return;
    }
    setLoading(true);
    setStatusMsg("Sending secure code...");
    try {
      const res = await fetch("/api/send-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim() }),
      });
      const data = await res.json();
      if (data.success) {
        setOtpSent(true);
        setStatusMsg("OTP sent to your email!");
      } else {
        setStatusMsg(data.error || "Failed to send OTP.");
      }
    } catch (err) {
      setStatusMsg("Error sending OTP.");
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyOTP = async () => {
    if (!otp.trim()) {
      alert("Please enter the 6-digit OTP.");
      return;
    }
    setLoading(true);
    setStatusMsg("Verifying securely...");
    try {
      const res = await fetch("/api/verify-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ otp: otp.trim() }),
      });
      const data = await res.json();
      if (data.success) {
        setEmailAuthenticated(true);
        setLoggedInEmail(data.email);
        localStorage.setItem("dspaces_email", data.email);
        setUserName(data.email.split("@")[0]);
        setStatusMsg("");
      } else {
        setStatusMsg(data.error || "Invalid OTP.");
      }
    } catch (err) {
      setStatusMsg("Verification error.");
    } finally {
      setLoading(false);
    }
  };

  const handleCreateRoom = () => {
    const randomCode = Math.floor(1000 + Math.random() * 9000);
    const finalName = userName.trim() || "User";
    router.push(`/room?id=dSpaces-${randomCode}&name=${finalName}&ishost=true`);
  };

  const handleJoinRoom = () => {
    if (roomId.trim() !== "") {
      let finalId = roomId.trim();
      if (finalId.includes("room=")) {
        finalId = finalId.split("room=")[1].split("&")[0];
      } else if (finalId.includes("id=")) {
        finalId = finalId.split("id=")[1].split("&")[0];
      }
      const finalName = userName.trim() || "User";
      router.push(`/room?id=${finalId}&name=${finalName}`);
    } else {
      alert("Please enter a Room ID or Link to join.");
    }
  };

  const handleLogoutEmail = () => {
    localStorage.removeItem("dspaces_email");
    setEmailAuthenticated(false);
    setLoggedInEmail("");
    setEmail("");
    setOtp("");
    setOtpSent(false);
    setStatusMsg("");
  };

  // মূল ভেরিফিকেশন লজিক
  const isAuthenticated = connected || emailAuthenticated;

  return (
    <main className="min-h-screen bg-[#030712] text-white relative overflow-hidden font-sans selection:bg-blue-500/30">
      
      {/* Premium Background Effects */}
      <div className="absolute top-[-20%] left-[-10%] w-[60%] h-[60%] bg-blue-600/10 blur-[150px] rounded-full pointer-events-none"></div>
      <div className="absolute bottom-[-20%] right-[-10%] w-[60%] h-[60%] bg-purple-600/10 blur-[150px] rounded-full pointer-events-none"></div>

      {/* CSS Animations */}
      <style dangerouslySetInnerHTML={{__html: `
        @keyframes fadeInUp {
          from { opacity: 0; transform: translateY(20px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .animate-fade-in-up { animation: fadeInUp 0.7s cubic-bezier(0.16, 1, 0.3, 1) forwards; }
        .glass-panel {
          background: rgba(17, 24, 39, 0.6);
          backdrop-filter: blur(20px);
          -webkit-backdrop-filter: blur(20px);
          border: 1px solid rgba(255, 255, 255, 0.05);
          box-shadow: 0 8px 32px 0 rgba(0, 0, 0, 0.3);
        }
      `}} />

      {/* Smart Navbar */}
      <nav className="relative z-10 flex justify-between items-center px-4 sm:px-8 py-5 border-b border-white/5 bg-black/20 backdrop-blur-md">
        <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight bg-gradient-to-r from-blue-400 via-indigo-400 to-purple-500 bg-clip-text text-transparent drop-shadow-sm cursor-pointer hover:scale-105 transition-transform">
          dSpaces
        </h1>
        
        <div>
          {!isAuthenticated ? (
            <div className="hidden sm:block px-4 py-1.5 rounded-full border border-gray-800 bg-gray-900/50 text-xs font-semibold text-gray-400">
              Not Connected
            </div>
          ) : connected ? (
            /* Wallet Logged In - Handles its own disconnect */
            <div className="hover:scale-105 transition-transform">
              <WalletMultiButton className="!bg-indigo-600 hover:!bg-indigo-700 !h-10 !px-6 !rounded-xl !font-bold !shadow-lg !shadow-indigo-500/20" />
            </div>
          ) : (
            /* Email Logged In - Shows Email + Custom Logout */
            <div className="flex items-center gap-3 bg-gray-900/80 border border-gray-700/50 rounded-xl p-1.5 pl-4 shadow-lg animate-fade-in-up">
              <div className="flex items-center gap-2 max-w-[120px] sm:max-w-xs">
                <span className="relative flex h-2.5 w-2.5">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-green-500"></span>
                </span>
                <span className="text-sm font-semibold text-gray-200 truncate">{loggedInEmail}</span>
              </div>
              <button 
                onClick={handleLogoutEmail} 
                className="bg-red-500/10 hover:bg-red-500 text-red-500 hover:text-white px-4 py-2 rounded-lg text-xs font-bold transition-all duration-300"
              >
                Logout
              </button>
            </div>
          )}
        </div>
      </nav>

      {/* Main Content Area */}
      <section className="relative z-10 flex flex-col items-center justify-center min-h-[80vh] px-4 py-12 text-center animate-fade-in-up">
        
        {!isAuthenticated && (
          <div className="mb-10">
            <h1 className="text-4xl sm:text-6xl font-black mb-4 tracking-tight">
              The Future of <span className="bg-gradient-to-r from-blue-500 to-purple-500 bg-clip-text text-transparent">Web3 Meetings</span>
            </h1>
            <p className="text-gray-400 text-sm sm:text-base max-w-lg mx-auto">
              Connect your Solana wallet or verify your email to experience secure, high-quality decentralized video conferencing.
            </p>
          </div>
        )}

        <div className="w-full max-w-md glass-panel p-8 rounded-3xl transition-all duration-500">

          {!isAuthenticated ? (
            /* --- LOGGED OUT STATE: LOGIN OPTIONS --- */
            <div className="flex flex-col gap-6">
              
              {/* Wallet Option */}
              <div className="group text-left p-5 rounded-2xl bg-gray-900/40 border border-gray-800 hover:border-indigo-500/50 transition-colors">
                <label className="flex items-center gap-2 text-[11px] font-bold text-gray-400 uppercase tracking-widest mb-3">
                  <span className="w-2 h-2 rounded-full bg-indigo-500"></span>
                  Option 1: Web3 Wallet
                </label>
                <div className="flex justify-center w-full group-hover:scale-[1.02] transition-transform duration-300">
                  <WalletMultiButton style={{ width: "100%", justifyContent: "center", backgroundColor: "#4f46e5", borderRadius: "12px", height: "48px", fontWeight: "bold" }} />
                </div>
              </div>

              {/* Divider */}
              <div className="flex items-center opacity-40">
                <div className="flex-grow border-t border-gray-600"></div>
                <span className="px-4 text-gray-400 text-xs font-bold uppercase tracking-widest">OR</span>
                <div className="flex-grow border-t border-gray-600"></div>
              </div>

              {/* Email Option */}
              <div className="text-left p-5 rounded-2xl bg-gray-900/40 border border-gray-800 hover:border-blue-500/50 transition-colors">
                <label className="flex items-center gap-2 text-[11px] font-bold text-gray-400 uppercase tracking-widest mb-3">
                  <span className="w-2 h-2 rounded-full bg-blue-500"></span>
                  Option 2: Email Login
                </label>
                
                <div className="flex flex-col gap-3">
                  {!otpSent ? (
                    <div className="flex flex-col gap-2">
                      <input
                        type="email"
                        placeholder="name@example.com"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        className="w-full px-4 py-3 bg-gray-950/50 border border-gray-700 rounded-xl text-white text-sm focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all placeholder:text-gray-600"
                      />
                      <button
                        onClick={handleSendOTP}
                        disabled={loading}
                        className="w-full py-3 bg-blue-600 hover:bg-blue-500 disabled:bg-gray-700 text-white font-bold rounded-xl text-sm transition-all shadow-lg hover:shadow-blue-500/25 active:scale-[0.98]"
                      >
                        {loading ? "Sending Secure Code..." : "Get OTP Code"}
                      </button>
                    </div>
                  ) : (
                    <div className="flex flex-col gap-2 animate-fade-in-up">
                      <div className="flex justify-between items-center mb-1">
                        <span className="text-xs text-gray-400">Code sent to <span className="text-white">{email}</span></span>
                        <button onClick={() => { setOtpSent(false); setOtp(""); }} className="text-xs text-blue-400 hover:text-blue-300 underline">Change</button>
                      </div>
                      <input
                        type="text"
                        placeholder="• • • • • •"
                        value={otp}
                        maxLength={6}
                        onChange={(e) => setOtp(e.target.value)}
                        className="w-full px-4 py-3 bg-gray-950/50 border border-gray-700 rounded-xl text-white text-center text-xl tracking-[0.5em] focus:outline-none focus:border-green-500 focus:ring-1 focus:ring-green-500 transition-all"
                      />
                      <button
                        onClick={handleVerifyOTP}
                        disabled={loading}
                        className="w-full py-3 bg-green-600 hover:bg-green-500 disabled:bg-gray-700 text-white font-bold rounded-xl text-sm transition-all shadow-lg hover:shadow-green-500/25 active:scale-[0.98]"
                      >
                        {loading ? "Verifying..." : "Secure Login"}
                      </button>
                    </div>
                  )}
                  {statusMsg && <p className="text-xs text-center font-medium mt-1 text-blue-400 bg-blue-500/10 py-2 rounded-lg">{statusMsg}</p>}
                </div>
              </div>

            </div>
          ) : (
            /* --- LOGGED IN STATE: ROOM CONTROLS --- */
            <div className="flex flex-col gap-5 animate-fade-in-up">
              
              <div className="mb-2">
                <div className="inline-block px-4 py-1.5 rounded-full bg-green-500/10 border border-green-500/20 text-green-400 text-xs font-bold tracking-wider uppercase mb-4">
                  Authentication Successful
                </div>
                <h2 className="text-2xl font-bold">Ready to Connect?</h2>
                <p className="text-gray-400 text-sm mt-1">Set your name and create or join a secure room.</p>
              </div>

              <div className="text-left">
                <label className="text-[11px] font-bold text-gray-400 uppercase tracking-widest ml-1">Display Name</label>
                <input
                  type="text"
                  placeholder="e.g. John Doe"
                  value={userName}
                  onChange={(e) => setUserName(e.target.value)}
                  className="px-4 py-3.5 bg-gray-900 border border-gray-700 rounded-xl text-white focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 w-full mt-2 transition-all placeholder:text-gray-600"
                />
              </div>
              
              <div className="text-left">
                <label className="text-[11px] font-bold text-gray-400 uppercase tracking-widest ml-1">Room ID (To Join)</label>
                <input
                  type="text"
                  placeholder="Paste Room ID or Link..."
                  value={roomId}
                  onChange={(e) => setRoomId(e.target.value)}
                  className="px-4 py-3.5 bg-gray-900 border border-gray-700 rounded-xl text-white focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 w-full mt-2 transition-all placeholder:text-gray-600"
                />
              </div>

              <div className="flex flex-col gap-3 w-full mt-4">
                <button 
                  onClick={handleCreateRoom} 
                  className="py-4 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-bold rounded-xl transition-all shadow-lg hover:shadow-blue-500/30 active:scale-[0.98] flex items-center justify-center gap-2"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4"></path></svg>
                  Create New Room
                </button>
                <button 
                  onClick={handleJoinRoom} 
                  className="py-4 bg-gray-800 hover:bg-gray-700 text-white font-bold rounded-xl transition-all border border-gray-700 hover:border-gray-500 active:scale-[0.98] flex items-center justify-center gap-2"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M11 16l-4-4m0 0l4-4m-4 4h14m-5 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h7a3 3 0 013 3v1"></path></svg>
                  Join Existing Room
                </button>
              </div>

            </div>
          )}

        </div>
      </section>
    </main>
  );
}
