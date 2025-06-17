# Gamification System Architecture - BMTC Transit App

## Overview

The gamification system is designed to encourage user participation in location sharing by providing meaningful rewards, recognition, and community engagement. The system implements points, levels, achievements, leaderboards, and social features to create a compelling user experience that motivates continuous contribution to the crowdsourced transit data.

## Gamification Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         MOBILE APPLICATION LAYER                            │
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────────┐  │
│  │                      Gamification UI Components                         │  │
│  │                                                                         │  │
│  │  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐          │  │
│  │  │   Profile       │  │   Leaderboards  │  │   Achievements  │          │  │
│  │  │   Dashboard     │  │     Screen      │  │     Gallery     │          │  │
│  │  │                 │  │                 │  │                 │          │  │
│  │  │ • Points/Level  │  │ • Daily/Weekly  │  │ • Badge Display │          │  │
│  │  │ • Progress Bars │  │ • Route-specific│  │ • Progress      │          │  │
│  │  │ • Statistics    │  │ • Friends       │  │   Tracking      │          │  │
│  │  │ • Streaks       │  │ • Global        │  │ • Social Share  │          │  │
│  │  │ • Impact Metrics│  │ • Real-time     │  │ • Challenges    │          │  │
│  │  └─────────────────┘  │   Updates       │  └─────────────────┘          │  │
│  │                       └─────────────────┘                               │  │
│  │  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐          │  │
│  │  │   Challenges    │  │   Social        │  │   Notifications │          │  │
│  │  │   & Quests      │  │   Features      │  │   & Rewards     │          │  │
│  │  │                 │  │                 │  │                 │          │  │
│  │  │ • Daily Tasks   │  │ • Team Play     │  │ • Achievement   │          │  │
│  │  │ • Weekly Goals  │  │ • Friend        │  │   Unlocks       │          │  │
│  │  │ • Special       │  │   Competition   │  │ • Level Up      │          │  │
│  │  │   Events        │  │ • Community     │  │ • Milestone     │          │  │
│  │  │ • Route         │  │   Challenges    │  │   Rewards       │          │  │
│  │  │   Mastery       │  │ • Social Share  │  │ • Impact        │          │  │
│  │  └─────────────────┘  └─────────────────┘  │   Notifications │          │  │
│  │                                            └─────────────────┘          │  │
│  └─────────────────────────────────────────────────────────────────────────┘  │
└─────────────────────────┬───────────────────────────────────────────────────┘
                          │
┌─────────────────────────▼───────────────────────────────────────────────────┐
│                      GAMIFICATION API LAYER                                 │
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────────┐  │
│  │                      Points & Leveling Service                         │  │
│  │                                                                         │  │
│  │  • Real-time Point Calculation                                          │  │
│  │  • Level Progression Management                                         │  │
│  │  • XP Multipliers and Bonuses                                           │  │
│  │  • Contribution Quality Scoring                                         │  │
│  │  • Seasonal/Event Point Modifiers                                       │  │
│  └─────────────────────────────────────────────────────────────────────────┘  │
│                                      │                                        │
│  ┌─────────────────────────────────────────────────────────────────────────┐  │
│  │                     Achievement Engine                                  │  │
│  │                                                                         │  │
│  │  • Rule-based Achievement Detection                                     │  │
│  │  • Progress Tracking and Validation                                     │  │
│  │  • Badge Generation and Assignment                                      │  │
│  │  • Achievement Notification System                                      │  │
│  │  • Social Sharing Integration                                           │  │
│  └─────────────────────────────────────────────────────────────────────────┘  │
│                                      │                                        │
│  ┌─────────────────────────────────────────────────────────────────────────┐  │
│  │                    Leaderboard Management                               │  │
│  │                                                                         │  │
│  │  • Multi-dimensional Ranking System                                     │  │
│  │  • Real-time Score Updates                                              │  │
│  │  • Temporal Leaderboards (Daily/Weekly/Monthly)                         │  │
│  │  • Geographic and Route-specific Rankings                               │  │
│  │  • Social and Friend-based Competitions                                 │  │
│  └─────────────────────────────────────────────────────────────────────────┘  │
└─────────────────────────┬───────────────────────────────────────────────────┘
                          │
┌─────────────────────────▼───────────────────────────────────────────────────┐
│                     GAMIFICATION BUSINESS LOGIC                             │
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────────┐  │
│  │                       Event Processing Engine                          │  │
│  │                                                                         │  │
│  │  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐          │  │
│  │  │   Location      │  │   Contribution  │  │    Social       │          │  │
│  │  │   Events        │  │     Events      │  │    Events       │          │  │
│  │  │                 │  │                 │  │                 │          │  │
│  │  │ • GPS Share     │  │ • Quality Score │  │ • Friend Added  │          │  │
│  │  │   Started       │  │   Calculated    │  │ • Challenge     │          │  │
│  │  │ • Route         │  │ • Impact        │  │   Completed     │          │  │
│  │  │   Completed     │  │   Measured      │  │ • Team Goal     │          │  │
│  │  │ • Stop Reached  │  │ • Validation    │  │   Achieved      │          │  │
│  │  │ • Time Shared   │  │   Passed        │  │ • Content       │          │  │
│  │  │                 │  │                 │  │   Shared        │          │  │
│  │  └─────────────────┘  └─────────────────┘  └─────────────────┘          │  │
│  └─────────────────────────────────────────────────────────────────────────┘  │
│                                      │                                        │
│  ┌─────────────────────────────────────────────────────────────────────────┐  │
│  │                        Rules Engine                                     │  │
│  │                                                                         │  │
│  │  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐          │  │
│  │  │   Point Rules   │  │  Achievement    │  │   Challenge     │          │  │
│  │  │   Processor     │  │   Rules         │  │   Rules         │          │  │
│  │  │                 │  │                 │  │                 │          │  │
│  │  │ • Base Points   │  │ • Milestone     │  │ • Daily Tasks   │          │  │
│  │  │ • Quality       │  │   Detection     │  │ • Weekly Goals  │          │  │
│  │  │   Multipliers   │  │ • Streak        │  │ • Special       │          │  │
│  │  │ • Time Bonuses  │  │   Tracking      │  │   Events        │          │  │
│  │  │ • Route         │  │ • Social        │  │ • Route         │          │  │
│  │  │   Modifiers     │  │   Achievements  │  │   Challenges    │          │  │
│  │  └─────────────────┘  └─────────────────┘  └─────────────────┘          │  │
│  └─────────────────────────────────────────────────────────────────────────┘  │
│                                      │                                        │
│  ┌─────────────────────────────────────────────────────────────────────────┐  │
│  │                      Analytics & Insights                              │  │
│  │                                                                         │  │
│  │  • User Engagement Metrics                                              │  │
│  │  • Behavioral Pattern Analysis                                          │  │
│  │  • A/B Testing for Gamification Features                                │  │
│  │  • Retention and Churn Analysis                                         │  │
│  │  • Social Network Effect Measurement                                    │  │
│  └─────────────────────────────────────────────────────────────────────────┘  │
└─────────────────────────┬───────────────────────────────────────────────────┘
                          │
┌─────────────────────────▼───────────────────────────────────────────────────┐
│                        DATA PROCESSING LAYER                                │
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────────┐  │
│  │                     Real-time Event Streaming                          │  │
│  │                                                                         │  │
│  │  Topic: user-events             Topic: gamification-events             │  │
│  │  ├─ Partition by user_id        ├─ Partition by event_type             │  │
│  │  ├─ Location sharing events     ├─ Achievement unlocks                 │  │
│  │  ├─ Service report events       ├─ Level progressions                  │  │
│  │  └─ Social interaction events   └─ Leaderboard updates                 │  │
│  │                                                                         │  │
│  │  Topic: real-time-analytics     Topic: notification-events             │  │
│  │  ├─ Partition by metric_type    ├─ Partition by user_id                │  │
│  │  ├─ Performance metrics         ├─ Achievement notifications           │  │
│  │  └─ Engagement analytics        └─ Social notifications                │  │
│  └─────────────────────────────────────────────────────────────────────────┘  │
└─────────────────────────┬───────────────────────────────────────────────────┘
                          │
┌─────────────────────────▼───────────────────────────────────────────────────┐
│                          DATA STORAGE LAYER                                 │
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────────┐  │
│  │                      PostgreSQL - User Gamification                    │  │
│  │                                                                         │  │
│  │  • User Points and Levels                                               │  │
│  │  • Achievement Progress and Unlocks                                     │  │
│  │  • Leaderboard Rankings                                                 │  │
│  │  • Social Connections and Teams                                         │  │
│  │  • Challenge Participation and Progress                                 │  │
│  └─────────────────────────────────────────────────────────────────────────┘  │
│                                      │                                        │
│  ┌─────────────────────────────────────────────────────────────────────────┐  │
│  │                    Redis - High-Performance Cache                      │  │
│  │                                                                         │  │
│  │  • Live Leaderboard Data                                                │  │
│  │  • Real-time Point Calculations                                         │  │
│  │  • Achievement Progress Cache                                           │  │
│  │  • Social Activity Feeds                                                │  │
│  │  • Session-based Bonuses and Multipliers                               │  │
│  └─────────────────────────────────────────────────────────────────────────┘  │
│                                      │                                        │
│  ┌─────────────────────────────────────────────────────────────────────────┐  │
│  │                 InfluxDB - Time-Series Analytics                        │  │
│  │                                                                         │  │
│  │  • User Engagement Metrics                                              │  │
│  │  • Point Earning Patterns                                               │  │
│  │  • Achievement Unlock Rates                                             │  │
│  │  • Social Interaction Frequency                                         │  │
│  │  • Feature Usage Analytics                                              │  │
│  └─────────────────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────────────┘
```

## Point System Design

### 1. Point Calculation Engine

```typescript
interface PointCalculator {
  calculateLocationSharingPoints(session: LocationSharingSession): PointCalculation;
  calculateQualityBonus(dataQuality: DataQuality): number;
  calculateTimeBonus(duration: number, timeOfDay: string): number;
  calculateRouteBonus(routeId: string, popularity: number): number;
  calculateStreakBonus(streakDays: number): number;
}

interface PointCalculation {
  basePoints: number;
  qualityMultiplier: number;
  timeBonus: number;
  routeBonus: number;
  streakBonus: number;
  totalPoints: number;
  breakdown: PointBreakdown[];
}

class PointCalculator implements PointCalculator {
  private pointRules: PointRules;
  
  calculateLocationSharingPoints(session: LocationSharingSession): PointCalculation {
    // Base points calculation
    const basePoints = this.calculateBasePoints(session);
    
    // Quality multiplier based on data accuracy and validation
    const qualityMultiplier = this.calculateQualityMultiplier(session.dataQuality);
    
    // Time-based bonuses (peak hours, night time, etc.)
    const timeBonus = this.calculateTimeBonus(session.duration, session.timeOfDay);
    
    // Route-specific bonuses (underserved routes get higher rewards)
    const routeBonus = this.calculateRouteBonus(session.routeId, session.routePopularity);
    
    // Streak bonus for consecutive days
    const streakBonus = this.calculateStreakBonus(session.userStreakDays);
    
    const totalPoints = Math.round(
      (basePoints * qualityMultiplier) + timeBonus + routeBonus + streakBonus
    );
    
    return {
      basePoints,
      qualityMultiplier,
      timeBonus,
      routeBonus,
      streakBonus,
      totalPoints,
      breakdown: this.generatePointBreakdown({
        basePoints,
        qualityMultiplier,
        timeBonus,
        routeBonus,
        streakBonus
      })
    };
  }
  
  private calculateBasePoints(session: LocationSharingSession): number {
    // Base formula: 1 point per minute of sharing
    const timePoints = session.durationMinutes * 1;
    
    // Distance bonus: 0.1 points per km traveled
    const distancePoints = session.distanceKm * 0.1;
    
    // Riders helped bonus: 2 points per rider helped
    const ridersHelpedPoints = session.ridersHelped * 2;
    
    return timePoints + distancePoints + ridersHelpedPoints;
  }
  
  private calculateQualityMultiplier(dataQuality: DataQuality): number {
    // Quality score ranges from 0.5 to 2.0
    const baseMultiplier = 1.0;
    
    // GPS accuracy bonus (better accuracy = higher multiplier)
    const accuracyBonus = dataQuality.gpsAccuracy < 10 ? 0.3 : 0.1;
    
    // Consistency bonus (consistent data patterns)
    const consistencyBonus = dataQuality.consistencyScore * 0.2;
    
    // Validation bonus (data passed ML validation)
    const validationBonus = dataQuality.mlValidationPassed ? 0.2 : 0;
    
    return Math.min(2.0, baseMultiplier + accuracyBonus + consistencyBonus + validationBonus);
  }
  
  calculateTimeBonus(duration: number, timeOfDay: string): number {
    const hour = parseInt(timeOfDay.split(':')[0]);
    
    // Peak hour bonus (7-10 AM, 5-8 PM)
    if ((hour >= 7 && hour <= 10) || (hour >= 17 && hour <= 20)) {
      return duration * 0.5; // 0.5 bonus points per minute during peak
    }
    
    // Night time bonus (10 PM - 6 AM)
    if (hour >= 22 || hour <= 6) {
      return duration * 0.3; // 0.3 bonus points per minute during night
    }
    
    return 0;
  }
  
  calculateRouteBonus(routeId: string, popularity: number): number {
    // Underserved routes get higher bonuses
    if (popularity < 0.2) { // Less than 20% coverage
      return 10; // High bonus for underserved routes
    } else if (popularity < 0.5) { // Less than 50% coverage
      return 5; // Medium bonus
    }
    
    return 0; // No bonus for well-served routes
  }
  
  calculateStreakBonus(streakDays: number): number {
    if (streakDays >= 30) return 50; // Monthly streak
    if (streakDays >= 7) return 20;  // Weekly streak
    if (streakDays >= 3) return 10;  // 3-day streak
    return 0;
  }
}
```

### 2. Level Progression System

```typescript
interface LevelingSystem {
  calculateLevel(totalPoints: number): LevelInfo;
  getNextLevelRequirement(currentLevel: number): number;
  getLevelRewards(level: number): LevelReward[];
  checkLevelUp(oldPoints: number, newPoints: number): LevelUpResult;
}

interface LevelInfo {
  currentLevel: number;
  pointsInLevel: number;
  pointsToNextLevel: number;
  totalPointsRequired: number;
  progressPercentage: number;
}

interface LevelReward {
  type: 'badge' | 'title' | 'feature_unlock' | 'bonus_multiplier';
  name: string;
  description: string;
  value?: number;
  duration?: number; // for temporary rewards
}

class LevelingSystem implements LevelingSystem {
  // Exponential level progression: Level N requires N^2 * 100 points
  private levelFormula(level: number): number {
    return level * level * 100;
  }
  
  calculateLevel(totalPoints: number): LevelInfo {
    let currentLevel = 1;
    let totalRequired = 0;
    
    // Find current level
    while (totalRequired <= totalPoints) {
      currentLevel++;
      totalRequired += this.levelFormula(currentLevel);
    }
    currentLevel--; // Step back to actual current level
    
    // Recalculate for current level
    const currentLevelTotal = this.getTotalPointsForLevel(currentLevel);
    const nextLevelTotal = this.getTotalPointsForLevel(currentLevel + 1);
    const pointsInLevel = totalPoints - currentLevelTotal;
    const pointsToNextLevel = nextLevelTotal - totalPoints;
    const levelRange = nextLevelTotal - currentLevelTotal;
    const progressPercentage = (pointsInLevel / levelRange) * 100;
    
    return {
      currentLevel,
      pointsInLevel,
      pointsToNextLevel,
      totalPointsRequired: nextLevelTotal,
      progressPercentage
    };
  }
  
  private getTotalPointsForLevel(level: number): number {
    let total = 0;
    for (let i = 1; i <= level; i++) {
      total += this.levelFormula(i);
    }
    return total;
  }
  
  getLevelRewards(level: number): LevelReward[] {
    const rewards: LevelReward[] = [];
    
    // Standard level rewards
    if (level % 5 === 0) { // Every 5 levels
      rewards.push({
        type: 'badge',
        name: `Level ${level} Explorer`,
        description: `Reached level ${level} through consistent contributions`
      });
    }
    
    if (level % 10 === 0) { // Every 10 levels
      rewards.push({
        type: 'bonus_multiplier',
        name: 'Experience Boost',
        description: '1.1x point multiplier for next 7 days',
        value: 1.1,
        duration: 7 * 24 * 60 * 60 * 1000 // 7 days in milliseconds
      });
    }
    
    // Special milestone rewards
    switch (level) {
      case 10:
        rewards.push({
          type: 'title',
          name: 'Transit Contributor',
          description: 'Recognized contributor to Bengaluru transit data'
        });
        break;
      case 25:
        rewards.push({
          type: 'feature_unlock',
          name: 'Route Champion',
          description: 'Ability to become champion of favorite routes'
        });
        break;
      case 50:
        rewards.push({
          type: 'title',
          name: 'Transit Expert',
          description: 'Expert-level contributor with extensive experience'
        });
        break;
    }
    
    return rewards;
  }
  
  checkLevelUp(oldPoints: number, newPoints: number): LevelUpResult {
    const oldLevel = this.calculateLevel(oldPoints);
    const newLevel = this.calculateLevel(newPoints);
    
    if (newLevel.currentLevel > oldLevel.currentLevel) {
      return {
        leveledUp: true,
        oldLevel: oldLevel.currentLevel,
        newLevel: newLevel.currentLevel,
        rewards: this.getLevelRewards(newLevel.currentLevel),
        celebrationMessage: this.generateLevelUpMessage(newLevel.currentLevel)
      };
    }
    
    return { leveledUp: false };
  }
  
  private generateLevelUpMessage(level: number): string {
    const messages = [
      `Congratulations! You've reached Level ${level}!`,
      `Amazing! You're now a Level ${level} Transit Hero!`,
      `Level ${level} unlocked! Your contributions make a difference!`,
      `Fantastic! Level ${level} achieved through your dedication!`
    ];
    
    return messages[Math.floor(Math.random() * messages.length)];
  }
}
```

## Achievement System

### 1. Achievement Engine

```typescript
interface AchievementEngine {
  checkAchievements(userId: string, event: UserEvent): Promise<Achievement[]>;
  getAchievementProgress(userId: string): Promise<AchievementProgress[]>;
  unlockAchievement(userId: string, achievementId: string): Promise<void>;
  getAvailableAchievements(): Achievement[];
}

interface Achievement {
  id: string;
  name: string;
  description: string;
  category: AchievementCategory;
  difficulty: 'bronze' | 'silver' | 'gold' | 'platinum';
  points: number;
  iconUrl: string;
  requirements: AchievementRequirement[];
  isHidden: boolean; // Secret achievements
  isRepeatable: boolean;
  unlockedAt?: Date;
}

enum AchievementCategory {
  CONTRIBUTION = 'contribution',
  EXPLORATION = 'exploration',
  SOCIAL = 'social',
  QUALITY = 'quality',
  CONSISTENCY = 'consistency',
  SPECIAL = 'special'
}

interface AchievementRequirement {
  type: RequirementType;
  value: number;
  timeframe?: 'daily' | 'weekly' | 'monthly' | 'all_time';
  additionalCriteria?: Record<string, any>;
}

enum RequirementType {
  POINTS_EARNED = 'points_earned',
  DISTANCE_SHARED = 'distance_shared',
  TIME_SHARED = 'time_shared',
  ROUTES_CONTRIBUTED = 'routes_contributed',
  CONSECUTIVE_DAYS = 'consecutive_days',
  RIDERS_HELPED = 'riders_helped',
  QUALITY_SCORE = 'quality_score',
  SOCIAL_INTERACTIONS = 'social_interactions',
  REPORTS_SUBMITTED = 'reports_submitted'
}

class AchievementEngine implements AchievementEngine {
  private achievements: Achievement[];
  private achievementRules: AchievementRule[];
  
  constructor() {
    this.initializeAchievements();
  }
  
  private initializeAchievements(): void {
    this.achievements = [
      // Contribution Achievements
      {
        id: 'first_share',
        name: 'First Steps',
        description: 'Share your first location data',
        category: AchievementCategory.CONTRIBUTION,
        difficulty: 'bronze',
        points: 10,
        iconUrl: '/icons/achievements/first_steps.png',
        requirements: [
          { type: RequirementType.TIME_SHARED, value: 1 }
        ],
        isHidden: false,
        isRepeatable: false
      },
      {
        id: 'distance_warrior_100km',
        name: 'Distance Warrior',
        description: 'Share location data for 100 kilometers',
        category: AchievementCategory.CONTRIBUTION,
        difficulty: 'silver',
        points: 50,
        iconUrl: '/icons/achievements/distance_warrior.png',
        requirements: [
          { type: RequirementType.DISTANCE_SHARED, value: 100 }
        ],
        isHidden: false,
        isRepeatable: false
      },
      {
        id: 'time_champion_100h',
        name: 'Time Champion',
        description: 'Share location data for 100 hours',
        category: AchievementCategory.CONTRIBUTION,
        difficulty: 'gold',
        points: 100,
        iconUrl: '/icons/achievements/time_champion.png',
        requirements: [
          { type: RequirementType.TIME_SHARED, value: 100 * 60 } // 100 hours in minutes
        ],
        isHidden: false,
        isRepeatable: false
      },
      
      // Exploration Achievements
      {
        id: 'route_explorer_10',
        name: 'Route Explorer',
        description: 'Contribute to 10 different routes',
        category: AchievementCategory.EXPLORATION,
        difficulty: 'silver',
        points: 30,
        iconUrl: '/icons/achievements/route_explorer.png',
        requirements: [
          { type: RequirementType.ROUTES_CONTRIBUTED, value: 10 }
        ],
        isHidden: false,
        isRepeatable: false
      },
      
      // Consistency Achievements
      {
        id: 'consistent_contributor_7',
        name: 'Consistent Contributor',
        description: 'Share location data for 7 consecutive days',
        category: AchievementCategory.CONSISTENCY,
        difficulty: 'silver',
        points: 40,
        iconUrl: '/icons/achievements/consistent_contributor.png',
        requirements: [
          { type: RequirementType.CONSECUTIVE_DAYS, value: 7 }
        ],
        isHidden: false,
        isRepeatable: false
      },
      {
        id: 'monthly_hero',
        name: 'Monthly Hero',
        description: 'Share location data for 30 consecutive days',
        category: AchievementCategory.CONSISTENCY,
        difficulty: 'platinum',
        points: 200,
        iconUrl: '/icons/achievements/monthly_hero.png',
        requirements: [
          { type: RequirementType.CONSECUTIVE_DAYS, value: 30 }
        ],
        isHidden: false,
        isRepeatable: true
      },
      
      // Quality Achievements
      {
        id: 'quality_guru',
        name: 'Quality Guru',
        description: 'Maintain an average quality score of 90%',
        category: AchievementCategory.QUALITY,
        difficulty: 'gold',
        points: 75,
        iconUrl: '/icons/achievements/quality_guru.png',
        requirements: [
          { type: RequirementType.QUALITY_SCORE, value: 90 }
        ],
        isHidden: false,
        isRepeatable: false
      },
      
      // Social Achievements
      {
        id: 'community_builder',
        name: 'Community Builder',
        description: 'Help 1000 fellow commuters with your data',
        category: AchievementCategory.SOCIAL,
        difficulty: 'gold',
        points: 100,
        iconUrl: '/icons/achievements/community_builder.png',
        requirements: [
          { type: RequirementType.RIDERS_HELPED, value: 1000 }
        ],
        isHidden: false,
        isRepeatable: false
      },
      
      // Special/Hidden Achievements
      {
        id: 'night_owl',
        name: 'Night Owl',
        description: 'Share location data between 11 PM and 5 AM',
        category: AchievementCategory.SPECIAL,
        difficulty: 'bronze',
        points: 25,
        iconUrl: '/icons/achievements/night_owl.png',
        requirements: [
          { 
            type: RequirementType.TIME_SHARED, 
            value: 30,
            additionalCriteria: { timeRange: { start: '23:00', end: '05:00' } }
          }
        ],
        isHidden: true,
        isRepeatable: false
      }
    ];
  }
  
  async checkAchievements(userId: string, event: UserEvent): Promise<Achievement[]> {
    const userProgress = await this.getUserProgress(userId);
    const unlockedAchievements: Achievement[] = [];
    
    for (const achievement of this.achievements) {
      if (await this.isAchievementUnlocked(userId, achievement.id)) {
        continue; // Skip already unlocked achievements (unless repeatable)
      }
      
      const isUnlocked = await this.evaluateAchievementRequirements(
        achievement,
        userProgress,
        event
      );
      
      if (isUnlocked) {
        await this.unlockAchievement(userId, achievement.id);
        unlockedAchievements.push(achievement);
      }
    }
    
    return unlockedAchievements;
  }
  
  private async evaluateAchievementRequirements(
    achievement: Achievement,
    userProgress: UserProgress,
    event: UserEvent
  ): Promise<boolean> {
    for (const requirement of achievement.requirements) {
      if (!await this.checkRequirement(requirement, userProgress, event)) {
        return false;
      }
    }
    return true;
  }
  
  private async checkRequirement(
    requirement: AchievementRequirement,
    userProgress: UserProgress,
    event: UserEvent
  ): Promise<boolean> {
    switch (requirement.type) {
      case RequirementType.POINTS_EARNED:
        return userProgress.totalPoints >= requirement.value;
        
      case RequirementType.DISTANCE_SHARED:
        return userProgress.totalDistanceShared >= requirement.value;
        
      case RequirementType.TIME_SHARED:
        return userProgress.totalTimeShared >= requirement.value;
        
      case RequirementType.ROUTES_CONTRIBUTED:
        return userProgress.uniqueRoutesContributed >= requirement.value;
        
      case RequirementType.CONSECUTIVE_DAYS:
        return userProgress.currentStreak >= requirement.value;
        
      case RequirementType.RIDERS_HELPED:
        return userProgress.totalRidersHelped >= requirement.value;
        
      case RequirementType.QUALITY_SCORE:
        return userProgress.averageQualityScore >= requirement.value;
        
      default:
        return false;
    }
  }
  
  async unlockAchievement(userId: string, achievementId: string): Promise<void> {
    const achievement = this.achievements.find(a => a.id === achievementId);
    if (!achievement) return;
    
    // Save to database
    await this.db.userAchievements.create({
      userId,
      achievementId,
      unlockedAt: new Date(),
      pointsAwarded: achievement.points
    });
    
    // Update user's total points
    await this.updateUserPoints(userId, achievement.points);
    
    // Send notification
    await this.notificationService.sendAchievementNotification(userId, achievement);
    
    // Track analytics
    await this.analyticsService.trackEvent('achievement_unlocked', {
      userId,
      achievementId,
      category: achievement.category,
      difficulty: achievement.difficulty,
      points: achievement.points
    });
  }
}
```

## Leaderboard System

### 1. Multi-Dimensional Ranking

```typescript
interface LeaderboardManager {
  updateUserRanking(userId: string, metrics: UserMetrics): Promise<void>;
  getLeaderboard(type: LeaderboardType, filters?: LeaderboardFilters): Promise<LeaderboardEntry[]>;
  getUserRank(userId: string, type: LeaderboardType): Promise<UserRankInfo>;
  resetPeriodicLeaderboards(): Promise<void>;
}

enum LeaderboardType {
  DAILY_POINTS = 'daily_points',
  WEEKLY_POINTS = 'weekly_points',
  MONTHLY_POINTS = 'monthly_points',
  ALL_TIME_POINTS = 'all_time_points',
  ROUTE_SPECIFIC = 'route_specific',
  DISTANCE_SHARED = 'distance_shared',
  TIME_SHARED = 'time_shared',
  RIDERS_HELPED = 'riders_helped',
  QUALITY_SCORE = 'quality_score'
}

interface LeaderboardEntry {
  rank: number;
  userId: string;
  username: string;
  displayName: string;
  avatarUrl?: string;
  score: number;
  metric: string;
  change: RankChange;
}

interface RankChange {
  direction: 'up' | 'down' | 'same' | 'new';
  positions: number;
}

class LeaderboardManager implements LeaderboardManager {
  private redis: RedisClient;
  private db: DatabaseClient;
  
  async updateUserRanking(userId: string, metrics: UserMetrics): Promise<void> {
    const updates = [
      // Point-based leaderboards
      this.updateLeaderboard(LeaderboardType.DAILY_POINTS, userId, metrics.dailyPoints),
      this.updateLeaderboard(LeaderboardType.WEEKLY_POINTS, userId, metrics.weeklyPoints),
      this.updateLeaderboard(LeaderboardType.MONTHLY_POINTS, userId, metrics.monthlyPoints),
      this.updateLeaderboard(LeaderboardType.ALL_TIME_POINTS, userId, metrics.totalPoints),
      
      // Metric-specific leaderboards
      this.updateLeaderboard(LeaderboardType.DISTANCE_SHARED, userId, metrics.totalDistance),
      this.updateLeaderboard(LeaderboardType.TIME_SHARED, userId, metrics.totalTime),
      this.updateLeaderboard(LeaderboardType.RIDERS_HELPED, userId, metrics.ridersHelped),
      this.updateLeaderboard(LeaderboardType.QUALITY_SCORE, userId, metrics.qualityScore)
    ];
    
    // Route-specific leaderboards
    for (const [routeId, routeMetrics] of Object.entries(metrics.routeMetrics)) {
      updates.push(
        this.updateRouteLeaderboard(routeId, userId, routeMetrics.points)
      );
    }
    
    await Promise.all(updates);
  }
  
  private async updateLeaderboard(
    type: LeaderboardType,
    userId: string,
    score: number
  ): Promise<void> {
    const leaderboardKey = this.getLeaderboardKey(type);
    
    // Update Redis sorted set
    await this.redis.zadd(leaderboardKey, score, userId);
    
    // Set TTL for time-based leaderboards
    if (this.isTimeBased(type)) {
      await this.redis.expire(leaderboardKey, this.getTTL(type));
    }
  }
  
  async getLeaderboard(
    type: LeaderboardType,
    filters?: LeaderboardFilters
  ): Promise<LeaderboardEntry[]> {
    const leaderboardKey = this.getLeaderboardKey(type, filters);
    
    // Get top entries from Redis sorted set (descending order)
    const entries = await this.redis.zrevrange(
      leaderboardKey,
      0,
      (filters?.limit || 50) - 1,
      'WITHSCORES'
    );
    
    const leaderboardEntries: LeaderboardEntry[] = [];
    
    for (let i = 0; i < entries.length; i += 2) {
      const userId = entries[i];
      const score = parseFloat(entries[i + 1]);
      const rank = Math.floor(i / 2) + 1;
      
      const user = await this.getUserInfo(userId);
      const rankChange = await this.getRankChange(userId, type, rank);
      
      leaderboardEntries.push({
        rank,
        userId,
        username: user.username,
        displayName: user.displayName,
        avatarUrl: user.avatarUrl,
        score,
        metric: this.getMetricLabel(type),
        change: rankChange
      });
    }
    
    return leaderboardEntries;
  }
  
  async getUserRank(userId: string, type: LeaderboardType): Promise<UserRankInfo> {
    const leaderboardKey = this.getLeaderboardKey(type);
    
    // Get user's rank (0-based, so add 1)
    const rank = await this.redis.zrevrank(leaderboardKey, userId);
    const score = await this.redis.zscore(leaderboardKey, userId);
    const totalUsers = await this.redis.zcard(leaderboardKey);
    
    if (rank === null) {
      return {
        rank: null,
        score: 0,
        totalUsers,
        percentile: 0
      };
    }
    
    const actualRank = rank + 1;
    const percentile = ((totalUsers - rank) / totalUsers) * 100;
    
    return {
      rank: actualRank,
      score: parseFloat(score || '0'),
      totalUsers,
      percentile: Math.round(percentile)
    };
  }
  
  private async getRankChange(
    userId: string,
    type: LeaderboardType,
    currentRank: number
  ): Promise<RankChange> {
    const previousRankKey = `${this.getLeaderboardKey(type)}:previous`;
    const previousRank = await this.redis.zscore(previousRankKey, userId);
    
    if (previousRank === null) {
      return { direction: 'new', positions: 0 };
    }
    
    const previousRankNum = parseInt(previousRank);
    const difference = previousRankNum - currentRank;
    
    if (difference > 0) {
      return { direction: 'up', positions: difference };
    } else if (difference < 0) {
      return { direction: 'down', positions: Math.abs(difference) };
    } else {
      return { direction: 'same', positions: 0 };
    }
  }
  
  async resetPeriodicLeaderboards(): Promise<void> {
    // This should be called by a scheduled job
    const now = new Date();
    
    // Daily reset (at midnight)
    if (now.getHours() === 0 && now.getMinutes() === 0) {
      await this.backupAndResetLeaderboard(LeaderboardType.DAILY_POINTS);
    }
    
    // Weekly reset (on Monday at midnight)
    if (now.getDay() === 1 && now.getHours() === 0 && now.getMinutes() === 0) {
      await this.backupAndResetLeaderboard(LeaderboardType.WEEKLY_POINTS);
    }
    
    // Monthly reset (on 1st at midnight)
    if (now.getDate() === 1 && now.getHours() === 0 && now.getMinutes() === 0) {
      await this.backupAndResetLeaderboard(LeaderboardType.MONTHLY_POINTS);
    }
  }
  
  private async backupAndResetLeaderboard(type: LeaderboardType): Promise<void> {
    const currentKey = this.getLeaderboardKey(type);
    const previousKey = `${currentKey}:previous`;
    
    // Backup current leaderboard
    await this.redis.rename(currentKey, previousKey);
    
    // Set expiration for previous leaderboard
    await this.redis.expire(previousKey, 7 * 24 * 60 * 60); // 7 days
    
    // Award prizes to top performers
    await this.awardPeriodicPrizes(type, previousKey);
  }
  
  private async awardPeriodicPrizes(type: LeaderboardType, leaderboardKey: string): Promise<void> {
    const topUsers = await this.redis.zrevrange(leaderboardKey, 0, 9); // Top 10
    
    for (let i = 0; i < topUsers.length; i++) {
      const userId = topUsers[i];
      const rank = i + 1;
      const prize = this.calculatePrize(type, rank);
      
      if (prize.points > 0) {
        await this.awardPrize(userId, prize);
      }
    }
  }
  
  private calculatePrize(type: LeaderboardType, rank: number): Prize {
    const basePrizes = {
      1: { points: 100, title: 'Champion' },
      2: { points: 75, title: 'Runner-up' },
      3: { points: 50, title: 'Third Place' },
    };
    
    if (rank <= 3) {
      return basePrizes[rank as keyof typeof basePrizes];
    } else if (rank <= 10) {
      return { points: 25, title: 'Top 10' };
    }
    
    return { points: 0, title: '' };
  }
}
```

This comprehensive gamification system provides engaging user experiences through points, levels, achievements, and competitive leaderboards while maintaining user privacy and encouraging consistent participation in the crowdsourced transit data collection.