/**
 * WebRTC and Audio Engine for RootMe Talk
 * Handles Peer Connections, Media Streams, Screen Sharing & Web Audio API Visualizer
 * Fully hardened with W3C Perfect Negotiation, ICE candidate queuing, and responsive speaking detection
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

    // Web Audio Analyzer for speaking indicators
    this.audioCtx = null;
    this.analyser = null;
    this.micSource = null;
    this.speakingCheckInterval = null;
    this.isSpeaking = false;

    // Global STUN Servers for reliable cross-network WebRTC NAT traversal
    this.rtcConfig = {
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
        { urls: 'stun:stun2.l.google.com:19302' },
        { urls: 'stun:stun3.l.google.com:19302' },
        { urls: 'stun:stun4.l.google.com:19302' }
      ]
    };

    // Auto resume audio context on any user interaction
    const resumeAudio = () => {
      if (this.audioCtx && this.audioCtx.state === 'suspended') {
        this.audioCtx.resume().catch(() => {});
      }
    };
    document.addEventListener('click', resumeAudio, { passive: true });
    document.addEventListener('touchstart', resumeAudio, { passive: true });

    this.setupSocketSignaling();
  }

  // Request user mic & optional camera
  async initLocalMedia(video = false) {
    try {
      if (this.localStream) {
        this.stopLocalMedia();
      }

      const constraints = {
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        },
        video: video ? { width: { ideal: 640 }, height: { ideal: 480 } } : false
      };

      this.localStream = await navigator.mediaDevices.getUserMedia(constraints);
      this.isVideoEnabled = video;

      // Start Web Audio API Volume Analyzer
      this.startAudioAnalysis();

      return this.localStream;
    } catch (err) {
      console.warn('Microphone/camera access note:', err.message);
      // Fallback: create silent audio track so WebRTC can still connect without crash
      this.localStream = this.createSilentAudioStream();
      return this.localStream;
    }
  }

  createSilentAudioStream() {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = ctx.createOscillator();
    const dst = osc.connect(ctx.createMediaStreamDestination());
    osc.start();
    const track = dst.stream.getAudioTracks()[0];
    track.enabled = false;
    return new MediaStream([track]);
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
        if (this.isMicMuted || !this.analyser) {
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

        // Ultra-responsive speaking detection: triggered by low volume speech or peaks
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
  toggleMic() {
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
        // Stop video tracks
        this.localStream.getVideoTracks().forEach(t => {
          t.stop();
          this.localStream.removeTrack(t);
        });
        this.isVideoEnabled = false;

        // Update peers
        this.peers.forEach(pc => {
          const senders = pc.getSenders();
          const videoSender = senders.find(s => s.track && s.track.kind === 'video');
          if (videoSender) pc.removeTrack(videoSender);
        });
      } else {
        // Request video stream
        const vStream = await navigator.mediaDevices.getUserMedia({
          video: { width: { ideal: 640 }, height: { ideal: 480 } }
        });
        const newTrack = vStream.getVideoTracks()[0];
        this.localStream.addTrack(newTrack);
        this.isVideoEnabled = true;

        // Replace or add track on peers
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
    // Mute or unmute all remote audio tags
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

    // Add local tracks
    if (this.localStream) {
      this.localStream.getTracks().forEach(track => {
        pc.addTrack(track, this.localStream);
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
  }
}

window.MediaManager = MediaManager;
