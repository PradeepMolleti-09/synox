import React from 'react';
import { motion } from 'framer-motion';
import { Shield, Zap, Globe, Users } from 'lucide-react';
import { useWallet } from '../hooks/useWallet';
import { useNavigate } from 'react-router-dom';
import { BackgroundPaths } from '../components/ui/background-paths';

const Landing = () => {
    const { connectWallet, account } = useWallet();
    const navigate = useNavigate();

    const handleEnter = async () => {
        if (!account) {
            await connectWallet();
        }
        // If connected, navigate
        if (window.ethereum?.selectedAddress || account) {
            navigate('/dashboard');
        }
    };

    return (
        <div className="min-h-screen bg-black text-white relative selection:bg-white selection:text-black">
            {/* New Premium Hero Section */}
            <BackgroundPaths
                title="SYNOX09"
                subtitle="The future of tamper-proof meetings and on-chain governance."
                onAction={handleEnter}
                account={account}
            />

            {/* Content Overlayed/Below */}
            <main className="relative z-10 container mx-auto px-6 pb-32 flex flex-col items-center text-center">
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 1, duration: 1 }}
                />

                {/* Features Grid */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mt-12 w-full max-w-7xl">
                    {[
                        { icon: Shield, title: "Tamper-Proof", desc: "Meetings recorded and hashed on IPFS with on-chain verification." },
                        { icon: Globe, title: "Decentralized", desc: "No central servers. Powered by p2p WebRTC and Ethereum smart contracts." },
                        { icon: Users, title: "DAO Governance", desc: "Vote on proposals with reputation-backed NFTs and multi-sig consensus." },
                        { icon: Shield, title: "AES-256 Privacy", desc: "Military-grade encryption for all recording data before IPFS upload." },
                        { icon: Zap, title: "NFT Attendance", desc: "Automatically mint attendance proof NFTs for all meeting participants." },
                        { icon: Globe, title: "Global Reputation", desc: "Build on-chain credibility through active protocol participation." },
                        { icon: Users, title: "Multi-Sig Finality", desc: "Consensus-based meeting finalization to ensure data integrity." },
                        { icon: Shield, title: "Hash Verification", desc: "Independent tool to verify local data against the immutable ledger." }
                    ].map((feature, i) => (
                        <motion.div
                            key={i}
                            initial={{ opacity: 0, scale: 0.9 }}
                            whileInView={{ opacity: 1, scale: 1 }}
                            viewport={{ once: true }}
                            transition={{ delay: i * 0.1, type: "spring", stiffness: 100 }}
                            className="glass-card p-8 flex flex-col items-center hover:-translate-y-2 group cursor-default bg-zinc-900/40 border border-white/5 backdrop-blur-xl"
                        >
                            <div className="p-4 rounded-2xl bg-white/5 mb-6 group-hover:bg-white/10 transition-colors border border-white/5">
                                <feature.icon className="w-8 h-8 text-gray-300 group-hover:text-white transition-colors" />
                            </div>
                            <h3 className="text-lg font-black mb-3 tracking-tighter uppercase">{feature.title}</h3>
                            <p className="text-gray-500 text-xs leading-relaxed group-hover:text-gray-400 transition-colors uppercase tracking-widest font-medium">{feature.desc}</p>
                        </motion.div>
                    ))}
                </div>
            </main>

            {/* Cryptographic Proof Section */}
            <section className="py-24 md:py-40 bg-white text-black">
                <div className="container mx-auto px-6 grid grid-cols-1 lg:grid-cols-2 gap-12 lg:gap-20 items-center">
                    <motion.div
                        initial={{ opacity: 0, x: -50 }}
                        whileInView={{ opacity: 1, x: 0 }}
                        viewport={{ once: true }}
                    >
                        <h2 className="text-4xl md:text-6xl lg:text-8xl font-black tracking-tighter mb-8 leading-none uppercase">THE PROOF IS <br className="hidden md:block" /> ON-CHAIN.</h2>
                        <p className="text-lg md:text-xl text-zinc-600 leading-relaxed font-medium mb-12 uppercase tracking-tight">
                            Every meeting finalized on SYNOX09 creates a unique cryptographic signature.
                            This signature is stored on the Ethereum blockchain, linking your encrypted
                            recording to an immutable timestamp.
                        </p>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-8 text-[10px] font-black tracking-[0.3em] uppercase">
                            <div>
                                <div className="h-1 bg-black mb-4"></div>
                                <p>Mathematical Integrity</p>
                            </div>
                            <div>
                                <div className="h-1 bg-black/20 mb-4"></div>
                                <p>Distributed Consensus</p>
                            </div>
                        </div>
                    </motion.div>

                    <motion.div
                        initial={{ opacity: 0, scale: 0.95 }}
                        whileInView={{ opacity: 1, scale: 1 }}
                        viewport={{ once: true }}
                        className="bg-zinc-100 p-8 md:p-12 rounded-[2rem] md:rounded-[3rem] border border-black/5 flex flex-col gap-6 font-mono text-[10px] md:text-xs whitespace-pre overflow-hidden shadow-2xl"
                    >
                        <div className="flex gap-2">
                            <div className="w-3 h-3 rounded-full bg-red-400"></div>
                            <div className="w-3 h-3 rounded-full bg-yellow-400"></div>
                            <div className="w-3 h-3 rounded-full bg-green-400"></div>
                        </div>
                        <p className="text-black/40">// DEPLOYING SYNOX09_INFRASTRUCTURE</p>
                        <p className="text-black inline-block">Contract: 0xC776...BFF3</p>
                        <p className="text-black">Status: <span className="text-green-600">ENCRYPTED_SUCCESS</span></p>
                        <p className="text-black">CID: QmXy...pZ9a</p>
                        <div className="h-px bg-black/10 w-full my-4"></div>
                        <p className="text-zinc-400">Minting attendance NFT...</p>
                        <p className="text-zinc-400">Generating reputation hash...</p>
                        <p className="text-black font-black mt-4 uppercase">✓ IMMUTABLE PROOF GENERATED</p>
                    </motion.div>
                </div>
            </section>

            {/* How It Works Section */}
            <section className="py-24 md:py-40 bg-zinc-950/50 border-t border-white/5">
                <div className="container mx-auto px-6">
                    <div className="text-center mb-24">
                        <h2 className="text-4xl md:text-6xl font-black tracking-tighter mb-4 uppercase">PROTOCOL WORKFLOW</h2>
                        <p className="text-gray-500 font-mono text-[10px] tracking-[0.3em] uppercase">From Connection to On-chain Finality</p>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-12 md:gap-8">
                        {[
                            { step: "01", title: "IDENTITY", desc: "Authenticate via MetaMask. Your wallet is your cryptographic ID." },
                            { step: "02", title: "CREATION", desc: "Launch a decentralized room. Metadata is hashed and signed on-chain." },
                            { step: "03", title: "GOVERNANCE", desc: "Conduct live meetings with real-time on-chain voting tools." },
                            { step: "04", title: "CONSENSUS", desc: "Finalize and mint Attendance NFTs. Reputation is updated instantly." }
                        ].map((item, i) => (
                            <motion.div
                                key={i}
                                initial={{ opacity: 0, y: 20 }}
                                whileInView={{ opacity: 1, y: 0 }}
                                viewport={{ once: true }}
                                transition={{ delay: i * 0.1 }}
                                className="relative group p-6 rounded-3xl hover:bg-white/5 transition-all"
                            >
                                <div className="text-6xl font-black text-white/5 absolute -top-8 -left-2 group-hover:text-white/10 transition-colors">{item.step}</div>
                                <h4 className="text-lg font-black mb-4 tracking-tighter relative z-10 uppercase">{item.title}</h4>
                                <p className="text-gray-500 text-xs md:text-sm leading-relaxed uppercase tracking-widest font-medium border-l-2 border-white/10 pl-4">{item.desc}</p>
                            </motion.div>
                        ))}
                    </div>
                </div>
            </section>


            {/* Protocol Stats Section */}
            <section className="py-32 border-t border-white/5 bg-black">
                <div className="container mx-auto px-6 grid grid-cols-2 md:grid-cols-4 gap-12 text-center">
                    {[
                        { label: "AVAILABILITY", value: "100%", sub: "P2P NETWORK" },
                        { label: "ENCRYPTION", value: "256", sub: "BIT AES-GCM" },
                        { label: "FINALITY", value: "<15s", sub: "BLOCK TIME" },
                        { label: "CENTRALIZATION", value: "0%", sub: "TRUSTLESS" }
                    ].map((stat, i) => (
                        <div key={i}>
                            <p className="text-gray-500 text-[10px] font-black tracking-[0.4em] mb-4 uppercase">{stat.label}</p>
                            <p className="text-5xl md:text-7xl font-black tracking-tighter mb-1 select-none">{stat.value}</p>
                            <p className="text-zinc-600 text-[10px] font-mono">{stat.sub}</p>
                        </div>
                    ))}
                </div>
            </section>

            {/* Final CTA Section */}
            <section className="py-60 relative overflow-hidden flex flex-col items-center justify-center text-center border-t border-white/5">
                <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full h-full bg-[radial-gradient(circle_at_center,_rgba(255,255,255,0.05)_0%,_transparent_70%)]"></div>
                <h2 className="text-5xl md:text-8xl font-black tracking-tighter mb-12 relative z-10 uppercase">Ready to <br /> Govern?</h2>
                <button
                    onClick={handleEnter}
                    className="group relative px-16 py-6 bg-white text-black font-black tracking-[0.3em] rounded-full overflow-hidden transition-all hover:scale-105 hover:shadow-[0_0_60px_rgba(255,255,255,0.2)] text-xs flex items-center gap-3 relative z-10"
                >
                    {account ? "LAUNCH DASHBOARD" : "DEPLOY PROTOCOL"} <Zap size={18} className="fill-black" />
                </button>
            </section>

            {/* Footer */}
            <footer className="py-20 border-t border-white/5 bg-black">
                <div className="container mx-auto px-6">
                    <div className="flex flex-col md:flex-row justify-between items-start gap-12 mb-20">
                        <div className="max-w-sm">
                            <div className="flex items-center gap-2 mb-6">
                                <Shield className="w-8 h-8 text-white" />
                                <span className="text-2xl font-black tracking-widest text-white uppercase">SYNOX09</span>
                            </div>
                            <p className="text-gray-500 text-sm leading-relaxed uppercase tracking-widest font-medium">
                                A decentralized, tamper-proof meeting and governance infrastructure built on the Ethereum blockchain.
                            </p>
                        </div>

                        <div className="grid grid-cols-2 lg:grid-cols-3 gap-20">
                            <div>
                                <h5 className="text-[10px] font-black tracking-[0.3em] text-white mb-6 uppercase">Protocol</h5>
                                <ul className="space-y-4 text-gray-500 text-[10px] font-bold tracking-widest uppercase">
                                    <li className="hover:text-white cursor-pointer transition-colors">Meetings</li>
                                    <li className="hover:text-white cursor-pointer transition-colors">Governance</li>
                                    <li className="hover:text-white cursor-pointer transition-colors">Nodes</li>
                                </ul>
                            </div>
                            <div>
                                <h5 className="text-[10px] font-black tracking-[0.3em] text-white mb-6 uppercase">Security</h5>
                                <ul className="space-y-4 text-gray-500 text-[10px] font-bold tracking-widest uppercase">
                                    <li className="hover:text-white cursor-pointer transition-colors">Verification</li>
                                    <li className="hover:text-white cursor-pointer transition-colors">Cryptography</li>
                                    <li className="hover:text-white cursor-pointer transition-colors">Contracts</li>
                                </ul>
                            </div>
                        </div>
                    </div>

                    <div className="flex flex-col md:flex-row justify-between items-center gap-4 border-t border-white/5 pt-12">
                        <p className="text-gray-600 text-[10px] font-mono">© 2026 SYNOX09 PROTOCOL // DECENTRALIZED INFRASTRUCTURE</p>
                        <div className="flex gap-8 text-[10px] font-mono text-zinc-600">
                            <span>SEPOLIA_TESTNET</span>
                            <span>VERSION_1.0.42</span>
                        </div>
                    </div>
                </div>
            </footer>
        </div>
    );
};

export default Landing;
