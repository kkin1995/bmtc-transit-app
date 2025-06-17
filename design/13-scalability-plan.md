# Scalability Architecture - BMTC Transit App

## Overview

The scalability architecture is designed to handle the BMTC Transit App's target load of 10,000+ concurrent users with 100+ contributors per route during peak hours. This design ensures horizontal scalability, automatic resource management, and performance optimization across all system components.

## Scalability Requirements

### Target Metrics (FR-8.2.1, FR-8.2.2, FR-8.2.3, FR-8.2.4)
- **Concurrent Users**: 10,000+ active users across Bengaluru
- **Contributors per Route**: 100+ simultaneous location sharers per major route
- **Database Scale**: Support for 1 million+ registered users
- **Uptime**: 99.5% during peak transit hours (7-10 AM, 5-8 PM)
- **Response Time**: <15 seconds for real-time data updates
- **Throughput**: 50,000+ location updates per second during peak

## Horizontal Scaling Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           GLOBAL LOAD BALANCER                              │
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────────┐  │
│  │                        AWS Application Load Balancer                   │  │
│  │                                                                         │  │
│  │  • Geographic routing (Bangalore priority)                              │  │
│  │  • Health checks and automatic failover                                 │  │
│  │  • SSL termination and DDoS protection                                  │  │
│  │  • Sticky sessions for WebSocket connections                            │  │
│  │  • Auto-scaling trigger integration                                     │  │
│  └─────────────────────────────────────────────────────────────────────────┘  │
└─────────────────────────┬───────────────────────────────────────────────────┘
                          │
┌─────────────────────────▼───────────────────────────────────────────────────┐
│                        API GATEWAY CLUSTER                                  │
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────────┐  │
│  │                        Kong Gateway Instances                          │  │
│  │                                                                         │  │
│  │  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐          │  │
│  │  │   Gateway-1     │  │   Gateway-2     │  │   Gateway-N     │          │  │
│  │  │   (Primary AZ)  │  │  (Secondary AZ) │  │   (Auto-scale)  │          │  │
│  │  │                 │  │                 │  │                 │          │  │
│  │  │ • 5k req/sec    │  │ • 5k req/sec    │  │ • Dynamic       │          │  │
│  │  │ • Rate limiting │  │ • Rate limiting │  │   Capacity      │          │  │
│  │  │ • Auth caching  │  │ • Auth caching  │  │ • Health        │          │  │
│  │  │ • Circuit       │  │ • Circuit       │  │   Monitoring    │          │  │
│  │  │   breakers      │  │   breakers      │  │                 │          │  │
│  │  └─────────────────┘  └─────────────────┘  └─────────────────┘          │  │
│  │                                                                         │  │
│  │  Auto-scaling: 2-10 instances based on:                                 │  │
│  │  • CPU utilization (target: 70%)                                        │  │
│  │  • Request rate (scale up at 4k req/sec per instance)                   │  │
│  │  • Response latency (scale up if p95 > 500ms)                           │  │
│  └─────────────────────────────────────────────────────────────────────────┘  │
└─────────────────────────┬───────────────────────────────────────────────────┘
                          │
┌─────────────────────────▼───────────────────────────────────────────────────┐
│                    MICROSERVICES CLUSTER (EKS)                              │
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────────┐  │
│  │                    Service Mesh (Istio)                                │  │
│  │                                                                         │  │
│  │  • Service discovery and load balancing                                 │  │
│  │  • Circuit breakers and retry policies                                  │  │
│  │  • Distributed tracing and monitoring                                   │  │
│  │  • mTLS encryption between services                                     │  │
│  │  • Traffic routing and canary deployments                               │  │
│  └─────────────────────────────────────────────────────────────────────────┘  │
│                                      │                                        │
│  ┌─────────────────────────────────────────────────────────────────────────┐  │
│  │                        Service Scaling Matrix                          │  │
│  │                                                                         │  │
│  │  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐          │  │
│  │  │  Location       │  │   Real-time     │  │    User         │          │  │
│  │  │  Service        │  │   Service       │  │   Service       │          │  │
│  │  │                 │  │                 │  │                 │          │  │
│  │  │ Min: 3 pods     │  │ Min: 4 pods     │  │ Min: 2 pods     │          │  │
│  │  │ Max: 20 pods    │  │ Max: 30 pods    │  │ Max: 10 pods    │          │  │
│  │  │ CPU: 2 cores    │  │ CPU: 1 core     │  │ CPU: 1 core     │          │  │
│  │  │ Memory: 4GB     │  │ Memory: 2GB     │  │ Memory: 2GB     │          │  │
│  │  │ Scale: CPU>80%  │  │ Scale: Msg      │  │ Scale: CPU>70%  │          │  │
│  │  │                 │  │ queue depth     │  │                 │          │  │
│  │  └─────────────────┘  └─────────────────┘  └─────────────────┘          │  │
│  │                                                                         │  │
│  │  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐          │  │
│  │  │   Route         │  │   Trip          │  │   Analytics     │          │  │
│  │  │   Service       │  │   Service       │  │   Service       │          │  │
│  │  │                 │  │                 │  │                 │          │  │
│  │  │ Min: 2 pods     │  │ Min: 2 pods     │  │ Min: 1 pod      │          │  │
│  │  │ Max: 8 pods     │  │ Max: 15 pods    │  │ Max: 5 pods     │          │  │
│  │  │ CPU: 1 core     │  │ CPU: 2 cores    │  │ CPU: 2 cores    │          │  │
│  │  │ Memory: 2GB     │  │ Memory: 4GB     │  │ Memory: 8GB     │          │  │
│  │  │ Scale: CPU>70%  │  │ Scale: Request  │  │ Scale: Memory   │          │  │
│  │  │                 │  │ rate            │  │ usage >85%      │          │  │
│  │  └─────────────────┘  └─────────────────┘  └─────────────────┘          │  │
│  └─────────────────────────────────────────────────────────────────────────┘  │
└─────────────────────────┬───────────────────────────────────────────────────┘
                          │
┌─────────────────────────▼───────────────────────────────────────────────────┐
│                      DATA LAYER SCALING                                     │
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────────┐  │
│  │                     Database Scaling Strategy                          │  │
│  │                                                                         │  │
│  │  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐          │  │
│  │  │   PostgreSQL    │  │     Redis       │  │    InfluxDB     │          │  │
│  │  │    Cluster      │  │    Cluster      │  │    Cluster      │          │  │
│  │  │                 │  │                 │  │                 │          │  │
│  │  │ • Primary +     │  │ • 3-node        │  │ • 3-node        │          │  │
│  │  │   2 Read        │  │   cluster       │  │   cluster       │          │  │
│  │  │   Replicas      │  │ • Sharding by   │  │ • Sharding by   │          │  │
│  │  │ • Route-based   │  │   user_id and   │  │   time and      │          │  │
│  │  │   partitioning  │  │   route_id      │  │   route_id      │          │  │
│  │  │ • Connection    │  │ • Auto-failover │  │ • Retention     │          │  │
│  │  │   pooling       │  │ • Memory        │  │   policies      │          │  │
│  │  │ • Auto-failover │  │   optimization  │  │ • Compression   │          │  │
│  │  └─────────────────┘  └─────────────────┘  └─────────────────┘          │  │
│  └─────────────────────────────────────────────────────────────────────────┘  │
│                                      │                                        │
│  ┌─────────────────────────────────────────────────────────────────────────┐  │
│  │                    Message Queue Scaling                               │  │
│  │                                                                         │  │
│  │  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐          │  │
│  │  │   Kafka         │  │   Kafka         │  │   Kafka         │          │  │
│  │  │   Broker 1      │  │   Broker 2      │  │   Broker 3      │          │  │
│  │  │                 │  │                 │  │                 │          │  │
│  │  │ • Partition     │  │ • Partition     │  │ • Partition     │          │  │
│  │  │   Leader for    │  │   Leader for    │  │   Leader for    │          │  │
│  │  │   Topics 1-10   │  │   Topics 11-20  │  │   Topics 21-30  │          │  │
│  │  │ • Replication   │  │ • Replication   │  │ • Replication   │          │  │
│  │  │   Factor: 3     │  │   Factor: 3     │  │   Factor: 3     │          │  │
│  │  │ • Auto-scaling  │  │ • Auto-scaling  │  │ • Auto-scaling  │          │  │
│  │  │   partitions    │  │   partitions    │  │   partitions    │          │  │
│  │  └─────────────────┘  └─────────────────┘  └─────────────────┘          │  │
│  │                                                                         │  │
│  │  Topic Partitioning Strategy:                                           │  │
│  │  • location-updates: 30 partitions (by route_id hash)                   │  │
│  │  • validation-results: 20 partitions (by route_id hash)                 │  │
│  │  • user-events: 15 partitions (by user_id hash)                         │  │
│  │  • system-alerts: 5 partitions (by severity)                            │  │
│  └─────────────────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────────────┘
```

## Auto-Scaling Strategies

### 1. Kubernetes Horizontal Pod Autoscaler (HPA)

```yaml
# Location Processing Service HPA
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: location-service-hpa
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: location-service
  minReplicas: 3
  maxReplicas: 20
  metrics:
  - type: Resource
    resource:
      name: cpu
      target:
        type: Utilization
        averageUtilization: 80
  - type: Resource
    resource:
      name: memory
      target:
        type: Utilization
        averageUtilization: 85
  - type: Pods
    pods:
      metric:
        name: kafka_lag_sum
      target:
        type: AverageValue
        averageValue: "30"
  behavior:
    scaleUp:
      stabilizationWindowSeconds: 60
      policies:
      - type: Percent
        value: 100
        periodSeconds: 15
    scaleDown:
      stabilizationWindowSeconds: 300
      policies:
      - type: Percent
        value: 10
        periodSeconds: 60
```

### 2. Vertical Pod Autoscaler (VPA)

```yaml
# Real-time Service VPA
apiVersion: autoscaling.k8s.io/v1
kind: VerticalPodAutoscaler
metadata:
  name: realtime-service-vpa
spec:
  targetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: realtime-service
  updatePolicy:
    updateMode: "Auto"
  resourcePolicy:
    containerPolicies:
    - containerName: realtime-service
      maxAllowed:
        cpu: 2
        memory: 4Gi
      minAllowed:
        cpu: 100m
        memory: 256Mi
      controlledResources: ["cpu", "memory"]
```

### 3. Custom Autoscaling Logic

```typescript
interface AutoScalingManager {
  monitorSystemLoad(): Promise<void>;
  scaleServices(metrics: SystemMetrics): Promise<ScalingDecision[]>;
  predictCapacityNeeds(timeWindow: number): Promise<CapacityPrediction>;
}

interface SystemMetrics {
  locationUpdatesPerSecond: number;
  activeWebSocketConnections: number;
  kafkaConsumerLag: number;
  databaseConnectionCount: number;
  averageResponseTime: number;
  errorRate: number;
}

interface ScalingDecision {
  serviceName: string;
  action: 'scale_up' | 'scale_down' | 'no_change';
  targetReplicas: number;
  reason: string;
  confidence: number;
}

class AutoScalingManager implements AutoScalingManager {
  private k8sApi: KubernetesApi;
  private metricsCollector: MetricsCollector;
  private predictionModel: CapacityPredictionModel;
  
  async monitorSystemLoad(): Promise<void> {
    setInterval(async () => {
      const metrics = await this.collectSystemMetrics();
      const decisions = await this.scaleServices(metrics);
      await this.executeScalingDecisions(decisions);
    }, 30000); // Check every 30 seconds
  }
  
  async scaleServices(metrics: SystemMetrics): Promise<ScalingDecision[]> {
    const decisions: ScalingDecision[] = [];
    
    // Location service scaling
    if (metrics.locationUpdatesPerSecond > 8000) {
      decisions.push({
        serviceName: 'location-service',
        action: 'scale_up',
        targetReplicas: await this.calculateOptimalReplicas('location-service', metrics),
        reason: 'High location update rate detected',
        confidence: 0.9
      });
    }
    
    // Real-time service scaling based on WebSocket connections
    if (metrics.activeWebSocketConnections > 7500) {
      decisions.push({
        serviceName: 'realtime-service',
        action: 'scale_up',
        targetReplicas: Math.ceil(metrics.activeWebSocketConnections / 2500),
        reason: 'High WebSocket connection count',
        confidence: 0.85
      });
    }
    
    // Database connection scaling
    if (metrics.databaseConnectionCount > 800) {
      await this.scaleConnectionPools();
    }
    
    return decisions;
  }
  
  async predictCapacityNeeds(timeWindow: number): Promise<CapacityPrediction> {
    // Use historical data and ML model for prediction
    const historicalMetrics = await this.getHistoricalMetrics(timeWindow);
    const prediction = await this.predictionModel.predict(historicalMetrics);
    
    return {
      predictedPeakUsers: prediction.peakUsers,
      predictedLocationUpdates: prediction.locationUpdates,
      recommendedScaling: prediction.recommendedCapacity,
      confidence: prediction.confidence,
      timeToScale: prediction.timeToScale
    };
  }
  
  private async calculateOptimalReplicas(serviceName: string, metrics: SystemMetrics): Promise<number> {
    const currentReplicas = await this.getCurrentReplicaCount(serviceName);
    const targetCPU = 70; // Target 70% CPU utilization
    const currentCPU = await this.getCurrentCPUUtilization(serviceName);
    
    // Calculate based on CPU utilization
    const cpuBasedReplicas = Math.ceil(currentReplicas * (currentCPU / targetCPU));
    
    // Calculate based on throughput requirements
    const throughputBasedReplicas = this.calculateThroughputBasedReplicas(serviceName, metrics);
    
    // Take the maximum to ensure capacity
    return Math.min(20, Math.max(cpuBasedReplicas, throughputBasedReplicas, 3));
  }
}
```

## Database Scaling Strategy

### 1. PostgreSQL Scaling

```typescript
interface DatabaseScalingStrategy {
  setupReadReplicas(): Promise<void>;
  implementSharding(): Promise<void>;
  optimizeConnections(): Promise<void>;
  handleFailover(): Promise<void>;
}

class PostgreSQLScalingManager implements DatabaseScalingStrategy {
  private primaryDB: PostgreSQLConnection;
  private readReplicas: PostgreSQLConnection[];
  private shardManager: ShardManager;
  
  async setupReadReplicas(): Promise<void> {
    // Create read replicas for scaling read operations
    const replicaConfigs = [
      {
        region: 'ap-south-1a',
        instanceClass: 'db.r5.large',
        purpose: 'route_queries'
      },
      {
        region: 'ap-south-1b', 
        instanceClass: 'db.r5.large',
        purpose: 'user_queries'
      }
    ];
    
    for (const config of replicaConfigs) {
      await this.createReadReplica(config);
    }
    
    // Setup read-write splitting
    await this.configureReadWriteSplitting();
  }
  
  async implementSharding(): Promise<void> {
    // Implement route-based sharding
    const shardingStrategy = {
      shardKey: 'route_id',
      shardCount: 4,
      hashFunction: 'consistent_hash',
      rebalancingStrategy: 'gradual'
    };
    
    await this.shardManager.setupShards(shardingStrategy);
    
    // Route queries to appropriate shards
    await this.configureShardRouting();
  }
  
  private async configureReadWriteSplitting(): Promise<void> {
    // Configure PgBouncer for connection pooling and read-write splitting
    const pgBouncerConfig = `
      [databases]
      bmtc_primary = host=primary.db.cluster port=5432 dbname=bmtc_transit
      bmtc_read = host=replica.db.cluster port=5432 dbname=bmtc_transit
      
      [pgbouncer]
      pool_mode = transaction
      max_client_conn = 1000
      default_pool_size = 50
      max_db_connections = 100
    `;
    
    await this.deployPgBouncer(pgBouncerConfig);
  }
}
```

### 2. Redis Cluster Scaling

```typescript
class RedisClusterManager {
  private cluster: RedisCluster;
  
  async setupRedisCluster(): Promise<void> {
    const clusterConfig = {
      nodes: [
        { host: 'redis-1.cluster', port: 6379 },
        { host: 'redis-2.cluster', port: 6379 },
        { host: 'redis-3.cluster', port: 6379 },
        { host: 'redis-4.cluster', port: 6379 },
        { host: 'redis-5.cluster', port: 6379 },
        { host: 'redis-6.cluster', port: 6379 }
      ],
      enableOfflineQueue: false,
      retryDelayOnFailover: 100,
      enableReadyCheck: true,
      maxRetriesPerRequest: 3
    };
    
    this.cluster = new RedisCluster(clusterConfig);
    
    // Setup data partitioning strategy
    await this.configureDataPartitioning();
  }
  
  private async configureDataPartitioning(): Promise<void> {
    // Partition strategy for different data types
    const partitioningRules = {
      'user_sessions:*': 'hash_slot',
      'vehicle_locations:*': 'route_based',
      'real_time_cache:*': 'geographic',
      'leaderboards:*': 'time_based'
    };
    
    await this.applyPartitioningRules(partitioningRules);
  }
  
  async scaleRedisCluster(targetNodes: number): Promise<void> {
    const currentNodes = await this.cluster.nodes();
    
    if (targetNodes > currentNodes.length) {
      // Scale up
      await this.addRedisNodes(targetNodes - currentNodes.length);
      await this.rebalanceCluster();
    } else if (targetNodes < currentNodes.length) {
      // Scale down
      await this.removeRedisNodes(currentNodes.length - targetNodes);
    }
  }
}
```

## Performance Optimization

### 1. Connection Pool Management

```typescript
interface ConnectionPoolManager {
  optimizeDatabasePools(): Promise<void>;
  monitorPoolHealth(): Promise<PoolHealthMetrics>;
  adjustPoolSizes(metrics: SystemMetrics): Promise<void>;
}

class DatabaseConnectionPoolManager implements ConnectionPoolManager {
  private pools: Map<string, ConnectionPool>;
  
  async optimizeDatabasePools(): Promise<void> {
    // PostgreSQL connection pool optimization
    const pgPoolConfig = {
      host: process.env.DB_HOST,
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      database: process.env.DB_NAME,
      min: 5,           // Minimum connections
      max: 50,          // Maximum connections per service instance
      acquireTimeoutMillis: 60000,
      createTimeoutMillis: 30000,
      destroyTimeoutMillis: 5000,
      idleTimeoutMillis: 30000,
      reapIntervalMillis: 1000,
      createRetryIntervalMillis: 200
    };
    
    this.pools.set('postgresql', new Pool(pgPoolConfig));
    
    // Redis connection pool
    const redisPoolConfig = {
      max: 20,
      min: 5,
      acquireTimeoutMillis: 30000,
      evictionRunIntervalMillis: 60000,
      idleTimeoutMillis: 300000
    };
    
    this.pools.set('redis', createRedisPool(redisPoolConfig));
  }
  
  async adjustPoolSizes(metrics: SystemMetrics): Promise<void> {
    // Dynamic pool size adjustment based on load
    const pgPool = this.pools.get('postgresql');
    
    if (metrics.databaseConnectionCount > 40) {
      // Increase pool size
      await pgPool.setMaxSize(Math.min(80, pgPool.getMaxSize() + 10));
    } else if (metrics.databaseConnectionCount < 10) {
      // Decrease pool size
      await pgPool.setMaxSize(Math.max(20, pgPool.getMaxSize() - 5));
    }
  }
}
```

### 2. Query Optimization

```typescript
class QueryOptimizationManager {
  private queryCache: Map<string, QueryResult>;
  private slowQueryThreshold: number = 1000; // 1 second
  
  async optimizeQueries(): Promise<void> {
    // Implement query result caching
    await this.setupQueryCache();
    
    // Monitor and optimize slow queries
    await this.monitorSlowQueries();
    
    // Setup materialized views for complex aggregations
    await this.createMaterializedViews();
  }
  
  private async createMaterializedViews(): Promise<void> {
    // Real-time route statistics
    await this.db.query(`
      CREATE MATERIALIZED VIEW mv_route_stats AS
      SELECT 
        route_id,
        COUNT(DISTINCT vehicle_id) as active_vehicles,
        AVG(speed) as avg_speed,
        COUNT(*) as total_updates,
        MAX(timestamp) as last_update
      FROM location_data 
      WHERE timestamp > NOW() - INTERVAL '1 hour'
      GROUP BY route_id;
      
      CREATE UNIQUE INDEX idx_mv_route_stats_route_id ON mv_route_stats(route_id);
    `);
    
    // Setup automatic refresh
    await this.scheduleViewRefresh('mv_route_stats', 60000); // Refresh every minute
  }
  
  async optimizeLocationQueries(): Promise<void> {
    // Create specialized indexes for location queries
    await this.db.query(`
      -- Composite index for route-based location queries
      CREATE INDEX CONCURRENTLY idx_location_route_time 
      ON location_data(route_id, timestamp DESC, vehicle_id);
      
      -- Spatial index for geographic queries  
      CREATE INDEX CONCURRENTLY idx_location_spatial 
      ON location_data USING GIST(ST_Point(longitude, latitude));
      
      -- Partial index for recent data only
      CREATE INDEX CONCURRENTLY idx_location_recent 
      ON location_data(timestamp DESC) 
      WHERE timestamp > NOW() - INTERVAL '2 hours';
    `);
  }
}
```

## Capacity Planning

### 1. Resource Estimation

```typescript
interface CapacityPlanner {
  calculateResourceRequirements(targetUsers: number): ResourceRequirements;
  estimateCosts(requirements: ResourceRequirements): CostEstimate;
  planGrowthCapacity(growthRate: number): GrowthPlan;
}

interface ResourceRequirements {
  compute: ComputeRequirements;
  storage: StorageRequirements;
  network: NetworkRequirements;
  database: DatabaseRequirements;
}

class CapacityPlanner implements CapacityPlanner {
  calculateResourceRequirements(targetUsers: number): ResourceRequirements {
    // Base calculations for 10,000 concurrent users
    const baseUsers = 10000;
    const scaleFactor = targetUsers / baseUsers;
    
    return {
      compute: {
        cpuCores: Math.ceil(80 * scaleFactor), // 80 cores for 10k users
        memory: Math.ceil(160 * scaleFactor), // 160 GB RAM
        instances: Math.ceil(20 * scaleFactor) // 20 service instances
      },
      storage: {
        ssdStorage: Math.ceil(500 * scaleFactor), // 500 GB SSD
        objectStorage: Math.ceil(1000 * scaleFactor), // 1 TB object storage
        backupStorage: Math.ceil(2000 * scaleFactor) // 2 TB backup
      },
      network: {
        bandwidth: Math.ceil(10 * scaleFactor), // 10 Gbps
        dataTransfer: Math.ceil(50 * scaleFactor), // 50 TB/month
        cdnRequests: Math.ceil(10000000 * scaleFactor) // 10M requests/month
      },
      database: {
        primaryInstances: Math.min(1, scaleFactor), // Always 1 primary
        readReplicas: Math.ceil(2 * scaleFactor), // 2 read replicas base
        connectionLimit: Math.ceil(1000 * scaleFactor), // 1000 connections
        iops: Math.ceil(5000 * scaleFactor) // 5000 IOPS
      }
    };
  }
  
  estimateCosts(requirements: ResourceRequirements): CostEstimate {
    // AWS pricing estimates (monthly)
    const pricing = {
      ec2PerCore: 50, // $50/month per core
      ramPerGB: 5,    // $5/month per GB
      ssdPerGB: 0.1,  // $0.1/month per GB
      bandwidthPerGB: 0.09, // $0.09 per GB transfer
      rdsPerCore: 80  // $80/month per RDS core
    };
    
    return {
      compute: requirements.compute.cpuCores * pricing.ec2PerCore + 
               requirements.compute.memory * pricing.ramPerGB,
      storage: requirements.storage.ssdStorage * pricing.ssdPerGB,
      network: requirements.network.dataTransfer * pricing.bandwidthPerGB,
      database: requirements.database.primaryInstances * 4 * pricing.rdsPerCore +
                requirements.database.readReplicas * 2 * pricing.rdsPerCore,
      total: 0 // Calculated as sum of above
    };
  }
}
```

### 2. Load Testing Strategy

```typescript
interface LoadTestingManager {
  executeLoadTest(scenario: LoadTestScenario): Promise<LoadTestResult>;
  simulatePeakLoad(): Promise<void>;
  identifyBottlenecks(): Promise<BottleneckAnalysis>;
}

interface LoadTestScenario {
  concurrentUsers: number;
  rampUpTime: number;
  testDuration: number;
  locationUpdateFrequency: number;
  apiRequestRate: number;
}

class LoadTestingManager implements LoadTestingManager {
  async executeLoadTest(scenario: LoadTestScenario): Promise<LoadTestResult> {
    // K6 load testing script
    const k6Script = `
      import http from 'k6/http';
      import ws from 'k6/ws';
      import { check } from 'k6';
      
      export const options = {
        stages: [
          { duration: '${scenario.rampUpTime}s', target: ${scenario.concurrentUsers} },
          { duration: '${scenario.testDuration}s', target: ${scenario.concurrentUsers} },
          { duration: '60s', target: 0 }
        ],
        thresholds: {
          http_req_duration: ['p(95)<500'],
          ws_connecting: ['p(95)<1000'],
          'location_updates_per_sec': ['rate>8000']
        }
      };
      
      export default function() {
        // Test location sharing
        testLocationSharing();
        
        // Test real-time WebSocket
        testWebSocketConnection();
        
        // Test API endpoints
        testAPIEndpoints();
      }
    `;
    
    return await this.executeK6Test(k6Script);
  }
  
  async simulatePeakLoad(): Promise<void> {
    const peakScenario: LoadTestScenario = {
      concurrentUsers: 15000, // 150% of target
      rampUpTime: 300,        // 5 minutes ramp up
      testDuration: 1800,     // 30 minutes peak
      locationUpdateFrequency: 5, // Every 5 seconds
      apiRequestRate: 100     // 100 req/sec per user
    };
    
    const result = await this.executeLoadTest(peakScenario);
    await this.analyzeResults(result);
  }
}
```

This comprehensive scalability plan ensures the BMTC Transit App can handle its target load while maintaining performance and reliability standards. The architecture supports horizontal scaling, automatic resource management, and cost-effective capacity planning.