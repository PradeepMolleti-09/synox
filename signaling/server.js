const express = require('express');
const http = require('http');
const app = express();
const server = http.createServer(app);
const io = require('socket.io')(server, {
    cors: { origin: "*", methods: ["GET", "POST"] }
});

const rooms = {}; // roomId -> [socketId]

app.get('/health', (req, res) => res.json({ status: 'ok', rooms: Object.keys(rooms).length }));

io.on('connection', (socket) => {
    console.log('[+] Connected:', socket.id);

    socket.on('join-room', (roomId) => {
        if (!rooms[roomId]) rooms[roomId] = [];

        const existing = rooms[roomId].filter(id => id !== socket.id);

        // Tell the new joiner about ALL existing peers
        if (existing.length > 0) {
            socket.emit('all-users', existing);
        }

        // Tell ALL existing peers about the new joiner
        existing.forEach(userId => {
            io.to(userId).emit('user-joined', socket.id);
        });

        rooms[roomId].push(socket.id);
        // Store which room this socket is in for cleanup
        socket._roomId = roomId;

        console.log(`[Room ${roomId}] ${rooms[roomId].length} user(s)`);
    });

    // ── WebRTC Signaling ──────────────────────────────────────────────────────
    socket.on('offer', (payload) => {
        // payload: { target, callerID, signal }
        io.to(payload.target).emit('offer', payload);
    });

    socket.on('answer', (payload) => {
        // payload: { signal, target, id }
        io.to(payload.target).emit('answer', payload);
    });

    socket.on('ice-candidate', (payload) => {
        // payload: { target, candidate }
        io.to(payload.target).emit('ice-candidate', {
            from: socket.id,
            candidate: payload.candidate
        });
    });

    // ── Status Broadcast (mic/cam/speaking/hand) ──────────────────────────────
    socket.on('broadcast-status', (payload) => {
        // payload: { roomId, payload: {...}, type? }
        const roomId = payload.roomId || socket._roomId;
        if (!roomId || !rooms[roomId]) return;
        rooms[roomId].forEach(userId => {
            if (userId !== socket.id) {
                io.to(userId).emit('peer-status', {
                    from: socket.id,
                    payload: payload.payload,
                    type: payload.type
                });
            }
        });
    });

    // ── Disconnect ────────────────────────────────────────────────────────────
    socket.on('disconnect', () => {
        console.log('[-] Disconnected:', socket.id);
        Object.keys(rooms).forEach(roomId => {
            const idx = rooms[roomId].indexOf(socket.id);
            if (idx !== -1) {
                rooms[roomId].splice(idx, 1);
                // Notify remaining users
                rooms[roomId].forEach(userId => {
                    io.to(userId).emit('user-left', socket.id);
                });
                if (rooms[roomId].length === 0) delete rooms[roomId];
            }
        });
    });
});

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => console.log(`Signaling server on port ${PORT}`));
