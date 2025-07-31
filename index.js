const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

// Serve static files
app.use(express.static(path.join(__dirname, 'public')));

// Store room information
const rooms = new Map();

io.on('connection', (socket) => {
    console.log('User connected:', socket.id);

    // Join room
    socket.on('join-room', (data) => {
        const { roomId, username } = data;
        
        // Leave previous rooms
        socket.rooms.forEach(room => {
            if (room !== socket.id) {
                socket.leave(room);
            }
        });

        // Join new room
        socket.join(roomId);
        socket.username = username;
        socket.currentRoom = roomId;

        // Initialize room if it doesn't exist
        if (!rooms.has(roomId)) {
            rooms.set(roomId, {
                users: new Set(),
                messages: []
            });
        }

        const room = rooms.get(roomId);
        room.users.add(username);

        // Send existing messages to the user
        socket.emit('previous-messages', room.messages);

        // Notify room about new user
        socket.to(roomId).emit('user-joined', {
            username: username,
            message: `${username} joined the room`,
            timestamp: new Date().toLocaleTimeString()
        });

        // Send updated user list
        io.to(roomId).emit('user-list', Array.from(room.users));

        console.log(`${username} joined room: ${roomId}`);
    });

    // Handle chat messages
    socket.on('chat-message', (data) => {
        const { message, roomId } = data;
        const username = socket.username;

        if (!username || !socket.currentRoom) return;

        const messageData = {
            username: username,
            message: message,
            timestamp: new Date().toLocaleTimeString(),
            id: Date.now()
        };

        // Store message in room
        const room = rooms.get(roomId);
        if (room) {
            room.messages.push(messageData);
            // Keep only last 100 messages
            if (room.messages.length > 100) {
                room.messages.shift();
            }
        }

        // Broadcast message to room
        io.to(roomId).emit('chat-message', messageData);
    });

    // Handle typing indicators
    socket.on('typing', (data) => {
        socket.to(socket.currentRoom).emit('user-typing', {
            username: socket.username,
            isTyping: data.isTyping
        });
    });

    // Handle disconnect
    socket.on('disconnect', () => {
        console.log('User disconnected:', socket.id);
        
        if (socket.username && socket.currentRoom) {
            const room = rooms.get(socket.currentRoom);
            if (room) {
                room.users.delete(socket.username);
                
                // Notify room about user leaving
                socket.to(socket.currentRoom).emit('user-left', {
                    username: socket.username,
                    message: `${socket.username} left the room`,
                    timestamp: new Date().toLocaleTimeString()
                });

                // Send updated user list
                io.to(socket.currentRoom).emit('user-list', Array.from(room.users));

                // Clean up empty rooms
                if (room.users.size === 0) {
                    rooms.delete(socket.currentRoom);
                }
            }
        }
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});