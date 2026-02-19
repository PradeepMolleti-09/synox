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
import { motion, AnimatePresence } from 'framer-motion';

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
const RemoteVideo = ({ stream, peerId, name, isHandRaised, isSpeaking, isVideoOn, isAudioOn, isScreenSharing, isMobile }) => {
    const ref = useRef();
    const avatarUrl = `https://api.dicebear.com/7.x/avataaars/svg?seed=${peerId}`;

    useEffect(() => {
        if (ref.current && stream) {
            ref.current.srcObject = stream;
            ref.current.play().catch(() => { });
        }
    }, [stream]);

    return (
        <div className={`relative bg-zinc-900 rounded-2xl overflow-hidden transition-all duration-500 border-2 ${isSpeaking ? 'border-blue-500 shadow-[0_0_20px_rgba(59,130,246,0.3)]' : 'border-transparent'} aspect-video`}>
            <video
                ref={ref}
                autoPlay
                playsInline
                data-peer={peerId}
                className={`w-full h-full object-cover transform scale-x-[-1] ${!isVideoOn ? 'hidden' : ''}`}
            />
            {!isVideoOn && (
                <div className="w-full h-full flex flex-col items-center justify-center bg-zinc-800 absolute inset-0">
                    <img src={avatarUrl} alt="Avatar" className="w-24 h-24 rounded-full border-4 border-white/5 shadow-2xl" />
                </div>
            )}

            {/* Name Label */}
            <div className="absolute bottom-4 left-4 flex items-center gap-2 pointer-events-none">
                <span className="bg-black/40 backdrop-blur-md px-3 py-1 rounded-lg text-xs font-medium text-white">
                    {name || `User ${peerId.slice(0, 4)}`}
                </span>
            </div>

            {/* Mute Indicator */}
            {!isAudioOn && (
                <div className="absolute top-4 right-4 bg-black/40 backdrop-blur-md p-2 rounded-full border border-white/10 z-10">
                    <MicOff size={14} className="text-red-500" />
                </div>
            )}

            {isHandRaised && (
                <div className="absolute top-4 left-4 bg-blue-500 p-2 rounded-xl shadow-lg animate-bounce z-10">
                    <Hand size={16} className="text-white fill-white" />
                </div>
            )}

            {isScreenSharing && (
                <div className="absolute top-4 left-16 bg-blue-500/80 backdrop-blur-md px-3 py-1 rounded-lg flex items-center gap-2">
                    <Monitor size={12} className="text-white" />
                    <span className="text-[10px] text-white font-bold uppercase tracking-wider">Sharing</span>
                </div>
            )}
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
    const [hasJoined, setHasJoined] = useState(false);
    const [lobbyLoading, setLobbyLoading] = useState(false);
    const [finalizing, setFinalizing] = useState(false);
    const [showSidebar, setShowSidebar] = useState(true);
    const [sidebarTab, setSidebarTab] = useState("events"); // events, nodes, requests
    const [events, setEvents] = useState([]);
    const [finalTxHash, setFinalTxHash] = useState(null);
    const [isRecording, setIsRecording] = useState(false);
    const [displayId, setDisplayId] = useState("");
    const [cid, setCid] = useState("NOT_FINALIZED");
    const [showSuccessModal, setShowSuccessModal] = useState(false);
    const [meetingIdShort, setMeetingIdShort] = useState("");
    const [pendingJoiners, setPendingJoiners] = useState([]); // [{ peerId, name }]
    const [joinStatus, setJoinStatus] = useState("idle"); // idle, waiting, granted, denied
    const [joinName, setJoinName] = useState(() => {
        const params = new URLSearchParams(window.location.search);
        return params.get("name") || account?.slice(0, 8) || "";
    });

    // Media State
    const [isVideoOn, setIsVideoOn] = useState(true);
    const [isAudioOn, setIsAudioOn] = useState(true);
    const [localStream, setLocalStream] = useState(null);
    const [peers, setPeers] = useState([]); // [{ peerID, pc, stream }]
    const [isMobile, setIsMobile] = useState(window.innerWidth < 1024);

    useEffect(() => {
        const handleResize = () => setIsMobile(window.innerWidth < 1024);
        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, []);

    // Hand Raise & Speaking
    const [raisedHands, setRaisedHands] = useState({});
    const [remoteStatus, setRemoteStatus] = useState({});
    const [isSpeaking, setIsLocalSpeaking] = useState(false);

    // Screen Share State
    const [isScreenSharing, setIsScreenSharing] = useState(false);
    const screenStreamRef = useRef(null);

    // Full Screen State
    const [isFullScreen, setIsFullScreen] = useState(false);
    const [showInfo, setShowInfo] = useState(false);
    const [isWindowFocused, setIsWindowFocused] = useState(true);
    const meetingContainerRef = useRef(null);

    // Secure Mode: Detect Focus for "Blocking" recording
    useEffect(() => {
        const handleBlur = () => setIsWindowFocused(false);
        const handleFocus = () => setIsWindowFocused(true);
        window.addEventListener('blur', handleBlur);
        window.addEventListener('focus', handleFocus);
        return () => {
            window.removeEventListener('blur', handleBlur);
            window.removeEventListener('focus', handleFocus);
        };
    }, []);

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
                let m;
                // If the roomId is numeric, we can fetch directly
                if (!isNaN(roomId)) {
                    m = await contract.meetings(roomId);
                } else {
                    // Discovery Search: RoomId is alphanumeric, search all meetings
                    const count = await contract.meetingCount();
                    for (let i = 0; i < count; i++) {
                        const temp = await contract.meetings(i);
                        if (temp.huddleId === roomId) {
                            m = temp;
                            break;
                        }
                    }
                }

                if (m) {
                    setHuddleId(m.huddleId);
                    setMeetingTitle(m.title);
                    setIsHost(m.host.toLowerCase() === account?.toLowerCase());
                    if (m.recordingCID && m.recordingCID !== "") setCid(m.recordingCID);
                } else {
                    showToast("Security Alert: Meeting room not found on Ethereum.", "error");
                }
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
        if (showSidebar && isMobile) document.body.style.overflow = 'hidden';
        else document.body.style.overflow = 'unset';
        return () => { document.body.style.overflow = 'unset'; };
    }, [showSidebar, isMobile]);

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
    const handleJoinSession = useCallback(async () => {
        if (!huddleId || !account || !socketRef.current) return;
        setLobbyLoading(true);

        // Emit join-room event with host status and name
        socketRef.current.emit("join-room", {
            roomId: huddleId,
            isHost,
            name: joinName || account?.slice(0, 8)
        });

        addEvent("SECURITY", "Initiating protocol handshake...");
        // Status will be updated by socket listeners 'waiting-for-permission' or 'meeting-info'
    }, [huddleId, account, isHost, socketRef, setLobbyLoading, joinName, addEvent]);

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
    // ── Socket Connection ────────────────────────────────────────────────────
    useEffect(() => {
        if (!huddleId || !account) return;

        const socket = io(SIGNALING_SERVER, {
            transports: ['websocket', 'polling'],
            reconnectionAttempts: 10,
            reconnectionDelay: 1000,
            reconnectionDelayMax: 5000,
        });
        socketRef.current = socket;

        socket.on('connect', () => {
            addEvent("NETWORK", `Connected to signaling server.`);
        });

        socket.on('meeting-info', ({ meetingId }) => {
            setMeetingIdShort(meetingId);
            setJoinStatus("granted");
            setHasJoined(true);
            setLobbyLoading(false);
            addEvent("SUCCESS", "Channel established. Entering mesh...");
        });

        socket.on('waiting-for-permission', ({ meetingId }) => {
            setMeetingIdShort(meetingId);
            setJoinStatus("waiting");
            setLobbyLoading(false);
            addEvent("SECURITY", "Join request submitted. Awaiting host confirmation.");
        });

        socket.on('permission-granted', () => {
            setJoinStatus("granted");
            setHasJoined(true);
            addEvent("SUCCESS", "Host granted entry. Initializing WebRTC...");
        });

        socket.on('permission-denied', () => {
            setJoinStatus("denied");
            showToast("Host denied your entry request.", "error");
        });

        socket.on('permission-requested', ({ peerId, name }) => {
            setPendingJoiners(prev => {
                if (prev.find(p => p.peerId === peerId)) return prev;
                return [...prev, { peerId, name }];
            });
            showToast(`Protocol Request: ${name} is knocking.`, "info");
        });

        return () => {
            socket.disconnect();
        };
    }, [huddleId, account, isHost, addEvent, showToast]);

    // ── WebRTC Mesh Logic ─────────────────────────────────────────────────────
    useEffect(() => {
        const socket = socketRef.current;
        if (!hasJoined || !socket || !huddleId) return;

        socket.on('reconnect', () => {
            addEvent("NETWORK", "Mesh re-synching. Regenerating peers...");
            Object.values(pcsRef.current).forEach(pc => pc.close());
            pcsRef.current = {};
            setPeers([]);
            socket.emit("join-room", { roomId: huddleId, isHost, name: account?.slice(0, 8) });
        });

        // ── Joiner receives existing users → initiates offers ──
        socket.on("all-users", (users) => {
            addEvent("NETWORK", `${users.length} peer(s) in room. Establishing connections...`);
            users.forEach(async (user) => {
                const peerID = user.id;
                setRemoteStatus(prev => ({ ...prev, [peerID]: { ...prev[peerID], name: user.name } }));

                if (pcsRef.current[peerID]) {
                    pcsRef.current[peerID].close();
                    delete pcsRef.current[peerID];
                }

                const pc = createPC(peerID, socket);
                pcsRef.current[peerID] = pc;

                setPeers(prev => {
                    const filtered = prev.filter(p => p.peerID !== peerID);
                    return [...filtered, { peerID: peerID, pc, stream: null, addedAt: Date.now() }];
                });

                try {
                    const offer = await pc.createOffer();
                    await pc.setLocalDescription(offer);
                    socket.emit("offer", { target: peerID, callerID: socket.id, signal: offer });
                } catch (e) {
                    console.error("Error creating offer:", e);
                }
            });
        });

        // ── Existing user notified of new joiner ──
        socket.on("user-joined", ({ id, name }) => {
            addEvent("NETWORK", `Peer join: ${name}`);
            setRemoteStatus(prev => ({ ...prev, [id]: { ...prev[id], name: name } }));
        });

        // ── Receive offer → send answer ──
        socket.on("offer", async (payload) => {
            const { callerID, signal } = payload;
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

        socket.on("user-left", (userID) => {
            addEvent("NETWORK", `Peer detach.`);
            removePeer(userID);
        });

        const ghostSweeper = setInterval(() => {
            setPeers(prev => {
                const now = Date.now();
                const alive = prev.filter(p => {
                    if (p.stream) return true;
                    if (!p.addedAt) return true;
                    if (now - p.addedAt > 15000) {
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
            socket.off("all-users");
            socket.off("user-joined");
            socket.off("offer");
            socket.off("answer");
            socket.off("ice-candidate");
            socket.off("user-left");
            socket.off("reconnect");
            Object.values(pcsRef.current).forEach(pc => pc.close());
            pcsRef.current = {};
            setPeers([]);
        };
    }, [hasJoined, huddleId, removePeer, addEvent]);

    // ── Data channel for status/hand (via socket relay) ──────────────────────
    const broadcastStatus = useCallback((payload) => {
        if (socketRef.current) {
            socketRef.current.emit('broadcast-status', {
                roomId: huddleId,
                payload: { ...payload, isMobile, name: joinName || account?.slice(0, 8) }
            });
        }
    }, [huddleId, isMobile, account]);

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
                            <span className="text-blue-500 font-black text-[10px] tracking-[0.3em] uppercase mb-2 block">
                                {isHost ? "System Configuration" : "Join Request"}
                            </span>
                            <h1 className="text-5xl font-black tracking-tighter mb-2 leading-none uppercase">{meetingTitle}</h1>
                            <div className="flex items-center gap-2 mb-6">
                                <Hash size={12} className="text-blue-500" />
                                <span className="text-zinc-500 font-mono text-[10px] uppercase tracking-widest">Room ID: {roomId}</span>
                            </div>
                            <p className="text-zinc-500 max-w-md font-light leading-relaxed">
                                {isHost
                                    ? "Welcome back, Host. Verify your hardware configuration before initiating the secure protocol mesh."
                                    : "Protocol authorization required. Please establish your participant alias and request entry."}
                            </p>
                        </div>
                        <div className="space-y-4">
                            {joinStatus === "idle" ? (
                                <div className="space-y-4">
                                    <div className="space-y-2">
                                        <label className="text-[10px] font-black tracking-widest text-zinc-500 uppercase">Participant Alias</label>
                                        <input
                                            type="text"
                                            value={joinName}
                                            onChange={(e) => setJoinName(e.target.value)}
                                            placeholder="Enter your name..."
                                            className="w-full bg-white/5 border border-white/10 rounded-2xl px-6 py-4 text-sm font-bold focus:border-blue-500 transition-all outline-none text-white tracking-widest uppercase"
                                        />
                                    </div>
                                    <button onClick={handleJoinSession} disabled={lobbyLoading}
                                        className={`w-full py-5 rounded-3xl font-black tracking-[0.2em] text-sm transition-all shadow-xl flex items-center justify-center gap-3 disabled:opacity-50 ${isHost ? 'bg-blue-600 text-white hover:bg-blue-700 shadow-blue-500/20' : 'bg-white text-black hover:bg-zinc-200 shadow-white/5'}`}>
                                        {lobbyLoading ? <Activity className="animate-spin" /> : <ShieldCheck />}
                                        {lobbyLoading ? "INITIALIZING..." : (isHost ? "LAUNCH PROTOCOL" : "ASK TO JOIN")}
                                    </button>
                                </div>
                            ) : joinStatus === "waiting" ? (
                                <div className="p-6 bg-blue-500/10 border border-blue-500/20 rounded-3xl text-center">
                                    <Activity className="animate-spin text-blue-500 mx-auto mb-4" />
                                    <p className="text-blue-500 font-black text-xs uppercase tracking-widest">Waiting for host permission...</p>
                                </div>
                            ) : joinStatus === "denied" ? (
                                <div className="p-6 bg-red-500/10 border border-red-500/20 rounded-3xl text-center">
                                    <X className="text-red-500 mx-auto mb-4" />
                                    <p className="text-red-500 font-black text-xs uppercase tracking-widest">Access Denied by Host</p>
                                </div>
                            ) : null}

                            <button onClick={() => navigate('/dashboard')}
                                className="w-full bg-zinc-900 text-zinc-400 py-4 rounded-3xl font-bold tracking-widest text-xs hover:bg-zinc-800 transition-all">
                                CANCEL
                            </button>
                        </div>
                        <div className="p-4 border border-white/5 rounded-2xl bg-white/[0.02]">
                            <p className="text-[9px] font-mono text-zinc-600 uppercase tracking-widest leading-relaxed">
                                SECURE NOTE: BY JOINING, YOU AUTHORIZE THE SYNOX09 SMART CONTRACT ({SYNOX_ADDRESS.slice(0, 8)}...) TO RECORD YOUR ATTENDANCE.
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
        <div ref={meetingContainerRef} className="h-screen bg-black text-white flex flex-col font-sans overflow-hidden">
            {/* Header (Already provided by App layout usually, but here custom) */}
            {/* Header */}
            <header className="h-16 px-6 flex items-center justify-between border-b border-white/5 z-30 glass shadow-2xl">
                <div className="flex items-center gap-4">
                    <div>
                        <div className="flex gap-3 font-mono text-[10px] tracking-widest text-zinc-500 items-center">
                            <span className="text-white font-bold">{new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                            <span className="text-white/20">|</span>
                            <span className="text-white font-bold uppercase">{displayId || roomId}</span>
                            {isRecording && (
                                <span className="flex items-center gap-1.5 text-red-500 animate-pulse font-black ml-2 px-2 py-0.5 bg-red-500/10 rounded">
                                    <div className="w-2 h-2 bg-red-500 rounded-full" /> REC
                                </span>
                            )}
                        </div>
                    </div>
                </div>
                <button onClick={() => setShowSidebar(!showSidebar)}
                    className={`p-2 rounded-lg border transition-all ${showSidebar ? 'bg-white/10 border-white/20' : 'bg-transparent border-white/5 hover:border-white/10'}`}>
                    <Activity size={18} />
                </button>
            </header>

            <div className="flex-1 flex flex-col overflow-hidden relative">
                {/* Video Grid - Full Width Immersive */}
                <main className={`flex-1 overflow-hidden bg-black flex flex-col relative w-full transition-all duration-500 ease-in-out px-4 py-4 ${showSidebar && !isMobile ? 'lg:ml-[450px]' : 'ml-0'}`}>
                    {/* Secure Overlay */}
                    {!isWindowFocused && (
                        <div className="fixed inset-0 z-[200] bg-zinc-950/95 backdrop-blur-3xl flex flex-col items-center justify-center text-center p-12">
                            <ShieldCheck className="text-blue-500 mb-8 w-24 h-24 animate-pulse" />
                            <h2 className="text-4xl font-black tracking-tighter uppercase mb-4">Secure Channel Protected</h2>
                            <p className="text-zinc-500 max-w-md font-light leading-relaxed">
                                System-level recording detected. SYNOX Protocol has obscured the session to prevent unauthorized binary capture. Use the internal recording tool for certified transcripts.
                            </p>
                        </div>
                    )}

                    <div className="flex-1 overflow-hidden flex items-center justify-center">
                        <div className={`grid gap-2 md:gap-4 w-full h-full max-w-7xl mx-auto content-center ${peers.length + 1 === 1 ? 'grid-cols-1 max-w-4xl' :
                            peers.length + 1 === 2 ? 'grid-cols-1 md:grid-cols-2' :
                                peers.length + 1 === 3 ? 'grid-cols-1 md:grid-cols-3' :
                                    peers.length + 1 === 4 ? 'grid-cols-2' :
                                        'grid-cols-2 md:grid-cols-3 lg:grid-cols-4'
                            }`}>
                            {/* Me Participant */}
                            <div className={`relative bg-zinc-900 rounded-2xl overflow-hidden transition-all duration-500 border-2 ${isSpeaking ? 'border-blue-500 shadow-[0_0_20px_rgba(59,130,246,0.3)]' : 'border-transparent'} aspect-video`}>
                                <video ref={localVideoRef} autoPlay muted playsInline
                                    className={`w-full h-full object-cover transform scale-x-[-1] ${!isVideoOn ? 'hidden' : ''}`} />
                                {!isVideoOn && (
                                    <div className="absolute inset-0 flex flex-col items-center justify-center bg-zinc-800">
                                        <img src={`https://api.dicebear.com/7.x/avataaars/svg?seed=${account}`} alt="Me" className="w-24 h-24 rounded-full border border-white/10 shadow-2xl" />
                                    </div>
                                )}
                                <div className="absolute bottom-4 left-4 flex items-center gap-2">
                                    <span className="bg-black/40 backdrop-blur-md px-3 py-1 rounded-lg text-xs font-medium text-white">
                                        You {isHost && "(Host)"}
                                    </span>
                                </div>
                                {!isAudioOn && (
                                    <div className="absolute top-4 right-4 bg-black/40 backdrop-blur-md p-2 rounded-full border border-white/10 z-10">
                                        <MicOff size={14} className="text-red-500" />
                                    </div>
                                )}
                                {raisedHands['me'] && (
                                    <div className="absolute top-4 left-4 bg-blue-500 p-2 rounded-xl animate-bounce border border-white/20">
                                        <Hand size={16} className="text-white fill-white" />
                                    </div>
                                )}
                            </div>

                            {/* All Participants */}
                            {peers
                                .map(p => ({ ...p, status: remoteStatus[p.peerID] || {} }))
                                .map(peer => (
                                    <RemoteVideo
                                        key={peer.peerID}
                                        peerId={peer.peerID}
                                        stream={peer.stream}
                                        name={peer.status.name}
                                        isHandRaised={raisedHands[peer.peerID]}
                                        isSpeaking={peer.status.isSpeaking}
                                        isVideoOn={peer.status.isVideoOn !== false}
                                        isAudioOn={peer.status.isAudioOn !== false}
                                        isScreenSharing={peer.status.isScreenSharing}
                                        isMobile={peer.status.isMobile}
                                    />
                                ))}
                        </div>
                    </div>
                </main>

                {/* Left Side Ledge (Sidebar) */}
                <AnimatePresence>
                    {showSidebar && (
                        <motion.aside
                            initial={{ x: "-100%" }}
                            animate={{ x: 0 }}
                            exit={{ x: "-100%" }}
                            transition={{ type: "spring", damping: 25, stiffness: 200 }}
                            className="fixed top-16 left-0 bottom-24 lg:bottom-20 w-full lg:w-[450px] bg-zinc-950/98 border-r border-white/5 z-50 overflow-hidden flex flex-col shadow-[20px_0_50px_rgba(0,0,0,0.5)] backdrop-blur-3xl"
                        >
                            <div className="p-6 flex flex-col">
                                <div className="flex items-center justify-between mb-8">
                                    <div className="flex items-center gap-3">
                                        <div className="w-2 h-2 bg-blue-500 rounded-full animate-pulse" />
                                        <span className="text-xs font-black tracking-[0.3em] uppercase opacity-50 text-white">Protocol Ledger</span>
                                    </div>
                                    <button onClick={() => setShowSidebar(false)} className="p-2 bg-white/5 hover:bg-white/10 rounded-xl transition-all">
                                        <X size={18} />
                                    </button>
                                </div>

                                <div className="bg-white/5 rounded-2xl p-1 mb-8 flex gap-1 border border-white/5 shadow-inner">
                                    <button
                                        onClick={() => setSidebarTab("events")}
                                        className={`flex-1 py-3 rounded-xl font-black text-[10px] tracking-widest uppercase transition-all ${sidebarTab === 'events' ? 'bg-white text-black' : 'text-zinc-500 hover:text-white'}`}
                                    >
                                        Events
                                    </button>
                                    <button
                                        onClick={() => setSidebarTab("nodes")}
                                        className={`flex-1 py-3 rounded-xl font-black text-[10px] tracking-widest uppercase transition-all ${sidebarTab === 'nodes' ? 'bg-white text-black' : 'text-zinc-500 hover:text-white'}`}
                                    >
                                        Nodes
                                    </button>
                                    {isHost && (
                                        <button
                                            onClick={() => setSidebarTab("requests")}
                                            className={`flex-1 py-3 rounded-xl font-black text-[10px] tracking-widest uppercase transition-all ${sidebarTab === 'requests' ? 'bg-white text-black' : 'text-zinc-500 hover:text-white relative'}`}
                                        >
                                            Requests
                                            {pendingJoiners.length > 0 && (
                                                <span className={`absolute -top-1 -right-1 w-4 h-4 text-[8px] flex items-center justify-center rounded-full animate-bounce ${sidebarTab === 'requests' ? 'bg-blue-600 text-white' : 'bg-blue-500 text-white'}`}>
                                                    {pendingJoiners.length}
                                                </span>
                                            )}
                                        </button>
                                    )}
                                </div>
                            </div>

                            <div className="flex-1 overflow-y-auto px-6 pb-8 space-y-4 custom-scrollbar">
                                {sidebarTab === "requests" && isHost && (
                                    <div className="space-y-4">
                                        <h3 className="text-[10px] font-black tracking-widest text-blue-500 uppercase flex items-center gap-2">
                                            <Users size={12} /> Incoming Protocol Requests ({pendingJoiners.length})
                                        </h3>
                                        {pendingJoiners.length > 0 ? (
                                            <div className="grid gap-3">
                                                {pendingJoiners.map(request => (
                                                    <motion.div
                                                        layout
                                                        initial={{ opacity: 0, y: 10 }}
                                                        animate={{ opacity: 1, y: 0 }}
                                                        key={request.peerId}
                                                        className="p-4 bg-white/5 border border-white/10 rounded-2xl flex items-center justify-between"
                                                    >
                                                        <div className="flex items-center gap-3">
                                                            <img src={`https://api.dicebear.com/7.x/avataaars/svg?seed=${request.peerId}`} className="w-8 h-8 rounded-full border border-white/10" />
                                                            <div>
                                                                <p className="text-xs font-bold text-white">{request.name}</p>
                                                                <p className="text-[9px] text-zinc-500 font-mono uppercase tracking-widest">Wants to join</p>
                                                            </div>
                                                        </div>
                                                        <div className="flex gap-2">
                                                            <button
                                                                onClick={() => {
                                                                    socketRef.current.emit("give-permission", { peerId: request.peerId, roomId: huddleId, approved: true });
                                                                    setPendingJoiners(prev => prev.filter(p => p.peerId !== request.peerId));
                                                                }}
                                                                className="p-2 bg-blue-500/20 hover:bg-blue-500 text-blue-500 hover:text-white rounded-xl transition-all"
                                                            >
                                                                <ShieldCheck size={16} />
                                                            </button>
                                                            <button
                                                                onClick={() => {
                                                                    socketRef.current.emit("give-permission", { peerId: request.peerId, roomId: huddleId, approved: false });
                                                                    setPendingJoiners(prev => prev.filter(p => p.peerId !== request.peerId));
                                                                }}
                                                                className="p-2 bg-red-500/20 hover:bg-red-500 text-red-500 hover:text-white rounded-xl transition-all"
                                                            >
                                                                <X size={16} />
                                                            </button>
                                                        </div>
                                                    </motion.div>
                                                ))}
                                            </div>
                                        ) : (
                                            <p className="text-center py-12 text-zinc-600 text-[10px] font-black tracking-widest uppercase">No pending requests</p>
                                        )}
                                    </div>
                                )}

                                {sidebarTab === "nodes" && (
                                    <div className="space-y-4">
                                        <h3 className="text-[10px] font-black tracking-widest text-zinc-400 uppercase">Active Mesh Nodes ({peers.length + 1})</h3>
                                        <div className="grid gap-3">
                                            {/* Me Node */}
                                            <div className="p-4 bg-blue-500/5 border border-blue-500/10 rounded-2xl flex items-center justify-between">
                                                <div className="flex items-center gap-3">
                                                    <img src={`https://api.dicebear.com/7.x/avataaars/svg?seed=${account}`} className="w-8 h-8 rounded-full border border-blue-500/20" />
                                                    <div>
                                                        <p className="text-xs font-bold text-white">{joinName} (You)</p>
                                                        <p className="text-[8px] text-blue-500 font-mono uppercase tracking-widest">Local Authority</p>
                                                    </div>
                                                </div>
                                                <div className="w-2 h-2 bg-green-500 rounded-full shadow-[0_0_10px_rgba(34,197,94,0.5)]" />
                                            </div>

                                            {/* Peer Nodes */}
                                            {peers.map(peer => {
                                                const status = remoteStatus[peer.peerID] || {};
                                                return (
                                                    <div key={peer.peerID} className="p-4 bg-white/5 border border-white/10 rounded-2xl flex items-center justify-between">
                                                        <div className="flex items-center gap-4">
                                                            <img src={`https://api.dicebear.com/7.x/avataaars/svg?seed=${peer.peerID}`} className="w-8 h-8 rounded-full border border-white/10" />
                                                            <div>
                                                                <p className="text-xs font-bold text-white tracking-widest uppercase">{status.name || "UNIDENTIFIED NODE"}</p>
                                                                <p className="text-[8px] text-zinc-500 font-mono uppercase tracking-widest">{peer.peerID.slice(0, 16)}...</p>
                                                            </div>
                                                        </div>
                                                        <div className="w-2 h-2 bg-blue-500 rounded-full animate-pulse" />
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </div>
                                )}

                                {sidebarTab === "events" && (
                                    <div className="space-y-4">
                                        {events.map((e) => (
                                            <motion.div
                                                initial={{ opacity: 0, x: -20 }}
                                                animate={{ opacity: 1, x: 0 }}
                                                key={e.id}
                                                className="p-5 bg-white/[0.02] rounded-[1.5rem] border border-white/5 hover:border-blue-500/20 hover:bg-white/[0.04] transition-all group"
                                            >
                                                <div className="flex justify-between items-center mb-3">
                                                    <div className="flex items-center gap-2">
                                                        <div className={`w-1.5 h-1.5 rounded-full ${e.type === 'BLOCKCHAIN' ? 'bg-blue-500' : e.type === 'ERROR' ? 'bg-red-500' : 'bg-green-500'}`} />
                                                        <span className="text-[9px] font-black tracking-widest text-zinc-500 uppercase">{e.type}</span>
                                                    </div>
                                                    <span className="text-[9px] font-mono text-zinc-600 group-hover:text-blue-500 transition-colors uppercase">{e.time}</span>
                                                </div>
                                                <p className="text-[11px] text-zinc-400 font-medium leading-relaxed tracking-tight group-hover:text-zinc-200 transition-colors uppercase">{e.msg}</p>
                                            </motion.div>
                                        ))}
                                        {events.length === 0 && (
                                            <div className="py-20 flex flex-col items-center opacity-20">
                                                <Activity className="animate-spin mb-4 w-8 h-8 text-white" />
                                                <p className="text-xs font-mono uppercase tracking-[0.3em] text-white text-center">Protocol Ledger: Empty</p>
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>
                        </motion.aside>
                    )}
                </AnimatePresence>
            </div>

            {/* Footer */}
            <footer className="h-24 md:h-20 flex flex-col md:flex-row items-center justify-between bg-black z-20 px-2 md:px-4 py-2 md:py-0 border-t border-white/5">
                {/* Left side info */}
                <div className="hidden md:flex items-center gap-4 w-1/4">
                    <div className="text-sm font-medium text-white pl-4">
                        {new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} | {displayId || roomId}
                    </div>
                </div>

                {/* Center Controls */}
                <div className="flex items-center gap-2 md:gap-3 justify-center w-full md:w-auto">
                    <button onClick={toggleAudio}
                        className={`p-2.5 md:p-3 rounded-full transition-all border ${isAudioOn ? 'bg-zinc-800 border-zinc-700 text-white' : 'bg-red-500 border-red-500 text-white shadow-[0_0_15px_rgba(239,68,68,0.3)]'}`}>
                        {isAudioOn ? <Mic size={18} /> : <MicOff size={18} />}
                    </button>
                    <button onClick={toggleVideo}
                        className={`p-2.5 md:p-3 rounded-full transition-all border ${isVideoOn ? 'bg-zinc-800 border-zinc-700 text-white' : 'bg-red-500 border-red-500 text-white shadow-[0_0_15px_rgba(239,68,68,0.3)]'}`}>
                        {isVideoOn ? <Video size={18} /> : <VideoOff size={18} />}
                    </button>
                    <button onClick={toggleScreenSharing}
                        className={`p-2.5 md:p-3 rounded-full transition-all border ${isScreenSharing ? 'bg-blue-500 border-blue-500 text-white shadow-[0_0_15px_rgba(59,130,246,0.3)]' : 'bg-zinc-800 border-zinc-700 text-white hover:bg-zinc-700'}`}>
                        <Monitor size={18} />
                    </button>
                    <button onClick={toggleHand}
                        className={`p-2.5 md:p-3 rounded-full transition-all border ${raisedHands['me'] ? 'bg-blue-500 border-blue-500 text-white shadow-[0_0_15px_rgba(59,130,246,0.3)]' : 'bg-zinc-800 border-zinc-700 text-white hover:bg-zinc-700'}`}>
                        <Hand size={18} />
                    </button>

                    <button onClick={toggleRecording}
                        className={`p-2.5 md:p-3 rounded-full transition-all border ${isRecording ? 'bg-red-500 border-red-500 text-white animate-pulse' : 'bg-zinc-800 border-zinc-700 text-white hover:bg-zinc-700'}`}>
                        {isRecording ? <StopCircle size={18} /> : <Circle size={18} />}
                    </button>

                    <button onClick={toggleFullScreen}
                        className={`p-2.5 md:p-3 rounded-full transition-all border ${isFullScreen ? 'bg-blue-500 border-blue-500 text-white' : 'bg-zinc-800 border-zinc-700 text-white hover:bg-zinc-700'}`}>
                        <Maximize size={18} />
                    </button>

                    <button
                        onClick={() => {
                            if (socketRef.current) socketRef.current.disconnect();
                            Object.values(pcsRef.current).forEach(pc => pc.close());
                            if (localStreamRef.current) localStreamRef.current.getTracks().forEach(t => t.stop());
                            navigate('/dashboard');
                        }}
                        className="bg-red-500 hover:bg-red-600 text-white px-4 md:px-6 py-2.5 md:py-3 rounded-full transition-all border border-red-500 shadow-lg shadow-red-500/20">
                        <PhoneOff size={18} />
                    </button>
                </div>

                {/* Right side controls */}
                <div className="flex items-center justify-center md:justify-end gap-2 w-full md:w-1/4 md:pr-4 mt-2 md:mt-0">
                    {isHost && (
                        <button onClick={finalizeMeeting} disabled={finalizing}
                            className="bg-white text-black px-3 py-1.5 rounded-full font-black text-[9px] hover:bg-zinc-200 transition-all disabled:opacity-50 flex items-center gap-2">
                            {finalizing ? <Activity className="animate-spin" size={12} /> : <ShieldCheck size={12} />}
                            <span>SEAL BINARY</span>
                        </button>
                    )}
                    <button onClick={() => setShowSidebar(!showSidebar)}
                        className={`p-2.5 rounded-full transition-all ${showSidebar ? 'bg-white/10 text-white' : 'text-zinc-400 hover:text-white hover:bg-white/5'}`}>
                        <Activity size={18} />
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
