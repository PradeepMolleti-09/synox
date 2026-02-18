const express = require('express');
const http = require('http');
const app = express();
const server = http.createServer(app);
const io = require('socket.io')(server, {
    cors: { origin: "*", methods: ["GET", "POST"] },
    // Keep connections alive — prevents ghost peers from Render spin-down
    pingTimeout: 60000,
    pingInterval: 25000,
});

// roomId -> Set of socketIds (Set prevents duplicates automatically)
const rooms = {};

app.get('/health', (req, res) => res.json({
    status: 'ok',
    rooms: Object.keys(rooms).length,
    roomDetails: Object.fromEntries(
        Object.entries(rooms).map(([k, v]) => [k, [...v]])
    )
}));

io.on('connection', (socket) => {
    console.log('[+] Connected:', socket.id);

    socket.on('join-room', (roomId) => {
        // Initialize room as a Set (no duplicates possible)
        if (!rooms[roomId]) rooms[roomId] = new Set();

        // If this socket is already in the room, skip (handles reconnect race)
        if (rooms[roomId].has(socket.id)) {
            console.log(`[Room ${roomId}] Socket ${socket.id} already in room, skipping`);
            return;
        }

        // Get existing users BEFORE adding the new one
        const existing = [...rooms[roomId]];

        // Tell the new joiner about ALL existing peers
        if (existing.length > 0) {
            socket.emit('all-users', existing);
            console.log(`[Room ${roomId}] Sent ${existing.length} existing user(s) to ${socket.id}`);
        }

        // Tell ALL existing peers about the new joiner
        existing.forEach(userId => {
            io.to(userId).emit('user-joined', socket.id);
        });

        // Now add the new socket
        rooms[roomId].add(socket.id);
        socket._roomId = roomId;

        console.log(`[Room ${roomId}] ${rooms[roomId].size} user(s): [${[...rooms[roomId]].join(', ')}]`);
    });

    // ── WebRTC Signaling ──────────────────────────────────────────────────────
    socket.on('offer', (payload) => {
        io.to(payload.target).emit('offer', payload);
    });

    socket.on('answer', (payload) => {
        io.to(payload.target).emit('answer', payload);
    });

    socket.on('ice-candidate', (payload) => {
        io.to(payload.target).emit('ice-candidate', {
            from: socket.id,
            candidate: payload.candidate
        });
    });

    // ── Status Broadcast (mic/cam/speaking/hand) ──────────────────────────────
    socket.on('broadcast-status', (payload) => {
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
    socket.on('disconnect', (reason) => {
        console.log(`[-] Disconnected: ${socket.id} (${reason})`);
        Object.keys(rooms).forEach(roomId => {
            if (rooms[roomId].has(socket.id)) {
                rooms[roomId].delete(socket.id);
                // Notify remaining users
                rooms[roomId].forEach(userId => {
                    io.to(userId).emit('user-left', socket.id);
                });
                if (rooms[roomId].size === 0) delete rooms[roomId];
                console.log(`[Room ${roomId}] Now has ${rooms[roomId]?.size ?? 0} user(s)`);
            }
        });
    });
});

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => console.log(`Signaling server on port ${PORT}`));
