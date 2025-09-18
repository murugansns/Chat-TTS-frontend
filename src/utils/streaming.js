class EventSourceStream {
  constructor(url, options = {}) {
    this.url = url;
    this.options = options;
    this.eventSource = null;
    this.listeners = new Map();
    this.isConnected = false;
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = options.maxReconnectAttempts || 5;
    this.reconnectDelay = options.reconnectDelay || 1000;
  }

  connect() {
    if (this.eventSource) {
      this.close();
    }

    this.eventSource = new EventSource(this.url);
    this.isConnected = true;
    this.reconnectAttempts = 0;

    this.eventSource.onopen = () => {
      console.log('SSE connection opened');
      this.emit('open');
    };

    this.eventSource.onmessage = (event) => {
      this.emit('message', event);
    };

    this.eventSource.onerror = (error) => {
      console.error('SSE error:', error);
      this.emit('error', error);
      
      if (this.reconnectAttempts < this.maxReconnectAttempts) {
        this.reconnectAttempts++;
        console.log(`Attempting to reconnect (${this.reconnectAttempts}/${this.maxReconnectAttempts})...`);
        setTimeout(() => this.connect(), this.reconnectDelay);
      } else {
        this.close();
      }
    };

    // Set up event listeners
    this.eventSource.addEventListener('token', (event) => {
      try {
        const data = JSON.parse(event.data);
        this.emit('token', data);
      } catch (e) {
        console.error('Error parsing token event:', e);
      }
    });

    this.eventSource.addEventListener('audio', (event) => {
      try {
        const data = JSON.parse(event.data);
        this.emit('audio', data);
      } catch (e) {
        console.error('Error parsing audio event:', e);
      }
    });

    this.eventSource.addEventListener('error', (event) => {
      try {
        const data = JSON.parse(event.data);
        this.emit('api_error', data);
      } catch (e) {
        console.error('Error parsing error event:', e);
      }
    });

    this.eventSource.addEventListener('done', () => {
      this.emit('done');
    });
  }

  on(event, callback) {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event).add(callback);
    return () => this.off(event, callback);
  }

  off(event, callback) {
    if (this.listeners.has(event)) {
      this.listeners.get(event).delete(callback);
    }
  }

  emit(event, data) {
    if (this.listeners.has(event)) {
      for (const callback of this.listeners.get(event)) {
        try {
          callback(data);
        } catch (e) {
          console.error(`Error in ${event} handler:`, e);
        }
      }
    }
  }

  close() {
    if (this.eventSource) {
      this.eventSource.close();
      this.eventSource = null;
      this.isConnected = false;
      this.emit('close');
    }
  }
}

export default EventSourceStream;
