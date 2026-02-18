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

const rooms = {};

io.on('connection', (socket) => {
    console.log('User Connected:', socket.id);

    socket.on('join-room', (roomId) => {
        if (rooms[roomId]) {
            rooms[roomId].push(socket.id);
        } else {
            rooms[roomId] = [socket.id];
        }

        const otherUser = rooms[roomId].find(id => id !== socket.id);
        if (otherUser) {
            socket.emit('other-user', otherUser);
            socket.to(otherUser).emit('user-joined', socket.id);
        }
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

    socket.on('disconnect', () => {
        Object.keys(rooms).forEach(roomId => {
            rooms[roomId] = rooms[roomId].filter(id => id !== socket.id);
        });
        console.log('User Disconnected:', socket.id);
    });
});

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => console.log(`Signaling server running on port ${PORT}`));
