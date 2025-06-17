# WebSocket Real-Time Communication Design - BMTC Transit App

## Overview

The WebSocket communication system enables real-time bidirectional communication between mobile clients and the backend services. This system handles live location updates, instant notifications, and real-time transit information distribution with sub-second latency.

## WebSocket Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                          CLIENT APPLICATIONS                                │
│                                                                             │
│  ┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐          │
│  │   Mobile App    │    │   Mobile App    │    │  Web Dashboard  │          │
│  │   (Android)     │    │    (iOS)        │    │    (Admin)      │          │
│  │                 │    │                 │    │                 │          │
│  │ • Socket.IO     │    │ • Socket.IO     │    │ • Socket.IO     │          │
│  │   Client        │    │   Client        │    │   Client        │          │
│  │ • Auto-reconnect│    │ • Auto-reconnect│    │ • Real-time     │          │
│  │ • Channel Mgmt  │    │ • Channel Mgmt  │    │   Monitoring    │          │
│  │ • Offline Queue │    │ • Offline Queue │    │ • Analytics     │          │
│  └─────────────────┘    └─────────────────┘    └─────────────────┘          │
└─────────────┬─────────────────┬─────────────────────┬─────────────────────────┘
              │                 │                     │
              │        WSS://   │                     │
              │     (WebSocket  │                     │
              │      Secure)    │                     │
              │                 │                     │
┌─────────────▼─────────────────▼─────────────────────▼─────────────────────────┐
│                         LOAD BALANCER                                       │
│                                                                             │
│  • Sticky Sessions (Session Affinity)                                       │
│  • WebSocket Protocol Upgrade Handling                                      │
│  • Health Check Integration                                                 │
│  • SSL/TLS Termination                                                      │
│  • Rate Limiting and DDoS Protection                                        │
└─────────────┬─────────────────┬─────────────────────┬─────────────────────────┘
              │                 │                     │
┌─────────────▼─────────────────▼─────────────────────▼─────────────────────────┐
│                      WEBSOCKET GATEWAY CLUSTER                              │
│                                                                             │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐              │
│  │   Gateway       │  │   Gateway       │  │   Gateway       │              │
│  │   Instance 1    │  │   Instance 2    │  │   Instance 3    │              │
│  │                 │  │                 │  │                 │              │
│  │ • Socket.IO     │  │ • Socket.IO     │  │ • Socket.IO     │              │
│  │   Server        │  │   Server        │  │   Server        │              │
│  │ • Connection    │  │ • Connection    │  │ • Connection    │              │
│  │   Management    │  │   Management    │  │   Management    │              │
│  │ • Channel       │  │ • Channel       │  │ • Channel       │              │
│  │   Subscriptions │  │   Subscriptions │  │   Subscriptions │              │
│  │ • Message       │  │ • Message       │  │ • Message       │              │
│  │   Broadcasting  │  │   Broadcasting  │  │   Broadcasting  │              │
│  └─────────────────┘  └─────────────────┘  └─────────────────┘              │
│            │                    │                    │                      │
│            └────────────────────┼────────────────────┘                      │
│                                 │                                           │
│  ┌─────────────────────────────────────────────────────────────────────────┐  │
│  │                    Message Distribution Hub                             │  │
│  │                                                                         │  │
│  │  • Redis Pub/Sub for Inter-Gateway Communication                        │  │
│  │  • Channel Management and User Presence                                 │  │
│  │  • Message Routing and Broadcasting                                     │  │
│  │  • Connection State Synchronization                                     │  │
│  └─────────────────────────────────────────────────────────────────────────┘  │
└─────────────┬─────────────────────────────────────────────────────────────────┘
              │
┌─────────────▼─────────────────────────────────────────────────────────────────┐
│                        MESSAGE PROCESSING LAYER                             │
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────────┐  │
│  │                      Kafka Message Broker                              │  │
│  │                                                                         │  │
│  │  Topic: location-updates        Topic: system-notifications            │  │
│  │  ├─ Partition by route_id       ├─ Partition by user_id                │  │
│  │  ├─ Real-time location data     ├─ Push notifications                  │  │
│  │  └─ Vehicle movements           └─ System alerts                        │  │
│  │                                                                         │  │
│  │  Topic: service-alerts          Topic: user-events                     │  │
│  │  ├─ Partition by route_id       ├─ Partition by user_id                │  │
│  │  ├─ Service disruptions         ├─ Achievement unlocks                 │  │
│  │  └─ Crowding updates            └─ Leaderboard updates                 │  │
│  └─────────────────────────────────────────────────────────────────────────┘  │
│                                      │                                        │
│  ┌─────────────────────────────────────────────────────────────────────────┐  │
│  │                   Stream Processing Services                            │  │
│  │                                                                         │  │
│  │  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐          │  │
│  │  │   Location      │  │   Notification  │  │   Analytics     │          │  │
│  │  │   Processor     │  │   Processor     │  │   Processor     │          │  │
│  │  │                 │  │                 │  │                 │          │  │
│  │  │ • Real-time     │  │ • Push Notif    │  │ • Usage Metrics │          │  │
│  │  │   Validation    │  │   Generation    │  │ • Performance   │          │  │
│  │  │ • Aggregation   │  │ • Alert         │  │   Monitoring    │          │  │
│  │  │ • Distribution  │  │   Processing    │  │ • Real-time     │          │  │
│  │  └─────────────────┘  └─────────────────┘  │   Dashboards    │          │  │
│  │                                            └─────────────────┘          │  │
│  └─────────────────────────────────────────────────────────────────────────┘  │
└─────────────┬─────────────────────────────────────────────────────────────────┘
              │
┌─────────────▼─────────────────────────────────────────────────────────────────┐
│                         DATA STORAGE LAYER                                  │
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────────┐  │
│  │                      Redis Cluster                                     │  │
│  │                                                                         │  │
│  │  • WebSocket Connection State                                           │  │
│  │  • User Presence and Session Management                                 │  │
│  │  • Channel Subscriptions and Routing                                    │  │
│  │  • Real-time Data Cache                                                 │  │
│  │  • Message Queue for Offline Users                                      │  │
│  └─────────────────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────────────┘
```

## WebSocket Connection Management

### 1. Connection Lifecycle

```typescript
interface WebSocketConnectionManager {
  establishConnection(userId: string, deviceInfo: DeviceInfo): Promise<ConnectionResult>;
  handleAuthentication(socket: Socket, token: string): Promise<AuthResult>;
  manageHeartbeat(socket: Socket): void;
  handleDisconnection(socket: Socket): Promise<void>;
  handleReconnection(socket: Socket, sessionId: string): Promise<ReconnectionResult>;
}

interface ConnectionState {
  socketId: string;
  userId: string;
  sessionId: string;
  deviceType: 'android' | 'ios' | 'web';
  connectedAt: Date;
  lastHeartbeat: Date;
  subscriptions: ChannelSubscription[];
  presence: UserPresence;
}

class WebSocketConnectionManager implements WebSocketConnectionManager {
  private connections = new Map<string, ConnectionState>();
  private redis: RedisClient;
  private io: Server;
  
  async establishConnection(userId: string, deviceInfo: DeviceInfo): Promise<ConnectionResult> {
    const sessionId = this.generateSessionId();
    const socket = this.io.sockets.sockets.get(socketId);
    
    const connectionState: ConnectionState = {
      socketId: socket.id,
      userId,
      sessionId,
      deviceType: deviceInfo.platform,
      connectedAt: new Date(),
      lastHeartbeat: new Date(),
      subscriptions: [],
      presence: UserPresence.ONLINE
    };
    
    // Store connection state in Redis for cluster synchronization
    await this.redis.setex(
      `connection:${socket.id}`,
      3600, // 1 hour TTL
      JSON.stringify(connectionState)
    );
    
    this.connections.set(socket.id, connectionState);
    
    // Set up heartbeat monitoring
    this.manageHeartbeat(socket);
    
    return {
      success: true,
      sessionId,
      serverTime: new Date().toISOString()
    };
  }
  
  manageHeartbeat(socket: Socket): void {
    const heartbeatInterval = setInterval(() => {
      socket.emit('ping', { timestamp: Date.now() });
    }, 30000); // 30 seconds
    
    socket.on('pong', (data) => {
      const connection = this.connections.get(socket.id);
      if (connection) {
        connection.lastHeartbeat = new Date();
        this.updateConnectionState(socket.id, connection);
      }
    });
    
    socket.on('disconnect', () => {
      clearInterval(heartbeatInterval);
    });
  }
  
  async handleDisconnection(socket: Socket): Promise<void> {
    const connection = this.connections.get(socket.id);
    if (!connection) return;
    
    // Update user presence
    await this.updateUserPresence(connection.userId, UserPresence.OFFLINE);
    
    // Clean up subscriptions
    await this.cleanupSubscriptions(socket.id);
    
    // Remove from local cache
    this.connections.delete(socket.id);
    
    // Remove from Redis
    await this.redis.del(`connection:${socket.id}`);
    
    console.log(`User ${connection.userId} disconnected from socket ${socket.id}`);
  }
}
```

### 2. Channel Subscription System

```typescript
interface ChannelManager {
  subscribeToChannel(socket: Socket, channelName: string, filters?: ChannelFilters): Promise<SubscriptionResult>;
  unsubscribeFromChannel(socket: Socket, channelName: string): Promise<void>;
  broadcastToChannel(channelName: string, message: ChannelMessage): Promise<void>;
  getUserSubscriptions(userId: string): Promise<ChannelSubscription[]>;
}

interface ChannelSubscription {
  channelName: string;
  filters: ChannelFilters;
  subscribedAt: Date;
  messageCount: number;
}

enum ChannelType {
  ROUTE_UPDATES = 'route_updates',
  STOP_ARRIVALS = 'stop_arrivals',
  SERVICE_ALERTS = 'service_alerts',
  USER_NOTIFICATIONS = 'user_notifications',
  SYSTEM_ANNOUNCEMENTS = 'system_announcements',
  LEADERBOARD_UPDATES = 'leaderboard_updates'
}

class ChannelManager implements ChannelManager {
  private subscriptions = new Map<string, Set<string>>(); // channelName -> socketIds
  private userChannels = new Map<string, Set<string>>(); // userId -> channelNames
  
  async subscribeToChannel(
    socket: Socket, 
    channelName: string, 
    filters?: ChannelFilters
  ): Promise<SubscriptionResult> {
    const connection = await this.getConnectionState(socket.id);
    if (!connection) {
      throw new Error('Connection not found');
    }
    
    // Validate subscription permissions
    const hasPermission = await this.validateChannelPermission(
      connection.userId, 
      channelName, 
      filters
    );
    
    if (!hasPermission) {
      return {
        success: false,
        error: 'Insufficient permissions for channel subscription'
      };
    }
    
    // Add to subscription tracking
    if (!this.subscriptions.has(channelName)) {
      this.subscriptions.set(channelName, new Set());
    }
    this.subscriptions.get(channelName)!.add(socket.id);
    
    // Join Socket.IO room
    socket.join(channelName);
    
    // Update user's channel list
    if (!this.userChannels.has(connection.userId)) {
      this.userChannels.set(connection.userId, new Set());
    }
    this.userChannels.get(connection.userId)!.add(channelName);
    
    // Store subscription in Redis for cluster synchronization
    await this.redis.sadd(`channel:${channelName}:subscribers`, socket.id);
    await this.redis.sadd(`user:${connection.userId}:channels`, channelName);
    
    return {
      success: true,
      channelName,
      filters,
      subscriberCount: this.subscriptions.get(channelName)!.size
    };
  }
  
  async broadcastToChannel(channelName: string, message: ChannelMessage): Promise<void> {
    // Get subscribers from Redis (for cluster-wide broadcast)
    const subscribers = await this.redis.smembers(`channel:${channelName}:subscribers`);
    
    // Broadcast via Socket.IO
    this.io.to(channelName).emit('channel_message', {
      channel: channelName,
      message,
      timestamp: new Date().toISOString(),
      messageId: this.generateMessageId()
    });
    
    // Track message metrics
    await this.trackMessageMetrics(channelName, message, subscribers.length);
  }
  
  private async validateChannelPermission(
    userId: string, 
    channelName: string, 
    filters?: ChannelFilters
  ): Promise<boolean> {
    // Parse channel name to determine type and resource
    const channelInfo = this.parseChannelName(channelName);
    
    switch (channelInfo.type) {
      case ChannelType.ROUTE_UPDATES:
        // Any authenticated user can subscribe to route updates
        return true;
        
      case ChannelType.USER_NOTIFICATIONS:
        // Users can only subscribe to their own notifications
        return channelInfo.resourceId === userId;
        
      case ChannelType.SERVICE_ALERTS:
        // Public channel for service alerts
        return true;
        
      default:
        return false;
    }
  }
}
```

## Message Types and Schemas

### 1. Real-Time Location Updates

```typescript
interface LocationUpdateMessage {
  type: 'location_update';
  data: {
    vehicle_id: string;
    route_id: string;
    direction: string;
    location: {
      latitude: number;
      longitude: number;
      speed: number;
      heading: number;
    };
    confidence: number;
    contributor_count: number;
    timestamp: string; // ISO 8601
  };
  metadata: {
    data_freshness: 'fresh' | 'recent' | 'stale';
    quality_score: number;
    source: 'crowdsourced' | 'estimated';
  };
}

interface StopArrivalMessage {
  type: 'stop_arrival';
  data: {
    stop_id: string;
    arrivals: Array<{
      route_id: string;
      route_number: string;
      vehicle_id: string;
      estimated_arrival: string; // ISO 8601
      confidence: number;
      delay_minutes: number;
      crowding_level: 'low' | 'medium' | 'high' | 'full';
    }>;
  };
}

interface ServiceAlertMessage {
  type: 'service_alert';
  data: {
    alert_id: string;
    route_id?: string;
    stop_id?: string;
    alert_type: 'delay' | 'disruption' | 'route_change' | 'service_suspended';
    severity: 'low' | 'medium' | 'high' | 'critical';
    title: string;
    description: string;
    affected_routes: string[];
    effective_period: {
      start: string; // ISO 8601
      end?: string; // ISO 8601
    };
  };
}
```

### 2. User Notifications

```typescript
interface UserNotificationMessage {
  type: 'user_notification';
  data: {
    notification_id: string;
    user_id: string;
    notification_type: 'achievement' | 'leaderboard' | 'trip_reminder' | 'service_update';
    title: string;
    message: string;
    action_url?: string;
    priority: 'low' | 'medium' | 'high';
    expires_at?: string; // ISO 8601
  };
}

interface LeaderboardUpdateMessage {
  type: 'leaderboard_update';
  data: {
    leaderboard_type: 'daily' | 'weekly' | 'monthly' | 'route_specific';
    route_id?: string;
    user_rank_change: {
      user_id: string;
      old_rank: number;
      new_rank: number;
      points_earned: number;
    };
    top_contributors: Array<{
      rank: number;
      username: string;
      points: number;
    }>;
  };
}
```

## Real-Time Event Processing

### 1. Event Stream Integration

```typescript
interface EventStreamProcessor {
  processLocationUpdate(locationData: LocationData): Promise<void>;
  processServiceAlert(alert: ServiceAlert): Promise<void>;
  processUserEvent(userEvent: UserEvent): Promise<void>;
  distributeToSubscribers(message: ChannelMessage): Promise<void>;
}

class EventStreamProcessor implements EventStreamProcessor {
  private kafkaConsumer: KafkaConsumer;
  private channelManager: ChannelManager;
  private redis: RedisClient;
  
  constructor() {
    this.initializeKafkaConsumers();
  }
  
  private initializeKafkaConsumers(): void {
    // Location updates consumer
    this.kafkaConsumer.subscribe(['location-updates'], {
      groupId: 'websocket-location-processor'
    });
    
    this.kafkaConsumer.on('message', async (message) => {
      try {
        const locationData = JSON.parse(message.value);
        await this.processLocationUpdate(locationData);
      } catch (error) {
        console.error('Error processing location update:', error);
      }
    });
  }
  
  async processLocationUpdate(locationData: LocationData): Promise<void> {
    // Transform to WebSocket message format
    const wsMessage: LocationUpdateMessage = {
      type: 'location_update',
      data: {
        vehicle_id: locationData.vehicle_id,
        route_id: locationData.route_id,
        direction: locationData.direction,
        location: {
          latitude: locationData.latitude,
          longitude: locationData.longitude,
          speed: locationData.speed,
          heading: locationData.heading
        },
        confidence: locationData.confidence_score,
        contributor_count: locationData.contributor_count,
        timestamp: new Date(locationData.timestamp).toISOString()
      },
      metadata: {
        data_freshness: this.calculateDataFreshness(locationData.timestamp),
        quality_score: locationData.quality_score,
        source: 'crowdsourced'
      }
    };
    
    // Determine target channels
    const channels = [
      `route:${locationData.route_id}:${locationData.direction}`,
      `route:${locationData.route_id}:all`,
      'system:all_updates'
    ];
    
    // Broadcast to relevant channels
    for (const channel of channels) {
      await this.channelManager.broadcastToChannel(channel, wsMessage);
    }
    
    // Update ETA calculations for affected stops
    await this.updateStopETAs(locationData);
  }
  
  private calculateDataFreshness(timestamp: number): 'fresh' | 'recent' | 'stale' {
    const age = Date.now() - timestamp;
    if (age < 30000) return 'fresh'; // < 30 seconds
    if (age < 120000) return 'recent'; // < 2 minutes
    return 'stale';
  }
  
  private async updateStopETAs(locationData: LocationData): Promise<void> {
    // Calculate ETAs for upcoming stops
    const upcomingStops = await this.geospatialService.getUpcomingStops(
      locationData.route_id,
      locationData.direction,
      { latitude: locationData.latitude, longitude: locationData.longitude }
    );
    
    for (const stop of upcomingStops) {
      const eta = await this.calculateETA(locationData, stop);
      
      const etaMessage: StopArrivalMessage = {
        type: 'stop_arrival',
        data: {
          stop_id: stop.stop_id,
          arrivals: [{
            route_id: locationData.route_id,
            route_number: stop.route_number,
            vehicle_id: locationData.vehicle_id,
            estimated_arrival: eta.arrival_time,
            confidence: eta.confidence,
            delay_minutes: eta.delay_minutes,
            crowding_level: locationData.crowding_level || 'medium'
          }]
        }
      };
      
      await this.channelManager.broadcastToChannel(
        `stop:${stop.stop_id}:arrivals`,
        etaMessage
      );
    }
  }
}
```

### 2. Message Queuing for Offline Users

```typescript
interface OfflineMessageQueue {
  queueMessage(userId: string, message: ChannelMessage): Promise<void>;
  getQueuedMessages(userId: string): Promise<ChannelMessage[]>;
  clearUserQueue(userId: string): Promise<void>;
  processReconnection(userId: string, socket: Socket): Promise<void>;
}

class OfflineMessageQueue implements OfflineMessageQueue {
  private redis: RedisClient;
  private maxQueueSize = 100;
  private messageRetentionHours = 24;
  
  async queueMessage(userId: string, message: ChannelMessage): Promise<void> {
    const queueKey = `offline_queue:${userId}`;
    
    // Add message to queue with timestamp
    const queuedMessage = {
      ...message,
      queued_at: new Date().toISOString()
    };
    
    await this.redis.lpush(queueKey, JSON.stringify(queuedMessage));
    
    // Trim queue to max size
    await this.redis.ltrim(queueKey, 0, this.maxQueueSize - 1);
    
    // Set expiration
    await this.redis.expire(queueKey, this.messageRetentionHours * 3600);
  }
  
  async getQueuedMessages(userId: string): Promise<ChannelMessage[]> {
    const queueKey = `offline_queue:${userId}`;
    const messages = await this.redis.lrange(queueKey, 0, -1);
    
    return messages.map(msg => JSON.parse(msg)).reverse(); // Oldest first
  }
  
  async processReconnection(userId: string, socket: Socket): Promise<void> {
    const queuedMessages = await this.getQueuedMessages(userId);
    
    if (queuedMessages.length === 0) return;
    
    // Send queued messages
    for (const message of queuedMessages) {
      socket.emit('queued_message', message);
      await this.sleep(50); // Prevent overwhelming the client
    }
    
    // Clear the queue
    await this.clearUserQueue(userId);
    
    // Notify client about queue processing completion
    socket.emit('queue_sync_complete', {
      message_count: queuedMessages.length,
      synced_at: new Date().toISOString()
    });
  }
  
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
```

## Performance Optimization

### 1. Connection Scaling

```typescript
interface ConnectionScaler {
  getConnectionCount(): Promise<number>;
  balanceConnections(): Promise<void>;
  scaleGatewayInstances(targetConnections: number): Promise<void>;
}

class ConnectionScaler implements ConnectionScaler {
  private redis: RedisClient;
  private maxConnectionsPerInstance = 10000;
  
  async getConnectionCount(): Promise<number> {
    const instances = await this.redis.smembers('gateway_instances');
    let totalConnections = 0;
    
    for (const instance of instances) {
      const connections = await this.redis.get(`instance:${instance}:connections`);
      totalConnections += parseInt(connections || '0');
    }
    
    return totalConnections;
  }
  
  async balanceConnections(): Promise<void> {
    const instances = await this.getGatewayInstances();
    const totalConnections = await this.getConnectionCount();
    
    // Check if scaling is needed
    if (totalConnections > instances.length * this.maxConnectionsPerInstance * 0.8) {
      await this.scaleUp();
    } else if (totalConnections < instances.length * this.maxConnectionsPerInstance * 0.3) {
      await this.scaleDown();
    }
  }
  
  private async scaleUp(): Promise<void> {
    // Trigger auto-scaling group to add instances
    // Implementation depends on cloud provider (AWS ECS, K8s HPA, etc.)
    console.log('Scaling up WebSocket gateway instances');
  }
}
```

### 2. Message Batching and Compression

```typescript
interface MessageOptimizer {
  batchMessages(messages: ChannelMessage[]): BatchedMessage;
  compressMessage(message: ChannelMessage): CompressedMessage;
  optimizeForBandwidth(message: ChannelMessage, connectionType: string): ChannelMessage;
}

class MessageOptimizer implements MessageOptimizer {
  batchMessages(messages: ChannelMessage[]): BatchedMessage {
    // Group messages by type and channel
    const grouped = messages.reduce((acc, msg) => {
      const key = `${msg.type}:${msg.channel}`;
      if (!acc[key]) acc[key] = [];
      acc[key].push(msg);
      return acc;
    }, {} as Record<string, ChannelMessage[]>);
    
    return {
      type: 'batched_messages',
      batches: Object.entries(grouped).map(([key, msgs]) => ({
        batch_id: this.generateBatchId(),
        message_type: key.split(':')[0],
        channel: key.split(':')[1],
        messages: msgs,
        count: msgs.length
      })),
      total_messages: messages.length,
      batched_at: new Date().toISOString()
    };
  }
  
  optimizeForBandwidth(message: ChannelMessage, connectionType: string): ChannelMessage {
    if (connectionType === 'cellular' || connectionType === 'slow') {
      // Reduce precision for location data
      if (message.type === 'location_update') {
        return this.reducePrecision(message);
      }
      
      // Remove non-essential fields
      return this.removeNonEssentialFields(message);
    }
    
    return message;
  }
  
  private reducePrecision(message: LocationUpdateMessage): LocationUpdateMessage {
    return {
      ...message,
      data: {
        ...message.data,
        location: {
          latitude: Number(message.data.location.latitude.toFixed(6)),
          longitude: Number(message.data.location.longitude.toFixed(6)),
          speed: Math.round(message.data.location.speed),
          heading: Math.round(message.data.location.heading / 5) * 5
        }
      }
    };
  }
}
```

## Monitoring and Analytics

### 1. Real-Time Metrics

```typescript
interface WebSocketMetrics {
  trackConnection(event: 'connect' | 'disconnect', metadata: ConnectionMetadata): Promise<void>;
  trackMessage(channelName: string, messageType: string, latency: number): Promise<void>;
  trackError(error: WebSocketError): Promise<void>;
  getPerformanceMetrics(): Promise<PerformanceMetrics>;
}

interface PerformanceMetrics {
  activeConnections: number;
  messagesPerSecond: number;
  averageLatency: number;
  errorRate: number;
  channelMetrics: ChannelMetrics[];
}

class WebSocketMetrics implements WebSocketMetrics {
  private influxDB: InfluxDBClient;
  
  async trackConnection(event: 'connect' | 'disconnect', metadata: ConnectionMetadata): Promise<void> {
    const point = new Point('websocket_connections')
      .tag('event', event)
      .tag('device_type', metadata.deviceType)
      .tag('gateway_instance', metadata.gatewayInstance)
      .intField('value', event === 'connect' ? 1 : -1)
      .timestamp(new Date());
    
    await this.influxDB.writePoint(point);
  }
  
  async trackMessage(channelName: string, messageType: string, latency: number): Promise<void> {
    const point = new Point('websocket_messages')
      .tag('channel', channelName)
      .tag('message_type', messageType)
      .floatField('latency_ms', latency)
      .intField('count', 1)
      .timestamp(new Date());
    
    await this.influxDB.writePoint(point);
  }
}
```

This comprehensive WebSocket design ensures reliable, scalable real-time communication for the BMTC Transit App with sub-second latency and support for 100,000+ concurrent connections.