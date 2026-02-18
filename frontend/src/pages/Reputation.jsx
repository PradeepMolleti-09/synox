import React, { useState, useEffect } from 'react';
import { useWallet } from '../hooks/useWallet';
import { ethers } from 'ethers';
import { NFT_ADDRESS, NFT_ABI, SYNOX_ADDRESS, SYNOX_ABI } from '../utils/contract';
import { Award, User, TrendingUp, Medal } from 'lucide-react';

const Reputation = () => {
    const { provider, account } = useWallet();
    const [score, setScore] = useState(0);
    const [leaderboard, setLeaderboard] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (!provider) return;
        const fetchData = async () => {
            try {
                const nftContract = new ethers.Contract(NFT_ADDRESS, NFT_ABI, provider);
                const synoxContract = new ethers.Contract(SYNOX_ADDRESS, SYNOX_ABI, provider);

                // Fetch current user score
                if (account) {
                    const s = await nftContract.totalReputation(account);
                    setScore(Number(s));
                }

                // Fetch Leaderboard
                const users = await synoxContract.getAllUsers();
                const leaderboardData = [];
                for (let user of users) {
                    const rep = await nftContract.totalReputation(user);
                    leaderboardData.push({ address: user, score: Number(rep) });
                }

                setLeaderboard(leaderboardData.sort((a, b) => b.score - a.score).slice(0, 5));
            } catch (e) {
                console.error(e);
            }
            setLoading(false);
        };
        fetchData();
    }, [provider, account]);

    return (
        <div className="min-h-screen pt-24 md:pt-32 px-4 md:px-12 bg-black text-white pb-20">
            <div className="max-w-6xl mx-auto flex flex-col lg:flex-row gap-16">

                {/* Personal Reputation Card */}
                <div className="flex-1 flex flex-col items-center">
                    <h2 className="text-xl md:text-2xl font-black mb-8 tracking-[0.3em] text-gray-500 uppercase">YOUR STANDING</h2>
                    <div className="glass-card w-full max-w-md p-8 md:p-12 flex flex-col items-center gap-8 border-white/5 hover:border-white/10 relative overflow-hidden group shadow-2xl">
                        <div className="absolute -top-10 -right-10 w-40 h-40 bg-blue-500/5 rounded-full blur-3xl group-hover:bg-blue-500/10 transition-all"></div>

                        <div className="p-8 bg-white/5 rounded-full border border-white/10 shadow-2xl relative">
                            <Award size={48} className="text-white md:w-16 md:h-16" />
                            <div className="absolute inset-0 bg-white/5 rounded-full animate-ping"></div>
                        </div>

                        <div className="text-center">
                            <p className="text-7xl md:text-9xl font-black tracking-tighter bg-gradient-to-b from-white via-gray-300 to-gray-600 bg-clip-text text-transparent">
                                {score}
                            </p>
                            <p className="text-[10px] font-black tracking-[0.4em] text-gray-500 mt-4 uppercase">Protocol Reputation</p>
                        </div>

                        <div className="flex items-center gap-3 bg-white/5 border border-white/5 px-6 py-2.5 rounded-full text-[10px] font-black tracking-widest text-gray-400 uppercase">
                            <User size={12} className="text-blue-400" /> {account ? `${account.slice(0, 6)}...${account.slice(-4)}` : "NOT_CONNECTED"}
                        </div>
                    </div>
                </div>

                {/* Global Leaderboard */}
                <div className="flex-1">
                    <h2 className="text-xl md:text-2xl font-black mb-8 tracking-[0.3em] text-gray-500 flex items-center gap-4 uppercase">
                        <TrendingUp size={24} className="text-blue-500" /> TOP OPERATORS
                    </h2>

                    <div className="space-y-4">
                        {loading ? (
                            [1, 2, 3, 4, 5].map(i => <div key={i} className="h-24 bg-white/5 rounded-2xl animate-pulse border border-white/5"></div>)
                        ) : leaderboard.map((user, idx) => (
                            <div key={user.address} className="glass-card p-6 flex justify-between items-center border-white/5 hover:bg-white/5 hover:border-white/10 transition-all group">
                                <div className="flex items-center gap-4 md:gap-8">
                                    <div className={`w-10 h-10 md:w-12 md:h-12 rounded-2xl flex items-center justify-center font-black text-sm md:text-base border ${idx === 0 ? 'bg-white text-black border-white' : 'bg-white/5 text-white border-white/10'}`}>
                                        {idx + 1}
                                    </div>
                                    <div>
                                        <p className="font-black text-xs md:text-sm tracking-widest uppercase mb-1">{user.address.slice(0, 10)}...</p>
                                        <p className="text-[9px] font-black text-gray-500 uppercase tracking-[0.2em]">
                                            {idx === 0 ? 'Protocol Chancellor' : idx === 1 ? 'High Sentinel' : 'Network Member'}
                                        </p>
                                    </div>
                                </div>
                                <div className="text-right flex items-center gap-3 md:gap-4">
                                    <span className="text-xl md:text-3xl font-black tracking-tighter group-hover:text-blue-400 transition-colors">{user.score}</span>
                                    <Medal className={`${idx === 0 ? 'text-yellow-500' : idx === 1 ? 'text-gray-400' : 'text-orange-600'}`} size={24} />
                                </div>
                            </div>
                        ))}
                    </div>

                    <div className="mt-12 p-6 border border-white/5 rounded-3xl bg-white/[0.02]">
                        <p className="text-gray-500 text-[10px] font-black leading-relaxed uppercase tracking-[0.2em] text-center">
                            Reputation is minted upon meeting finality <br className="hidden md:block" /> and locked to your sovereign cryptographic identity.
                        </p>
                    </div>
                </div>
            </div>
        </div>

    );
};

export default Reputation;
