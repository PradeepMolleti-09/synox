import React, { useEffect, useState, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useWallet } from '../hooks/useWallet';
import { ethers } from 'ethers';
import { SYNOX_ADDRESS, SYNOX_ABI } from '../utils/contract';
import {
    Mic, MicOff, Video, VideoOff, PhoneOff, Users,
    ShieldCheck, Trophy, Activity, Hand, Volume2,
    Hash, Globe, X, ExternalLink, Maximize, Monitor, Circle, StopCircle
} from 'lucide-react';
import { useToast } from '../context/ToastContext';
import { encryptFile, uploadToIPFS, getSessionSignatureMessage } from '../utils/storage';
import io from 'socket.io-client';
import process from 'process';

window.process = process;

// ─── Config ───────────────────────────────────────────────────────────────────
const SIGNALING_SERVER = import.meta.env.VITE_SIGNALING_URL || 'http://localhost:5000';

// Public STUN servers — essential for cross-device/cross-network WebRTC
const ICE_SERVERS = {
    iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
        { urls: 'stun:stun2.l.google.com:19302' },
        { urls: 'stun:stun3.l.google.com:19302' },
        { urls: 'stun:stun4.l.google.com:19302' },
        { urls: 'stun:global.stun.twilio.com:3478' },
    ],
};

// ─── Remote Video Component ───────────────────────────────────────────────────
const RemoteVideo = ({ stream, peerId, isHandRaised, isSpeaking, isVideoOn, isScreenSharing }) => {
    const ref = useRef();
    const avatarUrl = `https://api.dicebear.com/7.x/avataaars/svg?seed=${peerId}`;

    useEffect(() => {
        if (ref.current && stream) {
            ref.current.srcObject = stream;
            ref.current.play().catch(() => { });
        }
    }, [stream]);

    return (
        <div className={`relative bg-zinc-900 rounded-2xl overflow-hidden aspect-video border transition-all duration-500 ${isSpeaking ? 'border-blue-500 shadow-[0_0_30px_rgba(59,130,246,0.3)] scale-[1.02]' : 'border-white/5'}`}>
            <video
                ref={ref}
                autoPlay
                playsInline
                data-peer={peerId}
                className={`w-full h-full object-cover ${!isVideoOn ? 'hidden' : ''}`}
            />
            {!isVideoOn && (
                <div className="w-full h-full flex flex-col items-center justify-center bg-zinc-950 absolute inset-0">
                    <img src={avatarUrl} alt="Avatar" className="w-24 h-24 rounded-full border-4 border-white/5 shadow-2xl" />
                    <div className="mt-4 flex items-center gap-2 text-zinc-500 font-mono text-[8px] uppercase tracking-widest">
                        <Volume2 size={12} className={isSpeaking ? 'text-blue-500 animate-pulse' : ''} />
                        CAMERA OFF
                    </div>
                </div>
            )}
            {isHandRaised && (
                <div className="absolute top-4 left-4 bg-blue-500 p-2.5 rounded-xl shadow-[0_0_30px_rgba(59,130,246,0.6)] animate-bounce z-10 border border-white/20">
                    <Hand size={18} className="text-white fill-white" />
                </div>
            )}
            <div className="absolute bottom-4 left-4 bg-black/60 px-3 py-1.5 rounded-lg text-[10px] font-black tracking-tighter backdrop-blur-md text-white border border-white/10 flex items-center gap-2">
                <span>PEER: {peerId.slice(0, 8)}</span>
                {isScreenSharing && <Monitor size={10} className="text-blue-400" />}
            </div>
        </div>
    );
};

// ─── Main Component ───────────────────────────────────────────────────────────
const MeetingRoom = () => {
    const { roomId } = useParams();
    const { provider, signer, account } = useWallet();
    const navigate = useNavigate();

    // UI State
    const [huddleId, setHuddleId] = useState(null);
    const [meetingTitle, setMeetingTitle] = useState("Loading...");
    const [isHost, setIsHost] = useState(false);
    const [finalizing, setFinalizing] = useState(false);
    const [showSidebar, setShowSidebar] = useState(true);
    const [events, setEvents] = useState([]);
    const [finalTxHash, setFinalTxHash] = useState(null);
    const [isRecording, setIsRecording] = useState(false);
    const [displayId, setDisplayId] = useState("");
    const [cid, setCid] = useState("NOT_FINALIZED");
    const [hasJoined, setHasJoined] = useState(false);
    const [lobbyLoading, setLobbyLoading] = useState(false);
    const [showSuccessModal, setShowSuccessModal] = useState(false);

    // Media State
    const [isVideoOn, setIsVideoOn] = useState(true);
    const [isAudioOn, setIsAudioOn] = useState(true);
    const [localStream, setLocalStream] = useState(null);
    const [peers, setPeers] = useState([]); // [{ peerID, pc, stream }]

    // Hand Raise & Speaking
    const [raisedHands, setRaisedHands] = useState({});
    const [remoteStatus, setRemoteStatus] = useState({});
    const [isSpeaking, setIsLocalSpeaking] = useState(false);

    // Screen Share State
    const [isScreenSharing, setIsScreenSharing] = useState(false);
    const screenStreamRef = useRef(null);

    // Full Screen State
    const [isFullScreen, setIsFullScreen] = useState(false);
    const meetingContainerRef = useRef(null);

    // Refs
    const socketRef = useRef(null);
    const localVideoRef = useRef(null);
    const localStreamRef = useRef(null);
    const pcsRef = useRef({}); // { peerID: RTCPeerConnection }
    const mediaRecorderRef = useRef(null);
    const recordedChunksRef = useRef([]);
    const { showToast } = useToast();

    // ── Helpers ───────────────────────────────────────────────────────────────
    const addEvent = useCallback((type, msg) => {
        setEvents(prev => [{ id: Date.now() + Math.random(), type, msg, time: new Date().toLocaleTimeString() }, ...prev]);
    }, []);

    // ── Contract Init ─────────────────────────────────────────────────────────
    useEffect(() => {
        if (!provider || !roomId || !account) return;
        const contract = new ethers.Contract(SYNOX_ADDRESS, SYNOX_ABI, provider);

        const fetchMeeting = async () => {
            try {
                const m = await contract.meetings(roomId);
                setHuddleId(m.huddleId);
                setMeetingTitle(m.title);
                setIsHost(m.host.toLowerCase() === account?.toLowerCase());
                setDisplayId(Math.floor(100 + Math.random() * 900).toString());
                if (m.recordingCID && m.recordingCID !== "") setCid(m.recordingCID);
            } catch (e) {
                console.warn("Meeting fetch failed", e);
            }
        };
        fetchMeeting();

        const onJoined = (mid, user) => {
            if (Number(mid) === Number(roomId))
                addEvent("USER JOINED", `${user.slice(0, 6)}... joined the room.`);
        };
        contract.on("UserJoined", onJoined);
        return () => contract.off("UserJoined", onJoined);
    }, [provider, roomId, account]);

    // ── Body Scroll Lock ──────────────────────────────────────────────────────
    useEffect(() => {
        if (showSidebar && window.innerWidth < 1024) document.body.style.overflow = 'hidden';
        else document.body.style.overflow = 'unset';
        return () => { document.body.style.overflow = 'unset'; };
    }, [showSidebar]);

    // ── Media Init ────────────────────────────────────────────────────────────
    useEffect(() => {
        const initMedia = async () => {
            try {
                const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
                stream.getVideoTracks()[0].enabled = true;
                stream.getAudioTracks()[0].enabled = true;
                localStreamRef.current = stream;
                setLocalStream(stream);
                if (localVideoRef.current) localVideoRef.current.srcObject = stream;
            } catch (e) {
                console.warn("Media init failed:", e);
                showToast("Media Error: Check camera/mic permissions.", "error");
            }
        };
        initMedia();
        return () => {
            if (localStreamRef.current) localStreamRef.current.getTracks().forEach(t => t.stop());
        };
    }, []);

    useEffect(() => {
        if (localVideoRef.current && localStream) localVideoRef.current.srcObject = localStream;
    }, [localStream, hasJoined]);

    // ── Join Session ──────────────────────────────────────────────────────────
    const handleJoinSession = async () => {
        if (!signer || !provider) return;
        setLobbyLoading(true);
        try {
            const contract = new ethers.Contract(SYNOX_ADDRESS, SYNOX_ABI, signer);
            const isPart = await contract.isParticipant(roomId, account);
            if (!isPart) {
                const tx = await contract.joinMeeting(roomId);
                await tx.wait();
            }
            setHasJoined(true);
            addEvent("NETWORK", "Blockchain authorization complete. Joining P2P mesh...");
        } catch (e) {
            console.error(e);
            showToast("Authorization Error: " + e.message, "error");
        }
        setLobbyLoading(false);
    };

    // ── RTCPeerConnection factory ─────────────────────────────────────────────
    const removePeer = useCallback((peerID) => {
        if (pcsRef.current[peerID]) {
            pcsRef.current[peerID].close();
            delete pcsRef.current[peerID];
        }
        setPeers(prev => prev.filter(p => p.peerID !== peerID));
        setRemoteStatus(prev => { const n = { ...prev }; delete n[peerID]; return n; });
    }, []);

    const createPC = useCallback((peerID, socket) => {
        const pc = new RTCPeerConnection(ICE_SERVERS);

        // Add local tracks
        const stream = localStreamRef.current;
        if (stream) {
            stream.getTracks().forEach(track => pc.addTrack(track, stream));
        }

        // Relay ICE candidates via signaling server
        pc.onicecandidate = ({ candidate }) => {
            if (candidate) {
                socket.emit('ice-candidate', { target: peerID, candidate });
            }
        };

        pc.oniceconnectionstatechange = () => {
            const state = pc.iceConnectionState;
            console.log(`[${peerID.slice(0, 6)}] ICE state: ${state}`);
            if (state === 'failed') {
                pc.restartIce();
            }
            // Remove ghost peer if connection definitively closed
            if (state === 'closed' || state === 'disconnected') {
                // Give 5s grace period for reconnect before removing
                setTimeout(() => {
                    if (pc.iceConnectionState === 'closed' || pc.iceConnectionState === 'disconnected') {
                        removePeer(peerID);
                    }
                }, 5000);
            }
        };

        pc.onconnectionstatechange = () => {
            const state = pc.connectionState;
            console.log(`[${peerID.slice(0, 6)}] Connection state: ${state}`);
            if (state === 'failed' || state === 'closed') {
                removePeer(peerID);
            }
        };

        // Receive remote stream
        pc.ontrack = ({ streams }) => {
            if (streams && streams[0]) {
                const remoteStream = streams[0];
                setPeers(prev => prev.map(p =>
                    p.peerID === peerID ? { ...p, stream: remoteStream } : p
                ));
            }
        };

        return pc;
    }, [removePeer]);

    // ── WebRTC + Socket Setup ─────────────────────────────────────────────────
    useEffect(() => {
        if (!hasJoined || !huddleId) return;

        // Wait for media to be ready before connecting
        const connect = async () => {
            // Give media up to 3 seconds to initialize
            if (!localStreamRef.current) {
                await new Promise(resolve => {
                    const check = setInterval(() => {
                        if (localStreamRef.current) { clearInterval(check); resolve(); }
                    }, 100);
                    setTimeout(() => { clearInterval(check); resolve(); }, 3000);
                });
            }

            const socket = io(SIGNALING_SERVER, {
                transports: ['websocket', 'polling'],
                reconnectionAttempts: 10,
                reconnectionDelay: 1000,
                reconnectionDelayMax: 5000,
            });
            socketRef.current = socket;

            socket.on('connect', () => {
                addEvent("NETWORK", `Connected to signaling server. Room: ${huddleId.slice(0, 12)}...`);
                // Robustness: ensure listeners are active before joining
                setTimeout(() => {
                    socket.emit("join-room", huddleId);
                }, 500);
            });

            // On reconnect: close all stale PCs, clear peer list, rejoin
            socket.on('reconnect', () => {
                addEvent("NETWORK", "Reconnected. Re-establishing peer connections...");
                Object.values(pcsRef.current).forEach(pc => pc.close());
                pcsRef.current = {};
                setPeers([]);
                socket.emit("join-room", huddleId);
            });

            // ── Joiner receives existing users → initiates offers ──
            socket.on("all-users", async (users) => {
                addEvent("NETWORK", `${users.length} peer(s) in room. Establishing connections...`);

                for (const userID of users) {
                    // Close stale PC if exists before creating new one
                    if (pcsRef.current[userID]) {
                        pcsRef.current[userID].close();
                        delete pcsRef.current[userID];
                    }

                    const pc = createPC(userID, socket);
                    pcsRef.current[userID] = pc;

                    setPeers(prev => {
                        const filtered = prev.filter(p => p.peerID !== userID);
                        return [...filtered, { peerID: userID, pc, stream: null, addedAt: Date.now() }];
                    });

                    try {
                        const offer = await pc.createOffer();
                        await pc.setLocalDescription(offer);
                        socket.emit("offer", { target: userID, callerID: socket.id, signal: offer });
                    } catch (e) {
                        console.error("Error creating offer:", e);
                    }
                }
            });

            // ── Existing user notified of new joiner (just log; wait for offer) ──
            socket.on("user-joined", (userID) => {
                addEvent("NETWORK", `New peer joined: ${userID.slice(0, 8)}...`);
            });

            // ── Receive offer → send answer ──
            socket.on("offer", async (payload) => {
                const { callerID, signal } = payload;

                // Always create fresh PC for incoming offer (handles reconnect)
                if (pcsRef.current[callerID]) {
                    pcsRef.current[callerID].close();
                    delete pcsRef.current[callerID];
                }

                const pc = createPC(callerID, socket);
                pcsRef.current[callerID] = pc;
                setPeers(prev => {
                    const filtered = prev.filter(p => p.peerID !== callerID);
                    return [...filtered, { peerID: callerID, pc, stream: null, addedAt: Date.now() }];
                });

                try {
                    await pc.setRemoteDescription(new RTCSessionDescription(signal));
                    const answer = await pc.createAnswer();
                    await pc.setLocalDescription(answer);
                    socket.emit("answer", { signal: answer, target: callerID, id: socket.id });
                } catch (e) {
                    console.error("Error handling offer:", e);
                }
            });

            // ── Receive answer ──
            socket.on("answer", async (payload) => {
                const pc = pcsRef.current[payload.id];
                if (pc) {
                    try {
                        await pc.setRemoteDescription(new RTCSessionDescription(payload.signal));
                    } catch (e) {
                        console.error("Error handling answer:", e);
                    }
                }
            });

            // ── Receive ICE candidate ──
            socket.on("ice-candidate", async ({ from, candidate }) => {
                const pc = pcsRef.current[from];
                if (pc && candidate) {
                    try {
                        await pc.addIceCandidate(new RTCIceCandidate(candidate));
                    } catch (e) {
                        console.warn("Error adding ICE candidate:", e);
                    }
                }
            });

            // ── User left ──
            socket.on("user-left", (userID) => {
                addEvent("NETWORK", `Peer disconnected: ${userID.slice(0, 8)}...`);
                removePeer(userID);
            });

            socket.on('disconnect', () => {
                addEvent("NETWORK", "Disconnected from signaling server.");
            });
        };

        connect();

        // ── Ghost peer sweeper: remove peers with no stream after 10s ──
        const ghostSweeper = setInterval(() => {
            setPeers(prev => {
                const now = Date.now();
                const alive = prev.filter(p => {
                    if (p.stream) return true; // has stream, keep
                    if (!p.addedAt) return true; // no timestamp yet, keep
                    if (now - p.addedAt > 10000) {
                        // No stream after 10s → ghost, remove
                        console.warn(`[Ghost sweep] Removing peer ${p.peerID.slice(0, 8)} (no stream after 10s)`);
                        if (pcsRef.current[p.peerID]) {
                            pcsRef.current[p.peerID].close();
                            delete pcsRef.current[p.peerID];
                        }
                        return false;
                    }
                    return true;
                });
                return alive.length !== prev.length ? alive : prev;
            });
        }, 5000);

        return () => {
            clearInterval(ghostSweeper);
            if (socketRef.current) socketRef.current.disconnect();
            Object.values(pcsRef.current).forEach(pc => pc.close());
            pcsRef.current = {};
            setPeers([]);
        };
    }, [hasJoined, huddleId, removePeer]);

    // ── Data channel for status/hand (via socket relay) ──────────────────────
    const broadcastStatus = useCallback((payload) => {
        if (socketRef.current) {
            socketRef.current.emit('broadcast-status', { roomId: huddleId, payload });
        }
    }, [huddleId]);

    useEffect(() => {
        const socket = socketRef.current;
        if (!socket) return;
        socket.on('peer-status', ({ from, payload }) => {
            setRemoteStatus(prev => ({
                ...prev,
                [from]: { ...prev[from], ...payload }
            }));

            // Sync specific states like hand raise and recording status
            if (payload.hand !== undefined) {
                setRaisedHands(prev => ({ ...prev, [from]: payload.hand }));
            }
            if (payload.isRecording !== undefined) {
                setIsRecording(payload.isRecording);
                addEvent("NETWORK", payload.isRecording ? "Host started session recording." : "Session recording stopped.");
            }
        });

        socket.on('meeting-ended', () => {
            addEvent("NETWORK", "Host has finalized and closed the meeting room.");
            showToast("Meeting finalized by host. Redirecting...", "success");
            setTimeout(() => {
                navigate('/dashboard');
                // Clean up tracks
                if (localStreamRef.current) localStreamRef.current.getTracks().forEach(t => t.stop());
            }, 3000);
        });

        return () => {
            socket?.off('peer-status');
            socket?.off('meeting-ended');
        };
    }, [hasJoined, navigate, showToast]);

    const toggleHand = () => {
        const newState = !raisedHands['me'];
        setRaisedHands(prev => ({ ...prev, me: newState }));
        broadcastStatus({ hand: newState });
        addEvent("PROCESS", newState ? "Hand raised." : "Hand lowered.");
    };

    // ── Speaking Indicator ────────────────────────────────────────────────────
    useEffect(() => {
        if (!localStream || !isAudioOn) { setIsLocalSpeaking(false); return; }
        const audioContext = new (window.AudioContext || window.webkitAudioContext)();
        const source = audioContext.createMediaStreamSource(localStream);
        const analyser = audioContext.createAnalyser();
        analyser.fftSize = 256;
        source.connect(analyser);
        const dataArray = new Uint8Array(analyser.frequencyBinCount);
        let lastSpeaking = false;
        const interval = setInterval(() => {
            analyser.getByteFrequencyData(dataArray);
            const avg = dataArray.reduce((a, b) => a + b, 0) / dataArray.length;
            const speaking = avg > 15;
            if (speaking !== lastSpeaking) {
                lastSpeaking = speaking;
                setIsLocalSpeaking(speaking);
                broadcastStatus({ isSpeaking: speaking });
            }
        }, 300);
        return () => { clearInterval(interval); audioContext.close(); };
    }, [localStream, isAudioOn]);

    // ── Toggle Video ──────────────────────────────────────────────────────────
    const toggleVideo = () => {
        const stream = localStreamRef.current;
        if (!stream) return;
        const track = stream.getVideoTracks()[0];
        if (!track) return;
        const newState = !isVideoOn;
        track.enabled = newState;
        setIsVideoOn(newState);
        broadcastStatus({ isVideoOn: newState });
        if (localVideoRef.current && localVideoRef.current.srcObject !== stream) {
            localVideoRef.current.srcObject = stream;
        }
    };

    // ── Toggle Audio ──────────────────────────────────────────────────────────
    const toggleAudio = () => {
        const stream = localStreamRef.current;
        if (!stream) return;
        const track = stream.getAudioTracks()[0];
        if (!track) return;
        const newState = !isAudioOn;
        track.enabled = newState;
        setIsAudioOn(newState);
        broadcastStatus({ isAudioOn: newState });
    };

    // ── Screen Sharing Logic ──────────────────────────────────────────────────
    const toggleScreenSharing = async () => {
        try {
            if (!isScreenSharing) {
                const screenStream = await navigator.mediaDevices.getDisplayMedia({ video: true });
                screenStreamRef.current = screenStream;
                setIsScreenSharing(true);
                broadcastStatus({ isScreenSharing: true });

                const screenTrack = screenStream.getVideoTracks()[0];

                // Replace track in all peer connections
                Object.values(pcsRef.current).forEach(pc => {
                    const sender = pc.getSenders().find(s => s.track?.kind === 'video');
                    if (sender) sender.replaceTrack(screenTrack);
                });

                screenTrack.onended = () => {
                    stopScreenSharing();
                };

                // Update local preview
                if (localVideoRef.current) localVideoRef.current.srcObject = screenStream;

            } else {
                stopScreenSharing();
            }
        } catch (e) {
            console.error("Screen sharing failed:", e);
            showToast("Screen share cancelled or failed.", "error");
        }
    };

    const stopScreenSharing = () => {
        if (screenStreamRef.current) {
            screenStreamRef.current.getTracks().forEach(t => t.stop());
            screenStreamRef.current = null;
        }
        setIsScreenSharing(false);
        broadcastStatus({ isScreenSharing: false });

        // Restore camera track in all peer connections
        const cameraTrack = localStreamRef.current?.getVideoTracks()[0];
        if (cameraTrack) {
            Object.values(pcsRef.current).forEach(pc => {
                const sender = pc.getSenders().find(s => s.track?.kind === 'video');
                if (sender) sender.replaceTrack(cameraTrack);
            });
            if (localVideoRef.current) localVideoRef.current.srcObject = localStreamRef.current;
        }
    };

    // ── Full Screen Logic ─────────────────────────────────────────────────────
    const toggleFullScreen = () => {
        if (!document.fullscreenElement) {
            meetingContainerRef.current?.requestFullscreen().catch(err => {
                showToast("Fullscreen Error: " + err.message, "error");
            });
            setIsFullScreen(true);
        } else {
            document.exitFullscreen();
            setIsFullScreen(false);
        }
    };

    useEffect(() => {
        const handleFSChange = () => setIsFullScreen(!!document.fullscreenElement);
        document.addEventListener('fullscreenchange', handleFSChange);
        return () => document.removeEventListener('fullscreenchange', handleFSChange);
    }, []);

    // ── High-Quality Grid Recording Logic ────────────────────────────────────
    const canvasRef = useRef(null);
    const canvasStreamRef = useRef(null);
    const animationFrameRef = useRef(null);

    const startRecording = () => {
        const stream = localStreamRef.current;
        if (!stream) { showToast("No media stream found.", "error"); return; }

        recordedChunksRef.current = [];
        const mimeType = ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm', 'video/mp4']
            .find(t => MediaRecorder.isTypeSupported(t));

        // 1. Setup Audio Mixing
        const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        const dest = audioCtx.createMediaStreamDestination();

        // Mix Local Audio
        if (stream.getAudioTracks().length > 0) {
            const localSource = audioCtx.createMediaStreamSource(new MediaStream([stream.getAudioTracks()[0]]));
            localSource.connect(dest);
        }

        // Mix Peer Audios
        peers.forEach(p => {
            if (p.stream && p.stream.getAudioTracks().length > 0) {
                try {
                    const peerSource = audioCtx.createMediaStreamSource(new MediaStream([p.stream.getAudioTracks()[0]]));
                    peerSource.connect(dest);
                } catch (e) { console.warn("Audio mixing failed for peer", p.peerID, e); }
            }
        });

        // 2. Setup Video Grid Canvas
        const canvas = document.createElement('canvas');
        canvas.width = 1280;
        canvas.height = 720;
        const ctx = canvas.getContext('2d');

        const drawGrid = () => {
            if (!isRecording && !mediaRecorderRef.current) return;

            ctx.fillStyle = "#000";
            ctx.fillRect(0, 0, canvas.width, canvas.height);

            const allParticipants = [
                { id: 'me', stream: localStreamRef.current, video: localVideoRef.current, name: 'You' },
                ...peers.filter(p => p.stream).map(p => ({
                    id: p.peerID,
                    stream: p.stream,
                    // We need a stable video element for each peer to draw to canvas
                    // We can reuse the elements from the UI if we have refs, 
                    // but it's safer to use the actual video components' current source
                    video: document.querySelector(`video[data-peer="${p.peerID}"]`),
                    name: `Peer ${p.peerID.slice(0, 4)}`
                }))
            ];

            const n = allParticipants.length;
            const cols = Math.ceil(Math.sqrt(n));
            const rows = Math.ceil(n / cols);
            const w = canvas.width / cols;
            const h = canvas.height / rows;

            allParticipants.forEach((p, i) => {
                const r = Math.floor(i / cols);
                const c = i % cols;
                const x = c * w;
                const y = r * h;

                if (p.video && p.video.readyState >= 2) {
                    // Maintain aspect ratio while covering the grid cell
                    const videoW = p.video.videoWidth;
                    const videoH = p.video.videoHeight;
                    const scale = Math.max(w / videoW, h / videoH);
                    const drawW = videoW * scale;
                    const drawH = videoH * scale;
                    const drawX = x + (w - drawW) / 2;
                    const drawY = y + (h - drawH) / 2;

                    ctx.drawImage(p.video, drawX, drawY, drawW, drawH);

                    // Premium Label Styling
                    ctx.fillStyle = "rgba(0,0,0,0.6)";
                    ctx.beginPath();
                    ctx.roundRect(x + 15, y + h - 40, 120, 25, 8);
                    ctx.fill();

                    ctx.fillStyle = "#fff";
                    ctx.font = "bold 12px Inter, sans-serif";
                    ctx.textAlign = "left";
                    ctx.fillText(p.name.toUpperCase(), x + 25, y + h - 23);
                } else {
                    // Placeholder for peer without video
                    ctx.fillStyle = "#111";
                    ctx.fillRect(x, y, w, h);

                    // Draw Avatar Placeholder
                    ctx.fillStyle = "#1a1a1a";
                    ctx.beginPath();
                    ctx.arc(x + w / 2, y + h / 2 - 10, 40, 0, Math.PI * 2);
                    ctx.fill();

                    ctx.fillStyle = "#444";
                    ctx.font = "bold 14px Inter, sans-serif";
                    ctx.textAlign = "center";
                    ctx.fillText(p.name, x + w / 2, y + h / 2 + 50);
                }
            });

            animationFrameRef.current = requestAnimationFrame(drawGrid);
        };

        requestAnimationFrame(drawGrid);

        // 3. Combine Canvas Video + Mixed Audio
        const canvasStream = canvas.captureStream(30);
        const combinedStream = new MediaStream([
            ...canvasStream.getVideoTracks(),
            ...dest.stream.getAudioTracks()
        ]);

        const recorder = new MediaRecorder(combinedStream, { mimeType, videoBitsPerSecond: 2500000 });
        recorder.ondataavailable = e => { if (e.data?.size > 0) recordedChunksRef.current.push(e.data); };
        recorder.onstop = () => {
            cancelAnimationFrame(animationFrameRef.current);
            audioCtx.close();
            addEvent("SUCCESS", "Grid recording finalized.");
        };

        recorder.start(1000);
        mediaRecorderRef.current = recorder;
        setIsRecording(true);
        broadcastStatus({ isRecording: true });
        addEvent("PROCESS", "Secure protocol recording (Grid-View) initiated.");
        showToast("Recording started and synced with peers.", "info");
    };

    const toggleRecording = () => {
        if (!isHost) return;
        if (!isRecording) {
            startRecording();
        } else {
            if (mediaRecorderRef.current) mediaRecorderRef.current.stop();
            mediaRecorderRef.current = null;
            setIsRecording(false);
            broadcastStatus({ isRecording: false });
        }
    };

    // ── Finalize Meeting ──────────────────────────────────────────────────────
    const finalizeMeeting = async () => {
        if (!signer || !isHost) return;
        if (isRecording) {
            if (mediaRecorderRef.current) mediaRecorderRef.current.stop();
            mediaRecorderRef.current = null;
            setIsRecording(false);
            broadcastStatus({ isRecording: false });
            await new Promise(r => setTimeout(r, 800)); // Wait for chunks
        }
        setFinalizing(true);
        try {
            addEvent("PROCESS", "Requesting cryptographic signature...");
            const msg = getSessionSignatureMessage(roomId);
            const signature = await signer.signMessage(msg);
            addEvent("PROCESS", "Encrypting with AES-GCM-256...");

            let blobToEncrypt;
            if (recordedChunksRef.current.length > 0) {
                // Combine and optimize recording blob
                blobToEncrypt = new Blob(recordedChunksRef.current, { type: 'video/webm' });
            } else {
                blobToEncrypt = new Blob([JSON.stringify({
                    title: meetingTitle, roomId, sessionCode: huddleId,
                    timestamp: Date.now(), protocol: "SYNOX Grid-Rec v1.1"
                })], { type: 'application/json' });
            }

            // Use huddleId as the key seed instead of signature to allow all participants to decrypt.
            // Even though huddleId is on-chain, it acts as the shared session key for the protocol.
            const keySeed = huddleId;
            const { encrypted } = await encryptFile(new Uint8Array(await blobToEncrypt.arrayBuffer()), keySeed);
            addEvent("PROCESS", "Uploading to IPFS...");
            const _cid = await uploadToIPFS(encrypted);
            setCid(_cid);

            addEvent("BLOCKCHAIN", "Committing proof to Ethereum...");
            const contract = new ethers.Contract(SYNOX_ADDRESS, SYNOX_ABI, signer);
            const tx = await contract.finalizeMeeting(roomId, _cid);
            addEvent("BLOCKCHAIN", `TX Mining: ${tx.hash.slice(0, 10)}...`);
            setFinalTxHash(tx.hash);
            await tx.wait();

            // Notify all peers to end their session
            if (socketRef.current) {
                socketRef.current.emit('end-meeting', { roomId: huddleId });
            }

            addEvent("SUCCESS", "Session SEALED. NFTs distributed.");
            setShowSuccessModal(true);
        } catch (e) {
            console.error(e);
            addEvent("ERROR", e.message);
            showToast("Protocol Violation: " + e.message, "error");
        }
        setFinalizing(false);
    };

    // ── Fetch On-Chain History ────────────────────────────────────────────────
    useEffect(() => {
        if (!hasJoined || !provider || !roomId) return;
        const fetch = async () => {
            try {
                const contract = new ethers.Contract(SYNOX_ADDRESS, SYNOX_ABI, provider);
                const logs = await contract.queryFilter(contract.filters.UserJoined(roomId));
                setEvents(prev => [...logs.map(log => ({
                    id: log.blockNumber + log.transactionHash,
                    type: "LEDGER",
                    msg: `Verified Participant: ${log.args[1].slice(0, 6)}...${log.args[1].slice(-4)} joined.`,
                    time: "ON-CHAIN"
                })), ...prev]);
            } catch (e) { console.warn("History fetch failed:", e); }
        };
        fetch();
    }, [hasJoined]);

    // ─────────────────────────────────────────────────────────────────────────
    // LOBBY VIEW
    // ─────────────────────────────────────────────────────────────────────────
    if (!hasJoined) {
        return (
            <div className="min-h-screen bg-black flex items-center justify-center p-6 pt-24">
                <div className="max-w-6xl w-full grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
                    <div className="space-y-6">
                        <div className="relative glass rounded-3xl overflow-hidden aspect-video border border-white/10 shadow-2xl">
                            <video ref={localVideoRef} autoPlay muted playsInline
                                className={`w-full h-full object-cover transform scale-x-[-1] ${!isVideoOn ? 'hidden' : ''}`} />
                            {!isVideoOn && (
                                <div className="absolute inset-0 flex flex-col items-center justify-center bg-zinc-900">
                                    <img src={`https://api.dicebear.com/7.x/avataaars/svg?seed=${account}`} alt="Avatar"
                                        className="w-32 h-32 rounded-full border-4 border-white/5 shadow-2xl mb-4" />
                                    <p className="text-zinc-500 font-mono text-[10px] uppercase tracking-widest">Camera Off</p>
                                </div>
                            )}
                            <div className="absolute bottom-6 left-1/2 -translate-x-1/2 flex gap-4">
                                <button onClick={toggleAudio}
                                    className={`p-4 rounded-2xl transition-all ${isAudioOn ? 'bg-white/10 text-white border border-white/20' : 'bg-red-500/20 text-red-500 border border-red-500/40'}`}>
                                    {isAudioOn ? <Mic size={24} /> : <MicOff size={24} />}
                                </button>
                                <button onClick={toggleVideo}
                                    className={`p-4 rounded-2xl transition-all ${isVideoOn ? 'bg-white/10 text-white border border-white/20' : 'bg-red-500/20 text-red-500 border border-red-500/40'}`}>
                                    {isVideoOn ? <Video size={24} /> : <VideoOff size={24} />}
                                </button>
                            </div>
                        </div>
                    </div>
                    <div className="space-y-8">
                        <div>
                            <span className="text-blue-500 font-black text-[10px] tracking-[0.3em] uppercase mb-2 block">Protocol Authorization</span>
                            <h1 className="text-5xl font-black tracking-tighter mb-4 leading-none uppercase">{meetingTitle}</h1>
                            <p className="text-zinc-500 max-w-md font-light leading-relaxed">
                                Ready to join? You will be registered on the Ethereum ledger and eligible for attendance reputation.
                            </p>
                        </div>
                        <div className="space-y-4">
                            <button onClick={handleJoinSession} disabled={lobbyLoading}
                                className="w-full bg-white text-black py-5 rounded-3xl font-black tracking-[0.2em] text-sm hover:bg-zinc-200 transition-all shadow-xl shadow-white/5 flex items-center justify-center gap-3 disabled:opacity-50">
                                {lobbyLoading ? <Activity className="animate-spin" /> : <ShieldCheck />}
                                {lobbyLoading ? "AUTHORIZING..." : "JOIN SESSION"}
                            </button>
                            <button onClick={() => navigate('/dashboard')}
                                className="w-full bg-zinc-900 text-zinc-400 py-4 rounded-3xl font-bold tracking-widest text-xs hover:bg-zinc-800 transition-all">
                                CANCEL
                            </button>
                        </div>
                        <div className="p-4 border border-white/5 rounded-2xl bg-white/[0.02]">
                            <p className="text-[9px] font-mono text-zinc-600 uppercase tracking-widest leading-relaxed">
                                SECURE NOTE: BY JOINING, YOU AUTHORIZE THE SyNox09 SMART CONTRACT ({SYNOX_ADDRESS.slice(0, 8)}...) TO RECORD YOUR ATTENDANCE.
                            </p>
                        </div>
                    </div>
                </div>
            </div>
        );
    }

    // ─────────────────────────────────────────────────────────────────────────
    // MEETING ROOM VIEW
    // ─────────────────────────────────────────────────────────────────────────
    return (
        <div ref={meetingContainerRef} className="h-screen bg-[#111] text-white flex flex-col font-sans overflow-hidden pt-20">
            {/* Header */}
            <header className="h-16 px-6 flex items-center justify-between border-b border-white/5 z-30 glass shadow-2xl">
                <div className="flex items-center gap-4">
                    <div className="w-8 h-8 rounded-lg bg-white flex items-center justify-center">
                        <ShieldCheck className="text-black" size={18} />
                    </div>
                    <div>
                        <h1 className="font-black tracking-tighter text-lg leading-none uppercase">{meetingTitle}</h1>
                        <div className="flex gap-3 mt-1.5 font-mono text-[8px] tracking-widest text-zinc-500 items-center flex-wrap">
                            {isRecording && (
                                <span className="flex items-center gap-1 text-red-500 animate-pulse font-black">
                                    <div className="w-1.5 h-1.5 bg-red-500 rounded-full" /> REC
                                </span>
                            )}
                            <span className="flex items-center gap-1 uppercase bg-white/5 px-2 py-0.5 rounded"><Hash size={10} className="text-white/20" /> CODE: {displayId || "..."}</span>
                            <span className="flex items-center gap-1 uppercase bg-blue-500/10 px-2 py-0.5 rounded text-blue-400"><Hash size={10} className="text-blue-500/30" /> INDEX: {roomId}</span>
                            <span className="flex items-center gap-1 uppercase bg-white/5 px-2 py-0.5 rounded"><Globe size={10} className="text-white/20" /> CID: {cid.slice(0, 10)}...</span>
                            <span className="flex items-center gap-1 uppercase bg-green-500/10 px-2 py-0.5 rounded text-green-400">
                                <Users size={10} /> {peers.length + 1} ONLINE
                            </span>
                        </div>
                    </div>
                </div>
                <button onClick={() => setShowSidebar(!showSidebar)}
                    className={`p-2 rounded-lg border transition-all ${showSidebar ? 'bg-white/10 border-white/20' : 'bg-transparent border-white/5 hover:border-white/10'}`}>
                    <Activity size={18} />
                </button>
            </header>

            <div className="flex-1 flex overflow-hidden relative">
                {/* Video Grid - Google Meet Style */}
                <main className="flex-1 p-4 md:p-6 overflow-hidden bg-zinc-950 flex flex-col relative">
                    <div className="flex-1 overflow-y-auto min-h-0 flex items-center justify-center p-4">
                        <div className={`grid gap-4 w-full max-w-7xl mx-auto h-full auto-rows-fr ${peers.length === 0 ? 'grid-cols-1' : peers.length === 1 ? 'grid-cols-1 max-w-4xl' : peers.length === 2 ? 'grid-cols-2' : 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3'
                            }`}>
                            {/* All Participants except Me */}
                            {peers
                                .map(p => ({ ...p, status: remoteStatus[p.peerID] || {} }))
                                .sort((a, b) => (a.status.isSpeaking ? -1 : b.status.isSpeaking ? 1 : 0))
                                .map(peer => (
                                    <RemoteVideo
                                        key={peer.peerID}
                                        peerId={peer.peerID}
                                        stream={peer.stream}
                                        isHandRaised={raisedHands[peer.peerID]}
                                        isSpeaking={peer.status.isSpeaking}
                                        isVideoOn={peer.status.isVideoOn !== false}
                                        isScreenSharing={peer.status.isScreenSharing}
                                    />
                                ))}

                            {peers.length === 0 && (
                                <div className="aspect-video rounded-3xl border border-dashed border-white/5 flex flex-col items-center justify-center opacity-30 h-full">
                                    <Users size={48} className="mb-4 text-zinc-500" />
                                    <p className="text-sm font-mono tracking-[0.2em] uppercase text-zinc-500">Waiting for participants to join...</p>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Floating Self Video - Bottom Right */}
                    <div className={`fixed bottom-28 right-8 w-60 md:w-80 aspect-video rounded-2xl overflow-hidden shadow-2xl border-2 transition-all duration-500 z-50 group ${isSpeaking ? 'border-blue-500 shadow-[0_0_40px_rgba(59,130,246,0.4)]' : 'border-white/20 hover:border-white/40'}`}>
                        <video ref={localVideoRef} autoPlay muted playsInline
                            className={`w-full h-full object-cover transform scale-x-[-1] ${!isVideoOn ? 'hidden' : ''}`} />
                        {!isVideoOn && (
                            <div className="absolute inset-0 flex flex-col items-center justify-center bg-zinc-900">
                                <img src={`https://api.dicebear.com/7.x/avataaars/svg?seed=${account}`} alt="Me" className="w-16 h-16 rounded-full border-2 border-white/5 shadow-2xl" />
                                <p className="mt-2 text-zinc-600 font-mono text-[8px] uppercase tracking-widest leading-none">Camera Off</p>
                            </div>
                        )}
                        {raisedHands['me'] && (
                            <div className="absolute top-2 left-2 bg-blue-500 p-1.5 rounded-lg animate-bounce border border-white/20">
                                <Hand size={12} className="text-white fill-white" />
                            </div>
                        )}
                        <div className="absolute bottom-2 left-2 px-2 py-1 rounded-lg glass border-white/10 flex items-center gap-1.5">
                            <span className="text-[8px] font-black tracking-widest uppercase">YOU {isHost && "(HOST)"}</span>
                            {isScreenSharing && <Monitor size={10} className="text-blue-400" />}
                            {isSpeaking && <Volume2 size={10} className="text-blue-500 animate-pulse" />}
                        </div>
                    </div>
                </main>

                {/* Sidebar Backdrop */}
                {showSidebar && (
                    <div className="lg:hidden fixed inset-0 bg-black/60 backdrop-blur-sm z-30" onClick={() => setShowSidebar(false)} />
                )}

                {/* Sidebar */}
                <aside className={`fixed lg:relative inset-y-0 right-0 w-80 h-full border-l border-white/5 glass transition-all duration-500 transform z-40 ${showSidebar ? 'translate-x-0 opacity-100' : 'translate-x-full opacity-0'}`}>
                    <div className="flex p-4 border-b border-white/5 gap-2">
                        <div className="flex-1 py-2 px-4 rounded-lg text-[10px] font-black tracking-widest bg-white text-black text-center">PROTOCOL LEDGER</div>
                        <button onClick={() => setShowSidebar(false)} className="lg:hidden p-2 text-zinc-500 hover:text-white"><X size={18} /></button>
                    </div>
                    <div className="p-4 overflow-y-auto h-[calc(100vh-120px)]">
                        <div className="space-y-4">
                            {events.map(e => (
                                <div key={e.id} className="p-3 bg-white/5 rounded-xl border border-white/5">
                                    <div className="flex justify-between items-center mb-1">
                                        <span className="text-[8px] font-black tracking-widest text-zinc-500 uppercase">{e.type}</span>
                                        <span className="text-[8px] font-mono text-zinc-600">{e.time}</span>
                                    </div>
                                    <p className="text-[11px] text-zinc-300 leading-relaxed tracking-tight">{e.msg}</p>
                                </div>
                            ))}
                            {events.length === 0 && (
                                <div className="text-center text-[10px] text-zinc-600 mt-20 uppercase tracking-widest font-mono">
                                    Connecting to protocol node...
                                </div>
                            )}
                        </div>
                    </div>
                </aside>
            </div>

            {/* Footer */}
            <footer className="h-24 md:h-20 flex items-center justify-between glass border-t border-white/5 z-20 px-8 py-2">
                <div className="flex items-center gap-3">
                    <button onClick={toggleAudio}
                        className={`p-4 rounded-2xl transition-all ${isAudioOn ? 'bg-zinc-900 border border-white/10' : 'bg-red-500 text-white border border-red-500'}`}>
                        {isAudioOn ? <Mic size={20} /> : <MicOff size={20} />}
                    </button>
                    <button onClick={toggleVideo}
                        className={`p-4 rounded-2xl transition-all ${isVideoOn ? 'bg-zinc-900 border border-white/10' : 'bg-red-500 text-white border border-red-500'}`}>
                        {isVideoOn ? <Video size={20} /> : <VideoOff size={20} />}
                    </button>
                    <button onClick={toggleScreenSharing}
                        className={`p-4 rounded-2xl transition-all ${isScreenSharing ? 'bg-blue-500 text-white shadow-[0_0_20px_rgba(59,130,246,0.5)]' : 'bg-zinc-900 border border-white/10 text-gray-400 hover:text-white'}`}>
                        <Monitor size={20} />
                    </button>
                    <button onClick={toggleHand}
                        className={`p-4 rounded-2xl transition-all ${raisedHands['me'] ? 'bg-blue-500 text-white shadow-[0_0_20px_rgba(59,130,246,0.5)]' : 'bg-zinc-900 border border-white/10 text-gray-400 hover:text-white'}`}>
                        <Hand size={20} />
                    </button>
                    <button onClick={toggleFullScreen}
                        className={`p-4 rounded-2xl bg-zinc-900 border border-white/10 text-gray-400 hover:text-white transition-all`}>
                        <Maximize size={20} />
                    </button>
                    <button
                        onClick={() => {
                            if (socketRef.current) socketRef.current.disconnect();
                            Object.values(pcsRef.current).forEach(pc => pc.close());
                            if (localStreamRef.current) localStreamRef.current.getTracks().forEach(t => t.stop());
                            navigate('/dashboard');
                        }}
                        className="ml-2 px-6 md:px-8 py-4 rounded-2xl bg-red-600/20 border border-red-600/40 text-red-500 font-black text-[10px] tracking-widest hover:bg-red-600 hover:text-white transition-all flex items-center gap-2 group shadow-xl shadow-red-500/10">
                        <PhoneOff size={14} /> <span className="hidden md:inline">LEAVE SESSION</span>
                    </button>
                </div>
                <div className="flex items-center gap-4">
                    <button onClick={toggleRecording}
                        className={`p-4 rounded-2xl transition-all ${isRecording ? 'bg-red-500 text-white animate-pulse' : 'bg-zinc-900 border border-white/10 text-gray-400 hover:text-white'}`}>
                        {isRecording ? <StopCircle size={20} /> : <Circle size={20} />}
                    </button>
                    <button onClick={finalizeMeeting} disabled={finalizing || !isHost}
                        className="bg-white text-black px-8 py-4 rounded-2xl font-black text-[10px] tracking-[0.2em] hover:bg-zinc-200 transition-all disabled:opacity-50 flex items-center gap-3 shadow-xl shadow-white/5">
                        {finalizing ? <Activity className="animate-spin" size={16} /> : <ShieldCheck size={16} />}
                        <span>{finalizing ? "FINALIZE" : "SEAL SESSION"}</span>
                    </button>
                </div>
            </footer>

            {/* Success Modal */}
            {showSuccessModal && (
                <div className="fixed inset-0 z-[200] bg-black/80 backdrop-blur-2xl flex items-center justify-center p-6">
                    <div className="max-w-md w-full glass p-8 rounded-[2.5rem] border border-white/10 shadow-2xl text-center relative overflow-hidden">
                        <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-blue-500 to-transparent" />
                        <div className="w-20 h-20 bg-green-500/20 rounded-full flex items-center justify-center mx-auto mb-6 border border-green-500/30">
                            <Trophy className="text-green-500" size={32} />
                        </div>
                        <h2 className="text-3xl font-black tracking-tighter uppercase mb-4">Protocol Finalized</h2>
                        <p className="text-zinc-500 text-sm font-light leading-relaxed mb-8 px-4">
                            The meeting has been cryptographically sealed and attendance registered on the Ethereum ledger.
                        </p>
                        <div className="bg-white/5 border border-white/10 rounded-2xl p-4 mb-8 text-left">
                            <span className="text-[8px] font-black text-blue-500 tracking-[0.2em] uppercase block mb-1">Archived Hash (CID)</span>
                            <p className="text-[10px] font-mono text-zinc-400 break-all">{cid}</p>
                        </div>
                        <div className="flex flex-col gap-3">
                            <button onClick={() => navigate('/reputation')} className="w-full bg-white text-black py-4 rounded-2xl font-black tracking-widest text-xs hover:bg-zinc-200 transition-all flex items-center justify-center gap-2">
                                <Trophy size={16} /> VIEW REPUTATION
                            </button>
                            <a href={`https://sepolia.etherscan.io/tx/${finalTxHash}`} target="_blank" rel="noreferrer"
                                className="w-full bg-blue-600 text-white py-4 rounded-2xl font-black tracking-widest text-xs hover:bg-blue-700 transition-all flex items-center justify-center gap-2 shadow-lg shadow-blue-500/20">
                                <ExternalLink size={16} /> VIEW ON ETHERSCAN
                            </a>
                            <button onClick={() => navigate('/dashboard')} className="w-full bg-zinc-900 border border-white/5 text-zinc-500 py-4 rounded-2xl font-black tracking-widest text-xs hover:border-white/10 transition-all">
                                BACK TO DASHBOARD
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default MeetingRoom;
