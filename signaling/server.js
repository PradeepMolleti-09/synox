const express = require('express');
const http = require('http');
const app = express();
const server = http.createServer(app);
const io = require('socket.io')(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

const rooms = {}; // roomId -> [socketId, ...]

app.get('/health', (req, res) => res.json({ status: 'ok' }));

io.on('connection', (socket) => {
    console.log('User Connected:', socket.id);

    socket.on('join-room', (roomId) => {
        if (!rooms[roomId]) {
            rooms[roomId] = [];
        }

        // Send the list of ALL existing users in the room to the new joiner
        const existingUsers = rooms[roomId].filter(id => id !== socket.id);
        if (existingUsers.length > 0) {
            // Tell the new user about ALL existing peers
            socket.emit('all-users', existingUsers);
        }

        // Tell ALL existing users that a new user joined
        existingUsers.forEach(userId => {
            socket.to(userId).emit('user-joined', socket.id);
        });

        // Add the new user to the room
        rooms[roomId].push(socket.id);

        console.log(`Room ${roomId} now has ${rooms[roomId].length} users`);
    });

    socket.on('offer', (payload) => {
        io.to(payload.target).emit('offer', payload);
    });

    socket.on('answer', (payload) => {
        io.to(payload.target).emit('answer', payload);
    });

    socket.on('ice-candidate', (incoming) => {
        io.to(incoming.target).emit('ice-candidate', incoming.candidate);
    });

    // Relay arbitrary data between peers (for status/hand raise)
    socket.on('relay-data', (payload) => {
        io.to(payload.target).emit('relay-data', { from: socket.id, data: payload.data });
    });

    socket.on('disconnect', () => {
        // Remove user from all rooms and notify others
        Object.keys(rooms).forEach(roomId => {
            const idx = rooms[roomId].indexOf(socket.id);
            if (idx !== -1) {
                rooms[roomId].splice(idx, 1);
                // Notify remaining users
                rooms[roomId].forEach(userId => {
                    socket.to(userId).emit('user-left', socket.id);
                });
                if (rooms[roomId].length === 0) {
                    delete rooms[roomId];
                }
            }
        });
        console.log('User Disconnected:', socket.id);
    });
});

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => console.log(`Signaling server running on port ${PORT}`));
