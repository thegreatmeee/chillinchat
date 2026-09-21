const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// Serve static files from the "public" directory
app.use(express.static(path.join(__dirname, 'public')));

// In-memory state
const waitingQueue = [];
const userPartners = {}; // Maps socket.id -> partnerSocket.id

io.on('connection', (socket) => {
    console.log(`User connected: ${socket.id}`);

    // User wants to find a match
    socket.on('find_match', () => {
        // Prevent duplicate queueing or matching if already in a chat
        if (userPartners[socket.id] || waitingQueue.includes(socket.id)) {
            return;
        }

        waitingQueue.push(socket.id);
        io.to(socket.id).emit('waiting');

        // If there are at least 2 users in the queue, pair them
        if (waitingQueue.length >= 2) {
            const user1 = waitingQueue.shift();
            const user2 = waitingQueue.shift();

            // Link them as partners
            userPartners[user1] = user2;
            userPartners[user2] = user1;

            // Notify both users that a match has been found
            io.to(user1).emit('match_found');
            io.to(user2).emit('match_found');
            
            console.log(`Matched: ${user1} <-> ${user2}`);
        }
    });

    // Handle sending a message
    socket.on('send_message', (data) => {
        const partnerId = userPartners[socket.id];
        if (partnerId) {
            io.to(partnerId).emit('receive_message', {
                text: data.text,
                timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
            });
        }
    });

    // User manually leaves the chat
    socket.on('leave_chat', () => {
        handleDisconnect(socket.id);
    });

    // User disconnects (closes tab, loses connection)
    socket.on('disconnect', () => {
        console.log(`User disconnected: ${socket.id}`);
        handleDisconnect(socket.id);
    });

    // Helper to clean up partnerships and notify the other user
    function handleDisconnect(socketId) {
        const partnerId = userPartners[socketId];
        
        if (partnerId) {
            // Notify the partner that the user left
            io.to(partnerId).emit('partner_disconnected');
            // Remove the partnership link for both
            delete userPartners[partnerId];
            delete userPartners[socketId];
        }

        // Remove user from waiting queue if they were still waiting
        const queueIndex = waitingQueue.indexOf(socketId);
        if (queueIndex !== -1) {
            waitingQueue.splice(queueIndex, 1);
        }
    }
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});
