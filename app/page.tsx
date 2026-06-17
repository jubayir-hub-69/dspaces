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
  const [loading, setLoading] = useState(false);
  const [statusMsg, setStatusMsg] = useState("");

  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const joinId = urlParams.get("room") || urlParams.get("id");
    if (joinId) setRoomId(joinId);

    const savedEmail = localStorage.getItem("dspaces_email");
    if (savedEmail) {
      setEmailAuthenticated(true);
      if (!userName) setUserName(savedEmail.split("@")[0]);
    }
  }, []);

  const handleSendOTP = async () => {
    if (!email.trim()) {
      alert("Please enter a valid email address.");
      return;
    }
    setLoading(true);
    setStatusMsg("Sending...");
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
    setStatusMsg("Verifying...");
    try {
      const res = await fetch("/api/verify-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ otp: otp.trim() }),
      });
      const data = await res.json();
      if (data.success) {
        setEmailAuthenticated(true);
        localStorage.setItem("dspaces_email", data.email);
        setUserName(data.email.split("@")[0]);
        setStatusMsg("Email verified successfully!");
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
    setEmail("");
    setOtp("");
    setOtpSent(false);
    setStatusMsg("Logged out.");
  };

  const isAuthenticated = connected || emailAuthenticated;

  return (
    <main className="min-h-screen bg-gray-950 text-white p-4">
      <nav className="flex justify-between items-center p-4">
        <h1 className="text-2xl font-bold text-blue-500">dSpaces</h1>
        <WalletMultiButton />
      </nav>

      <section className="flex flex-col items-center justify-center py-10 text-center">
        <h1 className="text-4xl sm:text-6xl font-extrabold mb-6 bg-gradient-to-r from-blue-400 to-purple-500 bg-clip-text text-transparent">
          The Future of Web3 Meetings
        </h1>

        <div className="flex flex-col gap-4 w-full max-w-sm bg-gray-900 p-6 rounded-2xl border border-gray-800 shadow-2xl transition-all duration-300">

          {!isAuthenticated ? (
            <>
              <div className="text-sm mb-2 p-3 bg-gray-950 rounded-lg border border-gray-800 text-yellow-500 font-medium">
                Please login to access meetings.
              </div>

              <div className="flex flex-col gap-4 bg-gray-950 p-4 rounded-xl border border-gray-800">
                <div className="text-left">
                  <label className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2 block">Option 1: Connect Wallet</label>
                  <div className="flex justify-center w-full">
                    <WalletMultiButton style={{ width: "100%", justifyContent: "center", backgroundColor: "#4f46e5" }} />
                  </div>
                </div>

                <div className="flex items-center my-1">
                  <div className="flex-grow border-t border-gray-700"></div>
                  <span className="px-3 text-gray-500 text-xs font-bold uppercase">OR</span>
                  <div className="flex-grow border-t border-gray-700"></div>
                </div>

                <div className="text-left">
                  <label className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2 block">Option 2: Email Login</label>
                  <div className="flex gap-2">
                    <input
                      type="email"
                      placeholder="name@example.com"
                      value={email}
                      disabled={otpSent}
                      onChange={(e) => setEmail(e.target.value)}
                      className="flex-1 px-3 py-2 bg-gray-900 border border-gray-700 rounded-lg text-white text-sm focus:outline-none focus:border-blue-500"
                    />
                    {!otpSent ? (
                      <button
                        onClick={handleSendOTP}
                        disabled={loading}
                        className="px-3 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-800 text-white font-bold rounded-lg text-xs transition-all whitespace-nowrap"
                      >
                        {loading ? "Wait..." : "Get OTP"}
                      </button>
                    ) : (
                      <button
                        onClick={() => { setOtpSent(false); setOtp(""); }}
                        className="px-2 py-1 bg-gray-700 hover:bg-gray-600 text-white rounded-lg text-xs"
                      >
                        Edit
                      </button>
                    )}
                  </div>

                  {otpSent && (
                    <div className="flex flex-col gap-2 mt-2">
                      <input
                        type="text"
                        placeholder="Enter 6-Digit Code"
                        value={otp}
                        maxLength={6}
                        onChange={(e) => setOtp(e.target.value)}
                        className="px-3 py-2 bg-gray-900 border border-gray-700 rounded-lg text-white text-sm text-center tracking-widest focus:outline-none focus:border-blue-500"
                      />
                      <button
                        onClick={handleVerifyOTP}
                        disabled={loading}
                        className="w-full py-2 bg-green-600 hover:bg-green-700 disabled:bg-green-800 text-white font-bold rounded-lg text-sm transition-all"
                      >
                        {loading ? "Verifying..." : "Verify & Login"}
                      </button>
                    </div>
                  )}
                  {statusMsg && <p className="text-xs text-center font-medium mt-2 text-blue-400">{statusMsg}</p>}
                </div>
              </div>
            </>
          ) : (
            <>
              <div className="text-xs p-3 bg-gray-950 rounded-lg border border-gray-800 text-left">
                {connected ? (
                  <p className="text-green-400 font-bold flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></span>
                    Wallet Linked: {publicKey?.toString().substring(0, 6)}...
                  </p>
                ) : (
                  <div className="flex justify-between items-center">
                    <p className="text-green-400 font-bold flex items-center gap-2 truncate mr-2">
                      <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></span>
                      Email: {localStorage.getItem("dspaces_email")}
                    </p>
                    <button onClick={handleLogoutEmail} className="text-red-400 underline hover:text-red-300">Logout</button>
                  </div>
                )}
              </div>

              <div className="flex flex-col gap-3 mt-2">
                <div className="text-left">
                  <label className="text-[11px] font-semibold text-gray-400 uppercase ml-1">Your Display Name</label>
                  <input
                    type="text"
                    placeholder="Enter Your Name..."
                    value={userName}
                    onChange={(e) => setUserName(e.target.value)}
                    className="px-4 py-3 bg-gray-950 border border-gray-700 rounded-lg text-white focus:outline-none focus:border-blue-500 w-full mt-1"
                  />
                </div>
                
                <div className="text-left">
                  <label className="text-[11px] font-semibold text-gray-400 uppercase ml-1">Room ID / Link (Optional)</label>
                  <input
                    type="text"
                    placeholder="Enter Room ID to Join..."
                    value={roomId}
                    onChange={(e) => setRoomId(e.target.value)}
                    className="px-4 py-3 bg-gray-950 border border-gray-700 rounded-lg text-white focus:outline-none focus:border-blue-500 w-full mt-1"
                  />
                </div>

                <div className="flex flex-col gap-2 w-full mt-2 pt-2 border-t border-gray-800">
                  <button onClick={handleCreateRoom} className="py-3 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-lg transition-all shadow-lg">
                    Create New Room
                  </button>
                  <button onClick={handleJoinRoom} className="py-3 bg-gray-800 hover:bg-gray-700 text-white font-bold rounded-lg transition-all border border-gray-700">
                    Join Existing
                  </button>
                </div>
              </div>
            </>
          )}

        </div>
      </section>
    </main>
  );
}
