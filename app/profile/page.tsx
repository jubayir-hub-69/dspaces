"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useWallet } from "@solana/wallet-adapter-react";
import dynamic from "next/dynamic";

const WalletMultiButton = dynamic(
  () => import("@solana/wallet-adapter-react-ui").then((mod) => mod.WalletMultiButton),
  { ssr: false }
);

const getDb = () => JSON.parse(localStorage.getItem('dspaces_db') || '[]');
const saveDb = (db: any[]) => localStorage.setItem('dspaces_db', JSON.stringify(db));

export default function ProfilePage() {
  const router = useRouter();
  const { connected, publicKey, disconnect } = useWallet();

  const [myAcc, setMyAcc] = useState<any>(null);
  const [userName, setUserName] = useState("User");
  const [avatar, setAvatar] = useState("👨‍🚀");
  const [history, setHistory] = useState<any[]>([]);
  const [isEditing, setIsEditing] = useState(false);

  const [toastMsg, setToastMsg] = useState("");
  const [linkingEmail, setLinkingEmail] = useState(false);
  const [linkEmailInput, setLinkEmailInput] = useState("");
  const [linkOtpInput, setLinkOtpInput] = useState("");
  const [linkOtpSent, setLinkOtpSent] = useState(false);
  const [loading, setLoading] = useState(false);
  
  const [viewSummary, setViewSummary] = useState<string | null>(null);

  const avatars = ["👨‍🚀", "🥷", "🧙‍♂️", "👩‍🎤", "🤖", "👻", "🦊", "🐼"];

  const showToast = (msg: string) => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(""), 4000);
  };

  useEffect(() => {
    const sessionId = localStorage.getItem("dspaces_active_session");
    if (!sessionId) {
      router.push("/");
      return;
    }
    const db = getDb();
    const acc = db.find((a: any) => a.email === sessionId || a.wallet === sessionId);
    
    if (acc) {
      setMyAcc(acc);
      setUserName(acc.name);
      setAvatar(acc.avatar);
      
      const historyKey = `dspaces_history_${sessionId}`;
      const savedHistory = JSON.parse(localStorage.getItem(historyKey) || "[]");
      setHistory(savedHistory);
    } else {
      router.push("/");
    }
  }, [router]);

  useEffect(() => {
    if (connected && publicKey && myAcc && !myAcc.wallet) {
      const walletStr = publicKey.toString();
      fetch('/api/global-db', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'CHECK', type: 'wallet', value: walletStr })
      }).then(res => res.json()).then(data => {
        if (data.isUsed) {
          showToast("This Wallet is already used by another account!");
          disconnect();
        } else {
          fetch('/api/global-db', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'ADD', type: 'wallet', value: walletStr })
          });

          const db = getDb();
          const updatedDb = db.map((a: any) => (a.email === myAcc.email && a.wallet === myAcc.wallet) ? { ...a, wallet: walletStr } : a);
          saveDb(updatedDb);
          setMyAcc({ ...myAcc, wallet: walletStr });
          showToast("Wallet linked successfully!");
        }
      });
    }
  }, [connected, publicKey, myAcc, disconnect]);

  // FIX: This is the function that was mismatched in the button click
  const handleSendLinkOTP = async () => {
    const emailInput = linkEmailInput.trim();
    if (!emailInput) return showToast("Please enter an email address.");
    
    setLoading(true);
    try {
      const dbRes = await fetch('/api/global-db', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'CHECK', type: 'email', value: emailInput })
      });
      const dbData = await dbRes.json();

      if (dbData.isUsed) {
        setLoading(false);
        return showToast("This Email is already used by another account!");
      }

      const res = await fetch("/api/send-otp", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: emailInput }),
      });
      const data = await res.json();
      if (data.success) { 
        setLinkOtpSent(true); 
        showToast("OTP sent to email!"); 
      } else { showToast(data.error || "Failed to send OTP."); }
    } catch (err) { showToast("Error sending OTP."); } 
    finally { setLoading(false); }
  };

  const handleVerifyLinkOTP = async () => {
    if (!linkOtpInput.trim()) return showToast("Please enter the OTP.");
    setLoading(true);
    try {
      const res = await fetch("/api/verify-otp", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ otp: linkOtpInput.trim() }),
      });
      const data = await res.json();
      if (data.success) {
        const verifiedEmail = data.email;
        
        fetch('/api/global-db', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'ADD', type: 'email', value: verifiedEmail })
        });

        const db = getDb();
        const updatedDb = db.map((a: any) => (a.email === myAcc.email && a.wallet === myAcc.wallet) ? { ...a, email: verifiedEmail } : a);
        saveDb(updatedDb);

        setMyAcc({ ...myAcc, email: verifiedEmail });
        setLinkingEmail(false);
        showToast("Email successfully linked!");
      } else { showToast(data.error || "Invalid OTP."); }
    } catch (err) { showToast("Verification error."); } 
    finally { setLoading(false); }
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 2 * 1024 * 1024) return showToast("Image size should be less than 2MB.");
      const reader = new FileReader();
      reader.onloadend = () => setAvatar(reader.result as string);
      reader.readAsDataURL(file);
    }
  };

  const saveProfile = () => {
    const db = getDb();
    const updatedDb = db.map((a: any) => (a.email === myAcc.email && a.wallet === myAcc.wallet) ? { ...a, name: userName, avatar: avatar } : a);
    saveDb(updatedDb);
    
    fetch('/api/sync-avatar', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: userName, avatar: avatar })
    }).catch(e => console.log(e));

    setMyAcc({ ...myAcc, name: userName, avatar: avatar });
    setIsEditing(false);
    showToast("Profile Updated Successfully!");
  };

  const handleLogout = () => {
    localStorage.removeItem("dspaces_active_session");
    if (connected) disconnect();
    router.push("/");
  };

  if (!myAcc) return null;

  return (
    <main className="min-h-screen bg-[#030712] text-white font-sans relative overflow-x-hidden flex flex-col">
      
      <div className="absolute top-[-10%] left-[-10%] w-[50%] h-[50%] bg-[#00e5ff]/5 blur-[120px] rounded-full pointer-events-none"></div>
      <div className="absolute bottom-[-10%] right-[-10%] w-[50%] h-[50%] bg-[#00ff88]/5 blur-[120px] rounded-full pointer-events-none"></div>
      
      {toastMsg && (
        <div className="fixed top-6 left-1/2 -translate-x-1/2 z-[1000] bg-[#0f172a] border border-[#00e5ff]/30 text-white px-6 py-3 rounded-full shadow-[0_0_20px_rgba(0,229,255,0.2)] font-semibold text-sm animate-fade-in-up flex items-center gap-3">
          <span className="w-2 h-2 rounded-full bg-[#00ff88] animate-pulse"></span>
          {toastMsg}
        </div>
      )}

      <nav className="relative z-10 flex justify-between items-center px-6 sm:px-10 py-5 border-b border-gray-800/50 bg-black/20 backdrop-blur-md">
        <h1 onClick={() => router.push('/')} className="text-2xl font-extrabold cursor-pointer bg-gradient-to-r from-[#00e5ff] to-[#00ff88] bg-clip-text text-transparent drop-shadow-md transition-transform hover:scale-105">
          dSpaces
        </h1>
        <button onClick={() => router.push('/')} className="text-sm font-bold bg-[#0f172a] border border-gray-700 hover:border-[#00e5ff]/50 text-white px-5 py-2.5 rounded-xl transition-all shadow-lg">
          Back to Home
        </button>
      </nav>

      <section className="relative z-10 max-w-5xl mx-auto px-4 py-12 flex flex-col md:flex-row gap-8 flex-grow w-full">
        
        <div className="w-full md:w-1/3 flex flex-col gap-6">
          
          <div className="bg-[#0f172a]/80 backdrop-blur-xl border border-gray-800/80 hover:border-[#00e5ff]/30 rounded-[2rem] p-8 flex flex-col items-center text-center shadow-[0_8px_30px_rgb(0,0,0,0.5)] transition-all">
            <div className="relative w-28 h-28 flex items-center justify-center rounded-full mb-5 border-2 border-[#00e5ff] shadow-[0_0_25px_rgba(0,229,255,0.3)] bg-gray-900 group overflow-hidden">
              {avatar.startsWith("data:image") ? (
                <img src={avatar} alt="Profile" className="w-full h-full object-cover" />
              ) : (
                <span className="text-6xl drop-shadow-[0_0_10px_rgba(255,255,255,0.2)]">{avatar}</span>
              )}
              
              {isEditing && (
                <label className="absolute inset-0 bg-black/70 backdrop-blur-sm flex flex-col items-center justify-center cursor-pointer opacity-0 group-hover:opacity-100 transition-opacity">
                  <svg className="w-6 h-6 text-[#00ff88] mb-1" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z"></path><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 13a3 3 0 11-6 0 3 3 0 016 0z"></path></svg>
                  <span className="text-[9px] font-bold text-white uppercase tracking-wider">Upload</span>
                  <input type="file" accept="image/*" className="hidden" onChange={handleImageUpload} />
                </label>
              )}
            </div>
            
            {isEditing ? (
              <div className="w-full flex flex-col gap-4">
                <input 
                  type="text" 
                  value={userName} 
                  onChange={(e) => setUserName(e.target.value)} 
                  className="w-full bg-black/50 border border-gray-700 rounded-xl px-4 py-3 text-center focus:border-[#00e5ff] text-white outline-none font-semibold transition-colors"
                />
                <div className="flex flex-wrap justify-center gap-2 mb-2">
                  {avatars.map((a) => (
                    <button key={a} onClick={() => setAvatar(a)} className={`text-2xl p-1.5 rounded-xl transition-all ${avatar === a ? 'bg-[#00e5ff]/20 border border-[#00e5ff] scale-110' : 'hover:bg-gray-800 border border-transparent'}`}>
                      {a}
                    </button>
                  ))}
                </div>
                <button onClick={saveProfile} className="w-full bg-gradient-to-r from-[#00ff88] to-[#00e5ff] text-black font-extrabold py-3 rounded-xl shadow-[0_0_15px_rgba(0,255,136,0.3)] hover:scale-[1.02] transition-all">
                  Save Changes
                </button>
              </div>
            ) : (
              <>
                <h2 className="text-2xl font-black mb-1 tracking-tight text-white">{userName}</h2>
                <p className="text-gray-400 text-xs font-medium uppercase tracking-widest mb-6">Web3 Explorer</p>
                <button onClick={() => setIsEditing(true)} className="w-full bg-[#1e293b] hover:bg-[#334155] border border-gray-700 text-white font-bold py-3 rounded-xl transition-all shadow-lg">
                  Edit Profile
                </button>
              </>
            )}
          </div>

          <div className="bg-[#0f172a]/80 backdrop-blur-xl border border-gray-800/80 rounded-[2rem] p-6 shadow-[0_8px_30px_rgb(0,0,0,0.5)] flex flex-col gap-4">
            <h3 className="text-xs font-bold uppercase tracking-widest text-gray-500 mb-2 pl-2">Linked Accounts</h3>
            
            <div className="flex flex-col bg-black/40 rounded-2xl border border-gray-800/80 overflow-hidden">
              <div className="flex items-center justify-between p-4">
                <div className="flex items-center gap-3">
                  <div className="bg-blue-500/10 p-2.5 rounded-xl text-blue-400 border border-blue-500/20">
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"></path></svg>
                  </div>
                  <div className="flex flex-col">
                    <span className="text-[10px] uppercase font-bold text-gray-500">Email</span>
                    <span className="text-sm font-semibold text-gray-200 truncate max-w-[120px]">{myAcc.email || "Not Linked"}</span>
                  </div>
                </div>
                {myAcc.email ? <span className="text-[#00ff88] text-xs font-bold flex items-center gap-1"><svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7"></path></svg> Linked</span> : (
                  <button onClick={() => setLinkingEmail(!linkingEmail)} className="text-xs bg-blue-600 hover:bg-blue-500 px-4 py-1.5 rounded-lg font-bold shadow-lg transition-colors">Link</button>
                )}
              </div>
              
              {linkingEmail && !myAcc.email && (
                <div className="p-4 bg-[#1e293b]/50 border-t border-gray-800 flex flex-col gap-3">
                  {!linkOtpSent ? (
                    <>
                      <input type="email" placeholder="Enter your email" value={linkEmailInput} onChange={(e)=>setLinkEmailInput(e.target.value)} className="w-full bg-black/50 border border-gray-700 rounded-xl px-4 py-2.5 text-sm outline-none focus:border-blue-500 text-white" />
                      {/* FIX: Corrected onClick handler here */}
                      <button onClick={handleSendLinkOTP} disabled={loading} className="w-full bg-blue-600 hover:bg-blue-500 text-sm py-2.5 rounded-xl font-bold transition-colors">{loading ? "Wait..." : "Send Secure OTP"}</button>
                    </>
                  ) : (
                    <>
                      <input type="text" placeholder="• • • • • •" value={linkOtpInput} onChange={(e)=>setLinkOtpInput(e.target.value)} className="w-full bg-black/50 border border-gray-700 rounded-xl px-4 py-2.5 text-lg font-bold tracking-widest text-center outline-none focus:border-[#00ff88] text-white" />
                      <button onClick={handleVerifyLinkOTP} disabled={loading} className="w-full bg-[#00ff88] hover:bg-[#00e5ff] text-black text-sm py-2.5 rounded-xl font-bold transition-colors">{loading ? "Verifying..." : "Verify & Link"}</button>
                    </>
                  )}
                </div>
              )}
            </div>

            <div className="flex items-center justify-between p-4 bg-black/40 rounded-2xl border border-gray-800/80">
              <div className="flex items-center gap-3">
                <div className="bg-purple-500/10 p-2.5 rounded-xl text-purple-400 border border-purple-500/20">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 10V3L4 14h7v7l9-11h-7z"></path></svg>
                </div>
                <div className="flex flex-col">
                  <span className="text-[10px] uppercase font-bold text-gray-500">Solana Wallet</span>
                  <span className="text-sm font-semibold text-gray-200 truncate max-w-[100px]">{myAcc.wallet || "Not Linked"}</span>
                </div>
              </div>
              {myAcc.wallet ? <span className="text-[#00ff88] text-xs font-bold flex items-center gap-1"><svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7"></path></svg> Linked</span> : (
                 <div className="scale-[0.8] origin-right"><WalletMultiButton className="!bg-purple-600 hover:!bg-purple-500 !rounded-xl" /></div>
              )}
            </div>

            <button onClick={handleLogout} className="w-full mt-4 bg-red-500/10 hover:bg-red-500 text-red-500 hover:text-white font-bold py-3.5 rounded-xl transition-all border border-red-500/20 hover:border-transparent">
              Log Out Securely
            </button>
          </div>
        </div>

        <div className="w-full md:w-2/3 flex flex-col">
          <div className="bg-[#0f172a]/80 backdrop-blur-xl border border-gray-800/80 rounded-[2rem] p-6 sm:p-10 shadow-[0_8px_30px_rgb(0,0,0,0.5)] flex-grow">
            
            <div className="flex justify-between items-center mb-8 border-b border-gray-800/50 pb-4">
              <h2 className="text-2xl font-extrabold text-white">Meeting History</h2>
              <span className="bg-[#00e5ff]/10 text-[#00e5ff] text-[10px] uppercase tracking-wider font-bold px-4 py-1.5 rounded-full border border-[#00e5ff]/30 shadow-[0_0_10px_rgba(0,229,255,0.1)]">
                Last 10 Meetings
              </span>
            </div>

            <div className="flex flex-col gap-4">
              {history.length > 0 ? history.map((meeting, index) => (
                <div key={index} className="p-5 bg-black/40 border border-gray-800/80 hover:border-[#00e5ff]/40 hover:bg-[#1e293b]/40 rounded-2xl transition-all duration-300 flex flex-col sm:flex-row justify-between sm:items-center gap-4 group">
                  <div className="flex flex-col">
                    <div className="flex items-center gap-3 mb-1.5">
                      <span className="text-lg font-black text-white group-hover:text-[#00e5ff] transition-colors">{meeting.id}</span>
                      <span className={`text-[9px] font-bold px-2 py-0.5 rounded uppercase tracking-wider ${meeting.role === 'HOST' ? 'bg-purple-500/20 text-purple-400 border border-purple-500/30' : 'bg-gray-800 text-gray-400 border border-gray-700'}`}>
                        {meeting.role}
                      </span>
                    </div>
                    <span className="text-xs font-medium text-gray-500 flex items-center gap-1.5">
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"></path></svg>
                      {meeting.date}
                    </span>
                  </div>
                  <button 
                    onClick={() => setViewSummary(meeting.summary)}
                    className="bg-[#00e5ff]/10 hover:bg-[#00e5ff] text-[#00e5ff] hover:text-black px-5 py-2.5 rounded-xl text-xs font-extrabold transition-all border border-[#00e5ff]/30 hover:shadow-[0_0_15px_rgba(0,229,255,0.4)] flex items-center justify-center gap-2"
                  >
                    View Report ✨
                  </button>
                </div>
              )) : (
                <div className="text-center py-16 flex flex-col items-center justify-center bg-black/20 rounded-2xl border border-gray-800/50 border-dashed">
                  <div className="w-16 h-16 bg-gray-900 rounded-full flex items-center justify-center mb-4 border border-gray-800">
                    <svg className="w-8 h-8 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4"></path></svg>
                  </div>
                  <p className="text-gray-400 font-medium text-sm">No meeting history found.</p>
                  <p className="text-gray-600 text-xs mt-1">Start an AI recording in a room to see reports here.</p>
                </div>
              )}
            </div>
          </div>
        </div>
      </section>

      <footer className="w-full mt-auto py-8 flex flex-col items-center justify-center gap-5 border-t border-gray-800/60 bg-black/40 backdrop-blur-md relative z-10">
        <h3 className="text-gray-500 text-xs font-black tracking-[0.25em] uppercase">
          BUILD BY <span className="text-white drop-shadow-[0_0_8px_rgba(255,255,255,0.4)]">JUBAYIR69</span>
        </h3>
        <div className="flex items-center gap-5">
          <a href="https://x.com/jubayirhaider90" target="_blank" rel="noopener noreferrer" className="w-12 h-12 rounded-full bg-[#0f172a] border border-gray-700 flex items-center justify-center text-gray-400 hover:text-white hover:border-white hover:bg-black hover:shadow-[0_0_15px_rgba(255,255,255,0.3)] transition-all duration-300 hover:-translate-y-1 group">
            <svg viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5 group-hover:scale-110 transition-transform"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.005 4.15H5.059z"/></svg>
          </a>
          <a href="https://github.com/jubayir-hub-69" target="_blank" rel="noopener noreferrer" className="w-12 h-12 rounded-full bg-[#0f172a] border border-gray-700 flex items-center justify-center text-gray-400 hover:text-black hover:border-white hover:bg-white hover:shadow-[0_0_20px_rgba(255,255,255,0.5)] transition-all duration-300 hover:-translate-y-1 group">
            <svg viewBox="0 0 24 24" fill="currentColor" className="w-6 h-6 group-hover:scale-110 transition-transform"><path d="M12 2A10 10 0 002 12c0 4.42 2.87 8.17 6.84 9.5.5.08.66-.23.66-.5v-1.69c-2.77.6-3.36-1.34-3.36-1.34-.45-1.15-1.11-1.46-1.11-1.46-.9-.62.07-.6.07-.6 1 .07 1.53 1.03 1.53 1.03.87 1.52 2.34 1.07 2.91.83.09-.65.35-1.09.63-1.34-2.22-.25-4.55-1.11-4.55-4.92 0-1.11.38-2 1.03-2.71-.1-.25-.45-1.29.1-2.64 0 0 .84-.27 2.75 1.02.79-.22 1.65-.33 2.5-.33.85 0 1.71.11 2.5.33 1.91-1.29 2.75-1.02 2.75-1.02.55 1.35.2 2.39.1 2.64.65.71 1.03 1.6 1.03 2.71 0 3.82-2.34 4.66-4.57 4.91.36.31.69.92.69 1.85V21c0 .27.16.59.67.5C19.14 20.16 22 16.42 22 12A10 10 0 0012 2z"/></svg>
          </a>
          <a href="https://discordapp.com/users/775330417414635530" target="_blank" rel="noopener noreferrer" className="w-12 h-12 rounded-full bg-[#0f172a] border border-gray-700 flex items-center justify-center text-gray-400 hover:text-white hover:border-[#5865F2] hover:bg-[#5865F2] hover:shadow-[0_0_20px_rgba(88,101,242,0.5)] transition-all duration-300 hover:-translate-y-1 group">
            <svg viewBox="0 0 24 24" fill="currentColor" className="w-6 h-6 group-hover:scale-110 transition-transform"><path d="M20.317 4.3698a19.7913 19.7913 0 00-4.8851-1.5152.0741.0741 0 00-.0785.0371c-.211.3753-.4447.8648-.6083 1.2495-1.8447-.2762-3.68-.2762-5.4868 0-.1636-.3933-.4058-.8742-.6177-1.2495a.077.077 0 00-.0785-.037 19.7363 19.7363 0 00-4.8852 1.515.0699.0699 0 00-.0321.0277C.5334 9.0458-.319 13.5799.0992 18.0578a.0824.0824 0 00.0312.0561c2.0528 1.5076 4.0413 2.4228 5.9929 3.0294a.0777.0777 0 00.0842-.0276c.4616-.6304.8731-1.2952 1.226-1.9942a.076.076 0 00-.0416-.1057c-.6528-.2476-1.2743-.5495-1.8722-.8923a.077.077 0 01-.0076-.1277c.1258-.0943.2517-.1923.3718-.2914a.0743.0743 0 01.0776-.0105c3.9278 1.7933 8.18 1.7933 12.0614 0a.0739.0739 0 01.0785.0095c.1202.099.246.1981.3728.2924a.077.077 0 01-.0066.1276 12.2986 12.2986 0 01-1.873.8914.0766.0766 0 00-.0407.1067c.3604.698.7719 1.3628 1.225 1.9932a.076.076 0 00.0842.0286c1.961-.6067 3.9495-1.5219 6.0023-3.0294a.077.077 0 00.0313-.0552c.5004-5.177-.8382-9.6739-3.5485-13.6604a.061.061 0 00-.0312-.0286zM8.02 15.3312c-1.1825 0-2.1569-1.0857-2.1569-2.419 0-1.3332.9555-2.4189 2.157-2.4189 1.2108 0 2.1757 1.0952 2.1568 2.419 0 1.3332-.9555 2.4189-2.1569 2.4189zm7.9748 0c-1.1825 0-2.1569-1.0857-2.1569-2.419 0-1.3332.9554-2.4189 2.1569-2.4189 1.2108 0 2.1757 1.0952 2.1568 2.419 0 1.3332-.946 2.4189-2.1568 2.4189z"/></svg>
          </a>
        </div>
      </footer>

      {viewSummary && (
        <div className="fixed inset-0 z-[9999] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#0f172a] border border-[#00e5ff]/30 rounded-3xl p-8 max-w-2xl w-full shadow-[0_0_50px_rgba(0,229,255,0.15)] transform transition-all">
            <div className="flex justify-between items-center mb-6 border-b border-gray-800 pb-4">
              <h3 className="text-xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-[#00e5ff] to-[#00ff88] flex items-center gap-2">
                ✨ Meeting Report
              </h3>
              <button onClick={() => setViewSummary(null)} className="text-gray-400 hover:text-white hover:bg-gray-800 transition-colors bg-black/40 border border-gray-800 p-2.5 rounded-xl">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path></svg>
              </button>
            </div>
            <div className="text-gray-300 text-sm whitespace-pre-wrap max-h-[60vh] overflow-y-auto custom-scrollbar pr-4 leading-relaxed font-medium">
              {viewSummary}
            </div>
          </div>
        </div>
      )}
      
      <style dangerouslySetInnerHTML={{__html: `
        @keyframes fadeInUp { from { opacity: 0; transform: translateY(-20px) translateX(-50%); } to { opacity: 1; transform: translateY(0) translateX(-50%); } }
        .animate-fade-in-up { animation: fadeInUp 0.4s cubic-bezier(0.16, 1, 0.3, 1) forwards; }
        .custom-scrollbar::-webkit-scrollbar { width: 6px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: #1e293b; border-radius: 10px; }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: #00e5ff; }
      `}} />
    </main>
  );
}
