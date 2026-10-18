/**
 * WebRTC and Audio Engine for RootMe Talk
 * Handles Peer Connections, Media Streams, Screen Sharing & Web Audio API Visualizer
 * Fully hardened with W3C Perfect Negotiation, TURN relay traversal, mobile autoplay unlock, and resilient microphone initialization
 */
class MediaManager {
  constructor(socket) {
    this.socket = socket;
    this.localStream = null;
    this.screenStream = null;
    this.peers = new Map(); // peerId -> RTCPeerConnection
    this.candidateQueue = new Map(); // peerId -> RTCIceCandidateInit[]

    this.isMicMuted = false;
    this.isVideoEnabled = false;
    this.isScreenSharing = false;
    this.isDeafened = false;

    this.hasRealAudio = false;
    this.micError = null;

    // Web Audio Analyzer for speaking indicators
    this.audioCtx = null;
    this.analyser = null;
    this.micSource = null;
    this.speakingCheckInterval = null;
    this.isSpeaking = false;

    // Redundant STUN + TURN Relay Servers for guaranteed cross-network / mobile NAT traversal
    this.rtcConfig = {
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
        { urls: 'stun:stun2.l.google.com:19302' },
        { urls: 'stun:stun3.l.google.com:19302' },
        { urls: 'stun:stun4.l.google.com:19302' },
        { urls: 'stun:openrelay.metered.ca:80' },
        {
          urls: [
            'turn:openrelay.metered.ca:80',
            'turn:openrelay.metered.ca:443',
            'turn:openrelay.metered.ca:443?transport=tcp'
          ],
          username: 'openrelayproject',
          credential: 'openrelayproject'
        }
      ]
    };

    // Auto resume audio context & unlock remote audio on user interaction
    const unlockUserAudio = () => {
      this.unlockAudioPlayback();
    };
    document.addEventListener('click', unlockUserAudio, { passive: true });
    document.addEventListener('touchstart', unlockUserAudio, { passive: true });

    this.setupSocketSignaling();
  }

  // Unlocks audio context and remote playback on mobile browsers
  unlockAudioPlayback() {
    if (this.audioCtx && this.audioCtx.state === 'suspended') {
      this.audioCtx.resume().catch(() => {});
    }
    const audioTags = document.querySelectorAll('audio.remote-audio, #remoteAudioContainer audio');
    audioTags.forEach(a => {
      if (a.paused && a.srcObject) {
        a.play().catch(() => {});
      }
    });
    const prompt = document.getElementById('audioUnlockPrompt');
    if (prompt) prompt.style.display = 'none';
  }

  // Request user mic & optional camera
  async initLocalMedia(video = false) {
    const isLocalhost = location.hostname === 'localhost' || location.hostname === '127.0.0.1';
    const isSecure = window.isSecureContext || isLocalhost;

    // Mobile browsers (iOS Safari & Android Chrome) strictly require HTTPS for getUserMedia
    if (!isSecure) {
      const msg = 'Microphone requires HTTPS on mobile devices. (Access via https:// or run an HTTPS tunnel)';
      console.warn('[WebRTC]', msg);
      this.micError = 'insecure_context';
      this.hasRealAudio = false;
      if (this.onMicPermissionError) {
        this.onMicPermissionError(this.micError, msg);
      }
      this.localStream = this.createSilentAudioStream();
      return this.localStream;
    }

    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      const msg = 'Media devices API is not supported or permitted on this connection.';
      console.warn('[WebRTC]', msg);
      this.micError = 'not_supported';
      this.hasRealAudio = false;
      if (this.onMicPermissionError) {
        this.onMicPermissionError(this.micError, msg);
      }
      this.localStream = this.createSilentAudioStream();
      return this.localStream;
    }

    try {
      if (this.localStream) {
        this.stopLocalMedia();
      }

      // Try with full constraints first
      let stream = null;
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true
          },
          video: video ? { width: { ideal: 640 }, height: { ideal: 480 } } : false
        });
      } catch (constraintErr) {
        console.warn('[WebRTC] Full constraints failed, attempting fallback { audio: true }:', constraintErr.message);
        // Fallback for strict mobile devices
        stream = await navigator.mediaDevices.getUserMedia({
          audio: true,
          video: video ? true : false
        });
      }

      this.localStream = stream;
      this.hasRealAudio = true;
      this.micError = null;
      this.isVideoEnabled = video;
      this.isMicMuted = false;

      // Start Web Audio API Volume Analyzer
      this.startAudioAnalysis();

      // If peer connections were already established, attach active tracks now
      this.addLocalTracksToAllPeers();

      if (this.onMicReady) {
        this.onMicReady();
      }

      return this.localStream;
    } catch (err) {
      console.warn('[WebRTC] Microphone/camera access note:', err.name, err.message);
      this.micError = err.name || 'permission_denied';
      this.hasRealAudio = false;
      if (this.onMicPermissionError) {
        this.onMicPermissionError(this.micError, err.message);
      }
      // Fallback: create silent audio track so WebRTC can still connect without crashing
      this.localStream = this.createSilentAudioStream();
      return this.localStream;
    }
  }

  // Create an active dummy audio stream (via GainNode at 0) so WebRTC SDP includes audio m-line cleanly
  createSilentAudioStream() {
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      gain.gain.value = 0;
      const dst = ctx.createMediaStreamDestination();
      osc.connect(gain);
      gain.connect(dst);
      osc.start();
      const track = dst.stream.getAudioTracks()[0];
      if (track) track.enabled = true;
      return dst.stream;
    } catch (e) {
      return new MediaStream();
    }
  }

  // Update existing peer connections with newly acquired audio tracks
  addLocalTracksToAllPeers() {
    if (!this.localStream) return;
    const tracks = this.localStream.getTracks();
    this.peers.forEach((pc) => {
      const senders = pc.getSenders();
      tracks.forEach(track => {
        const sender = senders.find(s => s.track && s.track.kind === track.kind);
        if (sender) {
          sender.replaceTrack(track).catch(() => {});
        } else {
          try {
            pc.addTrack(track, this.localStream);
          } catch (e) {}
        }
      });
    });
  }

  startAudioAnalysis() {
    try {
      if (!this.localStream || this.localStream.getAudioTracks().length === 0) return;

      if (!this.audioCtx || this.audioCtx.state === 'closed') {
        this.audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      }
      if (this.audioCtx.state === 'suspended') {
        this.audioCtx.resume().catch(() => {});
      }

      this.analyser = this.audioCtx.createAnalyser();
      this.analyser.fftSize = 256;
      this.analyser.smoothingTimeConstant = 0.3;

      this.micSource = this.audioCtx.createMediaStreamSource(this.localStream);
      this.micSource.connect(this.analyser);

      const bufferLength = this.analyser.frequencyBinCount;
      const dataArray = new Uint8Array(bufferLength);

      clearInterval(this.speakingCheckInterval);
      this.speakingCheckInterval = setInterval(() => {
        if (this.isMicMuted || !this.analyser || !this.hasRealAudio) {
          if (this.isSpeaking) this.setSpeakingState(false);
          return;
        }

        if (this.audioCtx && this.audioCtx.state === 'suspended') {
          this.audioCtx.resume().catch(() => {});
        }

        this.analyser.getByteFrequencyData(dataArray);
        let sum = 0;
        let peak = 0;
        for (let i = 0; i < bufferLength; i++) {
          const val = dataArray[i];
          sum += val;
          if (val > peak) peak = val;
        }
        const average = sum / bufferLength;

        // Ultra-responsive speaking detection
        const currentlySpeaking = (average > 7 || peak > 24);
        if (currentlySpeaking !== this.isSpeaking) {
          this.setSpeakingState(currentlySpeaking);
        }
      }, 100);
    } catch (e) {
      console.warn('Audio analysis setup note:', e);
    }
  }

  setSpeakingState(speaking) {
    this.isSpeaking = speaking;
    if (this.onLocalSpeakingChanged) {
      this.onLocalSpeakingChanged(speaking);
    }
    if (this.socket) {
      this.socket.emit('peer:state-change', { isSpeaking: speaking });
    }
  }

  // Toggle Microphone Mute
  async toggleMic() {
    // If real mic was not captured yet, attempt capture on user tap
    if (!this.hasRealAudio && !this.micError) {
      await this.initLocalMedia();
      if (this.hasRealAudio) {
        this.isMicMuted = false;
        if (this.socket) this.socket.emit('peer:state-change', { isMuted: false });
        return true;
      }
    }

    if (!this.localStream) return false;
    const audioTrack = this.localStream.getAudioTracks()[0];
    if (audioTrack) {
      audioTrack.enabled = !audioTrack.enabled;
      this.isMicMuted = !audioTrack.enabled;

      if (this.isMicMuted && this.isSpeaking) {
        this.setSpeakingState(false);
      }

      if (this.socket) {
        this.socket.emit('peer:state-change', { isMuted: this.isMicMuted });
      }
      return !this.isMicMuted;
    }
    return false;
  }

  // Toggle Video Camera
  async toggleVideo() {
    try {
      if (this.isVideoEnabled) {
        this.localStream.getVideoTracks().forEach(t => {
          t.stop();
          this.localStream.removeTrack(t);
        });
        this.isVideoEnabled = false;

        this.peers.forEach(pc => {
          const senders = pc.getSenders();
          const videoSender = senders.find(s => s.track && s.track.kind === 'video');
          if (videoSender) pc.removeTrack(videoSender);
        });
      } else {
        const vStream = await navigator.mediaDevices.getUserMedia({
          video: { width: { ideal: 640 }, height: { ideal: 480 } }
        });
        const newTrack = vStream.getVideoTracks()[0];
        this.localStream.addTrack(newTrack);
        this.isVideoEnabled = true;

        this.peers.forEach(pc => {
          pc.addTrack(newTrack, this.localStream);
        });
      }

      if (this.socket) {
        this.socket.emit('peer:state-change', { isVideoOn: this.isVideoEnabled });
      }
      return this.isVideoEnabled;
    } catch (err) {
      console.warn('Video toggle error:', err);
      return false;
    }
  }

  // Toggle Screen Sharing
  async toggleScreenShare() {
    try {
      if (this.isScreenSharing) {
        if (this.screenStream) {
          this.screenStream.getTracks().forEach(t => t.stop());
          this.screenStream = null;
        }
        this.isScreenSharing = false;
        return false;
      } else {
        this.screenStream = await navigator.mediaDevices.getDisplayMedia({ video: true });
        const screenTrack = this.screenStream.getVideoTracks()[0];

        screenTrack.onended = () => {
          this.isScreenSharing = false;
          if (this.onScreenShareEnded) this.onScreenShareEnded();
        };

        this.peers.forEach(pc => {
          const senders = pc.getSenders();
          const sender = senders.find(s => s.track && s.track.kind === 'video');
          if (sender) {
            sender.replaceTrack(screenTrack);
          } else {
            pc.addTrack(screenTrack, this.screenStream);
          }
        });

        this.isScreenSharing = true;
        return true;
      }
    } catch (err) {
      console.warn('Screen share cancelled/failed:', err);
      return false;
    }
  }

  // Toggle Deafen (mute incoming audio)
  toggleDeafen() {
    this.isDeafened = !this.isDeafened;
    const audioTags = document.querySelectorAll('audio.remote-audio, #remoteAudioContainer audio');
    audioTags.forEach(a => {
      a.muted = this.isDeafened;
    });
    return this.isDeafened;
  }

  // Drain queued ICE candidates once remote description is successfully set
  async drainCandidateQueue(peerId, pc) {
    if (this.candidateQueue.has(peerId)) {
      const candidates = this.candidateQueue.get(peerId);
      this.candidateQueue.delete(peerId);
      for (const cand of candidates) {
        try {
          await pc.addIceCandidate(new RTCIceCandidate(cand));
        } catch (e) {
          console.warn('[WebRTC] Error adding queued ICE candidate:', e);
        }
      }
    }
  }

  // WebRTC Mesh Peer Connection Setup with W3C Perfect Negotiation
  setupSocketSignaling() {
    if (!this.socket) return;

    this.socket.on('signal:offer', async ({ from, offer }) => {
      try {
        let pc = this.peers.get(from);
        if (!pc) {
          pc = this.createPeerConnection(from);
        }

        const isPolite = (this.socket.id || '').localeCompare(from) < 0;
        const offerCollision = (pc.signalingState !== 'stable');

        if (offerCollision) {
          if (!isPolite) {
            console.log(`[WebRTC] Glare collision with ${from}. Impolite peer ignoring offer.`);
            return;
          }
          console.log(`[WebRTC] Glare collision with ${from}. Polite peer rolling back.`);
          await pc.setLocalDescription({ type: 'rollback' });
        }

        await pc.setRemoteDescription(new RTCSessionDescription(offer));
        await this.drainCandidateQueue(from, pc);

        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);

        this.socket.emit('signal:answer', {
          to: from,
          answer
        });
      } catch (err) {
        console.error('[WebRTC] Error handling signal:offer:', err);
      }
    });

    this.socket.on('signal:answer', async ({ from, answer }) => {
      try {
        const pc = this.peers.get(from);
        if (pc && pc.signalingState === 'have-local-offer') {
          await pc.setRemoteDescription(new RTCSessionDescription(answer));
          await this.drainCandidateQueue(from, pc);
        }
      } catch (err) {
        console.error('[WebRTC] Error handling signal:answer:', err);
      }
    });

    this.socket.on('signal:ice-candidate', async ({ from, candidate }) => {
      if (!candidate) return;
      try {
        const pc = this.peers.get(from);
        if (!pc || !pc.remoteDescription || !pc.remoteDescription.type) {
          if (!this.candidateQueue.has(from)) {
            this.candidateQueue.set(from, []);
          }
          this.candidateQueue.get(from).push(candidate);
          return;
        }
        await pc.addIceCandidate(new RTCIceCandidate(candidate));
      } catch (e) {
        console.warn('[WebRTC] ICE candidate add error:', e);
      }
    });
  }

  // Create a connection to a specific peer
  createPeerConnection(peerId) {
    if (this.peers.has(peerId)) {
      try {
        this.peers.get(peerId).close();
      } catch (e) {}
    }

    const pc = new RTCPeerConnection(this.rtcConfig);
    this.peers.set(peerId, pc);

    // Add local tracks if available
    if (this.localStream) {
      this.localStream.getTracks().forEach(track => {
        try {
          pc.addTrack(track, this.localStream);
        } catch (e) {}
      });
    }

    // Handle ICE Candidates
    pc.onicecandidate = (event) => {
      if (event.candidate && this.socket) {
        this.socket.emit('signal:ice-candidate', {
          to: peerId,
          candidate: event.candidate
        });
      }
    };

    // Handle Remote Track Received with unified stream fallback
    pc.ontrack = (event) => {
      console.log(`[WebRTC] Received remote track (${event.track.kind}) from peer: ${peerId}`);
      let stream = (event.streams && event.streams[0]) ? event.streams[0] : null;
      if (!stream) {
        stream = new MediaStream([event.track]);
      }
      if (this.onRemoteTrack) {
        this.onRemoteTrack(peerId, stream, event.track);
      }
    };

    pc.onconnectionstatechange = () => {
      console.log(`[WebRTC] Peer ${peerId} connection state: ${pc.connectionState}`);
    };

    pc.oniceconnectionstatechange = () => {
      console.log(`[WebRTC] Peer ${peerId} ICE connection state: ${pc.iceConnectionState}`);
      if (pc.iceConnectionState === 'failed') {
        console.warn(`[WebRTC] ICE failed for peer ${peerId}, attempting ICE restart...`);
        try {
          pc.restartIce();
        } catch (e) {}
      }
    };

    return pc;
  }

  // Initiate call to a newly joined peer
  async connectToPeer(peerId) {
    try {
      const pc = this.createPeerConnection(peerId);
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);

      this.socket.emit('signal:offer', {
        to: peerId,
        offer
      });
    } catch (err) {
      console.error('[WebRTC] Failed to connect to peer:', peerId, err);
    }
  }

  // Disconnect from peer
  closePeerConnection(peerId) {
    const pc = this.peers.get(peerId);
    if (pc) {
      pc.close();
      this.peers.delete(peerId);
    }
    this.candidateQueue.delete(peerId);
  }

  // Stop all media when leaving room
  stopLocalMedia() {
    clearInterval(this.speakingCheckInterval);
    if (this.audioCtx) {
      this.audioCtx.close().catch(() => {});
      this.audioCtx = null;
    }
    if (this.localStream) {
      this.localStream.getTracks().forEach(track => track.stop());
      this.localStream = null;
    }
    if (this.screenStream) {
      this.screenStream.getTracks().forEach(track => track.stop());
      this.screenStream = null;
    }
    this.peers.forEach(pc => pc.close());
    this.peers.clear();
    this.candidateQueue.clear();
    this.hasRealAudio = false;
    this.micError = null;
  }
}

window.MediaManager = MediaManager;
