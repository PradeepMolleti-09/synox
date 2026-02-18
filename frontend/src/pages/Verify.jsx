import React, { useState, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { useWallet } from '../hooks/useWallet';
import { ethers } from 'ethers';
import { SYNOX_ADDRESS, SYNOX_ABI } from '../utils/contract';
import { ShieldCheck, Hash, Search, FileCheck, XCircle } from 'lucide-react';
import { useToast } from '../context/ToastContext';

const Verify = () => {
    const { provider } = useWallet();
    const [meetingId, setMeetingId] = useState("");
    const [cid, setCid] = useState("");
    const [result, setResult] = useState(null);
    const [loading, setLoading] = useState(false);
    const [onChainCid, setOnChainCid] = useState("");
    const { showToast } = useToast();
    const location = useLocation();

    // Auto-fill parameters from URL
    useEffect(() => {
        const params = new URLSearchParams(location.search);
        const id = params.get('id');
        const hash = params.get('hash');
        if (id) setMeetingId(id);
        if (hash) setCid(hash);
    }, [location]);

    const handleVerifySync = async () => {
        if (!provider || !meetingId || !cid) return;
        setLoading(true);
        setOnChainCid("");
        try {
            const contract = new ethers.Contract(SYNOX_ADDRESS, SYNOX_ABI, provider);

            // First, fetch what's actually stored on-chain
            const meeting = await contract.meetings(meetingId);
            const storedCid = meeting.recordingCID;
            setOnChainCid(storedCid);

            console.log("User entered CID:", cid);
            console.log("On-chain CID:", storedCid);
            console.log("Trimmed user CID:", cid.trim());
            console.log("Match:", storedCid === cid.trim());

            const isValid = await contract.verifyMeetingData(meetingId, cid.trim());
            setResult(isValid ? "VALID" : "INVALID");
        } catch (e) {
            console.error(e);
            showToast("Verification failed. Check ID and Hash format.", "error");
        }
        setLoading(false);
    };

    return (
        <div className="min-h-screen pt-24 md:pt-32 px-4 md:px-12 bg-black text-white flex flex-col items-center pb-20">
            <header className="text-center mb-16 max-w-2xl px-4">
                <div className="inline-block p-3 md:p-4 bg-white/5 rounded-2xl md:rounded-3xl border border-white/10 mb-6 font-mono text-[10px] md:text-xs tracking-widest text-gray-500 uppercase">
                    Verification Protocol
                </div>
                <h1 className="text-3xl md:text-5xl lg:text-6xl font-black mb-6 tracking-tighter uppercase leading-none">DATA VERIFICATION</h1>
                <p className="text-sm md:text-lg text-gray-500 font-medium leading-relaxed uppercase tracking-tight">
                    Verify the authenticity of any meeting recording. Match your local file hash (CID)
                    against the tamper-proof record stored on the Ethereum blockchain.
                </p>
            </header>


            <div className="glass-card w-full max-w-xl p-8 border-white/5 shadow-2xl">
                <div className="space-y-6">
                    <div>
                        <label className="text-[10px] font-black tracking-widest text-gray-500 mb-2 block uppercase font-mono">Protocol Index (On-chain ID)</label>
                        <div className="relative">
                            <Search className="absolute left-4 top-3 text-gray-600" size={18} />
                            <input
                                type="number"
                                value={meetingId}
                                onChange={(e) => setMeetingId(e.target.value)}
                                placeholder="Enter Index (e.g. 0, 1, 2...)"
                                className="w-full bg-white/5 border border-white/10 rounded-xl py-3 pl-12 pr-4 text-sm focus:outline-none focus:border-white/30 transition-all font-mono"
                            />
                        </div>
                    </div>

                    <div>
                        <label className="text-[10px] font-black tracking-widest text-gray-500 mb-2 block uppercase">IPFS CID (Hash)</label>
                        <div className="relative">
                            <Hash className="absolute left-4 top-3 text-gray-600" size={18} />
                            <input
                                type="text"
                                value={cid}
                                onChange={(e) => setCid(e.target.value)}
                                placeholder="Qm..."
                                className="w-full bg-white/5 border border-white/10 rounded-xl py-3 pl-12 pr-4 text-sm focus:outline-none focus:border-white/30 transition-all font-mono"
                            />
                        </div>
                    </div>

                    <button
                        onClick={handleVerifySync}
                        disabled={loading || !meetingId || !cid}
                        className="w-full py-4 bg-white text-black font-black tracking-widest rounded-xl hover:bg-gray-200 transition-all disabled:opacity-50 flex items-center justify-center gap-2"
                    >
                        {loading ? "SEARCHING LEDGER..." : "COMPARE ON-CHAIN"}
                    </button>
                </div>

                {result && (
                    <div className={`mt-8 p-6 rounded-2xl border flex flex-col gap-4 animate-in fade-in zoom-in duration-300 ${result === 'VALID' ? 'bg-green-500/10 border-green-500/30 text-green-500' : 'bg-red-500/10 border-red-500/30 text-red-500'}`}>
                        <div className="flex items-center gap-6">
                            {result === 'VALID' ? <FileCheck size={48} /> : <XCircle size={48} />}
                            <div>
                                <p className="text-xl font-black tracking-tighter uppercase">{result} MATCH</p>
                                <p className="text-sm font-medium opacity-70">
                                    {result === 'VALID'
                                        ? "This data matches the official blockchain record for this meeting."
                                        : "Warning: This hash does not match the record stored for this Meeting ID."}
                                </p>
                            </div>
                        </div>
                        {onChainCid && (
                            <div className="text-xs font-mono bg-black/20 p-4 rounded-lg border border-white/10">
                                <p className="text-gray-400 mb-2">ON-CHAIN HASH:</p>
                                <p className="text-white break-all">{onChainCid || "(empty)"}</p>
                                <p className="text-gray-400 mt-3 mb-2">YOUR INPUT:</p>
                                <p className="text-white break-all">{cid}</p>
                            </div>
                        )}
                    </div>
                )}
            </div>

            <div className="mt-16 grid grid-cols-1 md:grid-cols-3 gap-8 max-w-4xl text-center">
                {[
                    { title: "TAMPER-PROOF", desc: "Digital fingerprints are permanent on Ethereum." },
                    { title: "ZERO TRUST", desc: "Verify any recording without asking the host." },
                    { title: "CRYPTOGRAPHY", desc: "Uses Keccak-256 hashing for bit-precise matching." }
                ].map((item, i) => (
                    <div key={i}>
                        <h4 className="text-[10px] font-black tracking-widest text-white mb-2">{item.title}</h4>
                        <p className="text-xs text-gray-500 leading-relaxed uppercase">{item.desc}</p>
                    </div>
                ))}
            </div>
        </div>
    );
};

export default Verify;
