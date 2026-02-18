import React, { useState, useEffect } from 'react';
import { useWallet } from '../hooks/useWallet';
import { ethers } from 'ethers';
import { SYNOX_ADDRESS, SYNOX_ABI } from '../utils/contract';
import { Vote, FileText, Clock, Users, Plus } from 'lucide-react';
import { useToast } from '../context/ToastContext';

const Governance = () => {
    const { provider, signer, account } = useWallet();
    const [proposals, setProposals] = useState([]);
    const [desc, setDesc] = useState("");
    const [loading, setLoading] = useState(false);
    const { showToast } = useToast();

    const fetchProposals = async () => {
        if (!provider) return;
        try {
            const contract = new ethers.Contract(SYNOX_ADDRESS, SYNOX_ABI, provider);
            const count = await contract.proposalCount();
            const items = [];
            for (let i = 0; i < count; i++) {
                const p = await contract.proposals(i);
                items.push({
                    id: Number(p.id),
                    description: p.description,
                    voteFor: Number(p.voteFor),
                    voteAgainst: Number(p.voteAgainst),
                    deadline: Number(p.deadline),
                    executed: p.executed,
                    creator: p.creator
                });
            }
            setProposals(items.reverse());
        } catch (e) {
            console.error("Proposals fetch failed", e);
        }
    };

    useEffect(() => {
        fetchProposals();
    }, [provider]);

    const createProposal = async () => {
        if (!desc || !signer) return;
        setLoading(true);
        try {
            const contract = new ethers.Contract(SYNOX_ADDRESS, SYNOX_ABI, signer);
            const tx = await contract.createProposal(desc, 3600 * 24 * 7); // 1 week
            await tx.wait();
            setDesc("");
            await fetchProposals();
            showToast("✓ Governance Proposal Registered on Ledger", "success");
        } catch (e) {
            console.error(e);
            showToast("Protocol Restriction: Only established NFT holders can propose.", "error");
        }
        setLoading(false);
    };

    const castVote = async (id, support) => {
        if (!signer) return;
        try {
            const contract = new ethers.Contract(SYNOX_ADDRESS, SYNOX_ABI, signer);
            const tx = await contract.vote(id, support);
            await tx.wait();
            await fetchProposals();
            showToast("✓ Vote Cryptographically Recorded", "success");
        } catch (e) {
            console.error(e);
            showToast("Vote Rejected: Identity validation failed or already voted.", "error");
        }
    };


    return (
        <div className="min-h-screen pt-24 md:pt-32 px-4 md:px-12 bg-black pb-20">
            <header className="flex flex-col lg:flex-row justify-between items-start lg:items-center mb-12 border-b border-white/10 pb-8 gap-8">
                <div className="max-w-xl">
                    <h1 className="text-3xl md:text-5xl font-black tracking-tighter mb-4 uppercase leading-none">
                        Governance
                    </h1>
                    <p className="text-gray-500 font-medium text-xs md:text-sm uppercase tracking-widest leading-relaxed">
                        On-chain DAO proposals and decentralized voting. Use your reputation to shape the protocol.
                    </p>
                </div>

                <div className="flex flex-col sm:flex-row w-full lg:w-auto gap-4 items-stretch sm:items-center bg-zinc-900/40 p-3 rounded-2xl backdrop-blur-xl border border-white/10 focus-within:border-white/20 transition-all shadow-2xl">
                    <input
                        value={desc}
                        onChange={(e) => setDesc(e.target.value)}
                        placeholder="PROPOSAL DESCRIPTION..."
                        className="bg-transparent px-4 py-3 w-full sm:w-64 text-xs font-black tracking-widest text-white focus:outline-none placeholder:text-gray-700 uppercase"
                    />
                    <button
                        onClick={createProposal}
                        disabled={loading || !account}
                        className="bg-white text-black px-8 py-3 rounded-xl font-black hover:bg-zinc-200 transition-all text-[10px] tracking-[0.2em] flex items-center justify-center gap-3 disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
                    >
                        {loading ? <Clock className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                        PROPOSE
                    </button>
                </div>
            </header>


            <div className="grid grid-cols-1 gap-6 max-w-4xl mx-auto">
                {proposals.map((p) => (
                    <div key={p.id} className="glass-card p-8 border border-white/5 hover:border-white/20 transition-all">
                        <div className="flex justify-between items-start mb-6">
                            <div className="flex items-center gap-3">
                                <div className="p-3 bg-white/5 rounded-xl">
                                    <FileText className="text-gray-400" size={24} />
                                </div>
                                <div>
                                    <h3 className="text-xl font-bold">{p.description}</h3>
                                    <p className="text-xs text-gray-500 font-mono mt-1">ID: #{p.id} | Creator: {p.creator.slice(0, 6)}...{p.creator.slice(-4)}</p>
                                </div>
                            </div>
                            <div className="text-right">
                                <p className="text-[10px] font-bold tracking-widest text-gray-500 mb-1">DEADLINE</p>
                                <p className="text-sm font-light text-white">{new Date(p.deadline * 1000).toLocaleDateString()}</p>
                            </div>
                        </div>

                        <div className="grid grid-cols-2 gap-4 mb-8">
                            <div className="bg-zinc-900/50 p-4 rounded-2xl border border-white/5">
                                <div className="flex justify-between items-center mb-2">
                                    <span className="text-xs font-bold text-gray-500 tracking-widest">FOR</span>
                                    <span className="text-lg font-bold text-green-500">{p.voteFor}</span>
                                </div>
                                <div className="w-full bg-gray-800 h-1.5 rounded-full overflow-hidden">
                                    <div className="bg-green-500 h-full" style={{ width: `${(p.voteFor / (p.voteFor + p.voteAgainst || 1)) * 100}%` }}></div>
                                </div>
                            </div>
                            <div className="bg-zinc-900/50 p-4 rounded-2xl border border-white/5">
                                <div className="flex justify-between items-center mb-2">
                                    <span className="text-xs font-bold text-gray-500 tracking-widest">AGAINST</span>
                                    <span className="text-lg font-bold text-red-500">{p.voteAgainst}</span>
                                </div>
                                <div className="w-full bg-gray-800 h-1.5 rounded-full overflow-hidden">
                                    <div className="bg-red-500 h-full" style={{ width: `${(p.voteAgainst / (p.voteFor + p.voteAgainst || 1)) * 100}%` }}></div>
                                </div>
                            </div>
                        </div>

                        <div className="flex gap-4">
                            <button
                                onClick={() => castVote(p.id, true)}
                                className="flex-1 py-3 bg-green-500/10 text-green-500 border border-green-500/20 rounded-xl font-bold text-xs tracking-widest hover:bg-green-500 hover:text-black transition-all"
                            >
                                VOTE FOR
                            </button>
                            <button
                                onClick={() => castVote(p.id, false)}
                                className="flex-1 py-3 bg-red-500/10 text-red-500 border border-red-500/20 rounded-xl font-bold text-xs tracking-widest hover:bg-red-500 hover:text-black transition-all"
                            >
                                VOTE AGAINST
                            </button>
                        </div>
                    </div>
                ))}

                {proposals.length === 0 && (
                    <div className="py-20 flex flex-col items-center justify-center border border-dashed border-gray-800 rounded-2xl">
                        <Vote className="text-gray-800 mb-4" size={48} />
                        <p className="text-gray-500">No active proposals found.</p>
                    </div>
                )}
            </div>
        </div>
    );
};

export default Governance;
