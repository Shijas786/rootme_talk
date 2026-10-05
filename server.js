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

// In-memory Room State & Initial Seed Rooms
const rooms = new Map();

// Helper to seed initial active rooms
function seedInitialRooms() {
  const initialData = [
    {
      id: 'room-eng-casual',
      title: '☕ Cozy Coffee & Travel Talk',
      language: 'English',
      flag: '🇬🇧',
      level: 'Any Level',
      levelCode: 'any',
      topic: 'Casual & Lifestyle',
      topicKey: 'casual',
      capacity: 6,
      isPrivate: false,
      createdAt: Date.now() - 1000 * 60 * 25,
      host: { id: 'bot-1', name: 'Liam (London)', avatar: '👨‍🦰', native: 'English' },
      participants: [
        { id: 'bot-1', name: 'Liam (London)', avatar: '👨‍🦰', native: 'English', isHost: true, isMuted: false, isSpeaking: false, isBot: true },
        { id: 'bot-2', name: 'Sakura (Tokyo)', avatar: '👩‍🦳', native: 'Japanese', isHost: false, isMuted: false, isSpeaking: true, isBot: true },
        { id: 'bot-3', name: 'Carlos (Madrid)', avatar: '🧔', native: 'Spanish', isHost: false, isMuted: true, isSpeaking: false, isBot: true }
      ],
      messages: [
        { id: 'm1', sender: 'Liam (London)', avatar: '👨‍🦰', text: 'Welcome everyone! Today we are discussing our favorite places to travel in autumn.', time: '10:14' },
        { id: 'm2', sender: 'Sakura (Tokyo)', avatar: '👩‍🦳', text: 'Kyoto is so beautiful when maple leaves turn crimson!', time: '10:16' }
      ],
      vocabList: [
        { term: 'Wanderlust', phonetic: '/ˈwɒn.də.lʌst/', def: 'A strong desire to travel.', example: 'Her wanderlust led her across 20 countries.' }
      ]
    },
    {
      id: 'room-ielts-prep',
      title: '🎯 IELTS 7.5+ Speaking Part 2 & 3 Drills',
      language: 'English',
      flag: '🇬🇧',
      level: 'Advanced C1-C2',
      levelCode: 'advanced',
      topic: 'IELTS / TOEFL Exam',
      topicKey: 'exam',
      capacity: 4,
      isPrivate: false,
      createdAt: Date.now() - 1000 * 60 * 45,
      host: { id: 'bot-4', name: 'Dr. Sarah (IELTS Coach)', avatar: '👩‍🏫', native: 'English' },
      participants: [
        { id: 'bot-4', name: 'Dr. Sarah (IELTS Coach)', avatar: '👩‍🏫', native: 'English', isHost: true, isMuted: false, isSpeaking: true, isBot: true },
        { id: 'bot-5', name: 'Jin-Woo (Seoul)', avatar: '👨‍💼', native: 'Korean', isHost: false, isMuted: false, isSpeaking: false, isBot: true }
      ],
      messages: [
        { id: 'm3', sender: 'Dr. Sarah (IELTS Coach)', avatar: '👩‍🏫', text: 'Remember to use idiomatic expressions and cohesive linkers!', time: '10:20' }
      ],
      vocabList: [
        { term: 'Inadvertently', phonetic: '/ˌɪn.ədˈvɜː.tənt.li/', def: 'Without intention; accidentally.', example: 'He inadvertently deleted the file.' }
      ]
    },
    {
      id: 'room-nihongo-anime',
      title: '🏮 初級・中級 日本語会話 & Anime Talk',
      language: 'Japanese',
      flag: '🇯🇵',
      level: 'Intermediate B1-B2',
      levelCode: 'intermediate',
      topic: 'Culture & Entertainment',
      topicKey: 'culture',
      capacity: 6,
      isPrivate: false,
      createdAt: Date.now() - 1000 * 60 * 12,
      host: { id: 'bot-6', name: 'Kenji (Osaka)', avatar: '🧑‍🦱', native: 'Japanese' },
      participants: [
        { id: 'bot-6', name: 'Kenji (Osaka)', avatar: '🧑‍🦱', native: 'Japanese', isHost: true, isMuted: false, isSpeaking: false, isBot: true },
        { id: 'bot-7', name: 'Alex (Berlin)', avatar: '👱‍♂️', native: 'German', isHost: false, isMuted: false, isSpeaking: false, isBot: true },
        { id: 'bot-8', name: 'Mei (Taipei)', avatar: '👩', native: 'Mandarin', isHost: false, isMuted: false, isSpeaking: true, isBot: true }
      ],
      messages: [
        { id: 'm4', sender: 'Kenji (Osaka)', avatar: '🧑‍🦱', text: 'みなさん、こんにちは！何のアニメが好きですか？', time: '10:30' }
      ],
      vocabList: [
        { term: '懐かしい (Natsukashii)', phonetic: '[na-tsu-ka-shi-i]', def: 'Brings back fond memories, nostalgic.', example: 'この音楽はとても懐かしいです。' }
      ]
    },
    {
      id: 'room-espanol-beginners',
      title: '💃 Español para Principiantes (A1-A2)',
      language: 'Spanish',
      flag: '🇪🇸',
      level: 'Beginner A1-A2',
      levelCode: 'beginner',
      topic: 'Casual & Lifestyle',
      topicKey: 'casual',
      capacity: 8,
      isPrivate: false,
      createdAt: Date.now() - 1000 * 60 * 30,
      host: { id: 'bot-9', name: 'Sofia (Bogotá)', avatar: '👩‍🦰', native: 'Spanish' },
      participants: [
        { id: 'bot-9', name: 'Sofia (Bogotá)', avatar: '👩‍🦰', native: 'Spanish', isHost: true, isMuted: false, isSpeaking: true, isBot: true },
        { id: 'bot-10', name: 'David (Chicago)', avatar: '🧔‍♂️', native: 'English', isHost: false, isMuted: false, isSpeaking: false, isBot: true }
      ],
      messages: [
        { id: 'm5', sender: 'Sofia (Bogotá)', avatar: '👩‍🦰', text: '¡Hola a todos! No tengan miedo de cometer errores.', time: '10:05' }
      ],
      vocabList: [
        { term: 'Encantado/a', phonetic: '[en-kan-ta-do]', def: 'Pleased to meet you.', example: '¡Mucho gusto, encantado!' }
      ]
    },
    {
      id: 'room-tech-career',
      title: '💻 Tech Engineers: English for Job Interviews',
      language: 'English',
      flag: '🇬🇧',
      level: 'Intermediate B1-B2',
      levelCode: 'intermediate',
      topic: 'Career & Tech',
      topicKey: 'tech',
      capacity: 5,
      isPrivate: false,
      createdAt: Date.now() - 1000 * 60 * 50,
      host: { id: 'bot-11', name: 'Ravi (Bangalore)', avatar: '👨‍💻', native: 'Hindi' },
      participants: [
        { id: 'bot-11', name: 'Ravi (Bangalore)', avatar: '👨‍💻', native: 'Hindi', isHost: true, isMuted: false, isSpeaking: false, isBot: true },
        { id: 'bot-12', name: 'Guillaume (Paris)', avatar: '👨', native: 'French', isHost: false, isMuted: false, isSpeaking: true, isBot: true },
        { id: 'bot-13', name: 'Priya (Pune)', avatar: '👩‍💻', native: 'Marathi', isHost: false, isMuted: true, isSpeaking: false, isBot: true }
      ],
      messages: [
        { id: 'm6', sender: 'Ravi (Bangalore)', avatar: '👨‍💻', text: 'How do you describe system architecture trade-offs cleanly?', time: '09:55' }
      ],
      vocabList: [
        { term: 'Bottleneck', phonetic: '/ˈbɒt.əl.nek/', def: 'A point of congestion in a system.', example: 'Database queries were our main bottleneck.' }
      ]
    },
    {
      id: 'room-francais-b1',
      title: '🥖 Parlons Français - Culture & Gastronomie',
      language: 'French',
      flag: '🇫🇷',
      level: 'Intermediate B1-B2',
      levelCode: 'intermediate',
      topic: 'Culture & Entertainment',
      topicKey: 'culture',
      capacity: 6,
      isPrivate: false,
      createdAt: Date.now() - 1000 * 60 * 18,
      host: { id: 'bot-14', name: 'Camille (Lyon)', avatar: '👩‍🎨', native: 'French' },
      participants: [
        { id: 'bot-14', name: 'Camille (Lyon)', avatar: '👩‍🎨', native: 'French', isHost: true, isMuted: false, isSpeaking: true, isBot: true },
        { id: 'bot-15', name: 'Marco (Rome)', avatar: '👨‍🦱', native: 'Italian', isHost: false, isMuted: false, isSpeaking: false, isBot: true }
      ],
      messages: [
        { id: 'm7', sender: 'Camille (Lyon)', avatar: '👩‍🎨', text: 'Bienvenue! Quelle est votre spécialité culinaire préférée?', time: '10:22' }
      ],
      vocabList: [
        { term: 'Incontournable', phonetic: '[ɛ̃.kɔ̃.tuʁ.nabl]', def: 'Unmissable, essential.', example: 'La Tour Eiffel est incontournable à Paris.' }
      ]
    },
    {
      id: 'room-german-debate',
      title: '🇩🇪 Deutsch C1/C2 - Philosophie & Zukunft',
      language: 'German',
      flag: '🇩🇪',
      level: 'Advanced C1-C2',
      levelCode: 'advanced',
      topic: 'Philosophy & Debate',
      topicKey: 'debate',
      capacity: 4,
      isPrivate: false,
      createdAt: Date.now() - 1000 * 60 * 65,
      host: { id: 'bot-16', name: 'Lukas (Munich)', avatar: '🧑‍🏫', native: 'German' },
      participants: [
        { id: 'bot-16', name: 'Lukas (Munich)', avatar: '🧑‍🏫', native: 'German', isHost: true, isMuted: false, isSpeaking: true, isBot: true }
      ],
      messages: [
        { id: 'm8', sender: 'Lukas (Munich)', avatar: '🧑‍🏫', text: 'Wie beeinflusst künstliche Intelligenz unsere menschliche Kreativität?', time: '10:00' }
      ],
      vocabList: [
        { term: 'Das Fingerspitzengefühl', phonetic: '[ˈfɪŋɐˌʃpɪt͡sn̩ɡəˌfyːl]', def: 'Tact, finesse, delicate touch.', example: 'Diplomatie erfordert viel Fingerspitzengefühl.' }
      ]
    },
    {
      id: 'room-scheduled-french',
      title: '🥐 French Café Morning - Beginner A1-A2',
      language: 'French',
      flag: '🇫🇷',
      level: 'Beginner A1-A2',
      levelCode: 'beginner',
      topic: 'Casual & Lifestyle',
      topicKey: 'casual',
      capacity: 6,
      isPrivate: false,
      createdAt: Date.now() - 1000 * 60 * 10,
      isScheduled: true,
      scheduledFor: Date.now() + 1000 * 60 * 30,
      rsvpUsers: [
        { name: 'Alex (Berlin)', avatar: '👱‍♂️' },
        { name: 'Sakura (Tokyo)', avatar: '👩‍🦳' },
        { name: 'Carlos (Madrid)', avatar: '🧔' }
      ],
      host: { id: 'bot-17', name: 'Amélie (Paris)', avatar: '👩‍🎨', native: 'French' },
      participants: [],
      messages: [],
      vocabList: []
    },
    {
      id: 'room-scheduled-business-eng',
      title: '💼 Tech Job Interview Prep & Pitching',
      language: 'English',
      flag: '🇬🇧',
      level: 'Advanced C1-C2',
      levelCode: 'advanced',
      topic: 'Career & Tech',
      topicKey: 'tech',
      capacity: 5,
      isPrivate: false,
      createdAt: Date.now() - 1000 * 60 * 5,
      isScheduled: true,
      scheduledFor: Date.now() + 1000 * 60 * 85,
      rsvpUsers: [
        { name: 'Elena', avatar: '👩‍💼' },
        { name: 'Kenji (Osaka)', avatar: '🧑‍🦱' }
      ],
      host: { id: 'bot-18', name: 'David (San Francisco)', avatar: '🧑‍💻', native: 'English' },
      participants: [],
      messages: [],
      vocabList: []
    }
  ];

  initialData.forEach(r => rooms.set(r.id, r));
}

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
    totalOnline: Array.from(rooms.values()).reduce((sum, r) => sum + (r.participants ? r.participants.length : 0), 0) + 14
  });
});

// Socket.io Real-time Signaling & Room Management
io.on('connection', (socket) => {
  let currentRoomId = null;
  let currentUser = null;

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
      if (room.participants.length === 0 && !room.isScheduled && !roomId.startsWith('room-eng-') && !roomId.startsWith('room-ielts') && !roomId.startsWith('room-nihongo') && !roomId.startsWith('room-espanol') && !roomId.startsWith('room-tech') && !roomId.startsWith('room-francais') && !roomId.startsWith('room-german') && !roomId.startsWith('room-scheduled')) {
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

// Periodic bot conversation simulator for seed rooms to make the platform feel 100% alive
setInterval(() => {
  const seedRooms = ['room-eng-casual', 'room-ielts-prep', 'room-nihongo-anime', 'room-espanol-beginners', 'room-tech-career'];
  const randomRoomId = seedRooms[Math.floor(Math.random() * seedRooms.length)];
  const room = rooms.get(randomRoomId);
  if (!room) return;

  const bots = room.participants.filter(p => p.isBot);
  if (bots.length === 0) return;

  // Toggle active speaking state randomly
  const botUtterances = {
    'English': [
      "I feel that traveling alone actually pushes you to speak the local language much faster.",
      "Could you clarify what you meant by that last phrase?",
      "In my experience, consistency with speaking practice beats studying grammar rules all day."
    ],
    'Spanish': [
      "Me gusta mucho practicar todos los días aunque sea solo diez minutos.",
      "¿Alguien tiene planes para viajar a Latinoamérica este año?"
    ],
    'Japanese': [
      "日常会話の練習は本当に大切ですね。",
      "日本のアニメや文化に興味がある人はいますか？"
    ]
  };

  bots.forEach(b => {
    const wasSpeaking = b.isSpeaking;
    b.isSpeaking = Math.random() > 0.65;

    // Occasionally emit spoken segment for active bot so AI coach HUD shows all participants
    if (!wasSpeaking && b.isSpeaking && Math.random() > 0.4) {
      const phrases = botUtterances[room.language] || botUtterances.English;
      const text = phrases[Math.floor(Math.random() * phrases.length)];
      io.to(randomRoomId).emit('coach:speech-segment-remote', {
        senderId: b.id,
        speaker: {
          id: b.id,
          name: b.name,
          avatar: b.avatar,
          native: b.native
        },
        text,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      });
    }
  });

  io.to(randomRoomId).emit('room:state-sync', {
    participants: room.participants
  });
}, 4500);

async function startServer() {
  await db.initDB();
  const dbRooms = await db.loadRooms();
  if (dbRooms && dbRooms.length > 0) {
    dbRooms.forEach(r => rooms.set(r.id, r));
    console.log(`[DB] Loaded ${dbRooms.length} rooms from database.`);
  } else {
    seedInitialRooms();
    for (const r of rooms.values()) {
      await db.saveRoom(r);
    }
    console.log(`[DB] Seeded initial rooms into database.`);
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
