const express = require('express');
const http = require('http');
const path = require('path');
const { Server } = require('socket.io');
const db = require('./db');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

const PORT = process.env.PORT || 3000;

app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());

// In-memory Room State
const rooms = new Map();

function getRoomsPayload() {
  return Array.from(rooms.values()).map(r => ({
    ...r,
    participantCount: r.participants ? r.participants.length : 0,
    rsvpCount: r.rsvpUsers ? r.rsvpUsers.length : 0
  }));
}

// API endpoint to get rooms list
app.get('/api/rooms', (req, res) => {
  const roomList = getRoomsPayload();
  res.json({
    rooms: roomList,
    totalOnline: io.engine.clientsCount || 1
  });
});

// Socket.io Real-time Signaling & Room Management
io.on('connection', (socket) => {
  let currentRoomId = null;
  let currentUser = null;

  // Emit real online count to all clients
  io.emit('stats:online', { onlineCount: io.engine.clientsCount });

  // Send initial room list on connection
  socket.emit('rooms:updated', getRoomsPayload());

  // Handle Room Creation (Immediate or Pre-Scheduled)
  socket.on('room:create', async (roomData, callback) => {
    try {
      const roomId = 'room-' + Date.now().toString(36) + '-' + Math.random().toString(36).substr(2, 4);
      const isScheduled = Boolean(roomData.isScheduled);
      const scheduledFor = roomData.scheduledFor ? Number(roomData.scheduledFor) : (isScheduled ? Date.now() + 1000 * 60 * 15 : null);

      const newRoom = {
        id: roomId,
        title: roomData.title || 'Conversation Room',
        language: roomData.language || 'English',
        flag: roomData.flag || '🌐',
        level: roomData.level || 'Any Level',
        levelCode: roomData.levelCode || 'any',
        topic: roomData.topic || 'Casual & Lifestyle',
        topicKey: roomData.topicKey || 'casual',
        capacity: parseInt(roomData.capacity, 10) || 6,
        isPrivate: Boolean(roomData.isPrivate),
        password: roomData.password || '',
        createdAt: Date.now(),
        isScheduled,
        scheduledFor,
        rsvpUsers: [],
        host: {
          id: socket.id,
          name: roomData.creatorName || 'Anonymous',
          avatar: roomData.creatorAvatar || '🦊',
          native: roomData.creatorNative || 'English'
        },
        participants: [],
        messages: [
          {
            id: 'sys-start',
            sender: 'System',
            avatar: '⚡',
            text: isScheduled
              ? `Room scheduled for ${new Date(scheduledFor).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}. Participants can RSVP now!`
              : `Welcome to "${roomData.title}"! Practice speaking, share tips, and have fun.`,
            time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            isSystem: true
          }
        ],
        vocabList: []
      };

      rooms.set(roomId, newRoom);
      await db.saveRoom(newRoom);
      io.emit('rooms:updated', getRoomsPayload());

      if (callback) callback({ success: true, roomId, room: newRoom });
    } catch (err) {
      if (callback) callback({ success: false, error: err.message });
    }
  });

  // Handle RSVP for scheduled rooms
  socket.on('room:rsvp', async ({ roomId, user }, callback) => {
    try {
      const room = rooms.get(roomId);
      if (!room) {
        return callback && callback({ success: false, error: 'Room not found' });
      }
      const result = await db.toggleRSVP(roomId, user || { name: 'Learner', avatar: '🦊' });
      room.rsvpUsers = result.rsvps;
      await db.saveRoom(room);
      io.emit('rooms:updated', getRoomsPayload());
      if (callback) callback({ success: true, rsvps: result.rsvps, userRSVPed: result.userRSVPed });
    } catch (err) {
      if (callback) callback({ success: false, error: err.message });
    }
  });

  // Handle Host starting scheduled room early
  socket.on('room:start_early', async ({ roomId }, callback) => {
    try {
      const room = rooms.get(roomId);
      if (room && room.isScheduled) {
        room.isScheduled = false;
        await db.saveRoom(room);
        io.emit('rooms:updated', getRoomsPayload());
        io.emit('room:live_started', {
          roomId: room.id,
          title: room.title,
          flag: room.flag,
          host: room.host,
          rsvpUsers: room.rsvpUsers || []
        });
        if (callback) callback({ success: true, room });
      }
    } catch (err) {
      if (callback) callback({ success: false, error: err.message });
    }
  });

  // Handle Join Room
  socket.on('room:join', async ({ roomId, user, password }, callback) => {
    const room = rooms.get(roomId);
    if (!room) {
      return callback && callback({ success: false, error: 'Room does not exist' });
    }

    // Check if room is scheduled for the future
    if (room.isScheduled && room.scheduledFor && Date.now() < room.scheduledFor) {
      const isHost = (user && user.name === room.host.name) || room.host.id === socket.id;
      if (!isHost) {
        return callback && callback({
          success: false,
          isScheduled: true,
          scheduledFor: room.scheduledFor,
          error: `This room is scheduled to open at ${new Date(room.scheduledFor).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}. Please RSVP to get notified when it starts!`
        });
      } else {
        // Host arrived early: unlock and open to all participants
        room.isScheduled = false;
        await db.saveRoom(room);
        io.emit('rooms:updated', getRoomsPayload());
        io.emit('room:live_started', {
          roomId: room.id,
          title: room.title,
          flag: room.flag,
          host: room.host,
          rsvpUsers: room.rsvpUsers || []
        });
      }
    }

    if (room.isPrivate && room.password && room.password !== password) {
      return callback && callback({ success: false, error: 'Incorrect room password' });
    }

    if (room.participants.length >= room.capacity) {
      return callback && callback({ success: false, error: 'Room is full' });
    }

    // Leave any existing room
    if (currentRoomId) {
      leaveCurrentRoom();
    }

    currentRoomId = roomId;
    currentUser = {
      id: socket.id,
      name: user.name || 'Learner',
      avatar: user.avatar || '🦊',
      photoUrl: user.photoUrl || null,
      native: user.native || 'English',
      isHost: room.participants.length === 0 || room.host.id === socket.id,
      isMuted: false,
      isVideoOn: false,
      isSpeaking: false,
      joinedAt: Date.now()
    };

    room.participants.push(currentUser);
    socket.join(roomId);
    await db.saveRoom(room);

    // Announce to others in room
    socket.to(roomId).emit('peer:joined', {
      peer: currentUser,
      message: `${currentUser.name} joined the room`
    });

    // Notify caller with room details and existing peers
    if (callback) {
      callback({
        success: true,
        room: room,
        existingPeers: room.participants.filter(p => p.id !== socket.id)
      });
    }

    // Broadcast updated lobby
    io.emit('rooms:updated', Array.from(rooms.values()).map(r => ({
      ...r,
      participantCount: r.participants.length
    })));
  });

  // WebRTC Signaling: Offer
  socket.on('signal:offer', ({ to, offer }) => {
    io.to(to).emit('signal:offer', {
      from: socket.id,
      offer
    });
  });

  // WebRTC Signaling: Answer
  socket.on('signal:answer', ({ to, answer }) => {
    io.to(to).emit('signal:answer', {
      from: socket.id,
      answer
    });
  });

  // WebRTC Signaling: ICE Candidate
  socket.on('signal:ice-candidate', ({ to, candidate }) => {
    io.to(to).emit('signal:ice-candidate', {
      from: socket.id,
      candidate
    });
  });

  // Participant Media State (Mute, Video, Speaking)
  socket.on('peer:state-change', (updates) => {
    if (!currentRoomId) return;
    const room = rooms.get(currentRoomId);
    if (!room) return;

    const p = room.participants.find(x => x.id === socket.id);
    if (p) {
      Object.assign(p, updates);
      socket.to(currentRoomId).emit('peer:state-changed', {
        peerId: socket.id,
        updates
      });
    }
  });

  // In-Room Chat Message
  socket.on('chat:send', (data) => {
    if (!currentRoomId) return;
    const room = rooms.get(currentRoomId);
    if (!room) return;

    const newMsg = {
      id: 'msg-' + Date.now().toString(36) + Math.random().toString(36).substr(2, 4),
      senderId: socket.id,
      sender: data.sender || 'Learner',
      avatar: data.avatar || '🦊',
      text: data.text,
      correction: data.correction || null, // e.g. { original: '...', better: '...', explanation: '...' }
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      isHost: currentUser ? currentUser.isHost : false
    };

    room.messages.push(newMsg);
    // Keep max 100 messages in memory
    if (room.messages.length > 100) room.messages.shift();

    io.to(currentRoomId).emit('chat:received', newMsg);
  });

  // Floating Reaction Emojis
  socket.on('chat:reaction', (reaction) => {
    if (!currentRoomId) return;
    io.to(currentRoomId).emit('chat:reaction-broadcast', {
      senderId: socket.id,
      senderName: currentUser ? currentUser.name : 'Learner',
      emoji: reaction.emoji || '👏',
      x: reaction.x || 50,
      y: reaction.y || 80
    });
  });

  // Collaborative Whiteboard: Draw Stroke
  socket.on('whiteboard:draw', (strokeData) => {
    if (!currentRoomId) return;
    socket.to(currentRoomId).emit('whiteboard:draw-remote', strokeData);
  });

  // Collaborative Whiteboard: Clear
  socket.on('whiteboard:clear', () => {
    if (!currentRoomId) return;
    io.to(currentRoomId).emit('whiteboard:clear-remote');
  });

  // Shared Vocabulary Card Added
  socket.on('vocab:add', (vocabItem) => {
    if (!currentRoomId) return;
    const room = rooms.get(currentRoomId);
    if (!room) return;

    const item = {
      id: 'voc-' + Date.now().toString(36),
      term: vocabItem.term,
      phonetic: vocabItem.phonetic || '',
      def: vocabItem.def,
      example: vocabItem.example || '',
      addedBy: currentUser ? currentUser.name : 'Member'
    };

    if (!room.vocabList) room.vocabList = [];
    room.vocabList.push(item);

    io.to(currentRoomId).emit('vocab:added', item);
  });

  // Live Multi-User Speech Segment Broadcasting
  socket.on('coach:speech-segment', (data) => {
    if (!currentRoomId) return;
    const speaker = currentUser ? {
      id: socket.id,
      name: currentUser.name,
      avatar: currentUser.avatar,
      photoUrl: currentUser.photoUrl || null,
      native: currentUser.native
    } : { name: 'Learner', avatar: '🦊' };

    socket.to(currentRoomId).emit('coach:speech-segment-remote', {
      speaker,
      text: data.text,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    });
  });

  // Speaking Timer Event
  socket.on('timer:update', (timerData) => {
    if (!currentRoomId) return;
    io.to(currentRoomId).emit('timer:synced', timerData);
  });

  // Host Controls: Kick Peer
  socket.on('host:kick', (targetPeerId) => {
    if (!currentRoomId || !currentUser || !currentUser.isHost) return;
    io.to(targetPeerId).emit('host:you-were-kicked', { reason: 'Removed by room host' });
  });

  // Host Controls: Mute Peer
  socket.on('host:mute', (targetPeerId) => {
    if (!currentRoomId || !currentUser || !currentUser.isHost) return;
    io.to(targetPeerId).emit('host:you-were-muted');
  });

  // Leave Room
  socket.on('room:leave', () => {
    leaveCurrentRoom();
  });

  // Disconnect
  socket.on('disconnect', () => {
    leaveCurrentRoom();
    io.emit('stats:online', { onlineCount: io.engine.clientsCount });
  });

  function leaveCurrentRoom() {
    if (!currentRoomId) return;
    const roomId = currentRoomId;
    const room = rooms.get(roomId);

    if (room) {
      room.participants = room.participants.filter(p => p.id !== socket.id);
      socket.leave(roomId);

      // If user was host, assign next non-bot or any participant as host
      if (currentUser && currentUser.isHost && room.participants.length > 0) {
        room.participants[0].isHost = true;
        room.host = {
          id: room.participants[0].id,
          name: room.participants[0].name,
          avatar: room.participants[0].avatar,
          native: room.participants[0].native
        };
        io.to(roomId).emit('room:new-host', room.participants[0]);
      }

      // Notify remaining peers
      socket.to(roomId).emit('peer:left', {
        peerId: socket.id,
        name: currentUser ? currentUser.name : 'A participant'
      });

      // Clean up dynamic user-created rooms if empty (scheduled rooms remain active until their time)
      if (room.participants.length === 0 && !room.isScheduled) {
        rooms.delete(roomId);
        db.deleteRoom(roomId);
      } else {
        db.saveRoom(room);
      }

      // Update lobby count
      io.emit('rooms:updated', getRoomsPayload());
    }

    currentRoomId = null;
    currentUser = null;
  }
});

async function startServer() {
  await db.initDB();
  const dbRooms = await db.loadRooms();
  if (dbRooms && dbRooms.length > 0) {
    dbRooms.forEach(r => rooms.set(r.id, r));
    console.log(`[DB] Loaded ${dbRooms.length} rooms from database.`);
  } else {
    console.log(`[DB] No existing rooms in database. Ready for live user rooms.`);
  }

  // Periodic scheduler check for upcoming scheduled rooms
  setInterval(async () => {
    const now = Date.now();
    let updated = false;
    for (const [id, room] of rooms.entries()) {
      if (room.isScheduled && room.scheduledFor && now >= room.scheduledFor) {
        console.log(`[Scheduler] Room "${room.title}" reached scheduled time! Transitioning to LIVE.`);
        room.isScheduled = false;
        await db.saveRoom(room);
        updated = true;
        io.emit('room:live_started', {
          roomId: room.id,
          title: room.title,
          flag: room.flag,
          host: room.host,
          rsvpUsers: room.rsvpUsers || []
        });
      }
    }
    if (updated) {
      io.emit('rooms:updated', getRoomsPayload());
    }
  }, 4000);

  server.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 RootMe Talk server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
