import React, { createContext, useContext, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ShieldCheck, ShieldAlert, Info, X, Zap, Activity } from 'lucide-react';

const ToastContext = createContext(null);

export const ToastProvider = ({ children }) => {
    const [toasts, setToasts] = useState([]);

    const showToast = useCallback((message, type = 'info', duration = 5000) => {
        const id = Date.now();
        setToasts(prev => [...prev, { id, message, type }]);
        setTimeout(() => {
            setToasts(prev => prev.filter(t => t.id !== id));
        }, duration);
    }, []);

    const removeToast = (id) => {
        setToasts(prev => prev.filter(t => t.id !== id));
    };

    return (
        <ToastContext.Provider value={{ showToast }}>
            {children}
            <div className="fixed bottom-8 right-8 z-[9999] flex flex-col gap-4 max-w-md w-full sm:w-auto">
                <AnimatePresence>
                    {toasts.map((toast) => (
                        <motion.div
                            key={toast.id}
                            initial={{ opacity: 0, x: 50, scale: 0.9 }}
                            animate={{ opacity: 1, x: 0, scale: 1 }}
                            exit={{ opacity: 0, x: 20, scale: 0.95 }}
                            className="relative group"
                        >
                            <div className="glass px-6 py-4 rounded-2xl border border-white/10 shadow-2xl flex items-center gap-4 overflow-hidden">
                                {/* Accent Bar */}
                                <div className={`absolute top-0 left-0 w-1 h-full ${toast.type === 'success' ? 'bg-green-500' :
                                        toast.type === 'error' ? 'bg-red-500' :
                                            toast.type === 'warning' ? 'bg-yellow-500' : 'bg-blue-500'
                                    } shadow-[0_0_10px_rgba(255,255,255,0.2)]`}></div>

                                <div className="flex-shrink-0">
                                    {toast.type === 'success' && <ShieldCheck className="text-green-500" size={20} />}
                                    {toast.type === 'error' && <ShieldAlert className="text-red-500" size={20} />}
                                    {toast.type === 'warning' && <Activity className="text-yellow-500" size={20} />}
                                    {toast.type === 'info' && <Zap className="text-blue-500" size={20} />}
                                </div>

                                <div className="flex-1 pr-4">
                                    <h4 className="text-[10px] font-black tracking-[0.2em] uppercase opacity-50 mb-0.5">
                                        {toast.type === 'error' ? 'Security Protocol Violation' : 'System Notification'}
                                    </h4>
                                    <p className="text-xs font-bold text-white tracking-tight uppercase leading-relaxed">
                                        {toast.message}
                                    </p>
                                </div>

                                <button
                                    onClick={() => removeToast(toast.id)}
                                    className="p-1 hover:bg-white/5 rounded-md transition-colors opacity-30 group-hover:opacity-100"
                                >
                                    <X size={14} />
                                </button>
                            </div>
                        </motion.div>
                    ))}
                </AnimatePresence>
            </div>
        </ToastContext.Provider>
    );
};

export const useToast = () => {
    const context = useContext(ToastContext);
    if (!context) {
        throw new Error('useToast must be used within a ToastProvider');
    }
    return context;
};
