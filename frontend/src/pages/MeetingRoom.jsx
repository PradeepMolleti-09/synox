import React, { useEffect, useState, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useWallet } from '../hooks/useWallet';
import { ethers } from 'ethers';
import { SYNOX_ADDRESS, SYNOX_ABI } from '../utils/contract';
import {
    Mic, MicOff, Video, VideoOff, PhoneOff, Users,
    ShieldCheck, Trophy, Activity, Hand, Volume2,
    Vote as VoteIcon, ChevronRight, Hash, Globe, X, ExternalLink
} from 'lucide-react';
import { useToast } from '../context/ToastContext';
import { encryptFile, uploadToIPFS, getSessionSignatureMessage } from '../utils/storage';
import io from 'socket.io-client';
import Peer from 'simple-peer';
import process from 'process';

window.process = process;

// Huddle components removed

const RemoteVideo = ({ stream, peerId, isHandRaised, isSpeaking, isVideoOn }) => {
    const ref = useRef();
    const avatarUrl = `https://api.dicebear.com/7.x/avataaars/svg?seed=${peerId}`;

    useEffect(() => {
        if (ref.current && stream) ref.current.srcObject = stream;
    }, [stream]);

    return (
        <div className={`relative bg-zinc-900 rounded-2xl overflow-hidden aspect-video border transition-all duration-500 ${isSpeaking ? 'border-blue-500 shadow-[0_0_30px_rgba(59,130,246,0.3)] scale-[1.02]' : 'border-white/5'}`}>
            {isVideoOn ? (
                <video ref={ref} autoPlay className="w-full h-full object-cover" />
            ) : (
                <div className="w-full h-full flex flex-col items-center justify-center bg-zinc-950 relative">
                    <img src={avatarUrl} alt="Avatar" className="w-24 h-24 rounded-full border-4 border-white/5 shadow-2xl" />
                    <div className="mt-4 flex items-center gap-2 text-zinc-500 font-mono text-[8px] uppercase tracking-widest">
                        <Volume2 size={12} className={isSpeaking ? 'text-blue-500 animate-pulse' : ''} />
                        SIGNAL ACTIVE
                    </div>
                </div>
            )}

            {isHandRaised && (
                <div className="absolute top-4 left-4 bg-blue-500 p-2.5 rounded-xl shadow-[0_0_30px_rgba(59,130,246,0.6)] animate-bounce z-10 border border-white/20">
                    <Hand size={18} className="text-white fill-white" />
                </div>
            )}

            <div className="absolute bottom-4 left-4 bg-black/60 px-3 py-1.5 rounded-lg text-[10px] font-black tracking-tighter backdrop-blur-md text-white border border-white/10 opacity-0 group-hover:opacity-100 transition-opacity">
                PEER: {peerId.slice(0, 8)}
            </div>
        </div>
    );
};

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
    const [activeTab, setActiveTab] = useState('events');
    const [events, setEvents] = useState([]);
    const [finalTxHash, setFinalTxHash] = useState(null);
    const [isRecording, setIsRecording] = useState(false);
    const [recStartTime, setRecStartTime] = useState(null);
    const [displayId, setDisplayId] = useState("");
    const [cid, setCid] = useState("NOT_FINALIZED");
    const [hasJoined, setHasJoined] = useState(false);
    const [lobbyLoading, setLobbyLoading] = useState(false);
    const [showSuccessModal, setShowSuccessModal] = useState(false);

    // Media State for P2P
    const [isVideoOn, setIsVideoOn] = useState(true);
    const [isAudioOn, setIsAudioOn] = useState(true);
    const [localStream, setLocalStream] = useState(null);
    const [peers, setPeers] = useState([]);

    // Hand Raise & Audio State
    const [raisedHands, setRaisedHands] = useState({});
    const [remoteStatus, setRemoteStatus] = useState({}); // { peerId: { isVideoOn, isAudioOn, isSpeaking } }
    const [isSpeaking, setIsLocalSpeaking] = useState(false);

    const socketRef = useRef();
    const localVideoRef = useRef(null);
    const audioContextRef = useRef(null);
    const peersRef = useRef([]);
    const mediaRecorderRef = useRef(null);
    const recordedChunksRef = useRef([]);
    const { showToast } = useToast();

    // Initialize Meeting and Contract Events
    useEffect(() => {
        if (!provider || !roomId || !account) return;

        const contract = new ethers.Contract(SYNOX_ADDRESS, SYNOX_ABI, provider);

        const fetchMeeting = async () => {
            try {
                const m = await contract.meetings(roomId);
                setHuddleId(m.huddleId);
                setMeetingTitle(m.title);
                setIsHost(m.host.toLowerCase() === account?.toLowerCase());

                // Generate random 3-digit display ID (demo purposes)
                const randId = Math.floor(100 + Math.random() * 900);
                setDisplayId(randId.toString());
                if (m.recordingCID && m.recordingCID !== "") {
                    setCid(m.recordingCID);
                }
            } catch (e) {
                console.warn("Meeting fetch failed", e);
            }
        };

        fetchMeeting();

        // Listen for live events
        const onJoined = (mid, user) => {
            if (Number(mid) === Number(roomId)) {
                addEvent("USER JOINED", `${user.slice(0, 6)}... joined the room.`);
            }
        };

        contract.on("UserJoined", onJoined);
        return () => contract.off("UserJoined", onJoined);
    }, [provider, roomId, account]);

    // Body Scroll Lock for Mobile Sidebar
    useEffect(() => {
        if (showSidebar && window.innerWidth < 1024) {
            document.body.style.overflow = 'hidden';
        } else {
            document.body.style.overflow = 'unset';
        }
        return () => { document.body.style.overflow = 'unset'; };
    }, [showSidebar]);

    const addEvent = (type, msg) => {
        setEvents(prev => [{ id: Date.now(), type, msg, time: new Date().toLocaleTimeString() }, ...prev]);
    };
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
            addEvent("NETWORK", "Secure P2P tunnel established via WebRTC.");
        } catch (e) {
            console.error(e);
            showToast("Authorization Error: " + e.message, "error");
        }
        setLobbyLoading(false);
    };

    // WebRTC P2P Multi-Peer Logic
    useEffect(() => {
        if (!hasJoined || !huddleId) return;

        socketRef.current = io("http://localhost:5000"); // Local Signaling Node

        socketRef.current.emit("join-room", huddleId);

        socketRef.current.on("other-user", (userId) => {
            const peer = createPeer(userId, socketRef.current.id, localStream);
            peersRef.current.push({
                peerID: userId,
                peer,
            });
            setPeers(prev => [...prev, { peerID: userId, peer }]);
        });

        socketRef.current.on("user-joined", (userId) => {
            const peer = addPeer(userId, socketRef.current.id, localStream);
            peersRef.current.push({
                peerID: userId,
                peer,
            });
            setPeers(prev => [...prev, { peerID: userId, peer }]);
        });

        socketRef.current.on("offer", (payload) => {
            const item = peersRef.current.find(p => p.peerID === payload.callerID);
            if (item) item.peer.signal(payload.signal);
        });

        socketRef.current.on("answer", (payload) => {
            const item = peersRef.current.find(p => p.peerID === payload.id);
            if (item) item.peer.signal(payload.signal);
        });

        return () => {
            if (socketRef.current) socketRef.current.disconnect();
            peersRef.current.forEach(p => p.peer.destroy());
        };
    }, [hasJoined, huddleId]);

    function createPeer(userToSignal, callerID, stream) {
        const peer = new Peer({
            initiator: true,
            trickle: false,
            stream,
        });

        peer.on("signal", signal => {
            socketRef.current.emit("offer", { target: userToSignal, callerID, signal });
        });

        peer.on("stream", stream => {
            setPeers(prevPeers => {
                return prevPeers.map(p => {
                    if (p.peerID === userToSignal) {
                        return { ...p, stream };
                    }
                    return p;
                });
            });
        });

        peer.on("data", data => {
            const parsed = JSON.parse(data);
            handleIncomingData(userToSignal, parsed);
        });

        return peer;
    }

    function addPeer(incomingSignal, callerID, stream) {
        const peer = new Peer({
            initiator: false,
            trickle: false,
            stream,
        });

        peer.on("signal", signal => {
            socketRef.current.emit("answer", { signal, target: incomingSignal, id: socketRef.current.id });
        });

        peer.on("stream", stream => {
            setPeers(prevPeers => {
                return prevPeers.map(p => {
                    if (p.peerID === incomingSignal) {
                        return { ...p, stream };
                    }
                    return p;
                });
            });
        });

        peer.on("data", data => {
            const parsed = JSON.parse(data);
            handleIncomingData(incomingSignal, parsed);
        });

        return peer;
    }

    const handleIncomingData = (sender, data) => {
        if (data.type === 'hand') {
            setRaisedHands(prev => ({ ...prev, [sender]: data.value }));
            addEvent("PROTOCOL", `${sender.slice(0, 6)} ${data.value ? "raised their hand" : "lowered their hand"}`);
        } else if (data.type === 'status') {
            setRemoteStatus(prev => ({
                ...prev,
                [sender]: { ...prev[sender], ...data.payload }
            }));
        }
    };

    const broadcastStatus = (payload) => {
        const data = JSON.stringify({ type: 'status', payload });
        peersRef.current.forEach(p => p.peer.send(data));
    };


    const toggleHand = () => {
        const newState = !raisedHands['me'];
        setRaisedHands(prev => ({ ...prev, me: newState }));
        const payload = { type: 'hand', value: newState };
        peersRef.current.forEach(p => p.peer.send(JSON.stringify(payload)));
        addEvent("PROCESS", newState ? "Hand raised on protocol node." : "Hand lowered.");
    };

    // Speaking Indicator Logic
    useEffect(() => {
        if (!localStream || !isAudioOn) {
            setIsLocalSpeaking(false);
            return;
        }

        const audioContext = new (window.AudioContext || window.webkitAudioContext)();
        const source = audioContext.createMediaStreamSource(localStream);
        const analyser = audioContext.createAnalyser();
        analyser.fftSize = 256;
        source.connect(analyser);

        const bufferLength = analyser.frequencyBinCount;
        const dataArray = new Uint8Array(bufferLength);

        let interval = setInterval(() => {
            analyser.getByteFrequencyData(dataArray);
            const sum = dataArray.reduce((a, b) => a + b, 0);
            const average = sum / bufferLength;
            const speaking = average > 15; // Noise threshold

            if (speaking !== isSpeaking) {
                setIsLocalSpeaking(speaking);
                broadcastStatus({ isSpeaking: speaking });
            }
        }, 300);

        audioContextRef.current = audioContext;
        return () => {
            clearInterval(interval);
            audioContext.close();
        };
    }, [localStream, isAudioOn]);

    // Persistent media init
    useEffect(() => {
        const initMedia = async () => {
            try {
                if (localStream) {
                    // Don't restart if already running
                    return;
                }
                const stream = await navigator.mediaDevices.getUserMedia({
                    video: true,
                    audio: true
                });
                setLocalStream(stream);

                // Initially set based on states
                stream.getVideoTracks()[0].enabled = isVideoOn;
                stream.getAudioTracks()[0].enabled = isAudioOn;

                if (localVideoRef.current) {
                    localVideoRef.current.srcObject = stream;
                }
            } catch (e) {
                console.warn("Media init failed:", e);
                showToast("Media Error: Check camera permissions.", "error");
            }
        };
        initMedia();
    }, [hasJoined]); // Re-run if joining, but keep stream

    useEffect(() => {
        if (localVideoRef.current && localStream) {
            localVideoRef.current.srcObject = localStream;
        }
    }, [localStream, hasJoined]);

    const toggleRecording = () => {
        if (!isHost) return;
        if (!isRecording) {
            if (!localStream) {
                showToast("No media stream found to record.", "error");
                return;
            }
            recordedChunksRef.current = [];

            // Auto-detect supported types
            const mimeType = ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm', 'video/mp4']
                .find(type => MediaRecorder.isTypeSupported(type));

            if (!mimeType) {
                showToast("No supported video recording format found.", "error");
                return;
            }

            // Create a Combined Stream for Recording (Local Video + All Participant Audio)
            const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
            const destination = audioCtx.createMediaStreamDestination();

            // 1. Add Local Audio
            if (localStream.getAudioTracks().length > 0) {
                const localSource = audioCtx.createMediaStreamSource(localStream);
                localSource.connect(destination);
            }

            // 2. Add Remote Audio from all peers
            peers.forEach(p => {
                if (p.stream && p.stream.getAudioTracks().length > 0) {
                    try {
                        const remoteSource = audioCtx.createMediaStreamSource(p.stream);
                        remoteSource.connect(destination);
                    } catch (e) {
                        console.warn("Could not mix peer audio:", p.peerID, e);
                    }
                }
            });

            // 3. Composite Local Video + Mixed Audio
            const combinedStream = new MediaStream([
                localStream.getVideoTracks()[0],
                ...destination.stream.getAudioTracks()
            ]);

            const recorder = new MediaRecorder(combinedStream, { mimeType });

            recorder.ondataavailable = (e) => {
                if (e.data && e.data.size > 0) {
                    recordedChunksRef.current.push(e.data);
                }
            };

            recorder.onstop = () => {
                addEvent("SUCCESS", "Video proof segments finalized with multi-user audio.");
                audioCtx.close();
            };

            recorder.start(1000); // Collect chunks every second for safety
            mediaRecorderRef.current = recorder;
            setIsRecording(true);
            setRecStartTime(Date.now());
            addEvent("PROCESS", "Multi-party recording initiated...");
            showToast("Recording all participants' audio.", "info");
        } else {
            if (mediaRecorderRef.current) mediaRecorderRef.current.stop();
            setIsRecording(false);
            addEvent("SUCCESS", "Recording finalized.");
        }
    };

    const finalizeMeeting = async () => {
        if (!signer || !isHost) return;

        // Ensure recording is stopped if active
        if (isRecording) {
            if (mediaRecorderRef.current) {
                mediaRecorderRef.current.stop();
            }
            setIsRecording(false);
            addEvent("PROCESS", "Finalizing active recording before seal...");
            // Small delay to ensure ondataavailable fires
            await new Promise(r => setTimeout(r, 500));
        }

        setFinalizing(true);
        try {
            addEvent("PROCESS", "Requesting cryptographic signature for encryption key...");
            const msg = getSessionSignatureMessage(roomId);
            const signature = await signer.signMessage(msg);

            addEvent("PROCESS", "Encrypting protocol metadata & video stream with AES-GCM-256...");

            // Prepare the proof blob (Metadata & Session Info)
            let blobToEncrypt;
            if (recordedChunksRef.current.length > 0) {
                blobToEncrypt = new Blob(recordedChunksRef.current, { type: 'video/webm' });
            } else {
                const proofData = {
                    title: meetingTitle,
                    roomId: roomId,
                    sessionCode: huddleId,
                    participants: events.filter(e => e.type === 'LEDGER').map(e => e.msg),
                    timestamp: Date.now(),
                    protocol: "SYNOX v1 (P2P Mesh)"
                };
                blobToEncrypt = new Blob([JSON.stringify(proofData)], { type: 'application/json' });
            }

            const arrayBuffer = await blobToEncrypt.arrayBuffer();
            const { encrypted } = await encryptFile(new Uint8Array(arrayBuffer), signature);

            addEvent("PROCESS", "Uploading encrypted payload to IPFS (via Pinata)...");
            const _cid = await uploadToIPFS(encrypted);
            console.log("🔍 Final CID Generated:", _cid);
            setCid(_cid);

            addEvent("BLOCKCHAIN", "Committing cryptographic proof to Ethereum ledger...");
            const contract = new ethers.Contract(SYNOX_ADDRESS, SYNOX_ABI, signer);
            const tx = await contract.finalizeMeeting(roomId, _cid);

            addEvent("BLOCKCHAIN", `TX Mining: ${tx.hash.slice(0, 10)}...`);
            setFinalTxHash(tx.hash);
            await tx.wait();

            addEvent("SUCCESS", "Session SEALED. NFTs distributed to participants.");
            setShowSuccessModal(true);
        } catch (e) {
            console.error("❌ Protocol finalization error:", e);
            addEvent("ERROR", e.message);
            showToast("Protocol Violation: " + e.message, "error");
        }
        setFinalizing(false);
    };

    const fetchHistory = async () => {
        if (!provider || !roomId) return;
        try {
            const contract = new ethers.Contract(SYNOX_ADDRESS, SYNOX_ABI, provider);
            // Fetch past UserJoined events for this specific meeting
            const filter = contract.filters.UserJoined(roomId);
            const logs = await contract.queryFilter(filter);

            const history = logs.map(log => ({
                id: log.blockNumber + log.transactionHash,
                type: "LEDGER",
                msg: `Verified Participant: ${log.args[1].slice(0, 6)}...${log.args[1].slice(-4)} joined the session.`,
                time: "ON-CHAIN RECORD"
            }));

            setEvents(prev => [...history, ...prev]);
        } catch (e) {
            console.warn("Failed to fetch event history:", e);
        }
    };

    useEffect(() => {
        if (hasJoined) {
            fetchHistory();
        }
    }, [hasJoined, roomId]);

    if (!hasJoined) {
        return (
            <div className="min-h-screen bg-black flex items-center justify-center p-6 pt-24">
                <div className="max-w-6xl w-full grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
                    {/* Video Preview */}
                    <div className="space-y-6">
                        <div className="relative glass rounded-3xl overflow-hidden aspect-video border border-white/10 shadow-2xl">
                            <video
                                ref={localVideoRef}
                                autoPlay
                                muted
                                className={`w-full h-full object-cover transform scale-x-[-1] ${!isVideoOn ? 'hidden' : ''}`}
                            />
                            {!isVideoOn && (
                                <div className="absolute inset-0 flex flex-col items-center justify-center bg-zinc-900">
                                    <img
                                        src={`https://api.dicebear.com/7.x/avataaars/svg?seed=${account}`}
                                        alt="Lobby Avatar"
                                        className="w-32 h-32 rounded-full border-4 border-white/5 shadow-2xl mb-4"
                                    />
                                    <p className="text-zinc-500 font-mono text-[10px] uppercase tracking-widest">Camera is off (Privacy Shield Active)</p>
                                </div>
                            )}
                            <div className="absolute bottom-6 left-1/2 -translate-x-1/2 flex gap-4">
                                <button
                                    onClick={() => {
                                        setIsAudioOn(!isAudioOn);
                                        if (localStream) localStream.getAudioTracks()[0].enabled = !isAudioOn;
                                    }}
                                    className={`p-4 rounded-2xl transition-all ${isAudioOn ? 'bg-white/10 text-white border border-white/20' : 'bg-red-500/20 text-red-500 border border-red-500/40'}`}
                                >
                                    {isAudioOn ? <Mic size={24} /> : <MicOff size={24} />}
                                </button>
                                <button
                                    onClick={() => {
                                        setIsVideoOn(!isVideoOn);
                                        if (localStream) localStream.getVideoTracks()[0].enabled = !isVideoOn;
                                    }}
                                    className={`p-4 rounded-2xl transition-all ${isVideoOn ? 'bg-white/10 text-white border border-white/20' : 'bg-red-500/20 text-red-500 border border-red-500/40'}`}
                                >
                                    {isVideoOn ? <Video size={24} /> : <VideoOff size={24} />}
                                </button>
                            </div>
                        </div>
                    </div>

                    {/* Join Info */}
                    <div className="space-y-8">
                        <div>
                            <span className="text-blue-500 font-black text-[10px] tracking-[0.3em] uppercase mb-2 block">Protocol Authorization</span>
                            <h1 className="text-5xl font-black tracking-tighter mb-4 leading-none uppercase">{meetingTitle}</h1>
                            <p className="text-zinc-500 max-w-md font-light leading-relaxed">
                                Ready to join? You will be registered on the ethereum ledger and eligible for attendance reputation.
                            </p>
                        </div>

                        <div className="space-y-4">
                            <button
                                onClick={handleJoinSession}
                                disabled={lobbyLoading}
                                className="w-full bg-white text-black py-5 rounded-3xl font-black tracking-[0.2em] text-sm hover:bg-zinc-200 transition-all shadow-xl shadow-white/5 flex items-center justify-center gap-3 disabled:opacity-50"
                            >
                                {lobbyLoading ? <Activity className="animate-spin" /> : <ShieldCheck />}
                                {lobbyLoading ? "AUTHORIZING..." : "JOIN SESSION"}
                            </button>
                            <button
                                onClick={() => navigate('/dashboard')}
                                className="w-full bg-zinc-900 text-zinc-400 py-4 rounded-3xl font-bold tracking-widest text-xs hover:bg-zinc-800 transition-all"
                            >
                                CANCEL
                            </button>
                        </div>

                        <div className="p-4 border border-white/5 rounded-2xl bg-white/[0.02]">
                            <p className="text-[9px] font-mono text-zinc-600 uppercase tracking-widest leading-relaxed">
                                SECURE NOTE: BY JOINING, YOU AUTHORIZE THE SYNOX SMART CONTRACT ({SYNOX_ADDRESS.slice(0, 8)}...) TO RECORD YOUR ATTENDANCE.
                            </p>
                        </div>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="h-screen bg-black text-white flex flex-col font-sans overflow-hidden pt-20">
            {/* Header */}
            <header className="h-16 px-6 flex items-center justify-between border-b border-white/5 z-30 glass shadow-2xl">
                <div className="flex items-center gap-4">
                    <div className="w-8 h-8 rounded-lg bg-white flex items-center justify-center">
                        <ShieldCheck className="text-black" size={18} />
                    </div>
                    <div>
                        <h1 className="font-black tracking-tighter text-lg leading-none uppercase">{meetingTitle}</h1>
                        <div className="flex gap-3 mt-1.5 font-mono text-[8px] tracking-widest text-zinc-500 items-center">
                            {isRecording && (
                                <span className="flex items-center gap-1 text-red-500 animate-pulse font-black">
                                    <div className="w-1.5 h-1.5 bg-red-500 rounded-full" /> REC
                                </span>
                            )}
                            <span className="flex items-center gap-1 uppercase bg-white/5 px-2 py-0.5 rounded"><Hash size={10} className="text-white/20" /> CODE: {displayId || "..."}</span>
                            <span className="flex items-center gap-1 uppercase bg-blue-500/10 px-2 py-0.5 rounded text-blue-400"><Hash size={10} className="text-blue-500/30" /> INDEX: {roomId}</span>
                            <span className="flex items-center gap-1 uppercase bg-white/5 px-2 py-0.5 rounded"><Globe size={10} className="text-white/20" /> CID: {cid.slice(0, 10)}...</span>
                        </div>
                    </div>
                </div>

                <div className="flex items-center gap-3">
                    <button
                        onClick={() => setShowSidebar(!showSidebar)}
                        className={`p-2 rounded-lg border transition-all ${showSidebar ? 'bg-white/10 border-white/20' : 'bg-transparent border-white/5 hover:border-white/10'}`}
                    >
                        <Activity size={18} />
                    </button>
                </div>
            </header>

            <div className="flex-1 flex overflow-hidden relative">
                {/* Main Content: Video Grid */}
                <main className={`flex-1 p-4 md:p-6 overflow-y-auto transition-all duration-500 bg-zinc-950`}>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 max-w-7xl mx-auto">
                        {/* Local Peer */}
                        <div className={`relative bg-zinc-900 rounded-3xl overflow-hidden aspect-video border-2 shadow-[0_0_50px_rgba(255,255,255,0.05)] transition-all duration-500 ${isSpeaking ? 'border-blue-500 shadow-[0_0_40px_rgba(59,130,246,0.4)]' : 'border-white/20'}`}>
                            {isVideoOn ? (
                                <video ref={localVideoRef} autoPlay muted className="w-full h-full object-cover transform scale-x-[-1]" />
                            ) : (
                                <div className="w-full h-full flex flex-col items-center justify-center bg-zinc-950">
                                    <img src={`https://api.dicebear.com/7.x/avataaars/svg?seed=${account}`} alt="Me" className="w-24 h-24 rounded-full border-4 border-white/5 shadow-2xl" />
                                </div>
                            )}

                            {raisedHands['me'] && (
                                <div className="absolute top-4 left-4 bg-blue-500 p-2.5 rounded-xl shadow-[0_0_30px_rgba(59,130,246,0.6)] animate-bounce border border-white/20">
                                    <Hand size={18} className="text-white fill-white" />
                                </div>
                            )}

                            <div className="absolute top-4 right-4 animate-pulse">
                                <div className="w-2 h-2 rounded-full bg-red-500 shadow-[0_0_10px_rgba(239,68,68,1)]"></div>
                            </div>
                            <div className="absolute bottom-4 left-4 px-3 md:px-4 py-1.5 md:py-2 rounded-xl glass border-white/10 flex items-center gap-2 md:gap-3">
                                <span className="text-[8px] md:text-[10px] font-black tracking-widest uppercase">YOU {isHost && "(HOST)"}</span>
                                {!isAudioOn && <MicOff size={12} className="text-red-500" />}
                                {isSpeaking && <Volume2 size={12} className="text-blue-500 animate-pulse" />}
                            </div>
                        </div>

                        {/* Remote Peers - Ordered by Active Participant Status */}
                        {peers
                            .map(p => ({ ...p, status: remoteStatus[p.peerID] || {} }))
                            .sort((a, b) => {
                                if (a.status.isSpeaking && !b.status.isSpeaking) return -1;
                                if (!a.status.isSpeaking && b.status.isSpeaking) return 1;
                                if (a.status.isVideoOn && !b.status.isVideoOn) return -1;
                                return 0;
                            })
                            .map((peer) => (
                                <RemoteVideo
                                    key={peer.peerID}
                                    peerId={peer.peerID}
                                    stream={peer.stream}
                                    isHandRaised={raisedHands[peer.peerID]}
                                    isSpeaking={peer.status.isSpeaking}
                                    isVideoOn={peer.status.isVideoOn !== false}
                                />
                            ))
                        }

                        {peers.length === 0 && (
                            <div className="aspect-video rounded-3xl border border-dashed border-white/5 flex flex-col items-center justify-center opacity-30">
                                <Users size={32} className="md:w-12 md:h-12 mb-4" />
                                <p className="text-[10px] font-mono tracking-widest uppercase">Waiting for peers...</p>
                            </div>
                        )}
                    </div>
                </main>

                {/* Sidebar: Event Panel & Voting */}
                {showSidebar && (
                    <div
                        className="lg:hidden fixed inset-0 bg-black/60 backdrop-blur-sm z-30"
                        onClick={() => setShowSidebar(false)}
                    />
                )}
                <aside className={`fixed lg:relative inset-y-0 right-0 w-80 h-full border-l border-white/5 glass transition-all duration-500 transform z-40 ${showSidebar ? 'translate-x-0 opacity-100' : 'translate-x-full opacity-0'}`}>
                    <div className="flex p-4 border-b border-white/5 gap-2">
                        <div className="flex-1 py-2 px-4 rounded-lg text-[10px] font-black tracking-widest bg-white text-black text-center">
                            PROTOCOL LEDGER
                        </div>
                        <button
                            onClick={() => setShowSidebar(false)}
                            className="lg:hidden p-2 text-zinc-500 hover:text-white"
                        >
                            <X size={18} />
                        </button>
                    </div>

                    <div className="p-4 overflow-y-auto h-[calc(100vh-120px)]">
                        <div className="space-y-4">
                            {events.map((e) => (
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

            <footer className="h-24 md:h-20 flex items-center justify-between glass border-t border-white/5 z-20 px-8 py-2">
                <div className="flex items-center gap-4">
                    <button
                        onClick={() => {
                            const audioTrack = localStream.getAudioTracks()[0];
                            if (audioTrack) {
                                audioTrack.enabled = !audioTrack.enabled;
                                setIsAudioOn(audioTrack.enabled);
                                broadcastStatus({ isAudioOn: audioTrack.enabled });
                            }
                        }}
                        className={`p-4 rounded-2xl transition-all ${isAudioOn ? 'bg-zinc-900 border border-white/10' : 'bg-red-500 text-white border border-red-500'}`}
                    >
                        {isAudioOn ? <Mic size={20} /> : <MicOff size={20} />}
                    </button>
                    <button
                        onClick={toggleHand}
                        className={`p-4 rounded-2xl transition-all ${raisedHands['me'] ? 'bg-blue-500 text-white shadow-[0_0_20px_rgba(59,130,246,0.5)]' : 'bg-zinc-900 border border-white/10 text-gray-400'}`}
                    >
                        <Hand size={20} />
                    </button>

                    <button
                        onClick={() => {
                            if (localStream) {
                                const videoTrack = localStream.getVideoTracks()[0];
                                if (videoTrack) {
                                    videoTrack.enabled = !videoTrack.enabled;
                                    setIsVideoOn(videoTrack.enabled);
                                    broadcastStatus({ isVideoOn: videoTrack.enabled });
                                }
                            }
                        }}
                        className={`p-4 rounded-2xl transition-all ${isVideoOn ? 'bg-zinc-900 border border-white/10' : 'bg-red-500 text-white border border-red-500'}`}
                    >
                        {isVideoOn ? <Video size={20} /> : <VideoOff size={20} />}
                    </button>

                    <button
                        onClick={() => {
                            if (socketRef.current) socketRef.current.disconnect();
                            navigate('/dashboard');
                        }}
                        className="ml-4 px-8 py-4 rounded-2xl bg-red-600 text-white font-black text-[10px] tracking-widest hover:bg-red-700 transition-all flex items-center gap-2 shadow-xl shadow-red-500/20"
                    >
                        <PhoneOff size={14} /> <span>LEAVE PROTOCOL ROOM</span>
                    </button>

                    <div className="hidden md:flex items-center gap-2 px-4 py-2 bg-white/5 rounded-xl border border-white/10">
                        <div className="w-2 h-2 rounded-full bg-green-500"></div>
                        <span className="text-[8px] font-black tracking-widest uppercase text-green-500">SYNOX P2P Infrastructure Active</span>
                    </div>
                </div>

                <div className="flex items-center gap-4">
                    <button
                        onClick={toggleRecording}
                        className={`p-3.5 rounded-xl transition-all ${isRecording ? 'bg-red-500 text-white animate-pulse' : 'bg-white/5 text-gray-400 hover:bg-white/10 border border-white/10'}`}
                    >
                        <Activity size={18} />
                    </button>
                    <button
                        onClick={finalizeMeeting}
                        disabled={finalizing || !isHost}
                        className={`bg-white text-black px-8 py-4 rounded-2xl font-black text-[10px] tracking-[0.2em] hover:bg-zinc-200 transition-all disabled:opacity-50 flex items-center gap-3 shadow-xl shadow-white/5 ${finalizing ? 'bg-zinc-800 text-gray-500' : ''}`}
                    >
                        {finalizing ? <Activity className="animate-spin" size={16} /> : <ShieldCheck size={16} />}
                        <span>{finalizing ? "FINALIZING..." : "FINALIZE SESSION"}</span>
                    </button>
                </div>
            </footer>

            {/* Success Modal */}
            {showSuccessModal && (
                <div className="fixed inset-0 z-[200] bg-black/80 backdrop-blur-2xl flex items-center justify-center p-6">
                    <div className="max-w-md w-full glass p-8 rounded-[2.5rem] border border-white/10 shadow-2xl text-center relative overflow-hidden group">
                        <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-blue-500 to-transparent"></div>

                        <div className="w-20 h-20 bg-green-500/20 rounded-full flex items-center justify-center mx-auto mb-6 border border-green-500/30">
                            <Trophy className="text-green-500" size={32} />
                        </div>

                        <h2 className="text-3xl font-black tracking-tighter uppercase mb-4">Protocol Finalized</h2>
                        <p className="text-zinc-500 text-sm font-light leading-relaxed mb-8 px-4">
                            The meeting has been cryptographically sealed and your attendance reputation has been registered on the ethereum ledger.
                        </p>

                        <div className="bg-white/5 border border-white/10 rounded-2xl p-4 mb-8 text-left">
                            <span className="text-[8px] font-black text-blue-500 tracking-[0.2em] uppercase block mb-1">Archived Hash (CID)</span>
                            <p className="text-[10px] font-mono text-zinc-400 break-all">{cid}</p>
                        </div>

                        <div className="flex flex-col gap-3">
                            <button
                                onClick={() => navigate('/reputation')}
                                className="w-full bg-white text-black py-4 rounded-2xl font-black tracking-widest text-xs hover:bg-zinc-200 transition-all flex items-center justify-center gap-2"
                            >
                                <Trophy size={16} /> VIEW REPUTATION
                            </button>
                            <a
                                href={`https://sepolia.etherscan.io/tx/${finalTxHash}`}
                                target="_blank"
                                rel="noreferrer"
                                className="w-full bg-blue-600 text-white py-4 rounded-2xl font-black tracking-widest text-xs hover:bg-blue-700 transition-all flex items-center justify-center gap-2 shadow-lg shadow-blue-500/20"
                            >
                                <ExternalLink size={16} /> VIEW ON ETHERSCAN
                            </a>
                            <button
                                onClick={() => navigate('/dashboard')}
                                className="w-full bg-zinc-900 border border-white/5 text-zinc-500 py-4 rounded-2xl font-black tracking-widest text-xs hover:border-white/10 transition-all"
                            >
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
