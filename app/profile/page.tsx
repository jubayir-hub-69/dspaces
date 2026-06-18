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

  const avatars = ["👨‍🚀", "🥷", "🧙‍♂️", "👩‍🎤", "🤖", "👻", "🦊", "🐼"];

  const showToast = (msg: string) => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(""), 4000);
  };

  // Load User Data strictly from active session
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
      setHistory([
        { id: "dSpaces-9223", date: "Oct 24, 2026", duration: "45 mins", role: "Host" },
        { id: "dSpaces-1045", date: "Oct 22, 2026", duration: "12 mins", role: "Participant" },
      ]);
    } else {
      router.push("/");
    }
  }, [router]);

  // Strict Wallet Linking Logic
  useEffect(() => {
    if (connected && publicKey && myAcc && !myAcc.wallet) {
      const walletStr = publicKey.toString();
      const db = getDb();
      const existingWalletAcc = db.find((a: any) => a.wallet === walletStr);

      if (existingWalletAcc) {
        showToast("This Wallet is already used by another account!");
        disconnect(); 
      } else {
        const updatedDb = db.map((a: any) => (a.email === myAcc.email && a.wallet === myAcc.wallet) ? { ...a, wallet: walletStr } : a);
        saveDb(updatedDb);
        setMyAcc({ ...myAcc, wallet: walletStr });
        showToast("Wallet linked successfully!");
      }
    }
  }, [connected, publicKey, myAcc, disconnect]);

  const handleSendLinkOTP = async () => {
    const emailInput = linkEmailInput.trim();
    if (!emailInput) return showToast("Please enter an email address.");
    
    const db = getDb();
    const existingEmailAcc = db.find((a: any) => a.email === emailInput);
    if (existingEmailAcc) {
      return showToast("This Email is already used by another account!");
    }

    setLoading(true);
    try {
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
    <main className="min-h-screen bg-[#0f0f0f] text-white font-sans relative overflow-hidden">
      
      {toastMsg && (
        <div className="absolute top-6 left-1/2 -translate-x-1/2 z-[1000] bg-blue-600/90 backdrop-blur-md text-white px-6 py-3 rounded-xl shadow-2xl font-semibold text-sm animate-fade-in-up border border-blue-400">
          {toastMsg}
        </div>
      )}

      <div className="absolute top-[-10%] left-[-10%] w-[50%] h-[50%] bg-blue-600/10 blur-[120px] rounded-full pointer-events-none"></div>
      
      <nav className="relative z-10 flex justify-between items-center px-6 py-5 border-b border-gray-800 bg-black/40 backdrop-blur-md">
        <h1 onClick={() => router.push('/')} className="text-2xl font-extrabold cursor-pointer bg-gradient-to-r from-blue-500 to-purple-500 bg-clip-text text-transparent">
          dSpaces
        </h1>
        <button onClick={() => router.push('/')} className="text-sm font-bold bg-gray-800 hover:bg-gray-700 px-4 py-2 rounded-xl transition-all">
          Back to Home
        </button>
      </nav>

      <section className="relative z-10 max-w-4xl mx-auto px-4 py-10 flex flex-col md:flex-row gap-8">
        <div className="w-full md:w-1/3 flex flex-col gap-6">
          <div className="bg-[#1a1a1a] border border-gray-800 rounded-3xl p-6 flex flex-col items-center text-center shadow-2xl">
            
            <div className="relative text-6xl bg-gray-800 w-24 h-24 flex items-center justify-center rounded-full mb-4 border-2 border-blue-500 shadow-[0_0_15px_rgba(59,130,246,0.3)] overflow-hidden group">
              {avatar.startsWith("data:image") ? (
                <img src={avatar} alt="Profile" className="w-full h-full object-cover" />
              ) : (
                <span>{avatar}</span>
              )}
              
              {isEditing && (
                <label className="absolute inset-0 bg-black/60 flex flex-col items-center justify-center cursor-pointer opacity-0 group-hover:opacity-100 transition-opacity">
                  <svg className="w-6 h-6 text-white mb-1" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z"></path><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 13a3 3 0 11-6 0 3 3 0 016 0z"></path></svg>
                  <span className="text-[9px] font-bold text-white uppercase tracking-wider">Upload</span>
                  <input type="file" accept="image/*" className="hidden" onChange={handleImageUpload} />
                </label>
              )}
            </div>
            
            {isEditing ? (
              <div className="w-full flex flex-col gap-3">
                <input 
                  type="text" 
                  value={userName} 
                  onChange={(e) => setUserName(e.target.value)} 
                  className="w-full bg-black border border-gray-700 rounded-xl px-4 py-2 text-center focus:border-blue-500 outline-none"
                />
                <div className="flex flex-wrap justify-center gap-2 my-2">
                  {avatars.map((a) => (
                    <button key={a} onClick={() => setAvatar(a)} className={`text-2xl p-1 rounded-lg ${avatar === a ? 'bg-blue-500/20 border border-blue-500' : 'hover:bg-gray-800'}`}>
                      {a}
                    </button>
                  ))}
                </div>
                <button onClick={saveProfile} className="w-full bg-green-600 hover:bg-green-500 text-white font-bold py-2 rounded-xl mt-2">
                  Save Profile
                </button>
              </div>
            ) : (
              <>
                <h2 className="text-2xl font-bold mb-1">{userName}</h2>
                <p className="text-gray-400 text-sm mb-4">Web3 Meeting Explorer</p>
                <button onClick={() => setIsEditing(true)} className="w-full bg-gray-800 hover:bg-gray-700 text-white font-semibold py-2 rounded-xl transition-all">
                  Edit Profile
                </button>
              </>
            )}
          </div>

          <div className="bg-[#1a1a1a] border border-gray-800 rounded-3xl p-6 shadow-2xl">
            <h3 className="text-sm font-bold uppercase tracking-widest text-gray-500 mb-4">Linked Accounts</h3>
            
            <div className="flex flex-col gap-4">
              <div className="flex flex-col bg-black rounded-xl border border-gray-800 overflow-hidden">
                <div className="flex items-center justify-between p-3">
                  <div className="flex items-center gap-3">
                    <div className="bg-blue-500/20 p-2 rounded-lg text-blue-500">📧</div>
                    <div className="flex flex-col">
                      <span className="text-xs text-gray-400">Email</span>
                      <span className="text-sm font-semibold truncate max-w-[120px]">{myAcc.email ? myAcc.email : "Not Linked"}</span>
                    </div>
                  </div>
                  {myAcc.email ? <span className="text-green-500 text-xs font-bold">✔ Linked</span> : (
                    <button onClick={() => setLinkingEmail(!linkingEmail)} className="text-xs bg-blue-600 hover:bg-blue-500 px-3 py-1.5 rounded-lg font-bold">Link</button>
                  )}
                </div>
                
                {linkingEmail && !myAcc.email && (
                  <div className="p-3 bg-gray-900 border-t border-gray-800 flex flex-col gap-2">
                    {!linkOtpSent ? (
                      <>
                        <input type="email" placeholder="Enter email" value={linkEmailInput} onChange={(e)=>setLinkEmailInput(e.target.value)} className="w-full bg-black border border-gray-700 rounded-lg px-3 py-2 text-xs outline-none" />
                        <button onClick={handleSendLinkOTP} disabled={loading} className="w-full bg-blue-600 text-xs py-2 rounded-lg font-bold">{loading ? "Wait..." : "Send OTP"}</button>
                      </>
                    ) : (
                      <>
                        <input type="text" placeholder="Enter 6-digit OTP" value={linkOtpInput} onChange={(e)=>setLinkOtpInput(e.target.value)} className="w-full bg-black border border-gray-700 rounded-lg px-3 py-2 text-xs outline-none text-center tracking-widest" />
                        <button onClick={handleVerifyLinkOTP} disabled={loading} className="w-full bg-green-600 text-xs py-2 rounded-lg font-bold">{loading ? "Verifying..." : "Verify & Link"}</button>
                      </>
                    )}
                  </div>
                )}
              </div>

              <div className="flex items-center justify-between p-3 bg-black rounded-xl border border-gray-800">
                <div className="flex items-center gap-3">
                  <div className="bg-purple-500/20 p-2 rounded-lg text-purple-500">💳</div>
                  <div className="flex flex-col">
                    <span className="text-xs text-gray-400">Solana Wallet</span>
                    <span className="text-sm font-semibold truncate max-w-[90px]">{myAcc.wallet ? myAcc.wallet : "Not Linked"}</span>
                  </div>
                </div>
                {myAcc.wallet ? <span className="text-green-500 text-xs font-bold">✔ Linked</span> : (
                   <div className="scale-75 origin-right"><WalletMultiButton /></div>
                )}
              </div>
            </div>

            <button onClick={handleLogout} className="w-full mt-6 bg-red-500/10 hover:bg-red-500 text-red-500 hover:text-white font-bold py-3 rounded-xl transition-all">
              Log Out Everything
            </button>
          </div>
        </div>

        <div className="w-full md:w-2/3 flex flex-col gap-6">
          <div className="bg-[#1a1a1a] border border-gray-800 rounded-3xl p-6 sm:p-8 shadow-2xl flex-grow">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-2xl font-bold">Meeting History</h2>
              <span className="bg-blue-500/10 text-blue-400 text-xs font-bold px-3 py-1 rounded-full border border-blue-500/20">
                Last 5 Meetings
              </span>
            </div>

            <div className="flex flex-col gap-4">
              {history.length > 0 ? history.map((meeting, index) => (
                <div key={index} className="p-4 bg-black border border-gray-800 hover:border-blue-500/50 rounded-2xl transition-all flex flex-col sm:flex-row justify-between sm:items-center gap-4">
                  <div className="flex flex-col">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-lg font-bold text-white">{meeting.id}</span>
                      <span className="bg-gray-800 text-gray-300 text-[10px] px-2 py-0.5 rounded uppercase">{meeting.role}</span>
                    </div>
                    <span className="text-sm text-gray-500">📅 {meeting.date} • ⏱ {meeting.duration}</span>
                  </div>
                  <button className="bg-blue-600/20 hover:bg-blue-600 text-blue-400 hover:text-white px-4 py-2 rounded-xl text-sm font-bold transition-all border border-blue-500/30">
                    View AI Summary ✨
                  </button>
                </div>
              )) : (
                <div className="text-center py-10 text-gray-500">
                  <p>No meeting history found.</p>
                </div>
              )}
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
