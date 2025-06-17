# Security Architecture - BMTC Transit App

## Overview

The security architecture provides comprehensive protection for the BMTC Transit App, focusing on user privacy, data integrity, and system security. This design implements defense-in-depth principles with multiple security layers, robust authentication, and advanced threat detection mechanisms.

## Security Architecture Framework

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           PERIMETER SECURITY                                │
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────────┐  │
│  │                        WAF & DDoS Protection                           │  │
│  │                                                                         │  │
│  │  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐          │  │
│  │  │   CloudFlare    │  │   AWS WAF       │  │   Rate Limiting │          │  │
│  │  │   Protection    │  │   Rules         │  │   & Throttling  │          │  │
│  │  │                 │  │                 │  │                 │          │  │
│  │  │ • DDoS          │  │ • SQL Injection │  │ • Per-IP limits │          │  │
│  │  │   Mitigation    │  │   Prevention    │  │ • Per-User      │          │  │
│  │  │ • Bot           │  │ • XSS           │  │   limits        │          │  │
│  │  │   Detection     │  │   Prevention    │  │ • Geographic    │          │  │
│  │  │ • Geographic    │  │ • CSRF          │  │   filtering     │          │  │
│  │  │   Filtering     │  │   Protection    │  │ • Burst         │          │  │
│  │  │ • SSL/TLS       │  │ • Input         │  │   detection     │          │  │
│  │  │   Termination   │  │   Validation    │  │                 │          │  │
│  │  └─────────────────┘  └─────────────────┘  └─────────────────┘          │  │
│  └─────────────────────────────────────────────────────────────────────────┘  │
└─────────────────────────┬───────────────────────────────────────────────────┘
                          │
┌─────────────────────────▼───────────────────────────────────────────────────┐
│                      API GATEWAY SECURITY                                   │
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────────┐  │
│  │                        Kong Security Plugins                           │  │
│  │                                                                         │  │
│  │  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐          │  │
│  │  │   JWT           │  │   OAuth 2.0     │  │   API Key       │          │  │
│  │  │   Validation    │  │   Integration   │  │   Management    │          │  │
│  │  │                 │  │                 │  │                 │          │  │
│  │  │ • Token         │  │ • Authorization │  │ • Key           │          │  │
│  │  │   Signature     │  │   Code Flow     │  │   Generation    │          │  │
│  │  │   Verification  │  │ • PKCE          │  │ • Key           │          │  │
│  │  │ • Expiration    │  │   Support       │  │   Rotation      │          │  │
│  │  │   Checking      │  │ • Scope         │  │ • Usage         │          │  │
│  │  │ • Refresh       │  │   Management    │  │   Analytics     │          │  │
│  │  │   Token         │  │ • State         │  │ • Quota         │          │  │
│  │  │   Handling      │  │   Validation    │  │   Management    │          │  │
│  │  └─────────────────┘  └─────────────────┘  └─────────────────┘          │  │
│  │                                                                         │  │
│  │  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐          │  │
│  │  │   Request       │  │   Response      │  │   Audit         │          │  │
│  │  │   Validation    │  │   Filtering     │  │   Logging       │          │  │
│  │  │                 │  │                 │  │                 │          │  │
│  │  │ • Input         │  │ • PII           │  │ • Request       │          │  │
│  │  │   Sanitization  │  │   Redaction     │  │   Tracking      │          │  │
│  │  │ • Schema        │  │ • Error         │  │ • Security      │          │  │
│  │  │   Validation    │  │   Handling      │  │   Events        │          │  │
│  │  │ • File Upload   │  │ • Data          │  │ • Compliance    │          │  │
│  │  │   Security      │  │   Anonymization │  │   Reporting     │          │  │
│  │  └─────────────────┘  └─────────────────┘  └─────────────────┘          │  │
│  └─────────────────────────────────────────────────────────────────────────┘  │
└─────────────────────────┬───────────────────────────────────────────────────┘
                          │
┌─────────────────────────▼───────────────────────────────────────────────────┐
│                    APPLICATION SECURITY                                     │
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────────┐  │
│  │                     Service-to-Service Security                        │  │
│  │                                                                         │  │
│  │  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐          │  │
│  │  │   Mutual TLS    │  │   Service       │  │   Zero Trust    │          │  │
│  │  │   (mTLS)        │  │   Mesh          │  │   Network       │          │  │
│  │  │                 │  │   Security      │  │                 │          │  │
│  │  │ • Certificate   │  │ • Istio         │  │ • Identity      │          │  │
│  │  │   Management    │  │   Security      │  │   Verification  │          │  │
│  │  │ • Auto          │  │   Policies      │  │ • Least         │          │  │
│  │  │   Rotation      │  │ • Traffic       │  │   Privilege     │          │  │
│  │  │ • Identity      │  │   Encryption    │  │ • Continuous    │          │  │
│  │  │   Verification  │  │ • RBAC          │  │   Monitoring    │          │  │
│  │  │                 │  │   Enforcement   │  │                 │          │  │
│  │  └─────────────────┘  └─────────────────┘  └─────────────────┘          │  │
│  └─────────────────────────────────────────────────────────────────────────┘  │
│                                      │                                        │
│  ┌─────────────────────────────────────────────────────────────────────────┐  │
│  │                      Data Protection Layer                             │  │
│  │                                                                         │  │
│  │  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐          │  │
│  │  │   Encryption    │  │   Key           │  │   Data          │          │  │
│  │  │   at Rest       │  │   Management    │  │   Classification│          │  │
│  │  │                 │  │                 │  │                 │          │  │
│  │  │ • Database      │  │ • AWS KMS       │  │ • PII           │          │  │
│  │  │   Encryption    │  │   Integration   │  │   Identification│          │  │
│  │  │ • File System   │  │ • Key Rotation  │  │ • Sensitivity   │          │  │
│  │  │   Encryption    │  │ • Hardware      │  │   Labeling      │          │  │
│  │  │ • Backup        │  │   Security      │  │ • Access        │          │  │
│  │  │   Encryption    │  │   Modules (HSM) │  │   Controls      │          │  │
│  │  └─────────────────┘  └─────────────────┘  └─────────────────┘          │  │
│  └─────────────────────────────────────────────────────────────────────────┘  │
└─────────────────────────┬───────────────────────────────────────────────────┘
                          │
┌─────────────────────────▼───────────────────────────────────────────────────┐
│                     THREAT DETECTION & RESPONSE                             │
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────────┐  │
│  │                     Security Monitoring                                │  │
│  │                                                                         │  │
│  │  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐          │  │
│  │  │   SIEM          │  │   Anomaly       │  │   Incident      │          │  │
│  │  │   Integration   │  │   Detection     │  │   Response      │          │  │
│  │  │                 │  │                 │  │                 │          │  │
│  │  │ • Log           │  │ • Behavioral    │  │ • Automated     │          │  │
│  │  │   Aggregation   │  │   Analysis      │  │   Response      │          │  │
│  │  │ • Security      │  │ • ML-based      │  │ • Alert         │          │  │
│  │  │   Analytics     │  │   Detection     │  │   Management    │          │  │
│  │  │ • Compliance    │  │ • GPS Spoofing  │  │ • Forensics     │          │  │
│  │  │   Reporting     │  │   Detection     │  │ • Recovery      │          │  │
│  │  └─────────────────┘  └─────────────────┘  └─────────────────┘          │  │
│  └─────────────────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────────────┘
```

## Authentication & Authorization

### 1. Multi-Factor Authentication System

```typescript
interface AuthenticationService {
  authenticateUser(credentials: UserCredentials): Promise<AuthResult>;
  enableMFA(userId: string, method: MFAMethod): Promise<MFASetupResult>;
  verifyMFA(userId: string, token: string): Promise<boolean>;
  refreshToken(refreshToken: string): Promise<TokenPair>;
}

interface UserCredentials {
  username?: string;
  email?: string;
  password: string;
  phoneNumber?: string;
  biometricData?: BiometricAuth;
}

enum MFAMethod {
  SMS = 'sms',
  EMAIL = 'email',
  TOTP = 'totp',
  BIOMETRIC = 'biometric'
}

class AuthenticationService implements AuthenticationService {
  private jwtService: JWTService;
  private passwordHasher: PasswordHasher;
  private mfaProvider: MFAProvider;
  private securityLogger: SecurityLogger;

  async authenticateUser(credentials: UserCredentials): Promise<AuthResult> {
    try {
      // Rate limiting check
      await this.checkRateLimit(credentials.email || credentials.username);
      
      // User validation
      const user = await this.validateUser(credentials);
      if (!user) {
        await this.logSecurityEvent('INVALID_LOGIN_ATTEMPT', credentials);
        throw new AuthenticationError('Invalid credentials');
      }
      
      // Password verification with timing attack protection
      const isValidPassword = await this.verifyPasswordSecure(
        credentials.password, 
        user.passwordHash
      );
      
      if (!isValidPassword) {
        await this.incrementFailedAttempts(user.id);
        await this.logSecurityEvent('FAILED_PASSWORD_ATTEMPT', { userId: user.id });
        throw new AuthenticationError('Invalid credentials');
      }
      
      // Check if MFA is required
      if (user.mfaEnabled) {
        return {
          success: false,
          requiresMFA: true,
          mfaChallenge: await this.generateMFAChallenge(user.id),
          tempToken: await this.generateTempToken(user.id)
        };
      }
      
      // Generate tokens
      const tokens = await this.generateTokens(user);
      
      // Log successful authentication
      await this.logSecurityEvent('SUCCESSFUL_LOGIN', { userId: user.id });
      
      return {
        success: true,
        user: this.sanitizeUser(user),
        tokens,
        expiresIn: 3600 // 1 hour
      };
      
    } catch (error) {
      await this.logSecurityEvent('AUTHENTICATION_ERROR', { error: error.message });
      throw error;
    }
  }

  private async verifyPasswordSecure(password: string, hash: string): Promise<boolean> {
    // Use constant-time comparison to prevent timing attacks
    const startTime = process.hrtime();
    
    try {
      const isValid = await bcrypt.compare(password, hash);
      
      // Ensure minimum computation time to prevent timing analysis
      const elapsed = process.hrtime(startTime);

      const elapsedMs = elapsed[0] * 1000 + elapsed[1] / 1e6;
      const minTime = 100; // 100ms minimum
      
      if (elapsedMs < minTime) {
        await this.sleep(minTime - elapsedMs);
      }
      
      return isValid;
    } catch (error) {
      // Still consume minimum time even on error
      const elapsed = process.hrtime(startTime);
      const elapsedMs = elapsed[0] * 1000 + elapsed[1] / 1e6;
      if (elapsedMs < 100) {
        await this.sleep(100 - elapsedMs);
      }
      return false;
    }
  }

  async enableMFA(userId: string, method: MFAMethod): Promise<MFASetupResult> {
    const user = await this.getUserById(userId);
    
    switch (method) {
      case MFAMethod.TOTP:
        const secret = speakeasy.generateSecret({
          name: `BMTC Transit App (${user.email})`,
          issuer: 'BMTC Transit'
        });
        
        await this.storeMFASecret(userId, secret.base32);
        
        return {
          success: true,
          qrCode: await QRCode.toDataURL(secret.otpauth_url),
          backupCodes: await this.generateBackupCodes(userId),
          secret: secret.base32
        };
        
      case MFAMethod.SMS:
        const phoneToken = await this.generatePhoneVerificationToken(user.phoneNumber);
        await this.sendSMSToken(user.phoneNumber, phoneToken);
        
        return {
          success: true,
          message: 'Verification code sent to your phone'
        };
        
      default:
        throw new Error(`MFA method ${method} not supported`);
    }
  }
}
```

### 2. JWT Security Implementation

```typescript
interface JWTService {
  generateTokens(user: User): Promise<TokenPair>;
  verifyToken(token: string): Promise<TokenPayload>;
  revokeToken(token: string): Promise<void>;
  rotateSecret(): Promise<void>;
}

interface TokenPair {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

class JWTService implements JWTService {
  private secretKey: string;
  private algorithm: string = 'HS256';
  private issuer: string = 'bmtc-transit-app';
  private keyRotationInterval: number = 24 * 60 * 60 * 1000; // 24 hours

  constructor() {
    this.secretKey = process.env.JWT_SECRET || this.generateSecureSecret();
    this.setupKeyRotation();
  }

  async generateTokens(user: User): Promise<TokenPair> {
    const now = Math.floor(Date.now() / 1000);
    const accessTokenExpiry = now + 3600; // 1 hour
    const refreshTokenExpiry = now + (7 * 24 * 3600); // 7 days

    // Access token payload - minimal data
    const accessPayload = {
      sub: user.id,
      iat: now,
      exp: accessTokenExpiry,
      aud: 'bmtc-api',
      iss: this.issuer,
      scope: user.permissions || 'basic',
      // No sensitive data in access token
    };

    // Refresh token payload - includes refresh-specific claims
    const refreshPayload = {
      sub: user.id,
      iat: now,
      exp: refreshTokenExpiry,
      aud: 'bmtc-refresh',
      iss: this.issuer,
      type: 'refresh',
      jti: this.generateJTI() // Unique token ID for revocation
    };

    const accessToken = jwt.sign(accessPayload, this.secretKey, { algorithm: this.algorithm });
    const refreshToken = jwt.sign(refreshPayload, this.secretKey, { algorithm: this.algorithm });

    // Store refresh token for revocation tracking
    await this.storeRefreshToken(user.id, refreshPayload.jti, refreshTokenExpiry);

    return {
      accessToken,
      refreshToken,
      expiresIn: 3600
    };
  }

  async verifyToken(token: string): Promise<TokenPayload> {
    try {
      // Check if token is revoked
      if (await this.isTokenRevoked(token)) {
        throw new Error('Token has been revoked');
      }

      const payload = jwt.verify(token, this.secretKey, {
        algorithms: [this.algorithm],
        issuer: this.issuer,
        clockTolerance: 30 // 30 seconds clock skew tolerance
      }) as TokenPayload;

      // Additional security validations
      await this.validateTokenClaims(payload);

      return payload;
    } catch (error) {
      await this.logSecurityEvent('TOKEN_VERIFICATION_FAILED', { 
        error: error.message,
        token: this.hashToken(token) // Log hash, not actual token
      });
      throw new TokenVerificationError('Invalid token');
    }
  }

  private async validateTokenClaims(payload: TokenPayload): Promise<void> {
    // Validate audience
    if (payload.aud !== 'bmtc-api' && payload.aud !== 'bmtc-refresh') {
      throw new Error('Invalid token audience');
    }

    // Validate issued time (not too far in the past/future)
    const now = Math.floor(Date.now() / 1000);
    const maxAge = 8 * 24 * 3600; // 8 days max age
    
    if (payload.iat > now + 300) { // 5 minutes future tolerance
      throw new Error('Token issued in the future');
    }
    
    if (now - payload.iat > maxAge) {
      throw new Error('Token too old');
    }
  }

  private generateSecureSecret(): string {
    return crypto.randomBytes(64).toString('hex');
  }

  private setupKeyRotation(): void {
    setInterval(async () => {
      await this.rotateSecret();
    }, this.keyRotationInterval);
  }
}
```

## Input Validation & Sanitization

### 1. Comprehensive Input Validation

```typescript
interface InputValidator {
  validateLocationData(data: LocationInput): ValidationResult;
  validateUserInput(data: UserInput): ValidationResult;
  sanitizeInput(input: string): string;
  preventInjectionAttacks(input: any): any;
}

class SecurityInputValidator implements InputValidator {
  private readonly locationSchema = Joi.object({
    latitude: Joi.number().min(-90).max(90).precision(8).required(),
    longitude: Joi.number().min(-180).max(180).precision(8).required(),
    speed: Joi.number().min(0).max(200).required(), // Max 200 km/h
    heading: Joi.number().min(0).max(360).required(),
    accuracy: Joi.number().min(0).max(1000).required(),
    timestamp: Joi.number().integer().min(Date.now() - 300000).max(Date.now() + 60000).required(),
    routeId: Joi.string().uuid().required(),
    sessionId: Joi.string().uuid().required()
  });

  private readonly userSchema = Joi.object({
    username: Joi.string().alphanum().min(3).max(30).pattern(/^[a-zA-Z0-9_]+$/).required(),
    email: Joi.string().email({ tlds: { allow: false } }).max(255).required(),
    password: Joi.string().min(8).max(128)
      .pattern(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/)
      .required(),
    phoneNumber: Joi.string().pattern(/^\+91[6-9]\d{9}$/).optional(),
    displayName: Joi.string().min(1).max(100).pattern(/^[a-zA-Z0-9\s._-]+$/).optional()
  });

  validateLocationData(data: LocationInput): ValidationResult {
    // Basic schema validation
    const schemaResult = this.locationSchema.validate(data, { 
      abortEarly: false,
      stripUnknown: true 
    });
    
    if (schemaResult.error) {
      return {
        valid: false,
        errors: schemaResult.error.details.map(d => d.message),
        sanitizedData: null
      };
    }

    // Geographic bounds validation for Bengaluru
    const bengaluruBounds = {
      minLat: 12.7342,
      maxLat: 13.1939,
      minLng: 77.3910,
      maxLng: 77.7669
    };

    if (data.latitude < bengaluruBounds.minLat || data.latitude > bengaluruBounds.maxLat ||
        data.longitude < bengaluruBounds.minLng || data.longitude > bengaluruBounds.maxLng) {
      return {
        valid: false,
        errors: ['Location outside Bengaluru metropolitan area'],
        sanitizedData: null
      };
    }

    // Speed validation for transit vehicles
    if (data.speed > 100) { // 100 km/h max for buses/metro
      return {
        valid: false,
        errors: ['Speed exceeds maximum limit for transit vehicles'],
        sanitizedData: null
      };
    }

    return {
      valid: true,
      errors: [],
      sanitizedData: schemaResult.value
    };
  }

  sanitizeInput(input: string): string {
    if (typeof input !== 'string') {
      return '';
    }

    // Remove potentially dangerous characters
    let sanitized = input
      .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '') // Remove script tags
      .replace(/javascript:/gi, '') // Remove javascript: protocol
      .replace(/on\w+\s*=/gi, '') // Remove event handlers
      .replace(/[<>'"&]/g, (match) => { // HTML entity encoding
        const entities: { [key: string]: string } = {
          '<': '&lt;',
          '>': '&gt;',
          '"': '&quot;',
          "'": '&#x27;',
          '&': '&amp;'
        };
        return entities[match];
      });

    // Limit length
    sanitized = sanitized.substring(0, 10000);

    // Normalize unicode
    sanitized = sanitized.normalize('NFKC');

    return sanitized.trim();
  }

  preventInjectionAttacks(input: any): any {
    if (typeof input === 'string') {
      // SQL injection prevention
      if (this.containsSQLInjection(input)) {
        throw new SecurityError('Potential SQL injection detected');
      }

      // NoSQL injection prevention
      if (this.containsNoSQLInjection(input)) {
        throw new SecurityError('Potential NoSQL injection detected');
      }

      return this.sanitizeInput(input);
    }

    if (Array.isArray(input)) {
      return input.map(item => this.preventInjectionAttacks(item));
    }

    if (typeof input === 'object' && input !== null) {
      const sanitized: any = {};
      for (const [key, value] of Object.entries(input)) {
        const sanitizedKey = this.sanitizeInput(key);
        sanitized[sanitizedKey] = this.preventInjectionAttacks(value);
      }
      return sanitized;
    }

    return input;
  }

  private containsSQLInjection(input: string): boolean {
    const sqlPatterns = [
      /(\b(ALTER|CREATE|DELETE|DROP|EXEC(UTE)?|INSERT( +INTO)?|MERGE|SELECT|UPDATE|UNION( +ALL)?)\b)/i,
      /(\/\*[\s\S]*?\*\/)/i, // SQL comments
      /(-{2,}.*$)/mi, // SQL comments
      /('|(\\')|(;|\/\*|\*\/|@@|@))/i,
      /(eval\s*\()/i,
      /(script\s*:)/i
    ];

    return sqlPatterns.some(pattern => pattern.test(input));
  }

  private containsNoSQLInjection(input: string): boolean {
    try {
      const parsed = JSON.parse(input);
      return this.checkNoSQLOperators(parsed);
    } catch {
      // Check for MongoDB operators in string form
      const nosqlPatterns = [
        /\$where/i,
        /\$ne/i,
        /\$gt/i,
        /\$lt/i,
        /\$regex/i,
        /\$or/i,
        /\$and/i
      ];
      
      return nosqlPatterns.some(pattern => pattern.test(input));
    }
  }

  private checkNoSQLOperators(obj: any): boolean {
    if (typeof obj !== 'object' || obj === null) {
      return false;
    }

    const dangerousOperators = ['$where', '$ne', '$gt', '$lt', '$regex', '$or', '$and'];
    
    for (const key of Object.keys(obj)) {
      if (dangerousOperators.includes(key)) {
        return true;
      }
      
      if (typeof obj[key] === 'object' && this.checkNoSQLOperators(obj[key])) {
        return true;
      }
    }

    return false;
  }
}
```

## GPS Spoofing Prevention

### 1. Advanced GPS Validation

```typescript
interface GPSSpoofingPrevention {
  validateGPSData(locationData: LocationData, userHistory: LocationData[]): SpoofingAnalysis;
  detectDeviceMovement(accelerometer: AccelerometerData, gps: LocationData): MovementConsistency;
  verifyLocationContext(location: LocationData, contextData: ContextData): ContextValidation;
}

interface SpoofingAnalysis {

  isSpoofed: boolean;
  confidence: number;
  reasons: string[];
  riskScore: number;
  recommendation: 'accept' | 'reject' | 'flag_for_review';
}

class GPSSpoofingPrevention implements GPSSpoofingPrevention {
  private mlDetector: GPSSpoofingMLModel;
  private geofenceValidator: GeofenceValidator;
  
  validateGPSData(locationData: LocationData, userHistory: LocationData[]): SpoofingAnalysis {
    const checks = [
      this.checkImpossibleMovement(locationData, userHistory),
      this.checkAccuracyConsistency(locationData, userHistory),
      this.checkSignalStrengthPatterns(locationData),
      this.checkSatelliteData(locationData),
      this.checkMovementPatterns(locationData, userHistory),
      this.checkGeographicConstraints(locationData),
      this.checkTimingConsistency(locationData, userHistory)
    ];

    const suspiciousChecks = checks.filter(check => check.isSuspicious);
    const riskScore = this.calculateRiskScore(checks);
    
    // ML-based detection
    const mlAnalysis = this.mlDetector.analyzeSpoofing(locationData, userHistory);
    
    const finalConfidence = (riskScore + mlAnalysis.confidence) / 2;
    const isSpoofed = finalConfidence > 0.75;

    return {
      isSpoofed,
      confidence: finalConfidence,
      reasons: [...suspiciousChecks.map(c => c.reason), ...mlAnalysis.reasons],
      riskScore,
      recommendation: this.getRecommendation(finalConfidence, riskScore)
    };
  }

  private checkImpossibleMovement(current: LocationData, history: LocationData[]): ValidationCheck {
    if (history.length === 0) {
      return { isSuspicious: false, reason: '', score: 0 };
    }

    const previous = history[history.length - 1];
    const distance = this.haversineDistance(previous, current);
    const timeDiff = (current.timestamp - previous.timestamp) / 1000; // seconds
    const speed = (distance / timeDiff) * 3.6; // km/h

    // Check for teleportation
    if (speed > 200) { // Impossible speed for any ground transport
      return {
        isSuspicious: true,
        reason: `Impossible movement speed: ${speed.toFixed(1)} km/h`,
        score: 0.9
      };
    }

    // Check for sudden acceleration
    if (history.length >= 2) {
      const prevSpeed = current.speed;
      const acceleration = Math.abs(speed - prevSpeed) / timeDiff;
      
      if (acceleration > 10) { // m/s² - impossible acceleration
        return {
          isSuspicious: true,
          reason: `Impossible acceleration: ${acceleration.toFixed(1)} m/s²`,
          score: 0.8
        };
      }
    }

    return { isSuspicious: false, reason: '', score: 0 };
  }

  private checkAccuracyConsistency(current: LocationData, history: LocationData[]): ValidationCheck {
    // Spoofed GPS often claims unrealistically high accuracy
    if (current.accuracy < 1) {
      return {
        isSuspicious: true,
        reason: 'Unrealistically high GPS accuracy claimed',
        score: 0.7
      };
    }

    // Check for consistent perfect accuracy (sign of simulation)
    const recentAccuracies = history.slice(-10).map(h => h.accuracy);
    const variance = this.calculateVariance(recentAccuracies);
    
    if (recentAccuracies.length >= 5 && variance < 0.1) {
      return {
        isSuspicious: true,
        reason: 'GPS accuracy too consistent (possible simulation)',
        score: 0.6
      };
    }

    return { isSuspicious: false, reason: '', score: 0 };
  }

  private checkSatelliteData(locationData: LocationData): ValidationCheck {
    // Check for suspicious satellite counts
    const satCount = locationData.satelliteCount;
    
    if (satCount && (satCount < 4 || satCount > 12)) {
      return {
        isSuspicious: true,
        reason: `Unusual satellite count: ${satCount}`,
        score: 0.5
      };
    }

    // Check HDOP values
    const hdop = locationData.hdop;
    if (hdop && hdop < 0.5) {
      return {
        isSuspicious: true,
        reason: 'Unrealistically low HDOP value',
        score: 0.6
      };
    }

    return { isSuspicious: false, reason: '', score: 0 };
  }

  private checkMovementPatterns(current: LocationData, history: LocationData[]): ValidationCheck {
    if (history.length < 5) {
      return { isSuspicious: false, reason: '', score: 0 };
    }

    // Check for too-perfect straight lines (sign of simulation)
    const bearings = this.calculateBearings(history.concat(current));
    const bearingVariance = this.calculateVariance(bearings);
    
    if (bearingVariance < 0.01 && bearings.length > 5) {
      return {
        isSuspicious: true,
        reason: 'Movement pattern too linear (possible simulation)',
        score: 0.7
      };
    }

    // Check for geometric patterns
    if (this.detectGeometricPattern(history.concat(current))) {
      return {
        isSuspicious: true,
        reason: 'Geometric movement pattern detected',
        score: 0.8
      };
    }

    return { isSuspicious: false, reason: '', score: 0 };
  }

  private getRecommendation(confidence: number, riskScore: number): 'accept' | 'reject' | 'flag_for_review' {
    if (confidence > 0.9 || riskScore > 0.8) {
      return 'reject';
    } else if (confidence > 0.6 || riskScore > 0.5) {
      return 'flag_for_review';
    } else {
      return 'accept';
    }
  }
}
```

## Security Monitoring & Incident Response

### 1. Security Event Detection

```typescript
interface SecurityMonitor {
  detectSecurityEvents(events: SecurityEvent[]): Promise<SecurityAlert[]>;
  analyzeUserBehavior(userId: string): Promise<BehaviorAnalysis>;
  respondToIncident(incident: SecurityIncident): Promise<IncidentResponse>;
}

interface SecurityEvent {
  type: SecurityEventType;
  userId?: string;
  ipAddress: string;
  userAgent: string;
  timestamp: Date;
  severity: 'low' | 'medium' | 'high' | 'critical';
  data: any;
}

enum SecurityEventType {
  FAILED_LOGIN = 'failed_login',
  SUSPICIOUS_LOCATION = 'suspicious_location',
  RATE_LIMIT_EXCEEDED = 'rate_limit_exceeded',
  GPS_SPOOFING_DETECTED = 'gps_spoofing_detected',
  UNUSUAL_API_USAGE = 'unusual_api_usage',
  DATA_BREACH_ATTEMPT = 'data_breach_attempt',
  PRIVILEGE_ESCALATION = 'privilege_escalation'
}

class SecurityMonitoringSystem implements SecurityMonitor {
  private alertThresholds: Map<SecurityEventType, number>;
  private behaviorBaseline: Map<string, UserBehaviorBaseline>;
  private incidentResponsePlaybooks: Map<SecurityEventType, ResponsePlaybook>;

  constructor() {
    this.initializeThresholds();
    this.setupRealTimeMonitoring();
  }

  async detectSecurityEvents(events: SecurityEvent[]): Promise<SecurityAlert[]> {
    const alerts: SecurityAlert[] = [];

    // Group events by type and user
    const eventGroups = this.groupEvents(events);

    for (const [key, groupedEvents] of eventGroups) {
      const analysis = await this.analyzeEventGroup(groupedEvents);
      
      if (analysis.requiresAlert) {
        alerts.push({
          id: this.generateAlertId(),
          type: analysis.alertType,
          severity: analysis.severity,
          events: groupedEvents,
          confidence: analysis.confidence,
          recommendedActions: analysis.recommendedActions,
          detectedAt: new Date()
        });
      }
    }

    // Correlate alerts for complex attack patterns
    const correlatedAlerts = await this.correlateAlerts(alerts);

    return correlatedAlerts;
  }

  async analyzeUserBehavior(userId: string): Promise<BehaviorAnalysis> {
    const userEvents = await this.getUserEvents(userId, 30); // Last 30 days
    const baseline = this.behaviorBaseline.get(userId);

    if (!baseline) {
      // First time user - create baseline
      return this.createBehaviorBaseline(userId, userEvents);
    }

    const analysis = {
      userId,
      timeRange: { start: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000), end: new Date() },
      anomalies: [],
      riskScore: 0,
      recommendations: []
    };

    // Analyze location patterns
    const locationAnomaly = this.detectLocationAnomalies(userEvents, baseline.locationPatterns);
    if (locationAnomaly.isAnomalous) {
      analysis.anomalies.push(locationAnomaly);
    }

    // Analyze usage patterns
    const usageAnomaly = this.detectUsageAnomalies(userEvents, baseline.usagePatterns);
    if (usageAnomaly.isAnomalous) {
      analysis.anomalies.push(usageAnomaly);
    }

    // Calculate overall risk score
    analysis.riskScore = this.calculateUserRiskScore(analysis.anomalies);

    // Generate recommendations
    analysis.recommendations = this.generateSecurityRecommendations(analysis);

    return analysis;
  }

  async respondToIncident(incident: SecurityIncident): Promise<IncidentResponse> {
    const playbook = this.incidentResponsePlaybooks.get(incident.type);
    
    if (!playbook) {
      throw new Error(`No response playbook found for incident type: ${incident.type}`);
    }

    const response: IncidentResponse = {
      incidentId: incident.id,
      responseStarted: new Date(),
      actions: [],
      status: 'in_progress'
    };

    try {
      // Execute automatic response actions
      for (const action of playbook.automaticActions) {
        const result = await this.executeResponseAction(action, incident);
        response.actions.push(result);
      }

      // Alert security team for manual actions
      if (playbook.requiresManualIntervention) {
        await this.alertSecurityTeam(incident, response);
      }

      response.status = 'completed';
      response.responseCompleted = new Date();

    } catch (error) {
      response.status = 'failed';
      response.error = error.message;
      
      // Escalate to security team
      await this.escalateIncident(incident, error);
    }

    return response;
  }

  private async executeResponseAction(action: ResponseAction, incident: SecurityIncident): Promise<ActionResult> {
    switch (action.type) {
      case 'block_ip':
        return await this.blockIPAddress(incident.sourceIP, action.duration);
        
      case 'disable_user':
        return await this.disableUserAccount(incident.userId, action.reason);
        
      case 'revoke_tokens':
        return await this.revokeUserTokens(incident.userId);
        
      case 'increase_monitoring':
        return await this.increaseUserMonitoring(incident.userId, action.duration);
        
      case 'quarantine_data':
        return await this.quarantineUserData(incident.userId);
        
      default:
        throw new Error(`Unknown response action: ${action.type}`);
    }
  }

  private initializeThresholds(): void {
    this.alertThresholds = new Map([
      [SecurityEventType.FAILED_LOGIN, 5], // 5 failures in 15 minutes
      [SecurityEventType.RATE_LIMIT_EXCEEDED, 3], // 3 rate limit hits in 5 minutes  
      [SecurityEventType.GPS_SPOOFING_DETECTED, 1], // Immediate alert
      [SecurityEventType.UNUSUAL_API_USAGE, 10], // 10 unusual calls in 1 hour
      [SecurityEventType.DATA_BREACH_ATTEMPT, 1] // Immediate alert
    ]);
  }
}
```

This comprehensive security architecture provides robust protection for the BMTC Transit App, implementing multiple layers of security controls, advanced threat detection, and automated incident response capabilities while maintaining user privacy and system performance.