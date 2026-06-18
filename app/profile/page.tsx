"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useWallet } from "@solana/wallet-adapter-react";
import dynamic from "next/dynamic";

const WalletMultiButton = dynamic(
  () => import("@solana/wallet-adapter-react-ui").then((mod) => mod.WalletMultiButton),
  { ssr: false }
);

export default function ProfilePage() {
  const router = useRouter();
  const { connected, publicKey, disconnect } = useWallet();

  const [userName, setUserName] = useState("User");
  const [email, setEmail] = useState("");
  const [avatar, setAvatar] = useState("👨‍🚀");
  const [history, setHistory] = useState<any[]>([]);
  const [isEditing, setIsEditing] = useState(false);

  const avatars = ["👨‍🚀", "🥷", "🧙‍♂️", "👩‍🎤", "🤖", "👻", "🦊", "🐼"];

  useEffect(() => {
    const savedEmail = localStorage.getItem("dspaces_email") || "";
    setEmail(savedEmail);

    const savedName = localStorage.getItem("dspaces_username");
    if (savedName) setUserName(savedName);
    else if (savedEmail) setUserName(savedEmail.split("@")[0]);

    const savedAvatar = localStorage.getItem("dspaces_avatar");
    if (savedAvatar) setAvatar(savedAvatar);

    const savedHistory = localStorage.getItem("dspaces_history");
    if (savedHistory) {
      setHistory(JSON.parse(savedHistory));
    } else {
      setHistory([
        { id: "dSpaces-9223", date: "Oct 24, 2026", duration: "45 mins", role: "Host" },
        { id: "dSpaces-1045", date: "Oct 22, 2026", duration: "12 mins", role: "Participant" },
      ]);
    }

    if (!connected && !savedEmail) {
      router.push("/");
    }
  }, [connected, router]);

  const saveProfile = () => {
    localStorage.setItem("dspaces_username", userName);
    localStorage.setItem("dspaces_avatar", avatar);
    setIsEditing(false);
  };

  const handleLogout = () => {
    localStorage.removeItem("dspaces_email");
    if (connected) disconnect();
    router.push("/");
  };

  return (
    <main className="min-h-screen bg-[#0f0f0f] text-white font-sans relative overflow-hidden">
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
            <div className="text-6xl bg-gray-800 w-24 h-24 flex items-center justify-center rounded-full mb-4 border-2 border-blue-500 shadow-[0_0_15px_rgba(59,130,246,0.3)]">
              {avatar}
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
                <button onClick={saveProfile} className="w-full bg-green-600 hover:bg-green-500 text-white font-bold py-2 rounded-xl">
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
              <div className="flex items-center justify-between p-3 bg-black rounded-xl border border-gray-800">
                <div className="flex items-center gap-3">
                  <div className="bg-blue-500/20 p-2 rounded-lg text-blue-500">📧</div>
                  <div className="flex flex-col">
                    <span className="text-xs text-gray-400">Email</span>
                    <span className="text-sm font-semibold truncate max-w-[120px]">{email ? email : "Not Linked"}</span>
                  </div>
                </div>
                {email ? <span className="text-green-500 text-xs font-bold">✔ Linked</span> : <span className="text-gray-500 text-xs">Unlinked</span>}
              </div>

              <div className="flex items-center justify-between p-3 bg-black rounded-xl border border-gray-800">
                <div className="flex items-center gap-3">
                  <div className="bg-purple-500/20 p-2 rounded-lg text-purple-500">💳</div>
                  <div className="flex flex-col">
                    <span className="text-xs text-gray-400">Solana Wallet</span>
                    <span className="text-sm font-semibold truncate max-w-[90px]">{publicKey ? publicKey.toString() : "Not Linked"}</span>
                  </div>
                </div>
                {publicKey ? <span className="text-green-500 text-xs font-bold">✔ Linked</span> : (
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
            
            <div className="mt-8 p-4 bg-purple-500/10 border border-purple-500/20 rounded-2xl flex items-start gap-4">
              <div className="text-2xl">🤖</div>
              <div>
                <h4 className="text-sm font-bold text-purple-400 mb-1">AI Summaries Coming Soon!</h4>
                <p className="text-xs text-gray-400 leading-relaxed">
                  Your future meetings will be automatically transcribed and summarized using advanced AI. You'll be able to see the meeting notes, action items, and who said what right here in your history.
                </p>
              </div>
            </div>

          </div>
        </div>
      </section>
    </main>
  );
}
