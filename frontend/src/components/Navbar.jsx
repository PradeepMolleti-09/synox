import React, { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Shield } from 'lucide-react';
import { useWallet } from '../hooks/useWallet';
import gsap from 'gsap';
import { CustomEase } from 'gsap/CustomEase';

if (typeof window !== 'undefined') {
    gsap.registerPlugin(CustomEase);
    try {
        CustomEase.create('main', '0.65, 0.01, 0.05, 0.99');
        gsap.defaults({ ease: 'main', duration: 0.7 });
    } catch (e) {
        gsap.defaults({ ease: 'power2.out', duration: 0.7 });
    }
}

const Navbar = () => {
    const { account, connectWallet, isAuthenticated, logout } = useWallet();
    const [isMenuOpen, setIsMenuOpen] = useState(false);
    const containerRef = useRef(null);
    const navigate = useNavigate();

    const navLinks = [
        { name: 'Dashboard', path: '/dashboard' },
        { name: 'Meetings', path: '/meetings' },
        { name: 'Governance', path: '/governance' },
        { name: 'Reputation', path: '/reputation' },
    ];

    // Scroll Lock
    useEffect(() => {
        if (isMenuOpen) {
            document.body.style.overflow = 'hidden';
            document.documentElement.style.overflow = 'hidden';
            document.body.style.touchAction = 'none';
        } else {
            document.body.style.overflow = '';
            document.documentElement.style.overflow = '';
            document.body.style.touchAction = '';
        }
        return () => {
            document.body.style.overflow = '';
            document.documentElement.style.overflow = '';
            document.body.style.touchAction = '';
        };
    }, [isMenuOpen]);

    // Escape key
    useEffect(() => {
        const handleEsc = (e) => {
            if (e.key === 'Escape' && isMenuOpen) setIsMenuOpen(false);
        };
        window.addEventListener('keydown', handleEsc);
        return () => window.removeEventListener('keydown', handleEsc);
    }, [isMenuOpen]);

    // GSAP Menu Animation
    useEffect(() => {
        if (!containerRef.current) return;

        const ctx = gsap.context(() => {
            const navWrap = containerRef.current.querySelector('.nav-overlay-wrapper');
            const menuContent = containerRef.current.querySelector('.menu-content');
            const overlay = containerRef.current.querySelector('.menu-overlay');
            const bgPanels = containerRef.current.querySelectorAll('.backdrop-layer');
            const menuLinks = containerRef.current.querySelectorAll('.nav-link');

            // Hamburger bars
            const bar1 = containerRef.current.querySelector('.bar-1');
            const bar2 = containerRef.current.querySelector('.bar-2');
            const bar3 = containerRef.current.querySelector('.bar-3');

            const tl = gsap.timeline();

            if (isMenuOpen) {
                // Show overlay wrapper
                tl.set(navWrap, { display: 'block' })
                    // Animate hamburger → X
                    .to(bar1, { y: 7, rotate: 45, duration: 0.3 }, 0)
                    .to(bar2, { opacity: 0, scaleX: 0, duration: 0.2 }, 0)
                    .to(bar3, { y: -7, rotate: -45, duration: 0.3 }, 0)
                    // Fade in overlay
                    .fromTo(overlay, { autoAlpha: 0 }, { autoAlpha: 1, duration: 0.4 }, 0)
                    // Slide in backdrop panels
                    .fromTo(bgPanels, { xPercent: 101 }, { xPercent: 0, stagger: 0.1, duration: 0.55 }, 0.05)
                    // Stagger nav links up
                    .fromTo(menuLinks,
                        { yPercent: 120, rotate: 8, opacity: 0 },
                        { yPercent: 0, rotate: 0, opacity: 1, stagger: 0.07, duration: 0.6 },
                        0.3
                    );
            } else {
                // Animate X → hamburger
                tl.to(bar1, { y: 0, rotate: 0, duration: 0.3 }, 0)
                    .to(bar2, { opacity: 1, scaleX: 1, duration: 0.3 }, 0)
                    .to(bar3, { y: 0, rotate: 0, duration: 0.3 }, 0)
                    // Slide menu out
                    .to(menuContent, { xPercent: 105, duration: 0.5 }, 0)
                    .to(overlay, { autoAlpha: 0, duration: 0.4 }, 0)
                    .set(navWrap, { display: 'none' });
            }
        }, containerRef);

        return () => ctx.revert();
    }, [isMenuOpen]);

    const handleNavClick = (path) => {
        setIsMenuOpen(false);
        navigate(path);
    };

    return (
        <div ref={containerRef}>
            {/* ── Main Navbar ── */}
            <nav className="fixed top-0 left-0 right-0 z-[150] px-6 md:px-8 py-4 flex justify-between items-center glass border-b border-white/5">
                <Link to="/" className="flex items-center gap-2 group z-[300] relative">
                    <Shield className="w-6 h-6 md:w-8 md:h-8 text-white group-hover:text-gray-300 transition-colors" />
                    <span className="text-xl md:text-2xl font-bold tracking-[0.2em] text-white group-hover:text-gray-300 transition-colors uppercase">SYNOX09</span>
                </Link>

                {/* Desktop Links */}
                <div className="hidden lg:flex gap-12 text-[10px] font-black tracking-widest text-gray-500">
                    {navLinks.map((link) => (
                        <Link key={link.path} to={link.path} className="hover:text-white transition-all uppercase">
                            {link.name}
                        </Link>
                    ))}
                </div>

                <div className="flex items-center gap-4">
                    {/* Desktop wallet button */}
                    <div className="hidden md:block">
                        {isAuthenticated ? (
                            <button onClick={logout} className="px-6 py-2 bg-zinc-900 border border-white/10 text-white font-black text-[10px] tracking-widest rounded-full hover:bg-zinc-800 transition-all flex items-center gap-2">
                                <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse shadow-[0_0_8px_rgba(34,197,94,1)]"></div>
                                {account.slice(0, 4)}...
                            </button>
                        ) : (
                            <button onClick={connectWallet} className="px-6 py-2 bg-white text-black font-black text-[10px] tracking-widest rounded-full hover:bg-gray-200 transition-all flex items-center gap-2">
                                CONNECT WALLET
                            </button>
                        )}
                    </div>

                    {/* Hamburger — 3 bars only, no text */}
                    <button
                        onClick={() => setIsMenuOpen(prev => !prev)}
                        className="lg:hidden flex flex-col justify-center items-center gap-[5px] w-10 h-10 z-[300] relative"
                        aria-label="Toggle menu"
                    >
                        <span className="bar-1 block w-6 h-[2px] bg-white rounded-full origin-center transition-all"></span>
                        <span className="bar-2 block w-6 h-[2px] bg-white rounded-full origin-center transition-all"></span>
                        <span className="bar-3 block w-6 h-[2px] bg-white rounded-full origin-center transition-all"></span>
                    </button>
                </div>
            </nav>

            {/* ── Mobile Menu Overlay ── */}
            <div className="nav-overlay-wrapper" style={{ display: 'none', position: 'fixed', inset: 0, zIndex: 200 }}>
                {/* Dim overlay — click to close */}
                <div
                    className="menu-overlay absolute inset-0 bg-black/40"
                    onClick={() => setIsMenuOpen(false)}
                    style={{ opacity: 0 }}
                ></div>

                {/* Sliding panel */}
                <nav className="menu-content absolute top-0 right-0 h-full w-[85vw] max-w-sm flex flex-col overflow-hidden">
                    {/* Glass backdrop layers */}
                    <div className="backdrop-layer absolute inset-0 bg-zinc-950/95 z-[-3]"></div>
                    <div className="backdrop-layer absolute inset-0 bg-gradient-to-br from-white/[0.06] to-transparent z-[-2]"></div>
                    <div className="backdrop-layer absolute inset-0 backdrop-blur-2xl border-l border-white/10 z-[-1]"></div>

                    {/* Panel Header */}
                    <div className="flex items-center justify-between px-8 pt-8 pb-6 border-b border-white/10">
                        <div className="flex items-center gap-2">
                            <Shield className="w-5 h-5 text-white" />
                            <span className="text-base font-bold tracking-[0.2em] text-white">SYNOX09</span>
                        </div>
                        {isAuthenticated && (
                            <div className="px-3 py-1 bg-white/5 border border-white/10 text-white font-black text-[8px] tracking-widest rounded-full flex items-center gap-1.5">
                                <div className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse"></div>
                                {account.slice(0, 6)}...
                            </div>
                        )}
                    </div>

                    {/* Nav Links */}
                    <div className="flex flex-col flex-1 overflow-y-auto px-8 pt-8 pb-6 gap-1">
                        {navLinks.map((link) => (
                            <div key={link.path} className="overflow-hidden">
                                <button
                                    onClick={() => handleNavClick(link.path)}
                                    className="nav-link group flex items-center justify-between w-full py-5 border-b border-white/5 hover:border-white/20 transition-all text-left"
                                >
                                    <span className="text-2xl font-black tracking-tighter text-white group-hover:text-blue-400 transition-colors uppercase">
                                        {link.name}
                                    </span>
                                    <svg className="w-4 h-4 text-white/30 group-hover:text-blue-400 group-hover:translate-x-1 transition-all" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                                    </svg>
                                </button>
                            </div>
                        ))}
                    </div>

                    {/* Footer Action */}
                    <div className="px-8 pb-10 pt-6 border-t border-white/10">
                        {isAuthenticated ? (
                            <button
                                onClick={() => { logout(); setIsMenuOpen(false); }}
                                className="w-full py-4 bg-white/5 border border-white/10 text-white font-black text-[10px] tracking-[0.2em] rounded-2xl flex items-center justify-center gap-3 hover:bg-white/10 active:scale-95 transition-all"
                            >
                                <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></div>
                                DISCONNECT SESSION
                            </button>
                        ) : (
                            <button
                                onClick={() => { connectWallet(); setIsMenuOpen(false); }}
                                className="w-full py-4 bg-blue-600 text-white font-black text-[10px] tracking-[0.2em] rounded-2xl flex items-center justify-center gap-3 shadow-lg shadow-blue-500/20 active:scale-95 transition-all"
                            >
                                <Shield size={14} /> CONNECT PROTOCOL
                            </button>
                        )}
                    </div>
                </nav>
            </div>
        </div>
    );
};

export default Navbar;
