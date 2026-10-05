/**
 * Collaborative Real-Time Whiteboard
 */
class RoomWhiteboard {
  constructor(canvasId, socket) {
    this.canvas = document.getElementById(canvasId);
    if (!this.canvas) return;
    this.ctx = this.canvas.getContext('2d');
    this.socket = socket;

    this.isDrawing = false;
    this.currentTool = 'brush'; // 'brush' or 'eraser'
    this.currentColor = '#ffffff';
    this.lineWidth = 4;
    this.lastX = 0;
    this.lastY = 0;

    this.initCanvasSize();
    this.setupListeners();
  }

  initCanvasSize() {
    const rect = this.canvas.parentElement.getBoundingClientRect();
    if (rect.width > 0 && rect.height > 0) {
      this.canvas.width = rect.width;
      this.canvas.height = Math.max(rect.height, 480);
    }
    this.ctx.lineCap = 'round';
    this.ctx.lineJoin = 'round';
  }

  setupListeners() {
    // Mouse events
    this.canvas.addEventListener('mousedown', (e) => this.startDrawing(e));
    this.canvas.addEventListener('mousemove', (e) => this.draw(e));
    this.canvas.addEventListener('mouseup', () => this.stopDrawing());
    this.canvas.addEventListener('mouseleave', () => this.stopDrawing());

    // Touch events for mobile/tablet stylus
    this.canvas.addEventListener('touchstart', (e) => {
      e.preventDefault();
      const touch = e.touches[0];
      const mouseEvent = new MouseEvent('mousedown', {
        clientX: touch.clientX,
        clientY: touch.clientY
      });
      this.canvas.dispatchEvent(mouseEvent);
    }, { passive: false });

    this.canvas.addEventListener('touchmove', (e) => {
      e.preventDefault();
      const touch = e.touches[0];
      const mouseEvent = new MouseEvent('mousemove', {
        clientX: touch.clientX,
        clientY: touch.clientY
      });
      this.canvas.dispatchEvent(mouseEvent);
    }, { passive: false });

    this.canvas.addEventListener('touchend', () => {
      this.stopDrawing();
    });

    // Remote socket draw events
    if (this.socket) {
      this.socket.on('whiteboard:draw-remote', (stroke) => {
        this.renderRemoteStroke(stroke);
      });

      this.socket.on('whiteboard:clear-remote', () => {
        this.clearLocal();
      });
    }
  }

  getCoordinates(e) {
    const rect = this.canvas.getBoundingClientRect();
    return {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top
    };
  }

  startDrawing(e) {
    this.isDrawing = true;
    const { x, y } = this.getCoordinates(e);
    this.lastX = x;
    this.lastY = y;
  }

  draw(e) {
    if (!this.isDrawing) return;
    const { x, y } = this.getCoordinates(e);

    const stroke = {
      fromX: this.lastX,
      fromY: this.lastY,
      toX: x,
      toY: y,
      color: this.currentTool === 'eraser' ? '#0f172a' : this.currentColor,
      width: this.currentTool === 'eraser' ? this.lineWidth * 3 : this.lineWidth
    };

    this.drawSegment(stroke);

    if (this.socket) {
      this.socket.emit('whiteboard:draw', stroke);
    }

    this.lastX = x;
    this.lastY = y;
  }

  stopDrawing() {
    this.isDrawing = false;
  }

  drawSegment(stroke) {
    this.ctx.beginPath();
    this.ctx.moveTo(stroke.fromX, stroke.fromY);
    this.ctx.lineTo(stroke.toX, stroke.toY);
    this.ctx.strokeStyle = stroke.color;
    this.ctx.lineWidth = stroke.width;
    this.ctx.stroke();
    this.ctx.closePath();
  }

  renderRemoteStroke(stroke) {
    this.drawSegment(stroke);
  }

  clear() {
    this.clearLocal();
    if (this.socket) {
      this.socket.emit('whiteboard:clear');
    }
  }

  clearLocal() {
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
  }
}

window.RoomWhiteboard = RoomWhiteboard;
