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

// roomId -> { host: socketId, users: Set, pending: Set }
const rooms = {};

// Map of roomId to unique short meeting ID (like abc-defg-hij)
const meetingIds = {};
const meetingIdToRoomId = {};

function generateMeetingId() {
    const part = () => Math.random().toString(36).substring(2, 6);
    return `${part()}-${part()}-${part()}`;
}

app.get('/health', (req, res) => res.json({
    status: 'ok',
    rooms: Object.keys(rooms).length,
    roomDetails: Object.fromEntries(
        Object.entries(rooms).map(([k, v]) => [k, [...v]])
    )
}));

io.on('connection', (socket) => {
    console.log('[+] Connected:', socket.id);

    socket.on('join-room', ({ roomId, isHost, name }) => {
        if (!rooms[roomId]) {
            rooms[roomId] = {
                host: isHost ? socket.id : null,
                users: new Set(),
                pending: new Set(),
                meetingId: generateMeetingId(),
                names: {}
            };
            meetingIds[roomId] = rooms[roomId].meetingId;
            meetingIdToRoomId[rooms[roomId].meetingId] = roomId;
        }

        const room = rooms[roomId];
        room.names[socket.id] = name || 'Anonymous';

        if (isHost) {
            room.host = socket.id;
            console.log(`[Host Joined] ${socket.id} is now boss of ${roomId} (${room.meetingId})`);
        }

        // Host never needs permission
        if (isHost || room.host === socket.id) {
            room.users.add(socket.id);
            socket._roomId = roomId;
            socket.emit('meeting-info', { meetingId: room.meetingId, isHost: true });

            // Sync existing users
            const existing = [...room.users].filter(id => id !== socket.id);
            if (existing.length > 0) {
                socket.emit('all-users', existing.map(id => ({ id, name: room.names[id] })));
            }
            return;
        }

        // Regular users must wait for permission
        room.pending.add(socket.id);
        socket._roomId = roomId;
        socket.emit('waiting-for-permission', { meetingId: room.meetingId });

        if (room.host) {
            io.to(room.host).emit('permission-requested', {
                peerId: socket.id,
                name: room.names[socket.id]
            });
        }
    });

    socket.on('give-permission', ({ peerId, roomId, approved }) => {
        const room = rooms[roomId];
        if (!room || room.host !== socket.id) return;

        if (approved && room.pending.has(peerId)) {
            room.pending.delete(peerId);
            room.users.add(peerId);

            io.to(peerId).emit('permission-granted');

            // Notify joiner about ALL existing users
            const existing = [...room.users].filter(id => id !== peerId);
            if (existing.length > 0) {
                io.to(peerId).emit('all-users', existing.map(id => ({ id, name: room.names[id] })));
            }

            // Notify ALL existing users about the JOINER
            existing.forEach(userId => {
                io.to(userId).emit('user-joined', { id: peerId, name: room.names[peerId] });
            });
        } else {
            room.pending.delete(peerId);
            io.to(peerId).emit('permission-denied');
        }
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
        rooms[roomId].users.forEach(userId => {
            if (userId !== socket.id) {
                io.to(userId).emit('peer-status', {
                    from: socket.id,
                    payload: payload.payload,
                    type: payload.type
                });
            }
        });
    });

    socket.on('end-meeting', (payload) => {
        const roomId = payload.roomId || socket._roomId;
        if (!roomId || !rooms[roomId]) return;
        rooms[roomId].users.forEach(userId => {
            if (userId !== socket.id) {
                io.to(userId).emit('meeting-ended');
            }
        });
    });

    // ── Disconnect ────────────────────────────────────────────────────────────
    socket.on('disconnect', (reason) => {
        console.log(`[-] Disconnected: ${socket.id} (${reason})`);
        Object.keys(rooms).forEach(roomId => {
            const room = rooms[roomId];
            if (room.users.has(socket.id) || room.pending.has(socket.id)) {
                room.users.delete(socket.id);
                room.pending.delete(socket.id);
                delete room.names[socket.id];

                if (room.host === socket.id) room.host = null;

                // Notify remaining users
                room.users.forEach(userId => {
                    io.to(userId).emit('user-left', socket.id);
                });
                if (room.users.size === 0 && room.pending.size === 0) {
                    const mid = room.meetingId;
                    delete meetingIdToRoomId[mid];
                    delete meetingIds[roomId];
                    delete rooms[roomId];
                }
                console.log(`[Room ${roomId}] Now has ${rooms[roomId]?.users.size ?? 0} user(s)`);
            }
        });
    });
});

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => console.log(`Signaling server on port ${PORT}`));
