import React, { useEffect } from 'react';
import { useWallet } from '../hooks/useWallet';
import { useNavigate } from 'react-router-dom';
import { Shield, Fingerprint, Lock, ChevronRight, Activity } from 'lucide-react';

const Login = () => {
    const { account, connectWallet, login, isAuthenticated, isAuthenticating } = useWallet();
    const navigate = useNavigate();

    useEffect(() => {
        if (isAuthenticated) {
            navigate('/dashboard');
        }
    }, [isAuthenticated, navigate]);

    const handleAuth = async () => {
        if (!account) {
            await connectWallet();
        } else {
            const success = await login();
            if (success) navigate('/dashboard');
        }
    };

    return (
        <div className="min-h-screen bg-black flex items-center justify-center p-6 relative overflow-hidden">
            {/* Ambient Background */}
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] bg-blue-500/5 rounded-full blur-[120px] pointer-events-none"></div>

            <div className="max-w-[440px] w-full glass p-10 rounded-[3rem] border border-white/10 shadow-2xl relative z-10 text-center">
                <div className="w-20 h-20 bg-white/5 rounded-3xl flex items-center justify-center mx-auto mb-8 border border-white/10 relative group">
                    <Shield className="text-white group-hover:scale-110 transition-transform" size={32} />
                    <div className="absolute -top-1 -right-1 w-3 h-3 bg-blue-500 rounded-full animate-pulse border-2 border-black"></div>
                </div>

                <h1 className="text-4xl font-black tracking-tighter uppercase mb-2">Protocol Access</h1>
                <p className="text-zinc-500 font-light text-sm leading-relaxed mb-10 px-4">
                    Decrypt your secure workspace. Connect and authorize your identity signature to enter the SyNox09 environment.
                </p>

                <div className="space-y-4">
                    {!account ? (
                        <button
                            onClick={connectWallet}
                            className="w-full bg-white text-black py-4 rounded-2xl font-black tracking-[0.2em] text-[10px] hover:bg-zinc-200 transition-all flex items-center justify-center gap-3"
                        >
                            CONNECT WALLET <ChevronRight size={14} />
                        </button>
                    ) : (
                        <div className="space-y-4">
                            <div className="bg-zinc-900/50 border border-white/5 p-4 rounded-2xl mb-2">
                                <span className="text-[8px] font-black text-zinc-600 tracking-widest uppercase block mb-1">Identity Detected</span>
                                <p className="text-xs font-mono text-white">{account.slice(0, 8)}...{account.slice(-8)}</p>
                            </div>
                            <button
                                onClick={handleAuth}
                                disabled={isAuthenticating}
                                className="w-full bg-blue-600 text-white py-4 rounded-2xl font-black tracking-[0.2em] text-[10px] hover:bg-blue-500 transition-all flex items-center justify-center gap-3 shadow-xl shadow-blue-500/10 disabled:opacity-50"
                            >
                                {isAuthenticating ? <Activity className="animate-spin" size={14} /> : <Fingerprint size={16} />}
                                {isAuthenticating ? "AUTHORIZING..." : "AUTHORIZE SESSION"}
                            </button>
                        </div>
                    )}
                </div>

                <div className="mt-10 flex items-center justify-center gap-6 text-zinc-700">
                    <div className="flex items-center gap-2">
                        <Lock size={12} />
                        <span className="text-[10px] font-bold tracking-widest uppercase">AES-256</span>
                    </div>
                    <div className="w-1 h-1 bg-zinc-800 rounded-full"></div>
                    <div className="flex items-center gap-2">
                        <Shield size={12} />
                        <span className="text-[10px] font-bold tracking-widest uppercase">P2P Secure</span>
                    </div>
                </div>
            </div>

            {/* Bottom Branding */}
            <div className="absolute bottom-12 left-1/2 -translate-x-1/2 flex items-center gap-3 opacity-20 hover:opacity-100 transition-opacity">
                <span className="text-[10px] font-black tracking-[0.5em] text-white uppercase">SyNox09 CORE</span>
                <div className="h-px w-12 bg-white/20"></div>
                <span className="text-[10px] font-mono text-white/50">V2.4.0-STABLE</span>
            </div>
        </div>
    );
};

export default Login;
