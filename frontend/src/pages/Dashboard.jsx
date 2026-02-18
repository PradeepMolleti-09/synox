import React, { useState, useEffect } from 'react';
import { useWallet } from '../hooks/useWallet';
import { ethers } from 'ethers';
import { SYNOX_ADDRESS, SYNOX_ABI } from '../utils/contract';
import { Plus, Check, Clock, ExternalLink, Share2, Copy, ShieldCheck, ShieldAlert, Play, X, Lock, Unlock, Zap, Hash, Globe } from 'lucide-react';
import { Link, useLocation } from 'react-router-dom';
import { useToast } from '../context/ToastContext';

const Dashboard = () => {
    const { provider, signer, account } = useWallet();
    const [meetings, setMeetings] = useState([]);
    const [title, setTitle] = useState("");
    const [loading, setLoading] = useState(false);
    const [initialLoading, setInitialLoading] = useState(true);
    const [copiedId, setCopiedId] = useState(null);
    const [manualHuddleId, setManualHuddleId] = useState("");
    const { showToast } = useToast();
    const [playbackUrl, setPlaybackUrl] = useState(null);
    const [viewingRecording, setViewingRecording] = useState(null);
    const [isDecrypting, setIsDecrypting] = useState(false);
    const [decrypted, setDecrypted] = useState(false);
    const location = useLocation();
    const isArchiveView = location.pathname === '/meetings';

    // Body Scroll Lock for Playback
    useEffect(() => {
        if (viewingRecording) {
            document.body.style.overflow = 'hidden';
        } else {
            document.body.style.overflow = 'unset';
        }
        return () => { document.body.style.overflow = 'unset'; };
    }, [viewingRecording]);

    const startPlayback = (m) => {
        setViewingRecording(m);
        setDecrypted(false);
        setPlaybackUrl(null);
    };

    const handleDecrypt = async () => {
        if (!signer || !viewingRecording) return;
        setIsDecrypting(true);

        try {
            const { getSessionSignatureMessage, decryptFile } = await import('../utils/storage');
            const msg = getSessionSignatureMessage(viewingRecording.id);
            const signature = await signer.signMessage(msg);

            let encryptedBuffer;
            if (viewingRecording.cid.startsWith("QmDemo")) {
                const demoData = sessionStorage.getItem(viewingRecording.id.startsWith('QmDemo') ? viewingRecording.id : viewingRecording.cid);
                if (!demoData) throw new Error("Demo archive lost. Use a real IPFS provider for persistence.");
                encryptedBuffer = await (await fetch(demoData)).arrayBuffer();
            } else {
                const response = await fetch(`https://gateway.pinata.cloud/ipfs/${viewingRecording.cid}`);
                if (!response.ok) throw new Error("IPFS retrieval failed. Gateway might be congested.");
                encryptedBuffer = await response.arrayBuffer();
            }

            const decryptedArrayBuffer = await decryptFile(new Uint8Array(encryptedBuffer), signature);
            const header = new Uint8Array(decryptedArrayBuffer.slice(0, 4));
            const isVideo = header[0] === 0x1A && header[1] === 0x45;

            if (isVideo) {
                const url = URL.createObjectURL(new Blob([decryptedArrayBuffer], { type: 'video/webm' }));
                setPlaybackUrl(url);
            } else {
                const text = new TextDecoder().decode(decryptedArrayBuffer);
                try {
                    const json = JSON.parse(text);
                    setPlaybackUrl({ type: 'json', data: json });
                } catch {
                    throw new Error("Undecipherable content in archive.");
                }
            }
            setDecrypted(true);
            showToast("Archive Decrypted Successfully", "success");
        } catch (e) {
            console.error("Decryption failed:", e);
            showToast("Security Violation: " + e.message, "error");
        } finally {
            setIsDecrypting(false);
        }
    };


    const copyInviteLink = (id) => {
        const url = `${window.location.origin}/room/${id}`;
        navigator.clipboard.writeText(url);
        setCopiedId(id);
        setTimeout(() => setCopiedId(null), 2000);
    };

    const fetchMeetings = async () => {
        if (!provider) return;
        try {
            const contract = new ethers.Contract(SYNOX_ADDRESS, SYNOX_ABI, provider);
            const count = await contract.meetingCount();
            const items = [];
            for (let i = 0; i < count; i++) {
                const m = await contract.meetings(i);
                items.push({
                    id: Number(m.id),
                    title: m.title,
                    huddleId: m.huddleId,
                    host: m.host,
                    active: m.isActive,
                    createdTime: Number(m.createdTime),
                    cid: m.recordingCID
                });
            }
            const filteredItems = isArchiveView ? items : items.filter(m => m.active);
            setMeetings(filteredItems.reverse());
        } catch (e) {
            console.error("Failed to load meetings:", e);
        }
        setInitialLoading(false);
    };


    useEffect(() => {
        fetchMeetings();
    }, [provider, isArchiveView]);

    const createMeeting = async () => {
        if (!title || !signer) return;
        setLoading(true);
        try {
            // Jitsi Meet rooms are created on the fly, no API call needed
            const huddleId = manualHuddleId || `synox09-${Math.random().toString(36).substring(7)}`;

            const contract = new ethers.Contract(SYNOX_ADDRESS, SYNOX_ABI, signer);
            const tx = await contract.createMeeting(title, huddleId);
            await tx.wait();

            setTitle("");
            setManualHuddleId("");
            await fetchMeetings();
            showToast("✓ Protocol Session Initialized and Registered on Ethereum", "success");
        } catch (e) {
            console.error(e);
            showToast("Security Protocol Error: " + e.message, "error");
        }
        setLoading(false);
    };



    return (
        <div className="min-h-screen pt-24 md:pt-32 px-4 md:px-12 bg-black pb-20">
            <header className="flex flex-col lg:flex-row justify-between items-start lg:items-center mb-12 border-b border-white/10 pb-8 gap-8">
                <div className="max-w-xl">
                    <h1 className="text-3xl md:text-5xl font-black tracking-tighter mb-4 uppercase leading-none">
                        {isArchiveView ? "Meeting Archive" : "Protocol Dashboard"}
                    </h1>
                    <p className="text-gray-500 font-medium text-xs md:text-sm uppercase tracking-widest leading-relaxed">
                        {isArchiveView ? "Historical cryptographically-verified meeting ledger." : "Initialize new sessions and manage active protocol rooms."}
                    </p>
                </div>

                <div className="flex flex-col sm:flex-row w-full lg:w-auto gap-4 items-stretch sm:items-center bg-zinc-900/40 p-3 rounded-2xl backdrop-blur-xl border border-white/10 focus-within:border-white/20 transition-all shadow-2xl">
                    {!isArchiveView && (
                        <>
                            <input
                                value={title}
                                onChange={(e) => setTitle(e.target.value)}
                                placeholder="SESSION NAME..."
                                className="bg-transparent px-4 py-3 w-full sm:w-48 text-xs font-black tracking-widest text-white focus:outline-none placeholder:text-gray-700 uppercase"
                            />
                            <button
                                onClick={createMeeting}
                                disabled={loading || !account}
                                className="bg-white text-black px-8 py-3 rounded-xl font-black hover:bg-zinc-200 transition-all text-[10px] tracking-[0.2em] flex items-center justify-center gap-3 disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
                            >
                                {loading ? <Clock className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                                {loading ? "INITIALIZING..." : "CREATE ROOM"}
                            </button>
                        </>
                    )}
                </div>

            </header>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                {initialLoading ? (
                    [1, 2, 3, 4].map(i => (
                        <div key={i} className="glass-card h-[220px] border border-white/5 animate-pulse bg-white/5 rounded-2xl"></div>
                    ))
                ) : (
                    <>
                        {meetings.map((m) => (
                            <div key={m.id} className="glass-card group relative overflow-hidden p-6 flex flex-col justify-between min-h-[220px] border border-white/5 hover:border-white/20 hover:shadow-2xl hover:shadow-blue-500/10 transition-all duration-500">
                                <div className="absolute top-0 right-0 w-32 h-32 bg-gradient-to-br from-white/5 to-transparent rounded-bl-full pointer-events-none group-hover:from-white/10 transition-colors"></div>

                                <div>
                                    <div className="flex justify-between items-start mb-6 relative z-10">
                                        <div className={`px-2.5 py-1 rounded text-[8px] font-black tracking-[0.2em] flex items-center gap-2 ${m.active ? 'bg-green-500/10 text-green-400 border border-green-500/20' : 'bg-red-500/10 text-red-400 border border-red-500/20'}`}>
                                            <div className={`w-1.5 h-1.5 rounded-full ${m.active ? 'bg-green-400 animate-pulse' : 'bg-red-400'}`}></div>
                                            {m.active ? 'LIVE' : 'ENDED'}
                                        </div>
                                        <div className="flex flex-col items-end gap-1.5">
                                            <span className="text-gray-600 text-[8px] font-black tracking-widest border border-white/5 px-2 py-0.5 rounded uppercase bg-white/5">#{m.id}</span>
                                        </div>
                                    </div>

                                    <h3 className="text-xl font-black tracking-tighter truncate mb-2 uppercase group-hover:text-blue-400 transition-colors">{m.title}</h3>
                                    <p className="text-[9px] text-gray-500 font-bold mb-1 truncate uppercase tracking-widest opacity-60">HOST: {m.host.slice(0, 6)}...{m.host.slice(-4)}</p>

                                    <p className="text-[9px] text-blue-500 font-bold mb-2 truncate uppercase tracking-widest leading-none">
                                        HASH: {m.cid && m.cid !== "" && m.cid !== "NOT_FINALIZED" ? `${m.cid.slice(0, 12)}...` : (m.active ? "SECURED ON-CHAIN" : "AWAITING FINALITY")}
                                    </p>
                                    <div className="flex justify-between items-center bg-white/5 p-2 rounded-lg border border-white/5">
                                        <p className="text-[8px] text-gray-500 font-bold uppercase tracking-widest leading-none">{new Date(m.createdTime * 1000).toLocaleDateString()}</p>
                                        {m.active && (
                                            <button
                                                onClick={() => copyInviteLink(m.id)}
                                                className="flex items-center gap-1.5 text-[8px] font-black text-white/40 hover:text-white transition-colors uppercase tracking-widest"
                                            >
                                                {copiedId === m.id ? <Check size={10} className="text-green-500" /> : <Copy size={10} />}
                                                {copiedId === m.id ? "COPIED" : "INVITE"}
                                            </button>
                                        )}
                                    </div>
                                </div>

                                <div className="mt-8 relative z-10 grid grid-cols-2 gap-2">
                                    {!m.active && (
                                        <button
                                            onClick={() => startPlayback(m)}
                                            className="bg-white text-black py-3 rounded-xl font-black text-[9px] tracking-[0.2em] hover:bg-zinc-200 transition-all flex items-center justify-center gap-1.5 shadow-lg shadow-white/5"
                                        >
                                            <Play size={10} fill="black" /> PLAYBACK
                                        </button>
                                    )}
                                    <Link
                                        to={`/verify?id=${m.id}&hash=${m.cid}`}
                                        className={`bg-zinc-900 text-blue-400 border border-blue-500/20 py-2.5 rounded-lg font-black text-[9px] tracking-[0.2em] hover:bg-blue-500/10 hover:border-blue-500/40 transition-all flex items-center justify-center gap-1.5 ${m.active ? 'col-span-2' : ''}`}
                                    >
                                        <ShieldCheck size={10} /> VERIFY
                                    </Link>
                                    {m.active && (
                                        <Link to={`/room/${m.id}`} className="col-span-2 w-full bg-white text-black py-3 rounded-lg font-black text-[9px] tracking-[0.2em] hover:bg-zinc-200 transition-all flex items-center justify-center gap-2 group-hover:scale-[1.02] transition-transform">
                                            LAUNCH SESSION <ExternalLink size={12} />
                                        </Link>
                                    )}
                                </div>
                            </div>
                        ))}

                        {meetings.length === 0 && (
                            <div className="col-span-full py-24 flex flex-col items-center justify-center border border-dashed border-white/5 rounded-3xl bg-white/[0.02] backdrop-blur-sm">
                                <ShieldAlert className="w-12 h-12 text-zinc-800 mb-4" />
                                <h3 className="text-zinc-500 font-bold tracking-[0.3em] text-xs uppercase mb-2">
                                    {isArchiveView ? "PROTOCOL LEDGER: VOID" : "SYSTEM STATUS: IDLE"}
                                </h3>
                                <p className="text-zinc-600 text-[10px] font-mono uppercase tracking-widest max-w-[300px] text-center leading-relaxed">
                                    {isArchiveView
                                        ? "No cryptographically-verified sessions found in the historical blockchain registry."
                                        : "Protocol is ready for deployment. Initialize a new room at the top to begin a secure session."}
                                </p>
                                {!account && (
                                    <div className="mt-6 px-4 py-2 bg-yellow-500/10 border border-yellow-500/20 rounded-lg">
                                        <p className="text-[10px] text-yellow-500 font-black tracking-widest uppercase">Encryption Disabled: Connect Wallet</p>
                                    </div>
                                )}
                            </div>
                        )}
                    </>
                )}
            </div>

            {/* Playback Modal */}
            {viewingRecording && (
                <div className="fixed inset-0 z-[100] bg-black/90 backdrop-blur-xl flex items-center justify-center p-6 md:p-12">
                    <button
                        onClick={() => setViewingRecording(null)}
                        className="absolute top-8 right-8 text-white/40 hover:text-white transition-colors"
                    >
                        <X size={32} />
                    </button>

                    <div className="w-full max-w-5xl overflow-hidden rounded-[2rem] border border-white/10 shadow-[0_0_100px_rgba(0,0,0,0.8)] bg-zinc-950 relative flex flex-col">
                        {!decrypted ? (
                            <div className="p-12 md:p-20 text-center flex flex-col items-center justify-center">
                                <div className="w-24 h-24 bg-blue-500/10 rounded-3xl flex items-center justify-center mb-8 border border-blue-500/20 shadow-2xl relative group">
                                    <Lock className="text-blue-500 group-hover:scale-110 transition-transform" size={40} />
                                    <div className="absolute -top-1 -right-1 w-4 h-4 bg-blue-500 rounded-full animate-pulse" />
                                </div>
                                <h2 className="text-3xl font-black tracking-tighter uppercase mb-4">Encrypted Session Archive</h2>
                                <p className="text-zinc-500 text-xs md:text-sm font-medium uppercase tracking-widest max-w-md mb-12 leading-relaxed">
                                    The proof for this session is sealed with AES-GCM-256. Provide your cryptographic signature to derive the shared meeting key.
                                </p>

                                <div className="w-full max-w-md bg-white/[0.02] border border-white/10 rounded-2xl p-6 mb-12 text-left relative overflow-hidden group">
                                    <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
                                        <Hash size={40} />
                                    </div>
                                    <span className="text-[10px] font-black text-blue-500 tracking-[0.2em] uppercase block mb-3">Protocol CID (Hash)</span>
                                    <p className="text-xs font-mono text-zinc-300 break-all leading-relaxed select-all">
                                        {viewingRecording.cid}
                                    </p>
                                </div>

                                <button
                                    onClick={handleDecrypt}
                                    disabled={isDecrypting}
                                    className="px-12 py-5 bg-white text-black rounded-2xl font-black tracking-[0.3em] uppercase text-xs hover:bg-blue-400 hover:text-white transition-all shadow-2xl shadow-white/5 flex items-center gap-4 disabled:opacity-50 group"
                                >
                                    {isDecrypting ? <Activity className="animate-spin" /> : <Unlock className="group-hover:rotate-12 transition-transform" />}
                                    {isDecrypting ? "DECRYPTING..." : "DECRYPT & AUTHORIZE"}
                                </button>
                            </div>
                        ) : (
                            <div className="h-full w-full relative group aspect-video bg-black">
                                {typeof playbackUrl === 'string' ? (
                                    <video
                                        className="h-full w-full object-contain"
                                        autoPlay
                                        controls
                                        src={playbackUrl}
                                    />
                                ) : playbackUrl?.type === 'json' ? (
                                    <div className="flex flex-col items-center justify-center h-full p-12 text-center bg-zinc-950">
                                        <ShieldCheck className="w-20 h-20 text-blue-500 mb-8" />
                                        <h3 className="text-2xl font-black tracking-tighter uppercase mb-2">Verified Ledger Shard</h3>
                                        <p className="text-zinc-500 text-[10px] font-mono mb-12 max-w-md uppercase tracking-widest leading-none">Participant proof verified. No video buffer captured.</p>
                                        <pre className="bg-black/80 p-8 rounded-[2rem] border border-white/5 text-[11px] font-mono text-left max-h-[300px] overflow-y-auto w-full text-blue-400 shadow-2xl">
                                            {JSON.stringify(playbackUrl.data, null, 2)}
                                        </pre>
                                    </div>
                                ) : null}
                                <div className="absolute top-6 left-6 flex flex-col gap-2 z-10 pointer-events-none">
                                    <div className="bg-green-500/20 border border-green-500/40 px-4 py-2 rounded-xl backdrop-blur-xl flex items-center gap-2 shadow-2xl">
                                        <Unlock size={14} className="text-green-500" />
                                        <span className="text-[10px] font-black tracking-[0.2em] text-green-500 uppercase">
                                            {typeof playbackUrl === 'string' ? "LIVE PROOF" : "LEDGER ONLY"}
                                        </span>
                                    </div>
                                    <div className="bg-black/60 border border-white/10 px-4 py-2 rounded-xl backdrop-blur-xl flex items-center gap-2 shadow-2xl">
                                        <Zap size={14} className="text-blue-400" />
                                        <span className="text-[10px] font-black tracking-[0.2em] text-white/70 uppercase">
                                            {viewingRecording.cid.slice(0, 15)}...
                                        </span>
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
};

export default Dashboard;
