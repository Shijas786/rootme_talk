/**
 * RootMe Talk - Main Application Controller
 */

// Global State
const state = {
  socket: null,
  media: null,
  whiteboard: null,
  allRooms: [],
  currentRoom: null,
  currentUser: {
    name: 'Learner',
    avatar: '🦊',
    photoUrl: null,
    native: 'English',
    target: 'Spanish',
    streak: 3
  },
  temporaryPhotoUrl: null,
  filters: {
    language: 'all',
    level: 'all',
    topic: 'all',
    query: '',
    openOnly: false
  },
  timer: {
    duration: 90,
    remaining: 90,
    isRunning: false,
    intervalId: null
  },
  correctionMode: false,
  selectedAvatar: '🦊',
  lobbyMode: 'live' // 'live' or 'scheduled'
};

// Helper: render profile photo image if available, else emoji avatar
function renderAvatarHtml(p) {
  if (p && p.photoUrl) {
    return `<img src="${escapeHtml(p.photoUrl)}" class="avatar-photo-img" alt="${escapeHtml(p.name || 'User')}">`;
  }
  return `<span>${(p && p.avatar) || '👤'}</span>`;
}

// Web Audio Synth for UI Sound Effects
class SoundFX {
  constructor() {
    this.ctx = null;
  }
  init() {
    if (!this.ctx) {
      this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    }
  }
  playPop() {
    try {
      this.init();
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(450, this.ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(800, this.ctx.currentTime + 0.1);
      gain.gain.setValueAtTime(0.2, this.ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.1);
      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start();
      osc.stop(this.ctx.currentTime + 0.1);
    } catch (e) {}
  }
  playBell() {
    try {
      this.init();
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(880, this.ctx.currentTime);
      gain.gain.setValueAtTime(0.25, this.ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.6);
      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start();
      osc.stop(this.ctx.currentTime + 0.6);
    } catch (e) {}
  }
}
const sfx = new SoundFX();

// Icebreaker Questions Bank
const icebreakersBank = {
  fun: [
    {
      prompt: "If you could teleport to any city in the world for just 3 hours tonight for dinner, where would you go and what would you eat?",
      followups: ["Who would you take with you?", "What is the first street food you'd try?"]
    },
    {
      prompt: "What is an unusual habit or quirky morning routine that you secretly love?",
      followups: ["How did it start?", "Do your friends or family know about it?"]
    },
    {
      prompt: "If you were granted a magic microphone that broadcasts 30 seconds of speech to all 8 billion people on Earth, what would you say?",
      followups: ["Would you speak your native tongue or English?", "What emotion would you want to evoke?"]
    }
  ],
  travel: [
    {
      prompt: "Describe the most breathtaking sunrise, mountain view, or ocean shore you have ever witnessed with your own eyes.",
      followups: ["Where was it?", "What smells, sounds, and temperatures do you remember?"]
    },
    {
      prompt: "Have you ever experienced culture shock while traveling abroad or meeting people from another culture?",
      followups: ["What was surprising?", "How did your perspective change?"]
    }
  ],
  deep: [
    {
      prompt: "What is one piece of advice you received years ago that completely changed the trajectory of your life?",
      followups: ["Who told it to you?", "Would you pass it on to your younger self?"]
    },
    {
      prompt: "Do you believe learning a new language gives you a completely different second personality?",
      followups: ["Do you feel more outgoing or reserved in your target language?", "Why?"]
    }
  ],
  career: [
    {
      prompt: "What was your very first job, and what is one memorable lesson or funny mistake you made on day one?",
      followups: ["How did your manager react?", "What has changed since then?"]
    },
    {
      prompt: "If money and salaries were no object, what dream craft, art, or project would you spend 40 hours a week creating?",
      followups: ["What tools would you need?", "Who would you collaborate with?"]
    }
  ],
  debate: [
    {
      prompt: "Is working 100% remotely from home better or worse for human happiness and career growth than working in an office?",
      followups: ["What are the biggest trade-offs?", "How do you maintain real work-life boundaries?"]
    },
    {
      prompt: "Will AI language translation replace the need to learn foreign languages, or does human connection remain irreplaceable?",
      followups: ["What is lost in automated translation?", "Why are you motivated to learn today?"]
    }
  ],
  grammar: [
    {
      prompt: "Let's do a 60-second Story Relay! Describe your ideal weekend using ONLY past tense verbs (went, saw, drank, drove...).",
      followups: ["Keep it moving fast around the circle!"]
    },
    {
      prompt: "Vocabulary Challenge: Use the idiom 'Bite the bullet' or 'Hit the nail on the head' in a personal sentence right now!",
      followups: ["Can someone else make another sentence with the same phrase?"]
    }
  ]
};

// Initialize Application
document.addEventListener('DOMContentLoaded', () => {
  loadUserProfile();
  initSocket();
  setupUIEventListeners();
  setupSettingsAndMicMeter();
  startCountdownTicker();
});

// Load and Persist Profile in LocalStorage
function loadUserProfile() {
  const saved = localStorage.getItem('rootme_user_profile');
  if (saved) {
    try {
      state.currentUser = { ...state.currentUser, ...JSON.parse(saved) };
    } catch (e) {}
  }
  updateProfileNavUI();
}

function saveUserProfile(profile) {
  state.currentUser = { ...state.currentUser, ...profile };
  localStorage.setItem('rootme_user_profile', JSON.stringify(state.currentUser));
  updateProfileNavUI();
  showToast('Profile updated successfully!', 'success');
}

function updateProfileNavUI() {
  const navAvatar = document.getElementById('navAvatar');
  const navName = document.getElementById('navName');
  const navStreak = document.getElementById('navStreak');
  if (navAvatar) {
    if (state.currentUser.photoUrl) {
      navAvatar.innerHTML = `<img src="${escapeHtml(state.currentUser.photoUrl)}" class="avatar-photo-img" alt="Avatar">`;
    } else {
      navAvatar.textContent = state.currentUser.avatar || '🦊';
    }
  }
  if (navName) navName.textContent = state.currentUser.name;
  if (navStreak) navStreak.textContent = state.currentUser.streak || 3;
  window.currentUserProfile = state.currentUser;
}

// Socket.io Setup
function initSocket() {
  state.socket = io();
  state.media = new MediaManager(state.socket);

  // When room list updates from server
  state.socket.on('rooms:updated', (roomsList) => {
    state.allRooms = roomsList;
    renderLobbyRooms();
    updateLobbyStats();
  });

  // When real online user count updates
  state.socket.on('stats:online', ({ onlineCount }) => {
    const globalOnline = document.getElementById('globalOnlineCount');
    if (globalOnline) globalOnline.textContent = Math.max(1, onlineCount || 1);
  });

  // When a peer joins our room
  state.socket.on('peer:joined', ({ peer, message }) => {
    if (!state.currentRoom) return;
    showToast(message, 'info');
    sfx.playBell();

    // Check if peer is already in list
    if (!state.currentRoom.participants.some(p => p.id === peer.id)) {
      state.currentRoom.participants.push(peer);
      renderParticipants();
      updateRoomHeaderMeta();
    }
  });

  // When a peer leaves
  state.socket.on('peer:left', ({ peerId, name }) => {
    if (!state.currentRoom) return;
    showToast(`${name} left the room`, 'info');
    state.currentRoom.participants = state.currentRoom.participants.filter(p => p.id !== peerId);
    state.media.closePeerConnection(peerId);
    const audioEl = document.getElementById(`remote-audio-${peerId}`);
    if (audioEl) audioEl.remove();
    renderParticipants();
    updateRoomHeaderMeta();
  });

  // When remote peer state updates (mic, video, speaking)
  state.socket.on('peer:state-changed', ({ peerId, updates }) => {
    if (!state.currentRoom) return;
    const p = state.currentRoom.participants.find(x => x.id === peerId);
    if (p) {
      Object.assign(p, updates);
      updateParticipantTileState(peerId, updates);
    }
  });

  // Dynamic simulation sync for seed rooms
  state.socket.on('room:state-sync', ({ participants }) => {
    if (!state.currentRoom) return;
    participants.forEach(p => {
      const existing = state.currentRoom.participants.find(x => x.id === p.id);
      if (existing) {
        existing.isSpeaking = p.isSpeaking;
        updateParticipantTileState(p.id, { isSpeaking: p.isSpeaking });
      }
    });
  });

  // Chat message received
  state.socket.on('chat:received', (msg) => {
    appendChatMessage(msg);
  });

  // Floating reaction broadcast
  state.socket.on('chat:reaction-broadcast', (reaction) => {
    spawnFloatingEmoji(reaction.emoji, reaction.x, reaction.y);
    sfx.playPop();
  });

  // Vocabulary card added
  state.socket.on('vocab:added', (item) => {
    if (state.currentRoom) {
      if (!state.currentRoom.vocabList) state.currentRoom.vocabList = [];
      state.currentRoom.vocabList.push(item);
      renderVocabCards();
      showToast(`New word added: ${item.term}`, 'info');
    }
  });

  // Speaking Timer synced
  state.socket.on('timer:synced', (timerData) => {
    handleRemoteTimerUpdate(timerData);
  });

  // Host assigned
  state.socket.on('room:new-host', (newHost) => {
    if (state.currentRoom) {
      state.currentRoom.host = newHost;
      updateRoomHeaderMeta();
      renderParticipants();
      if (newHost.id === state.socket.id) {
        showToast('You are now the room host! 👑', 'success');
      }
    }
  });

  // Kicked by host
  state.socket.on('host:you-were-kicked', () => {
    showToast('You were removed from the room by the host', 'error');
    leaveRoom();
  });

  // Muted by host
  state.socket.on('host:you-were-muted', () => {
    if (!state.media.isMicMuted) {
      state.media.toggleMic();
      updateMicButtonUI(false);
      showToast('You were muted by the room host', 'info');
    }
  });

  // WebRTC remote track listener
  state.media.onRemoteTrack = (peerId, stream, track) => {
    attachRemoteTrackToTile(peerId, stream, track);
  };

  // Local speaking state callback
  state.media.onLocalSpeakingChanged = (isSpeaking) => {
    if (state.currentRoom) {
      updateParticipantTileState(state.socket.id, { isSpeaking });
      const dockMicBtn = document.getElementById('dockMicBtn');
      if (dockMicBtn) {
        if (isSpeaking && !state.media.isMicMuted) {
          dockMicBtn.classList.add('speaking-live');
        } else {
          dockMicBtn.classList.remove('speaking-live');
        }
      }
    }
  };

  // When a scheduled room goes live
  state.socket.on('room:live_started', ({ roomId, room }) => {
    sfx.playBell();
    showToast(`🔔 "${room.title}" is now LIVE! Join in!`, 'success');
    renderLobbyRooms();
    updateLobbyStats();
  });
}

// Countdown Formatting Helpers
function formatCountdown(targetTimestamp) {
  if (!targetTimestamp) return '00:00';
  const diff = targetTimestamp - Date.now();
  if (diff <= 0) return 'Opening now...';
  const hours = Math.floor(diff / (1000 * 60 * 60));
  const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
  const seconds = Math.floor((diff % (1000 * 60)) / 1000);
  if (hours > 0) {
    return `${hours}h ${minutes}m ${seconds}s`;
  }
  return `${minutes}m ${seconds}s`;
}

function formatScheduledTime(timestamp) {
  if (!timestamp) return '';
  const d = new Date(timestamp);
  const timeStr = d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  const today = new Date();
  if (d.toDateString() === today.toDateString()) {
    return `Today at ${timeStr}`;
  }
  const dateStr = d.toLocaleDateString([], { month: 'short', day: 'numeric' });
  return `${dateStr}, ${timeStr}`;
}

let countdownInterval = null;
function startCountdownTicker() {
  if (countdownInterval) clearInterval(countdownInterval);
  countdownInterval = setInterval(() => {
    document.querySelectorAll('.countdown-span[data-target-time]').forEach(el => {
      const target = parseInt(el.getAttribute('data-target-time'), 10);
      if (target) {
        el.textContent = formatCountdown(target);
      }
    });
  }, 1000);
}

// RSVP & Start Early Room Actions
function toggleRoomRSVP(roomId) {
  if (!state.socket) return;
  sfx.playPop();
  state.socket.emit('room:rsvp', {
    roomId,
    user: {
      id: state.socket.id,
      name: state.currentUser.name,
      avatar: state.currentUser.avatar,
      photoUrl: state.currentUser.photoUrl
    }
  }, (res) => {
    if (res.success) {
      showToast(res.isRsvp ? 'RSVP confirmed! You will be notified when this room opens. 🔔' : 'RSVP cancelled.', 'info');
      const room = state.allRooms.find(r => r.id === roomId);
      if (room) {
        room.rsvpCount = res.rsvpCount;
        room.rsvps = res.rsvps || [];
        renderLobbyRooms();
        updateLobbyStats();
      }
    } else {
      showToast(res.error || 'Failed to update RSVP', 'error');
    }
  });
}

function startRoomEarly(roomId) {
  if (!state.socket) return;
  showToast('Opening room now...', 'info');
  state.socket.emit('room:start_early', { roomId }, (res) => {
    if (res.success) {
      showToast('Room opened! Entering now... 🚀', 'success');
      state.lobbyMode = 'live';
      const liveBtn = document.getElementById('tabLiveRoomsBtn');
      const schedBtn = document.getElementById('tabScheduledRoomsBtn');
      if (liveBtn) liveBtn.classList.add('active');
      if (schedBtn) schedBtn.classList.remove('active');
      attemptJoinRoom(roomId);
    } else {
      showToast(res.error || 'Could not open room early', 'error');
    }
  });
}

// Render Lobby Rooms with Active Filters
function renderLobbyRooms() {
  const grid = document.getElementById('roomsGrid');
  const emptyState = document.getElementById('emptyRoomsState');
  const counterPill = document.getElementById('matchedRoomsCount');
  if (!grid) return;

  const filtered = state.allRooms.filter(room => {
    // Mode Filter: Live vs Scheduled
    if (state.lobbyMode === 'scheduled') {
      if (!room.isScheduled) return false;
    } else {
      if (room.isScheduled) return false;
    }

    // Language Filter
    if (state.filters.language !== 'all' && room.language.toLowerCase() !== state.filters.language.toLowerCase()) {
      return false;
    }
    // Level Filter
    if (state.filters.level !== 'all') {
      if (state.filters.level === 'any' && room.levelCode !== 'any') return false;
      if (state.filters.level === 'beginner' && room.levelCode !== 'beginner') return false;
      if (state.filters.level === 'intermediate' && room.levelCode !== 'intermediate') return false;
      if (state.filters.level === 'advanced' && room.levelCode !== 'advanced') return false;
    }
    // Topic Filter
    if (state.filters.topic !== 'all' && room.topicKey !== state.filters.topic) {
      return false;
    }
    // Open Seats Filter
    if (state.filters.openOnly && room.participantCount >= room.capacity) {
      return false;
    }
    // Search Query
    if (state.filters.query.trim()) {
      const q = state.filters.query.toLowerCase();
      const matchTitle = room.title.toLowerCase().includes(q);
      const matchTopic = room.topic.toLowerCase().includes(q);
      const matchLang = room.language.toLowerCase().includes(q);
      if (!matchTitle && !matchTopic && !matchLang) return false;
    }
    return true;
  });

  if (counterPill) {
    if (state.lobbyMode === 'scheduled') {
      counterPill.textContent = `${filtered.length} scheduled rooms`;
    } else {
      counterPill.textContent = `${filtered.length} rooms live`;
    }
  }

  if (filtered.length === 0) {
    grid.innerHTML = '';
    if (emptyState) {
      emptyState.style.display = 'block';
      const emptyTitle = emptyState.querySelector('h3');
      const emptyDesc = emptyState.querySelector('p');
      if (state.lobbyMode === 'scheduled') {
        if (emptyTitle) emptyTitle.textContent = 'No Upcoming Rooms Scheduled';
        if (emptyDesc) emptyDesc.textContent = 'Be the first to schedule a room with a pre-set opening time!';
      } else {
        if (emptyTitle) emptyTitle.textContent = 'No Matching Live Rooms';
        if (emptyDesc) emptyDesc.textContent = 'Be the pioneer! Create an open conversation room for learners across the globe.';
      }
    }
    return;
  }

  if (emptyState) emptyState.style.display = 'none';

  if (state.lobbyMode === 'scheduled') {
    // Render Scheduled Room Cards
    grid.innerHTML = filtered.map(room => {
      const levelClass = getLevelBadgeClass(room.levelCode);
      const rsvps = room.rsvps || [];
      const rsvpCount = room.rsvpCount || rsvps.length;
      const isUserHost = Boolean(room.creatorName && (room.creatorName === state.currentUser.name || room.hostId === (state.socket && state.socket.id)));
      const isUserRsvpd = rsvps.some(r => r.name === state.currentUser.name || r.id === (state.socket && state.socket.id));

      const rsvpAvatarsHtml = rsvps.slice(0, 4).map(p => `
        <div class="mini-avatar-item" title="${escapeHtml(p.name)}">
          ${renderAvatarHtml(p)}
        </div>
      `).join('');

      return `
        <div class="room-card scheduled-card" data-room-id="${room.id}">
          <div>
            <div class="card-top-badges">
              <div class="lang-indicator">
                <span>${room.flag || '🌐'}</span>
                <span>${room.language}</span>
              </div>
              <div class="card-badges-right">
                <span class="badge ${levelClass}">${room.level}</span>
                <span class="badge badge-scheduled">📅 Scheduled</span>
                ${room.isPrivate ? '<span class="badge badge-topic">🔒 Locked</span>' : ''}
              </div>
            </div>

            <div class="card-countdown-banner">
              <div class="countdown-timer-pill">
                <span>⏳</span>
                <span class="countdown-span" data-target-time="${room.scheduledFor}">${formatCountdown(room.scheduledFor)}</span>
              </div>
              <div class="countdown-exact-time">${formatScheduledTime(room.scheduledFor)}</div>
            </div>

            <h3 class="room-card-title">${escapeHtml(room.title)}</h3>
          </div>

          <div>
            <div class="rsvp-stack-row">
              <div class="avatar-stack">
                ${rsvpAvatarsHtml || '<div class="mini-avatar-item" style="opacity:0.6;">👤</div>'}
                ${rsvpCount > 4 ? `<div class="mini-avatar-item" style="font-size: 0.75rem; font-weight:700;">+${rsvpCount - 4}</div>` : ''}
              </div>
              <span class="rsvp-count-label">${rsvpCount} RSVP${rsvpCount === 1 ? '' : 's'}</span>
              <span class="host-name-tag" style="margin-left:auto;">Host: <strong>${escapeHtml(room.creatorName || 'Member')}</strong></span>
            </div>

            <div class="room-card-footer">
              <span class="host-name-tag">Topic: <strong>${escapeHtml(room.topic)}</strong></span>
              <div style="display:flex; gap:0.4rem; align-items:center;">
                ${isUserHost ? `<button class="btn-start-early" data-room-id="${room.id}">▶ Open Early</button>` : ''}
                <button class="btn-rsvp-room ${isUserRsvpd ? 'rsvpd' : ''}" data-room-id="${room.id}">
                  ${isUserRsvpd ? '✓ RSVP’d' : '🔔 Remind Me'}
                </button>
              </div>
            </div>
          </div>
        </div>
      `;
    }).join('');

    // Attach Scheduled Room Action Listeners
    grid.querySelectorAll('.btn-rsvp-room').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const roomId = btn.getAttribute('data-room-id');
        toggleRoomRSVP(roomId);
      });
    });

    grid.querySelectorAll('.btn-start-early').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const roomId = btn.getAttribute('data-room-id');
        startRoomEarly(roomId);
      });
    });

    grid.querySelectorAll('.room-card.scheduled-card').forEach(card => {
      card.addEventListener('click', () => {
        const roomId = card.getAttribute('data-room-id');
        const room = state.allRooms.find(r => r.id === roomId);
        if (!room) return;
        const isUserHost = Boolean(room.creatorName && (room.creatorName === state.currentUser.name || room.hostId === (state.socket && state.socket.id)));
        if (isUserHost) {
          startRoomEarly(roomId);
        } else {
          toggleRoomRSVP(roomId);
        }
      });
    });

  } else {
    // Render Live Room Cards
    grid.innerHTML = filtered.map(room => {
      const isFull = room.participantCount >= room.capacity;
      const capacityPct = Math.min(100, Math.round((room.participantCount / room.capacity) * 100));
      const levelClass = getLevelBadgeClass(room.levelCode);

      // Mini participant avatars (show up to 4)
      const avatarsHtml = room.participants.slice(0, 4).map(p => `
        <div class="mini-avatar-item ${p.isSpeaking ? 'mini-avatar-speaking' : ''}" title="${escapeHtml(p.name)}">
          ${renderAvatarHtml(p)}
        </div>
      `).join('');

      return `
        <div class="room-card" data-room-id="${room.id}">
          <div>
            <div class="card-top-badges">
              <div class="lang-indicator">
                <span>${room.flag || '🌐'}</span>
                <span>${room.language}</span>
              </div>
              <div class="card-badges-right">
                <span class="badge ${levelClass}">${room.level}</span>
                ${room.isPrivate ? '<span class="badge badge-topic">🔒 Locked</span>' : ''}
              </div>
            </div>

            <h3 class="room-card-title">${escapeHtml(room.title)}</h3>
          </div>

          <div>
            <div class="room-participants-preview">
              <div class="avatar-stack">
                ${avatarsHtml}
                ${room.participantCount > 4 ? `<div class="mini-avatar-item" style="font-size: 0.75rem; font-weight:700;">+${room.participantCount - 4}</div>` : ''}
              </div>

              <div class="capacity-meter-wrap">
                <span class="capacity-text">${room.participantCount}/${room.capacity} Seats</span>
                <div class="capacity-bar-track">
                  <div class="capacity-bar-fill ${isFull ? 'full' : ''}" style="width: ${capacityPct}%;"></div>
                </div>
              </div>
            </div>

            <div class="room-card-footer">
              <span class="host-name-tag">Topic: <strong>${escapeHtml(room.topic)}</strong></span>
              <button class="btn-join-room" data-room-id="${room.id}" ${isFull ? 'disabled' : ''}>
                ${isFull ? 'Room Full' : 'Join Room →'}
              </button>
            </div>
          </div>
        </div>
      `;
    }).join('');

    // Attach join click listeners
    grid.querySelectorAll('.btn-join-room').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const roomId = btn.getAttribute('data-room-id');
        attemptJoinRoom(roomId);
      });
    });

    // Clicking anywhere on card also triggers join if not full
    grid.querySelectorAll('.room-card').forEach(card => {
      card.addEventListener('click', () => {
        const roomId = card.getAttribute('data-room-id');
        attemptJoinRoom(roomId);
      });
    });
  }
}

function getLevelBadgeClass(code) {
  if (code === 'beginner') return 'badge-level-beginner';
  if (code === 'intermediate') return 'badge-level-intermediate';
  if (code === 'advanced') return 'badge-level-advanced';
  return 'badge-level';
}

function updateLobbyStats() {
  const liveCount = state.allRooms.filter(r => !r.isScheduled).length;
  const schedCount = state.allRooms.filter(r => r.isScheduled).length;
  const liveBadge = document.getElementById('liveRoomsCountBadge') || document.getElementById('liveRoomsBadge');
  const schedBadge = document.getElementById('scheduledRoomsCountBadge') || document.getElementById('scheduledRoomsBadge');
  if (liveBadge) liveBadge.textContent = liveCount;
  if (schedBadge) schedBadge.textContent = schedCount;

  const statsRooms = document.getElementById('statsRoomsCount');
  if (statsRooms) statsRooms.textContent = state.allRooms.length;

  const globalOnline = document.getElementById('globalOnlineCount');
  const inRoomsCount = state.allRooms.reduce((sum, r) => sum + r.participantCount, 0);
  if (globalOnline && !globalOnline.textContent) {
    globalOnline.textContent = Math.max(1, inRoomsCount);
  }
}

// Join Room Logic
function attemptJoinRoom(roomId, password = '') {
  const room = state.allRooms.find(r => r.id === roomId);
  if (!room) return;

  if (room.isPrivate && !password) {
    // Open password modal
    const pwdModal = document.getElementById('passwordModal');
    const pwdForm = document.getElementById('passwordForm');
    pwdForm.setAttribute('data-target-room-id', roomId);
    if (pwdModal) pwdModal.showModal();
    return;
  }

  // Request join via socket
  state.socket.emit('room:join', {
    roomId,
    user: state.currentUser,
    password
  }, async (res) => {
    if (!res.success) {
      if (res.error === 'Incorrect room password') {
        const err = document.getElementById('passwordErrorMsg');
        if (err) err.style.display = 'block';
      } else {
        showToast(res.error || 'Could not join room', 'error');
      }
      return;
    }

    // Close password modal if open
    const pwdModal = document.getElementById('passwordModal');
    if (pwdModal && pwdModal.open) pwdModal.close();

    state.currentRoom = res.room;
    enterInRoomView(res.room);

    // Initialize local microphone
    await state.media.initLocalMedia(false);

    // Connect to existing peers via WebRTC
    if (res.existingPeers && res.existingPeers.length) {
      res.existingPeers.forEach(peer => {
        if (peer && peer.id) {
          state.media.connectToPeer(peer.id);
        }
      });
    }
  });
}

// Surprise Match Roulette: Finds an open room with available seats
function triggerSurpriseMatch() {
  const availableRooms = state.allRooms.filter(r => r.participantCount < r.capacity && !r.isPrivate);
  if (availableRooms.length === 0) {
    showToast("No active rooms right now. Let's create one for you! 🚀", 'info');
    document.getElementById('openCreateRoomBtn').click();
    return;
  }

  // Pick random open room
  const pick = availableRooms[Math.floor(Math.random() * availableRooms.length)];
  showToast(`Matched you into "${pick.title}"! Joining... 🎲`, 'success');
  attemptJoinRoom(pick.id);
}

// Enter Room View UI Transition
function enterInRoomView(room) {
  document.getElementById('lobbyView').style.display = 'none';
  document.getElementById('inRoomView').style.display = 'flex';

  // Update room header
  updateRoomHeaderMeta();

  // Reset tab to Voice Stage
  switchStageTab('stage');

  // Render participants
  renderParticipants();

  // Load chat messages
  const chatContainer = document.getElementById('chatMessagesContainer');
  if (chatContainer) {
    chatContainer.innerHTML = '';
    (room.messages || []).forEach(msg => appendChatMessage(msg, false));
  }

  // Render Vocab Cards
  renderVocabCards();

  // Init Whiteboard if not already
  if (!state.whiteboard) {
    state.whiteboard = new RoomWhiteboard('whiteboardCanvas', state.socket);
  } else {
    state.whiteboard.initCanvasSize();
  }

  // Reset controls
  updateMicButtonUI(true);
  updateVideoButtonUI(false);

  showToast(`Joined ${room.title}! Say hi 👋`, 'success');
}

function updateRoomHeaderMeta() {
  if (!state.currentRoom) return;
  const room = state.currentRoom;

  document.getElementById('activeRoomFlag').textContent = room.flag || '🌐';
  document.getElementById('activeRoomTitle').textContent = room.title;
  document.getElementById('activeRoomLevel').textContent = room.level;
  document.getElementById('activeRoomTopic').textContent = room.topic;
  document.getElementById('activeRoomHost').textContent = room.host ? room.host.name : 'Host';
  document.getElementById('activeRoomOccupancy').textContent = room.participants.length;
  document.getElementById('activeRoomCapacity').textContent = room.capacity;
  document.getElementById('activeRoomLockStatus').textContent = room.isPrivate ? '🔒 Private' : '🔓 Public';
}

// Render Participants in the Stage Grid
function renderParticipants() {
  const grid = document.getElementById('participantsGrid');
  if (!grid || !state.currentRoom) return;

  grid.innerHTML = state.currentRoom.participants.map(p => {
    const isMe = p.id === state.socket.id;
    return `
      <div class="participant-tile ${p.isSpeaking ? 'is-speaking' : ''}" id="tile-${p.id}">
        <!-- Remote Video element if camera is on -->
        <video class="participant-video-stream" id="video-${p.id}" autoplay playsinline style="${p.isVideoOn ? '' : 'display:none;'}"></video>

        <div class="peer-indicators">
          <div class="status-icon-pill ${p.isMuted ? 'muted' : ''} ${p.isSpeaking && !p.isMuted ? 'speaking-live' : ''}" id="mic-status-${p.id}" title="${p.isMuted ? 'Muted' : 'Mic active'}">
            ${p.isMuted ? '🔇' : '🎙️'}
          </div>
        </div>

        <div class="participant-avatar-wrapper">
          <div class="speaking-wave-ring"></div>
          <div class="participant-avatar-circle" id="avatar-${p.id}">
            ${renderAvatarHtml(p)}
          </div>
        </div>

        <div class="participant-meta-bar">
          <span class="peer-name">${escapeHtml(p.name)} ${isMe ? '(You)' : ''}</span>
          <span class="peer-role-badge ${p.isHost ? 'host' : ''}">${p.isHost ? 'Host 👑' : 'Speaker'}</span>
        </div>
      </div>
    `;
  }).join('');
}

function updateParticipantTileState(peerId, updates) {
  const tile = document.getElementById(`tile-${peerId}`);
  const micStatus = document.getElementById(`mic-status-${peerId}`);

  if (updates.isSpeaking !== undefined) {
    if (updates.isSpeaking) {
      if (tile) tile.classList.add('is-speaking');
      if (micStatus && !micStatus.classList.contains('muted')) {
        micStatus.classList.add('speaking-live');
      }
    } else {
      if (tile) tile.classList.remove('is-speaking');
      if (micStatus) micStatus.classList.remove('speaking-live');
    }
  }

  if (updates.isMuted !== undefined) {
    if (micStatus) {
      if (updates.isMuted) {
        micStatus.className = 'status-icon-pill muted';
        micStatus.textContent = '🔇';
      } else {
        const isSpeaking = tile && tile.classList.contains('is-speaking');
        micStatus.className = `status-icon-pill ${isSpeaking ? 'speaking-live' : ''}`;
        micStatus.textContent = '🎙️';
      }
    }
  }

  if (updates.isVideoOn !== undefined) {
    const video = document.getElementById(`video-${peerId}`);
    if (video) {
      video.style.display = updates.isVideoOn ? 'block' : 'none';
    }
  }
}

function attachRemoteTrackToTile(peerId, stream, track) {
  if (track.kind === 'audio') {
    let container = document.getElementById('remoteAudioContainer');
    if (!container) {
      container = document.createElement('div');
      container.id = 'remoteAudioContainer';
      container.style.display = 'none';
      document.body.appendChild(container);
    }
    let audioEl = document.getElementById(`remote-audio-${peerId}`);
    if (!audioEl) {
      audioEl = document.createElement('audio');
      audioEl.id = `remote-audio-${peerId}`;
      audioEl.className = 'remote-audio';
      audioEl.autoplay = true;
      audioEl.playsInline = true;
      container.appendChild(audioEl);
    }
    const mediaStream = (stream && stream.getAudioTracks().length > 0) ? stream : new MediaStream([track]);
    audioEl.srcObject = mediaStream;
    audioEl.muted = state.media.isDeafened;
    const playPromise = audioEl.play();
    if (playPromise !== undefined) {
      playPromise.catch(e => {
        console.warn(`[Audio] Autoplay delayed for peer ${peerId}:`, e);
        const unlock = () => {
          audioEl.play().catch(() => {});
          document.removeEventListener('click', unlock);
          document.removeEventListener('touchstart', unlock);
        };
        document.addEventListener('click', unlock, { once: true });
        document.addEventListener('touchstart', unlock, { once: true });
      });
    }
  } else if (track.kind === 'video') {
    const videoEl = document.getElementById(`video-${peerId}`);
    if (videoEl) {
      videoEl.srcObject = stream;
      videoEl.style.display = 'block';
      videoEl.play().catch(() => {});
    }
  }
}

// In-Room Feature Stage Tabs (Voice Stage, Icebreaker, Vocab, Whiteboard)
function switchStageTab(panelKey) {
  document.querySelectorAll('.tool-tab-btn').forEach(btn => {
    btn.classList.toggle('active', btn.getAttribute('data-panel') === panelKey);
  });

  const panels = {
    stage: document.getElementById('panelStage'),
    aicoach: document.getElementById('panelAICoach'),
    notebook: document.getElementById('panelNotebook'),
    icebreaker: document.getElementById('panelIcebreaker'),
    whiteboard: document.getElementById('panelWhiteboard')
  };

  Object.keys(panels).forEach(key => {
    if (panels[key]) {
      panels[key].style.display = key === panelKey ? 'flex' : 'none';
    }
  });

  if (panelKey === 'notebook') {
    renderNotebookUI('panel');
  }

  if (panelKey === 'whiteboard' && state.whiteboard) {
    setTimeout(() => state.whiteboard.initCanvasSize(), 50);
  }
}

// Icebreakers Card Logic
function drawIcebreakerCard(category = 'fun') {
  const cards = icebreakersBank[category] || icebreakersBank.fun;
  const card = cards[Math.floor(Math.random() * cards.length)];

  document.getElementById('icebreakerTag').textContent = document.getElementById('icebreakerCategorySelect').selectedOptions[0].text;
  document.getElementById('icebreakerText').textContent = `"${card.prompt}"`;

  const followupsList = document.getElementById('icebreakerFollowups');
  if (card.followups && card.followups.length) {
    followupsList.style.display = 'block';
    followupsList.querySelector('ul').innerHTML = card.followups.map(f => `<li>${escapeHtml(f)}</li>`).join('');
  } else {
    followupsList.style.display = 'none';
  }
}

// ==========================================================================
// PERSONAL LANGUAGE NOTEBOOK CONTROLLER
// ==========================================================================
function renderNotebookUI(target = 'panel') {
  if (!window.notebook) return;
  const isPanel = target === 'panel';
  const headingEl = document.getElementById(isPanel ? 'notebookCurrentPageHeading' : 'modalNotebookPageHeading');
  const dateEl = document.getElementById(isPanel ? 'notebookHeaderDate' : 'modalNotebookHeaderDate');
  const pageNumEl = document.getElementById(isPanel ? 'nbPageNumber' : 'modalNbPageNumber');
  const tabsEl = document.getElementById(isPanel ? 'notebookPageTabs' : 'modalNotebookPageTabs');
  const cuesEl = document.getElementById(isPanel ? 'notebookCuesList' : 'modalNotebookCuesList');
  const notesEl = document.getElementById(isPanel ? 'notebookNotesContainer' : 'modalNotebookNotesContainer');

  const currentPage = window.notebook.getCurrentPage();
  if (headingEl && currentPage) {
    headingEl.textContent = currentPage.title.toUpperCase();
  }

  // Update notebook paper date
  if (dateEl) {
    dateEl.textContent = new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).toUpperCase();
  }

  // Update page counter
  const totalDisplayPages = Math.max(window.notebook.pages.length, 12);
  if (pageNumEl) {
    pageNumEl.textContent = `PAGE ${window.notebook.currentPageIndex + 1} / ${totalDisplayPages}`;
  }

  // Render Right-Edge Numbered Sticky Tabs (1 to 12 as in reference photo)
  if (tabsEl) {
    tabsEl.innerHTML = Array.from({ length: 12 }, (_, i) => {
      const page = window.notebook.pages[i];
      const isActive = i === window.notebook.currentPageIndex;
      const tabTitle = page ? page.title : `Page ${i + 1}`;
      return `
        <button class="planner-side-tab ${isActive ? 'active' : ''}" data-tab-idx="${i}" title="${escapeHtml(tabTitle)}">
          ${i + 1}
        </button>
      `;
    }).join('');

    tabsEl.querySelectorAll('.planner-side-tab').forEach(btn => {
      btn.addEventListener('click', () => {
        const idx = parseInt(btn.getAttribute('data-tab-idx'), 10);
        while (window.notebook.pages.length <= idx) {
          window.notebook.addPage(`Section ${window.notebook.pages.length + 1}`);
        }
        window.notebook.currentPageIndex = idx;
        renderNotebookUI(target);
        sfx.playPop();
      });
    });
  }

  // Render Left Column: Cues & Keywords
  if (cuesEl && currentPage) {
    if (currentPage.notes.length === 0) {
      cuesEl.innerHTML = `
        <div style="font-family:'Patrick Hand',cursive;font-size:0.95rem;color:#78716c;text-align:center;padding:12px 0;">
          (Add a keyword above)
        </div>
      `;
    } else {
      cuesEl.innerHTML = currentPage.notes.map(n => `
        <div class="cue-tag-item">
          <span class="cue-tag-text">${escapeHtml(n.term)}</span>
          <div class="cue-tag-actions">
            <button class="cue-mini-btn btn-speak-cue" data-term="${escapeHtml(n.term)}" title="Pronounce">🔊</button>
            <button class="cue-mini-btn btn-delete-cue" data-id="${n.id}" title="Delete">✕</button>
          </div>
        </div>
      `).join('');

      cuesEl.querySelectorAll('.btn-speak-cue').forEach(btn => {
        btn.addEventListener('click', () => speakText(btn.getAttribute('data-term')));
      });

      cuesEl.querySelectorAll('.btn-delete-cue').forEach(btn => {
        btn.addEventListener('click', () => {
          window.notebook.deleteNote(btn.getAttribute('data-id'));
          renderNotebookUI(target);
          showToast('Cue removed from notebook', 'info');
        });
      });
    }
  }

  // Render Right Column: Notes & Explanations with Highlighter Headers
  if (notesEl && currentPage) {
    if (currentPage.notes.length === 0) {
      notesEl.innerHTML = `
        <div style="text-align:center;padding:48px 16px;font-family:'Patrick Hand',cursive;font-size:1.15rem;color:#57534e;line-height:1.6;">
          <span class="highlighter-peach">CONSIDER YOUR PURPOSE</span><br><br>
          Before you start taking notes, identify how you will use them in your conversation rooms.<br>
          Use the pen tool above to capture words, idioms, and natural speaking patterns! ✍️
        </div>
      `;
      return;
    }

    notesEl.innerHTML = currentPage.notes.map(note => `
      <div class="cornell-note-block" data-note-id="${note.id}">
        <span class="note-block-heading">${escapeHtml(note.term.toUpperCase())}</span>
        <div class="note-block-content">${escapeHtml(note.meaning)}</div>
        ${note.example ? `<div class="note-example-quote">“${escapeHtml(note.example)}”</div>` : ''}
      </div>
    `).join('');
  }
}

// Add Note Helper
async function handleAddNote(isPanel = true) {
  const prefix = isPanel ? 'nb' : 'modalNb';
  const termInput = document.getElementById(`${prefix}TermInput`);
  const meaningInput = document.getElementById(`${prefix}MeaningInput`);
  const exampleInput = document.getElementById(`${prefix}ExampleInput`);

  const term = termInput.value.trim();
  const meaning = meaningInput.value.trim();
  const example = exampleInput.value.trim();

  if (!term || !meaning) {
    showToast('Please enter both a word and its meaning', 'info');
    return;
  }

  window.notebook.addNote(term, meaning, example);
  termInput.value = '';
  meaningInput.value = '';
  exampleInput.value = '';

  renderNotebookUI(isPanel ? 'panel' : 'modal');
  sfx.playPop();
  showToast(`Saved "${term}" to your Notebook! 📖`, 'success');
}

// AI Meaning Helper
async function handleAIMeaningLookup(isPanel = true) {
  const prefix = isPanel ? 'nb' : 'modalNb';
  const termInput = document.getElementById(`${prefix}TermInput`);
  const meaningInput = document.getElementById(`${prefix}MeaningInput`);
  const exampleInput = document.getElementById(`${prefix}ExampleInput`);
  const loadingEl = document.getElementById(`${prefix}AILoading`);

  const word = termInput.value.trim();
  if (!word) {
    showToast('Type a word or phrase first, then click AI Meaning', 'info');
    return;
  }

  if (loadingEl) loadingEl.style.display = 'flex';
  const lang = (state.currentRoom && state.currentRoom.language) || state.currentUser.target || 'English';

  try {
    const res = await window.notebook.fetchAIMeaning(word, lang);
    if (res) {
      meaningInput.value = res.meaning;
      if (res.example) exampleInput.value = res.example;
      showToast(`AI definition loaded for "${word}"`, 'success');
    }
  } catch (e) {
    showToast('Could not fetch AI explanation', 'error');
  } finally {
    if (loadingEl) loadingEl.style.display = 'none';
  }
}

// ==========================================================================
// LIVE AI SPEECH COACH & TRANSCRIBER CONTROLLER
// ==========================================================================
function setupLiveAICoachEngine() {
  if (!window.liveAICoach) return;

  // Listen for speech segments broadcast by other room participants
  if (state.socket) {
    state.socket.off('coach:speech-segment-remote');
    state.socket.on('coach:speech-segment-remote', (data) => {
      if (!state.currentRoom) return;
      if (window.liveAICoach) {
        window.liveAICoach.addRemoteSpeechSegment(data);
      }
    });
  }

  // When local user speaks, broadcast to peers in the room
  window.liveAICoach.onLocalSpoken = (item) => {
    if (state.socket && state.currentRoom) {
      state.socket.emit('coach:speech-segment', {
        roomId: state.currentRoom.id,
        text: item.text,
        speakerName: state.currentUser.name,
        speakerAvatar: state.currentUser.avatar,
        speakerPhotoUrl: state.currentUser.photoUrl,
        timestamp: item.timestamp
      });
    }
  };

  window.liveAICoach.onStateChange = (isActive) => {
    const dot = document.getElementById('aiCoachStatusDot');
    const label = document.getElementById('aiCoachBtnLabel');
    const toggleBtn = document.getElementById('aiCoachToggleBtn');
    const startStopBtn = document.getElementById('coachStartStopBtn');
    const liveIndicator = document.getElementById('coachLiveIndicator');
    const statusText = document.getElementById('coachStatusText');

    if (dot) dot.classList.toggle('active', isActive);
    if (toggleBtn) toggleBtn.classList.toggle('active', isActive);
    if (label) label.textContent = isActive ? 'Listening...' : '🤖 AI Coach';

    if (startStopBtn) {
      startStopBtn.innerHTML = isActive ? '<span>Stop Coach ⏹</span>' : '<span>Start AI Coach 🎙️</span>';
      startStopBtn.classList.toggle('btn-secondary', isActive);
      startStopBtn.classList.toggle('btn-primary', !isActive);
    }

    if (liveIndicator) liveIndicator.classList.toggle('live', isActive);
    if (statusText) {
      statusText.textContent = isActive
        ? 'AI Coach Active — Transcribing all speakers and analyzing conversation in real time'
        : 'AI Coach Inactive — Click "Start AI Coach" to listen';
    }
  };

  window.liveAICoach.onTranscriptUpdate = ({ interim, history }) => {
    const interimBar = document.getElementById('coachInterimStream');
    const feed = document.getElementById('coachTranscriptFeed');
    const placeholder = document.getElementById('transcriptPlaceholder');

    if (interimBar) {
      interimBar.textContent = interim ? `"... ${interim}"` : '';
    }

    if (feed && history.length > 0) {
      if (placeholder) placeholder.style.display = 'none';
      feed.innerHTML = history.slice(-25).map(item => `
        <div class="transcript-speaker-card ${item.isLocal ? 'local-user' : ''}">
          <div class="speaker-card-header">
            <div class="speaker-identity-wrap">
              <div class="speaker-avatar-circle">
                ${item.speakerPhotoUrl ? `<img src="${escapeHtml(item.speakerPhotoUrl)}" class="avatar-photo-img">` : `<span>${item.speakerAvatar || '👤'}</span>`}
              </div>
              <span class="speaker-name-badge">${escapeHtml(item.speakerName)}</span>
              <span class="speaker-role-tag">${item.isLocal ? 'You' : 'Speaker'}</span>
            </div>
            <span class="speaker-time-stamp">${item.timestamp}</span>
          </div>
          <div class="speaker-speech-bubble">${escapeHtml(item.text)}</div>
        </div>
      `).join('');
      feed.scrollTop = feed.scrollHeight;
    }
  };

  window.liveAICoach.onNewFeedback = (card) => {
    const feed = document.getElementById('coachFeedbackFeed');
    const placeholder = document.getElementById('feedbackPlaceholder');
    if (!feed) return;

    if (placeholder) placeholder.style.display = 'none';

    const cardEl = document.createElement('div');
    cardEl.className = 'coach-feedback-card';
    cardEl.innerHTML = `
      <div class="cf-spoken-row">
        <div style="display:flex;align-items:center;gap:6px;min-width:0;overflow:hidden;">
          <div class="speaker-avatar-circle" style="width:20px;height:20px;font-size:0.72rem;flex-shrink:0;">
            ${card.speakerPhotoUrl ? `<img src="${escapeHtml(card.speakerPhotoUrl)}" class="avatar-photo-img">` : `<span>${card.speakerAvatar || '👤'}</span>`}
          </div>
          <span style="font-size:0.75rem;font-weight:600;color:var(--white);white-space:nowrap;">${escapeHtml(card.speakerName || 'Speaker')}:</span>
          <span class="cf-spoken-text"><s>${escapeHtml(card.original)}</s></span>
        </div>
        <span class="cf-time">${card.timestamp}</span>
      </div>

      <div class="cf-better-row">
        <span class="cf-label">Natural Phrasing</span>
        <div class="cf-better-text">${escapeHtml(card.better || card.original)}</div>
      </div>

      ${card.grammarNote ? `<div class="cf-note-text">${escapeHtml(card.grammarNote)}</div>` : ''}

      <div class="cf-footer-row">
        <div class="cf-vocab-chip">Level up: <strong>${escapeHtml(card.vocabularyAlternative || 'Idiomatic')}</strong></div>
        <button class="btn-save-notebook" data-better="${escapeHtml(card.better || card.original)}" data-note="${escapeHtml(card.grammarNote || '')}">
          Save to Book 📖
        </button>
      </div>
    `;

    feed.prepend(cardEl);
    sfx.playPop();

    // Attach save to notebook button
    cardEl.querySelector('.btn-save-notebook').addEventListener('click', (e) => {
      const better = e.currentTarget.getAttribute('data-better');
      const note = e.currentTarget.getAttribute('data-note');
      window.notebook.addNote(better, note || 'Saved from AI Speech Coach', `Spoken: "${card.original}"`);
      showToast('Correction saved to your Notebook! 📖', 'success');
      sfx.playPop();
    });
  };

  window.liveAICoach.onError = (err) => {
    showToast(err, 'error');
  };
}

function toggleLiveAICoach() {
  if (!window.liveAICoach) return;
  const targetLang = (state.currentRoom && state.currentRoom.language) || 'English';
  const isNowActive = window.liveAICoach.toggle(targetLang);

  const langBadge = document.getElementById('coachLangBadge');
  if (langBadge) langBadge.textContent = window.liveAICoach.currentLanguage;

  if (isNowActive) {
    showToast('AI Speech Coach active! Speak into your mic 🎙️', 'success');
    switchStageTab('aicoach');
  } else {
    showToast('AI Speech Coach paused', 'info');
  }
}

function clearAICoachFeed() {
  if (window.liveAICoach) {
    window.liveAICoach.transcriptHistory = [];
    window.liveAICoach.analysisHistory = [];
  }
  const feed1 = document.getElementById('coachTranscriptFeed');
  const feed2 = document.getElementById('coachFeedbackFeed');
  const interim = document.getElementById('coachInterimStream');
  if (feed1) feed1.innerHTML = `<div class="transcript-placeholder" id="transcriptPlaceholder">Speak into your microphone. Your spoken words will stream here live and the AI will analyze grammar and natural phrasing.</div>`;
  if (feed2) feed2.innerHTML = `<div class="feedback-placeholder" id="feedbackPlaceholder">When you speak, the AI will detect awkward phrasing or grammar slips and suggest native corrections right here.</div>`;
  if (interim) interim.textContent = '';
  showToast('AI Coach feed cleared', 'info');
}

function speakText(text) {
  if ('speechSynthesis' in window) {
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.rate = 0.9;
    window.speechSynthesis.speak(u);
  }
}

// Speaking Turn Timer (Synchronized across the room)
function toggleSpeakingTimer() {
  if (state.timer.isRunning) {
    pauseTimer();
  } else {
    startTimer();
  }
}

function startTimer() {
  state.timer.isRunning = true;
  document.getElementById('timerToggleBtn').textContent = '⏸';
  state.socket.emit('timer:update', { action: 'start', remaining: state.timer.remaining });

  clearInterval(state.timer.intervalId);
  state.timer.intervalId = setInterval(() => {
    if (state.timer.remaining > 0) {
      state.timer.remaining--;
      updateTimerDisplay();
      if (state.timer.remaining === 0) {
        pauseTimer();
        sfx.playBell();
        showToast("Speaking turn time is up! Pass the mic 🎙️", 'info');
      }
    }
  }, 1000);
}

function pauseTimer() {
  state.timer.isRunning = false;
  document.getElementById('timerToggleBtn').textContent = '▶';
  clearInterval(state.timer.intervalId);
  state.socket.emit('timer:update', { action: 'pause', remaining: state.timer.remaining });
}

function resetTimer() {
  pauseTimer();
  state.timer.remaining = state.timer.duration;
  updateTimerDisplay();
  state.socket.emit('timer:update', { action: 'reset', remaining: state.timer.duration });
}

function handleRemoteTimerUpdate({ action, remaining }) {
  state.timer.remaining = remaining;
  updateTimerDisplay();
  if (action === 'start' && !state.timer.isRunning) {
    state.timer.isRunning = true;
    document.getElementById('timerToggleBtn').textContent = '⏸';
    clearInterval(state.timer.intervalId);
    state.timer.intervalId = setInterval(() => {
      if (state.timer.remaining > 0) {
        state.timer.remaining--;
        updateTimerDisplay();
      } else {
        clearInterval(state.timer.intervalId);
      }
    }, 1000);
  } else if (action === 'pause') {
    state.timer.isRunning = false;
    document.getElementById('timerToggleBtn').textContent = '▶';
    clearInterval(state.timer.intervalId);
  }
}

function updateTimerDisplay() {
  const m = Math.floor(state.timer.remaining / 60).toString().padStart(2, '0');
  const s = (state.timer.remaining % 60).toString().padStart(2, '0');
  const el = document.getElementById('timerClock');
  if (el) el.textContent = `${m}:${s}`;
}

// In-Room Chat Stream
function appendChatMessage(msg, scroll = true) {
  const container = document.getElementById('chatMessagesContainer');
  if (!container) return;

  const isMine = msg.senderId === state.socket.id || msg.sender === state.currentUser.name;
  const msgEl = document.createElement('div');
  msgEl.className = `chat-msg-row ${isMine ? 'mine' : ''}`;

  if (msg.correction) {
    msgEl.innerHTML = `
      <div class="chat-msg-meta">
        <span class="chat-sender-avatar">${msg.avatar || '👤'}</span>
        <span class="chat-sender-name ${msg.isHost ? 'host' : ''}">${escapeHtml(msg.sender)}</span>
        <span>${msg.time}</span>
      </div>
      <div class="correction-card-chat">
        <div class="corr-badge">✍️ Language Correction</div>
        <div class="corr-original"><s>${escapeHtml(msg.correction.original)}</s></div>
        <div class="corr-better">✓ ${escapeHtml(msg.correction.better)}</div>
      </div>
    `;
  } else {
    msgEl.innerHTML = `
      <div class="chat-msg-meta">
        <span class="chat-sender-avatar">${msg.avatar || '👤'}</span>
        <span class="chat-sender-name ${msg.isHost ? 'host' : ''}">${escapeHtml(msg.sender)}</span>
        <span>${msg.time}</span>
      </div>
      <div class="chat-bubble">${escapeHtml(msg.text)}</div>
    `;
  }

  container.appendChild(msgEl);
  if (scroll) {
    container.scrollTop = container.scrollHeight;
  }
}

// Floating Emoji Reactions
function sendReaction(emoji) {
  const x = Math.floor(Math.random() * 60) + 20; // 20% to 80% screen width
  const y = window.innerHeight - 100;
  state.socket.emit('chat:reaction', { emoji, x, y });
  spawnFloatingEmoji(emoji, x, y);
  sfx.playPop();
}

function spawnFloatingEmoji(emoji, xPercent, y) {
  const el = document.createElement('div');
  el.className = 'floating-emoji';
  el.textContent = emoji;
  el.style.left = `${xPercent}vw`;
  el.style.top = `${y}px`;
  document.body.appendChild(el);

  setTimeout(() => {
    el.remove();
  }, 2400);
}

// Leave Room
function leaveRoom() {
  if (window.aiPartner && window.aiPartner.isActive) {
    window.aiPartner.toggle(state.currentRoom);
  }
  state.media.stopLocalMedia();
  state.socket.emit('room:leave');
  state.currentRoom = null;

  // Clear all remote audio tags
  const audioContainer = document.getElementById('remoteAudioContainer');
  if (audioContainer) audioContainer.innerHTML = '';

  const dockMicBtn = document.getElementById('dockMicBtn');
  if (dockMicBtn) dockMicBtn.classList.remove('speaking-live');

  document.getElementById('inRoomView').style.display = 'none';
  document.getElementById('lobbyView').style.display = 'block';

  // Request updated lobby
  state.socket.emit('lobby:get-rooms');
}

// Microphone & Camera Dock UI Toggles
function updateMicButtonUI(isOn) {
  document.getElementById('iconMicOn').style.display = isOn ? 'block' : 'none';
  document.getElementById('iconMicOff').style.display = isOn ? 'none' : 'block';
  document.getElementById('dockMicLabel').textContent = isOn ? 'Mic On' : 'Muted';
  document.getElementById('dockMicBtn').classList.toggle('danger', !isOn);
  if (!isOn) {
    document.getElementById('dockMicBtn').classList.remove('speaking-live');
  }
}

function updateVideoButtonUI(isOn) {
  document.getElementById('iconVideoOn').style.display = isOn ? 'block' : 'none';
  document.getElementById('iconVideoOff').style.display = isOn ? 'none' : 'block';
  document.getElementById('dockVideoLabel').textContent = isOn ? 'Cam On' : 'Cam Off';
  document.getElementById('dockVideoBtn').classList.toggle('active', isOn);
}

// Microphones & Camera Meter in Settings
let micMeterStream = null;
let micMeterCtx = null;
let micMeterInterval = null;

function setupSettingsAndMicMeter() {
  const testBtn = document.getElementById('startMicTestBtn');
  const meterFill = document.getElementById('micMeterFill');

  if (testBtn) {
    testBtn.addEventListener('click', async () => {
      if (micMeterStream) {
        clearInterval(micMeterInterval);
        micMeterStream.getTracks().forEach(t => t.stop());
        micMeterStream = null;
        meterFill.style.width = '0%';
        testBtn.textContent = 'Test Microphone';
        return;
      }

      try {
        micMeterStream = await navigator.mediaDevices.getUserMedia({ audio: true });
        micMeterCtx = new (window.AudioContext || window.webkitAudioContext)();
        const src = micMeterCtx.createMediaStreamSource(micMeterStream);
        const analyser = micMeterCtx.createAnalyser();
        analyser.fftSize = 256;
        src.connect(analyser);

        const dataArray = new Uint8Array(analyser.frequencyBinCount);
        testBtn.textContent = 'Stop Test';

        micMeterInterval = setInterval(() => {
          analyser.getByteFrequencyData(dataArray);
          let sum = 0;
          for (let i = 0; i < dataArray.length; i++) sum += dataArray[i];
          const avg = sum / dataArray.length;
          const pct = Math.min(100, Math.round((avg / 60) * 100));
          meterFill.style.width = `${pct}%`;
        }, 100);
      } catch (err) {
        showToast('Microphone test permission denied or not found', 'error');
      }
    });
  }
}

// Setup All DOM Event Listeners
function setupUIEventListeners() {
  // Navigation & Modals
  const createRoomModal = document.getElementById('createRoomModal');
  const profileModal = document.getElementById('profileModal');
  const settingsModal = document.getElementById('settingsModal');

  document.getElementById('openCreateRoomBtn').addEventListener('click', () => createRoomModal.showModal());
  document.getElementById('emptyCreateBtn').addEventListener('click', () => createRoomModal.showModal());
  const emptyScheduleBtn = document.getElementById('emptyScheduleBtn');
  if (emptyScheduleBtn) {
    emptyScheduleBtn.addEventListener('click', () => {
      createRoomModal.showModal();
      const optionScheduleLater = document.getElementById('optionScheduleLater');
      const scheduleTimingOptions = document.getElementById('scheduleTimingOptions');
      if (optionScheduleLater) {
        optionScheduleLater.checked = true;
        if (scheduleTimingOptions) scheduleTimingOptions.style.display = 'block';
      }
    });
  }
  document.getElementById('closeCreateRoomModalBtn').addEventListener('click', () => createRoomModal.close());
  document.getElementById('cancelCreateRoomBtn').addEventListener('click', () => createRoomModal.close());

  const avatarPhotoPreview = document.getElementById('avatarPhotoPreview');
  const avatarFileInput = document.getElementById('avatarFileInput');
  const triggerPhotoUploadBtn = document.getElementById('triggerPhotoUploadBtn');
  const removePhotoBtn = document.getElementById('removePhotoBtn');

  document.getElementById('profileTrigger').addEventListener('click', () => {
    document.getElementById('profileNameInput').value = state.currentUser.name;
    document.getElementById('profileNativeSelect').value = state.currentUser.native;
    document.getElementById('profileTargetSelect').value = state.currentUser.target;
    state.temporaryPhotoUrl = state.currentUser.photoUrl || null;

    if (avatarPhotoPreview) {
      if (state.currentUser.photoUrl) {
        avatarPhotoPreview.innerHTML = `<img src="${escapeHtml(state.currentUser.photoUrl)}" class="avatar-photo-img" alt="Avatar">`;
        if (removePhotoBtn) removePhotoBtn.style.display = 'inline-flex';
      } else {
        avatarPhotoPreview.textContent = state.selectedAvatar || state.currentUser.avatar || '🦊';
        if (removePhotoBtn) removePhotoBtn.style.display = 'none';
      }
    }
    profileModal.showModal();
  });
  document.getElementById('closeProfileModalBtn').addEventListener('click', () => profileModal.close());

  // Photo Upload via Device File Dialog
  if (triggerPhotoUploadBtn && avatarFileInput) {
    triggerPhotoUploadBtn.addEventListener('click', () => {
      avatarFileInput.click();
    });

    avatarFileInput.addEventListener('change', (e) => {
      const file = e.target.files && e.target.files[0];
      if (!file) return;

      if (!file.type.startsWith('image/')) {
        showToast('Please select an image file (PNG, JPG, or WebP)', 'error');
        return;
      }

      const reader = new FileReader();
      reader.onload = (loadEvent) => {
        const img = new Image();
        img.onload = () => {
          // Render to 128x128 canvas for compressed lightweight avatar storage
          const canvas = document.createElement('canvas');
          const maxDim = 128;
          let w = img.width;
          let h = img.height;
          if (w > h) {
            if (w > maxDim) {
              h = Math.round((h * maxDim) / w);
              w = maxDim;
            }
          } else {
            if (h > maxDim) {
              w = Math.round((w * maxDim) / h);
              h = maxDim;
            }
          }
          canvas.width = w;
          canvas.height = h;
          const ctx = canvas.getContext('2d');
          ctx.drawImage(img, 0, 0, w, h);
          const compressedDataUrl = canvas.toDataURL('image/jpeg', 0.85);

          state.temporaryPhotoUrl = compressedDataUrl;
          if (avatarPhotoPreview) {
            avatarPhotoPreview.innerHTML = `<img src="${compressedDataUrl}" class="avatar-photo-img" alt="Avatar Preview">`;
          }
          if (removePhotoBtn) removePhotoBtn.style.display = 'inline-flex';
          showToast('Photo selected! Click "Save Profile" to apply.', 'success');
        };
        img.src = loadEvent.target.result;
      };
      reader.readAsDataURL(file);
    });
  }

  if (removePhotoBtn) {
    removePhotoBtn.addEventListener('click', () => {
      state.temporaryPhotoUrl = null;
      if (avatarFileInput) avatarFileInput.value = '';
      if (avatarPhotoPreview) {
        avatarPhotoPreview.textContent = state.selectedAvatar || state.currentUser.avatar || '🦊';
      }
      removePhotoBtn.style.display = 'none';
      showToast('Custom photo removed. Using default avatar icon.', 'info');
    });
  }

  document.getElementById('settingsBtn').addEventListener('click', () => settingsModal.showModal());
  document.getElementById('closeSettingsModalBtn').addEventListener('click', () => settingsModal.close());
  document.getElementById('closeSettingsSaveBtn').addEventListener('click', () => settingsModal.close());

  document.getElementById('closePasswordModalBtn').addEventListener('click', () => document.getElementById('passwordModal').close());
  document.getElementById('cancelPasswordBtn').addEventListener('click', () => document.getElementById('passwordModal').close());

  // Surprise Match Roulette
  document.getElementById('quickMatchBtn').addEventListener('click', triggerSurpriseMatch);

  // Avatar Picker in Profile
  const avatarButtons = document.querySelectorAll('.avatar-choice');
  avatarButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      avatarButtons.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      state.selectedAvatar = btn.getAttribute('data-avatar');
      // If no custom photo active, update preview immediately
      if (!state.temporaryPhotoUrl && avatarPhotoPreview) {
        avatarPhotoPreview.textContent = state.selectedAvatar;
      }
    });
  });

  document.getElementById('saveProfileBtn').addEventListener('click', () => {
    const name = document.getElementById('profileNameInput').value.trim() || 'Learner';
    const native = document.getElementById('profileNativeSelect').value;
    const target = document.getElementById('profileTargetSelect').value;
    const photoUrl = state.temporaryPhotoUrl !== undefined ? state.temporaryPhotoUrl : (state.currentUser.photoUrl || null);

    saveUserProfile({
      name,
      avatar: state.selectedAvatar || state.currentUser.avatar,
      photoUrl,
      native,
      target
    });
    profileModal.close();
  });

  // Lobby Mode Switcher Tabs (Live vs Scheduled)
  const tabLiveRoomsBtn = document.getElementById('tabLiveRoomsBtn');
  const tabScheduledRoomsBtn = document.getElementById('tabScheduledRoomsBtn');
  const btnQuickScheduleRoom = document.getElementById('btnQuickScheduleRoom');

  if (tabLiveRoomsBtn && tabScheduledRoomsBtn) {
    tabLiveRoomsBtn.addEventListener('click', () => {
      state.lobbyMode = 'live';
      tabLiveRoomsBtn.classList.add('active');
      tabScheduledRoomsBtn.classList.remove('active');
      renderLobbyRooms();
    });

    tabScheduledRoomsBtn.addEventListener('click', () => {
      state.lobbyMode = 'scheduled';
      tabScheduledRoomsBtn.classList.add('active');
      tabLiveRoomsBtn.classList.remove('active');
      renderLobbyRooms();
    });
  }

  // Pre-Scheduling Controls inside Create Room Modal
  const optionStartNow = document.getElementById('optionStartNow');
  const optionScheduleLater = document.getElementById('optionScheduleLater');
  const scheduleTimingOptions = document.getElementById('scheduleTimingOptions');
  const scheduleChips = document.querySelectorAll('.schedule-chip');
  const scheduledDatetimeInput = document.getElementById('roomScheduledDatetimeInput');
  const scheduleTimingPreview = document.getElementById('scheduleTimingPreview');

  let selectedScheduleMinutes = 15;

  function updateSchedulePreview() {
    if (!scheduleTimingPreview) return;
    if (selectedScheduleMinutes === 'custom') {
      if (scheduledDatetimeInput && scheduledDatetimeInput.value) {
        const d = new Date(scheduledDatetimeInput.value);
        if (!isNaN(d.getTime())) {
          scheduleTimingPreview.textContent = `Room will open automatically on ${d.toLocaleDateString([], { month: 'short', day: 'numeric' })} at ${d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`;
          return;
        }
      }
      scheduleTimingPreview.textContent = 'Select custom date & time above';
    } else {
      const targetTime = Date.now() + (parseInt(selectedScheduleMinutes, 10) * 60 * 1000);
      const d = new Date(targetTime);
      scheduleTimingPreview.textContent = `Room will open automatically at ${d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })} (in ${selectedScheduleMinutes}m)`;
    }
  }

  if (optionStartNow && optionScheduleLater) {
    optionStartNow.addEventListener('change', () => {
      if (scheduleTimingOptions) scheduleTimingOptions.style.display = 'none';
    });
    optionScheduleLater.addEventListener('change', () => {
      if (scheduleTimingOptions) {
        scheduleTimingOptions.style.display = 'block';
        updateSchedulePreview();
      }
    });
  }

  scheduleChips.forEach(chip => {
    chip.addEventListener('click', () => {
      scheduleChips.forEach(c => c.classList.remove('active'));
      chip.classList.add('active');
      const mins = chip.getAttribute('data-minutes');
      if (mins === 'custom') {
        selectedScheduleMinutes = 'custom';
        if (scheduledDatetimeInput) {
          scheduledDatetimeInput.style.display = 'block';
          if (!scheduledDatetimeInput.value) {
            const future = new Date(Date.now() + 30 * 60 * 1000);
            const pad = (n) => String(n).padStart(2, '0');
            scheduledDatetimeInput.value = `${future.getFullYear()}-${pad(future.getMonth()+1)}-${pad(future.getDate())}T${pad(future.getHours())}:${pad(future.getMinutes())}`;
          }
        }
      } else {
        selectedScheduleMinutes = parseInt(mins, 10) || 15;
        if (scheduledDatetimeInput) {
          scheduledDatetimeInput.style.display = 'none';
        }
      }
      updateSchedulePreview();
    });
  });

  if (scheduledDatetimeInput) {
    scheduledDatetimeInput.addEventListener('input', updateSchedulePreview);
  }

  if (btnQuickScheduleRoom) {
    btnQuickScheduleRoom.addEventListener('click', () => {
      if (createRoomModal) {
        createRoomModal.showModal();
        if (optionScheduleLater) {
          optionScheduleLater.checked = true;
          if (scheduleTimingOptions) scheduleTimingOptions.style.display = 'block';
          updateSchedulePreview();
        }
      }
    });
  }

  // Create Room Form Submit
  const createForm = document.getElementById('createRoomForm');
  const privateToggle = document.getElementById('roomPrivateCheckbox');
  const passwordGroup = document.getElementById('roomPasswordGroup');

  privateToggle.addEventListener('change', () => {
    passwordGroup.style.display = privateToggle.checked ? 'block' : 'none';
  });

  createForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const title = document.getElementById('roomTitleInput').value.trim();
    const langSelect = document.getElementById('roomLangSelect');
    const language = langSelect.value;
    const flag = langSelect.selectedOptions[0].getAttribute('data-flag') || '🌐';

    const levelSelect = document.getElementById('roomLevelSelect');
    const level = levelSelect.value;
    const levelCode = levelSelect.selectedOptions[0].getAttribute('data-code') || 'any';

    const topicSelect = document.getElementById('roomTopicSelect');
    const topic = topicSelect.value;
    const topicKey = topicSelect.selectedOptions[0].getAttribute('data-key') || 'casual';

    const capacity = parseInt(document.getElementById('roomCapacitySelect').value, 10);
    const isPrivate = privateToggle.checked;
    const password = isPrivate ? document.getElementById('roomPasswordInput').value.trim() : '';

    const isScheduled = optionScheduleLater && optionScheduleLater.checked;
    let scheduledFor = null;
    if (isScheduled) {
      if (selectedScheduleMinutes === 'custom') {
        if (scheduledDatetimeInput && scheduledDatetimeInput.value) {
          scheduledFor = new Date(scheduledDatetimeInput.value).getTime();
        } else {
          scheduledFor = Date.now() + 30 * 60 * 1000;
        }
      } else {
        scheduledFor = Date.now() + (parseInt(selectedScheduleMinutes, 10) * 60 * 1000);
      }
    }

    state.socket.emit('room:create', {
      title,
      language,
      flag,
      level,
      levelCode,
      topic,
      topicKey,
      capacity,
      isPrivate,
      password,
      isScheduled,
      scheduledFor,
      creatorName: state.currentUser.name,
      creatorAvatar: state.currentUser.avatar,
      creatorPhotoUrl: state.currentUser.photoUrl,
      creatorNative: state.currentUser.native
    }, (res) => {
      if (res.success) {
        createRoomModal.close();
        createForm.reset();
        passwordGroup.style.display = 'none';
        if (scheduleTimingOptions) scheduleTimingOptions.style.display = 'none';
        if (optionStartNow) optionStartNow.checked = true;

        if (isScheduled) {
          showToast(`Room "${title}" pre-scheduled successfully! 📅`, 'success');
          // Switch view to scheduled rooms tab
          state.lobbyMode = 'scheduled';
          if (tabLiveRoomsBtn) tabLiveRoomsBtn.classList.remove('active');
          if (tabScheduledRoomsBtn) tabScheduledRoomsBtn.classList.add('active');
          renderLobbyRooms();
          updateLobbyStats();
        } else {
          showToast(`Created room "${title}"! Joining now... 🚀`, 'success');
          attemptJoinRoom(res.roomId, password);
        }
      } else {
        showToast(res.error || 'Failed to create room', 'error');
      }
    });
  });

  // Password Form Submit
  document.getElementById('passwordForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const roomId = e.target.getAttribute('data-target-room-id');
    const pwd = document.getElementById('joinPasswordInput').value.trim();
    attemptJoinRoom(roomId, pwd);
  });

  // Language Tabs Filter
  const langTabs = document.querySelectorAll('.lang-tab');
  langTabs.forEach(tab => {
    tab.addEventListener('click', () => {
      langTabs.forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      state.filters.language = tab.getAttribute('data-lang');
      renderLobbyRooms();
    });
  });

  // Search Input & Clear
  const searchInput = document.getElementById('searchInput');
  const searchClear = document.getElementById('searchClearBtn');
  searchInput.addEventListener('input', () => {
    state.filters.query = searchInput.value;
    searchClear.style.display = searchInput.value ? 'block' : 'none';
    renderLobbyRooms();
  });
  searchClear.addEventListener('click', () => {
    searchInput.value = '';
    state.filters.query = '';
    searchClear.style.display = 'none';
    renderLobbyRooms();
  });

  // Secondary Filters
  document.getElementById('levelFilter').addEventListener('change', (e) => {
    state.filters.level = e.target.value;
    renderLobbyRooms();
  });
  document.getElementById('topicFilter').addEventListener('change', (e) => {
    state.filters.topic = e.target.value;
    renderLobbyRooms();
  });
  document.getElementById('openSeatsToggle').addEventListener('change', (e) => {
    state.filters.openOnly = e.target.checked;
    renderLobbyRooms();
  });
  document.getElementById('refreshRoomsBtn').addEventListener('click', () => {
    showToast('Refreshing live rooms list...', 'info');
    state.socket.emit('lobby:get-rooms');
  });

  // Tool Tabs Strip (Stage, Icebreakers, Vocab, Whiteboard)
  document.querySelectorAll('.tool-tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const panel = btn.getAttribute('data-panel');
      switchStageTab(panel);
    });
  });

  // In-Room Bottom Dock Controls
  document.getElementById('dockMicBtn').addEventListener('click', () => {
    const isMicOn = state.media.toggleMic();
    updateMicButtonUI(isMicOn);
    showToast(isMicOn ? 'Microphone unmuted' : 'Microphone muted', 'info');
  });

  document.getElementById('dockVideoBtn').addEventListener('click', async () => {
    const isVideoOn = await state.media.toggleVideo();
    updateVideoButtonUI(isVideoOn);
    showToast(isVideoOn ? 'Camera turned on' : 'Camera turned off', 'info');
  });

  document.getElementById('dockDeafenBtn').addEventListener('click', () => {
    const isDeafened = state.media.toggleDeafen();
    document.getElementById('iconDeafenOff').style.display = isDeafened ? 'none' : 'block';
    document.getElementById('iconDeafenOn').style.display = isDeafened ? 'block' : 'none';
    document.getElementById('dockDeafenLabel').textContent = isDeafened ? 'Deafened' : 'Deafen';
    document.getElementById('dockDeafenBtn').classList.toggle('danger', isDeafened);
    showToast(isDeafened ? 'Room audio muted' : 'Room audio unmuted', 'info');
  });

  // Reaction Buttons
  document.querySelectorAll('.reaction-pop-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const emoji = btn.getAttribute('data-emoji');
      sendReaction(emoji);
    });
  });

  // Toggle Chat Drawer
  document.getElementById('dockChatToggleBtn').addEventListener('click', () => {
    const drawer = document.getElementById('chatDrawer');
    drawer.classList.toggle('mobile-open');
  });

  const chatDrawerCloseBtn = document.getElementById('chatDrawerCloseBtn');
  if (chatDrawerCloseBtn) {
    chatDrawerCloseBtn.addEventListener('click', () => {
      const drawer = document.getElementById('chatDrawer');
      drawer.classList.remove('mobile-open');
    });
  }

  // Leave Room Buttons
  document.getElementById('dockLeaveBtn').addEventListener('click', leaveRoom);
  document.getElementById('leaveRoomBtnTop').addEventListener('click', leaveRoom);

  // Live AI Coach & Speech Transcriber Controls
  setupLiveAICoachEngine();
  const aiCoachToggleBtn = document.getElementById('aiCoachToggleBtn');
  if (aiCoachToggleBtn) aiCoachToggleBtn.addEventListener('click', toggleLiveAICoach);

  const coachStartStopBtn = document.getElementById('coachStartStopBtn');
  if (coachStartStopBtn) coachStartStopBtn.addEventListener('click', toggleLiveAICoach);

  const coachClearBtn = document.getElementById('coachClearBtn');
  if (coachClearBtn) coachClearBtn.addEventListener('click', clearAICoachFeed);

  // In-Room Notebook Controls
  const nbAddPageBtn = document.getElementById('notebookAddPageBtn');
  if (nbAddPageBtn) {
    nbAddPageBtn.addEventListener('click', () => {
      const title = prompt('Enter a title for this notes page:', 'New Vocabulary');
      if (title && title.trim()) {
        window.notebook.addPage(title);
        renderNotebookUI('panel');
        showToast(`Created page "${title}" 📖`, 'success');
      }
    });
  }

  const nbDeletePageBtn = document.getElementById('notebookDeletePageBtn');
  if (nbDeletePageBtn) {
    nbDeletePageBtn.addEventListener('click', () => {
      if (confirm('Delete this notebook page?')) {
        window.notebook.deleteCurrentPage();
        renderNotebookUI('panel');
        showToast('Page removed from notebook', 'info');
      }
    });
  }

  const nbAIExplainBtn = document.getElementById('nbAIExplainBtn');
  if (nbAIExplainBtn) nbAIExplainBtn.addEventListener('click', () => handleAIMeaningLookup(true));

  const nbSaveNoteBtn = document.getElementById('nbSaveNoteBtn');
  if (nbSaveNoteBtn) nbSaveNoteBtn.addEventListener('click', () => handleAddNote(true));

  // In-Room Notebook Page Turner Buttons
  const nbPrevPageBtn = document.getElementById('nbPrevPageBtn');
  if (nbPrevPageBtn) {
    nbPrevPageBtn.addEventListener('click', () => {
      if (window.notebook && window.notebook.currentPageIndex > 0) {
        window.notebook.currentPageIndex--;
        renderNotebookUI('panel');
        sfx.playPop();
      } else {
        showToast('You are on the first page', 'info');
      }
    });
  }

  const nbNextPageBtn = document.getElementById('nbNextPageBtn');
  if (nbNextPageBtn) {
    nbNextPageBtn.addEventListener('click', () => {
      if (window.notebook && window.notebook.currentPageIndex < window.notebook.pages.length - 1) {
        window.notebook.currentPageIndex++;
        renderNotebookUI('panel');
        sfx.playPop();
      } else {
        showToast('You are on the last page. Click "+ New Page" to add more!', 'info');
      }
    });
  }

  // Standalone Notebook Modal (Opened from Profile / Lobby)
  const openNbFromProfileBtn = document.getElementById('openNotebookFromProfileBtn');
  const standaloneNbModal = document.getElementById('standaloneNotebookModal');
  const closeStandaloneNbBtn = document.getElementById('closeStandaloneNotebookBtn');

  if (openNbFromProfileBtn && standaloneNbModal) {
    openNbFromProfileBtn.addEventListener('click', () => {
      profileModal.close();
      renderNotebookUI('modal');
      standaloneNbModal.showModal();
    });
  }

  if (closeStandaloneNbBtn && standaloneNbModal) {
    closeStandaloneNbBtn.addEventListener('click', () => standaloneNbModal.close());
  }

  const modalNbAddPageBtn = document.getElementById('modalNotebookAddPageBtn');
  if (modalNbAddPageBtn) {
    modalNbAddPageBtn.addEventListener('click', () => {
      const title = prompt('Enter title for notes page:', 'New Page');
      if (title && title.trim()) {
        window.notebook.addPage(title);
        renderNotebookUI('modal');
      }
    });
  }

  const modalNbDeletePageBtn = document.getElementById('modalNotebookDeletePageBtn');
  if (modalNbDeletePageBtn) {
    modalNbDeletePageBtn.addEventListener('click', () => {
      if (confirm('Delete this page?')) {
        window.notebook.deleteCurrentPage();
        renderNotebookUI('modal');
      }
    });
  }

  const modalNbPrevPageBtn = document.getElementById('modalNbPrevPageBtn');
  if (modalNbPrevPageBtn) {
    modalNbPrevPageBtn.addEventListener('click', () => {
      if (window.notebook && window.notebook.currentPageIndex > 0) {
        window.notebook.currentPageIndex--;
        renderNotebookUI('modal');
        sfx.playPop();
      } else {
        showToast('You are on the first page', 'info');
      }
    });
  }

  const modalNbNextPageBtn = document.getElementById('modalNbNextPageBtn');
  if (modalNbNextPageBtn) {
    modalNbNextPageBtn.addEventListener('click', () => {
      if (window.notebook && window.notebook.currentPageIndex < window.notebook.pages.length - 1) {
        window.notebook.currentPageIndex++;
        renderNotebookUI('modal');
        sfx.playPop();
      } else {
        showToast('You are on the last page. Click "+ New Page" to add more!', 'info');
      }
    });
  }

  const modalNbAIExplainBtn = document.getElementById('modalNbAIExplainBtn');
  if (modalNbAIExplainBtn) modalNbAIExplainBtn.addEventListener('click', () => handleAIMeaningLookup(false));

  const modalNbSaveNoteBtn = document.getElementById('modalNbSaveNoteBtn');
  if (modalNbSaveNoteBtn) modalNbSaveNoteBtn.addEventListener('click', () => handleAddNote(false));

  // Summary Text Persistence
  const summaryEl = document.getElementById('plannerSummaryText');
  const modalSummaryEl = document.getElementById('modalPlannerSummaryText');
  if (summaryEl) {
    const saved = localStorage.getItem('rootme_planner_summary');
    if (saved) summaryEl.innerText = saved;
    summaryEl.addEventListener('blur', () => {
      localStorage.setItem('rootme_planner_summary', summaryEl.innerText);
    });
  }
  if (modalSummaryEl) {
    const saved = localStorage.getItem('rootme_planner_summary');
    if (saved) modalSummaryEl.innerText = saved;
    modalSummaryEl.addEventListener('blur', () => {
      localStorage.setItem('rootme_planner_summary', modalSummaryEl.innerText);
    });
  }

  // In-Room Chat Form Submit
  const chatForm = document.getElementById('chatForm');
  const chatTextInput = document.getElementById('chatTextInput');
  if (chatForm && chatTextInput) {
    chatForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const text = chatTextInput.value.trim();
      if (!text || !state.currentRoom || !state.socket) return;

      const payload = {
        roomId: state.currentRoom.id,
        text,
        sender: state.currentUser.name,
        avatar: state.currentUser.avatar,
        photoUrl: state.currentUser.photoUrl,
        time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      };

      state.socket.emit('chat:send', payload);
      chatTextInput.value = '';
      sfx.playPop();
    });
  }

  // OpenAI API Key Settings Persistence
  const openAIKeyInput = document.getElementById('openAIKeyInput');
  const settingsModalEl = document.getElementById('settingsModal');
  const closeSettingsSaveBtn = document.getElementById('closeSettingsSaveBtn');

  if (settingsModalEl && openAIKeyInput) {
    document.getElementById('settingsBtn').addEventListener('click', () => {
      openAIKeyInput.value = localStorage.getItem('rootme_openai_key') || '';
    });
  }

  if (closeSettingsSaveBtn && openAIKeyInput) {
    closeSettingsSaveBtn.addEventListener('click', () => {
      const key = openAIKeyInput.value.trim();
      if (key) {
        localStorage.setItem('rootme_openai_key', key);
        showToast('OpenAI API Key saved for deep language analysis!', 'success');
      } else {
        localStorage.removeItem('rootme_openai_key');
      }
    });
  }

  // Global Keyboard Shortcuts
  window.addEventListener('keydown', (e) => {
    // Only if not focused in an input
    if (['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement.tagName)) return;

    if (e.key === 'm' || e.key === 'M') {
      const isMicOn = state.media.toggleMic();
      updateMicButtonUI(isMicOn);
    } else if (e.key === 'v' || e.key === 'V') {
      state.media.toggleVideo().then(isOn => updateVideoButtonUI(isOn));
    }
  });
}

// Toast Notifications Helper
function showToast(message, type = 'info') {
  const container = document.getElementById('toastContainer');
  if (!container) return;

  const toast = document.createElement('div');
  toast.className = `toast ${type}`;

  const icon = type === 'success' ? '✓' : (type === 'error' ? '✕' : 'ℹ');
  toast.innerHTML = `<span style="font-weight:700;">${icon}</span> <span>${escapeHtml(message)}</span>`;

  container.appendChild(toast);
  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(-10px)';
    toast.style.transition = 'all 0.3s ease';
    setTimeout(() => toast.remove(), 300);
  }, 3200);
}

// Utility: Escape HTML
function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
