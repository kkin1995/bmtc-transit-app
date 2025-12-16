/**
 * Trip Tracking Screen
 *
 * Allows users to start, track, and end a trip on a specific route.
 * Manages trip session state and handles ride submission to backend.
 *
 * States:
 * - Initial: No active session, ready to start trip
 * - Active: Trip in progress, recording stop events
 * - Post-Submission: Success message or error with retry option
 *
 * Route Params:
 * - route_id (required): GTFS route ID
 * - route_short_name (required): Route short name for display
 * - direction_id (required): Direction ID ("0" or "1")
 * - route_long_name (optional): Route long name
 * - headsign (optional): Trip headsign
 */

import React, { useState, useEffect, useMemo } from 'react';
import { StyleSheet, Pressable, ActivityIndicator, ScrollView } from 'react-native';
import { useLocalSearchParams, Stack } from 'expo-router';

import { Text, View } from '@/components/Themed';
import { useTripSession, useStops, useStopDetection } from '@/src/hooks';
import type { Journey } from '@/src/types';
import type { StopWithCoords } from '@/src/domain/geo';

/**
 * Route parameters type
 */
interface TripTrackingParams {
  route_id?: string;
  route_short_name?: string;
  direction_id?: string;
  route_long_name?: string;
  headsign?: string;
}

export default function TripTrackingScreen() {
  const params = useLocalSearchParams<TripTrackingParams>();
  const { session, startTrip, endTrip, submissionError, recordStopVisit } = useTripSession();

  // Local state
  const [isEnding, setIsEnding] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const [submissionResult, setSubmissionResult] = useState<{
    submitted: boolean;
    error?: Error;
  } | null>(null);

  // Extract and validate route params
  const {
    route_id: routeId,
    route_short_name: routeShortName,
    direction_id: directionIdStr,
    route_long_name: routeLongName,
    headsign,
  } = params;

  // Validate required params
  const missingParams: string[] = [];
  if (!routeId) missingParams.push('route_id');
  if (!routeShortName) missingParams.push('route_short_name');
  if (!directionIdStr) missingParams.push('direction_id');

  // Validate direction_id format
  let directionIdError: string | null = null;
  let directionIdNumber: number | null = null;

  if (directionIdStr) {
    const parsed = parseInt(directionIdStr, 10);
    if (isNaN(parsed) || (parsed !== 0 && parsed !== 1)) {
      directionIdError = `Invalid direction_id: must be "0" or "1", got "${directionIdStr}"`;
    } else {
      directionIdNumber = parsed;
    }
  }

  // Check if we have valid params
  const hasValidParams =
    missingParams.length === 0 &&
    !directionIdError &&
    routeId &&
    routeShortName &&
    directionIdNumber !== null;

  // Determine validation error message
  let validationError: string | null = null;
  if (missingParams.length > 0) {
    validationError = `Missing required parameter: ${missingParams.join(', ')}`;
  } else if (directionIdError) {
    validationError = directionIdError;
  }

  /**
   * Fetch stops for this route
   *
   * Integration Point 1: Stops Fetching
   * - Fetches all stops for the route using useStops hook
   * - Uses limit: 1000 to ensure we get all stops (most routes have < 100 stops)
   * - Provides loading, error, and reload states for UI feedback
   */
  const {
    stops: stopsData,
    loading: stopsLoading,
    error: stopsError,
    reload: reloadStops,
  } = useStops(
    routeId ? { route_id: routeId } : undefined
  );

  /**
   * Transform Stop[] to StopWithCoords[]
   *
   * Integration Point 2: Data Transformation
   * - Transforms GTFS Stop objects to StopWithCoords format required by useStopDetection
   * - Mapping: stop_id → stopId, stop_lat/stop_lon → coords.lat/lon
   * - Uses useMemo to avoid re-transformation on every render
   * - Handles empty stops array gracefully
   */
  const transformedStops: StopWithCoords[] = useMemo(() => {
    if (!stopsData || stopsData.length === 0) {
      return [];
    }

    return stopsData.map(stop => ({
      stopId: stop.stop_id,
      coords: {
        lat: stop.stop_lat,
        lon: stop.stop_lon,
      },
    }));
  }, [stopsData]);

  /**
   * Integrate useStopDetection hook
   *
   * Integration Point 3: Stop Detection
   * - Activates GPS tracking when trip session is active (session !== null)
   * - Passes route_id and direction_id from params
   * - Uses transformed stops array for proximity detection
   * - Connects recordStopVisit callback from useTripSession
   * - Uses 50m radius for stop detection (standard for urban bus stops)
   */
  const { isRunning: gpsTracking, lastStopId, error: gpsError } = useStopDetection({
    active: session !== null,
    routeId: routeId || '',
    directionId: directionIdNumber ?? 0,
    stops: transformedStops,
    recordStopVisit: recordStopVisit,
    radiusMeters: 50,
  });

  // Handle successful submission
  useEffect(() => {
    // If we just ended a trip successfully (no session, no error, was ending)
    if (!session && !submissionError && isEnding) {
      setShowSuccess(true);
      setIsEnding(false);

      // Hide success message after 2 seconds
      const timer = setTimeout(() => {
        setShowSuccess(false);
      }, 2000);

      return () => clearTimeout(timer);
    }
  }, [session, submissionError, isEnding]);

  /**
   * Auto-dismiss success and info banners after 3 seconds
   * Error banner stays visible until user takes action
   */
  useEffect(() => {
    if (submissionResult && !submissionResult.error) {
      // Success or info banner - auto-dismiss after 3 seconds
      const timer = setTimeout(() => {
        setSubmissionResult(null);
      }, 3000);

      return () => clearTimeout(timer);
    }
    // Error banner (submitted: false with error) stays until manually cleared
  }, [submissionResult]);

  /**
   * Handle Start Trip button press
   */
  const handleStartTrip = () => {
    if (!hasValidParams || !routeId || !routeShortName || directionIdNumber === null) {
      return;
    }

    // Clear previous submission result when starting new trip
    setSubmissionResult(null);

    // Construct Journey object with placeholder stops
    const journey: Journey = {
      id: `manual-${Date.now()}`,
      route: {
        route_id: routeId,
        route_short_name: routeShortName,
        route_long_name: routeLongName || null,
        route_type: 3, // Bus
        agency_id: 'BMTC',
      },
      fromStop: {
        stop_id: 'unknown',
        stop_name: 'Origin',
        stop_lat: 0,
        stop_lon: 0,
        zone_id: null,
      },
      toStop: {
        stop_id: 'unknown',
        stop_name: 'Destination',
        stop_lat: 0,
        stop_lon: 0,
        zone_id: null,
      },
      directionId: directionIdNumber,
      confidence: 'medium',
    };

    startTrip(journey);
  };

  /**
   * Handle End Trip button press
   */
  const handleEndTrip = async () => {
    if (!session) return;

    setIsEnding(true);
    try {
      const result = await endTrip();
      setSubmissionResult(result);
    } catch (error) {
      // Error is already captured in submissionError from hook
      console.error('Error ending trip:', error);
    } finally {
      // isEnding will be cleared by useEffect when session becomes null
    }
  };

  /**
   * Handle Retry button press
   *
   * Note: After a failed submission, the session might be cleared,
   * but we still want to allow retry. The useTripSession hook
   * may store enough state (like lastRequest) to retry submission.
   */
  const handleRetry = async () => {
    // Clear previous result before retrying
    setSubmissionResult(null);
    setIsEnding(true);
    try {
      const result = await endTrip();
      setSubmissionResult(result);
    } catch (error) {
      console.error('Error retrying trip submission:', error);
    } finally {
      setIsEnding(false);
    }
  };


  // Format started_at timestamp for display
  const formatTimestamp = (isoString: string): string => {
    try {
      const date = new Date(isoString);
      return date.toLocaleString();
    } catch {
      return isoString;
    }
  };

  return (
    <>
      <Stack.Screen
        options={{
          title: `Trip: ${routeShortName}`,
          headerBackTitle: 'Back',
        }}
      />
      <ScrollView style={styles.scrollView}>
        <View style={styles.container}>
          {/* Parameter Validation Error */}
          {validationError && (
            <View style={styles.errorContainer}>
              <Text style={styles.errorText}>{validationError}</Text>
            </View>
          )}

          {/* Route Header */}
          {routeShortName && (
            <View style={styles.routeHeader}>
              <View style={styles.badgeRow}>
                <View style={styles.routeBadge}>
                  <Text style={styles.routeBadgeText}>{routeShortName}</Text>
                </View>
                {directionIdNumber !== null && (
                  <View style={styles.directionBadge}>
                    <Text style={styles.directionBadgeText}>
                      Direction {directionIdNumber}
                    </Text>
                  </View>
                )}
              </View>

              {routeLongName && (
                <Text style={styles.routeLongName}>{routeLongName}</Text>
              )}

              {headsign && (
                <Text style={styles.headsign}>{headsign}</Text>
              )}
            </View>
          )}

          {/* Status Section */}
          {!showSuccess && (
            <View style={styles.statusCard}>
              <Text style={styles.statusLabel}>Status</Text>
              <Text style={styles.statusText}>
                {session ? 'Trip in progress' : 'Ready to start trip'}
              </Text>
            </View>
          )}

          {/* Trip Details (when active) */}
          {session && (
            <View style={styles.tripDetailsCard}>
              <Text style={styles.cardTitle}>Trip Details</Text>

              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>Started:</Text>
                <Text style={styles.detailValue}>
                  {formatTimestamp(session.started_at)}
                </Text>
              </View>

              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>Stop Events:</Text>
                <Text style={styles.detailValue}>
                  {session.stopEvents.length} {session.stopEvents.length === 1 ? 'stop' : 'stops'}
                </Text>
              </View>

              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>GPS Tracking:</Text>
                <Text style={[styles.detailValue, gpsTracking && styles.statusActive]}>
                  {gpsTracking ? 'Active' : 'Inactive'}
                </Text>
              </View>

              {lastStopId && (
                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>Current Stop:</Text>
                  <Text style={styles.detailValue}>
                    {lastStopId}
                  </Text>
                </View>
              )}
            </View>
          )}

          {/* Three-Outcome Banners */}
          {/* Success Banner: submitted === true && !error */}
          {submissionResult && submissionResult.submitted && !submissionResult.error && (
            <View style={styles.successBanner}>
              <Text style={styles.successText}>
                Trip data submitted successfully! Thank you for contributing.
              </Text>
            </View>
          )}

          {/* Error Banner: submitted === false && error */}
          {submissionResult && !submissionResult.submitted && submissionResult.error && (
            <View style={styles.errorBanner}>
              <Text style={styles.errorBannerTitle}>Submission Failed</Text>
              <Text style={styles.errorBannerText}>
                {submissionResult.error.message}
              </Text>
              <Pressable style={styles.retryButton} onPress={handleRetry}>
                <Text style={styles.retryButtonText}>Retry</Text>
              </Pressable>
            </View>
          )}

          {/* Info Banner: submitted === false && !error */}
          {submissionResult && !submissionResult.submitted && !submissionResult.error && (
            <View style={styles.infoBanner}>
              <Text style={styles.infoBannerText}>
                Trip ended. No stop data was recorded during this trip.
              </Text>
            </View>
          )}

          {/* Stops Loading Indicator */}
          {stopsLoading && (
            <View style={styles.loadingCard}>
              <ActivityIndicator size="small" color="#007AFF" />
              <Text style={styles.loadingText}>Loading stops...</Text>
            </View>
          )}

          {/* Stops Error Banner */}
          {stopsError && (
            <View style={styles.errorBanner}>
              <Text style={styles.errorBannerTitle}>Stops Loading Error</Text>
              <Text style={styles.errorBannerText}>
                {stopsError.message || 'Failed to fetch stops'}
              </Text>
              <Pressable style={styles.retryButton} onPress={reloadStops}>
                <Text style={styles.retryButtonText}>Try Again</Text>
              </Pressable>
            </View>
          )}


          {/* Action Buttons */}
          <View style={styles.buttonContainer}>
            {/* Start Trip Button */}
            <Pressable
              style={({ pressed }) => [
                styles.button,
                styles.startButton,
                (!hasValidParams || session || stopsLoading) && styles.buttonDisabled,
                pressed && styles.buttonPressed,
              ]}
              onPress={handleStartTrip}
              disabled={!hasValidParams || !!session || stopsLoading}
            >
              <Text
                style={[
                  styles.buttonText,
                  (!hasValidParams || session || stopsLoading) && styles.buttonTextDisabled,
                ]}
              >
                Start Trip
              </Text>
            </Pressable>

            {/* End Trip Button */}
            <Pressable
              style={({ pressed }) => [
                styles.button,
                styles.endButton,
                (!session || isEnding) && styles.buttonDisabled,
                pressed && styles.buttonPressed,
              ]}
              onPress={handleEndTrip}
              disabled={!session || isEnding}
            >
              {isEnding ? (
                <View style={styles.buttonContent}>
                  <ActivityIndicator size="small" color="#fff" />
                  <Text style={styles.buttonText}>Ending trip...</Text>
                </View>
              ) : (
                <Text
                  style={[
                    styles.buttonText,
                    !session && styles.buttonTextDisabled,
                  ]}
                >
                  End Trip
                </Text>
              )}
            </Pressable>
          </View>
        </View>
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  scrollView: {
    flex: 1,
  },
  container: {
    flex: 1,
    padding: 16,
    gap: 16,
  },
  routeHeader: {
    padding: 16,
    backgroundColor: '#fff',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#ddd',
    gap: 10,
  },
  badgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap',
  },
  routeBadge: {
    backgroundColor: '#007AFF',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
  },
  routeBadgeText: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 16,
  },
  directionBadge: {
    backgroundColor: '#e0e0e0',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 5,
  },
  directionBadgeText: {
    color: '#333',
    fontSize: 13,
    fontWeight: '600',
  },
  routeLongName: {
    fontSize: 16,
    fontWeight: '500',
    color: '#000',
    lineHeight: 22,
  },
  headsign: {
    fontSize: 14,
    color: '#666',
    fontStyle: 'italic',
  },
  statusCard: {
    padding: 16,
    backgroundColor: '#fff',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#ddd',
    gap: 8,
  },
  statusLabel: {
    fontSize: 12,
    color: '#666',
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  statusText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#007AFF',
  },
  tripDetailsCard: {
    padding: 16,
    backgroundColor: '#fff',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#ddd',
    gap: 12,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#000',
    marginBottom: 4,
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 4,
  },
  detailLabel: {
    fontSize: 14,
    color: '#666',
    fontWeight: '500',
  },
  detailValue: {
    fontSize: 14,
    color: '#000',
    fontWeight: '600',
  },
  successBanner: {
    padding: 16,
    backgroundColor: '#d4edda',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#c3e6cb',
  },
  successText: {
    color: '#155724',
    fontSize: 15,
    fontWeight: '600',
    textAlign: 'center',
  },
  errorBanner: {
    padding: 16,
    backgroundColor: '#f8d7da',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#f5c6cb',
    gap: 10,
  },
  errorBannerTitle: {
    color: '#721c24',
    fontSize: 16,
    fontWeight: 'bold',
  },
  errorBannerText: {
    color: '#721c24',
    fontSize: 14,
    lineHeight: 20,
  },
  retryButton: {
    backgroundColor: '#007AFF',
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 6,
    alignSelf: 'flex-start',
  },
  retryButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  buttonContainer: {
    gap: 12,
    marginTop: 8,
  },
  button: {
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  startButton: {
    backgroundColor: '#007AFF',
  },
  endButton: {
    backgroundColor: '#FF3B30',
  },
  buttonDisabled: {
    backgroundColor: '#ccc',
    opacity: 0.6,
  },
  buttonPressed: {
    opacity: 0.7,
  },
  buttonContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  buttonTextDisabled: {
    color: '#888',
  },
  errorContainer: {
    padding: 20,
    backgroundColor: '#f8d7da',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#f5c6cb',
    gap: 10,
  },
  errorTitle: {
    color: '#721c24',
    fontSize: 18,
    fontWeight: 'bold',
  },
  errorText: {
    color: '#721c24',
    fontSize: 14,
    lineHeight: 20,
  },
  loadingCard: {
    padding: 16,
    backgroundColor: '#fff',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#ddd',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  loadingText: {
    fontSize: 14,
    color: '#666',
    fontWeight: '500',
  },
  statusActive: {
    color: '#28a745',
    fontWeight: 'bold',
  },
  infoBanner: {
    padding: 16,
    backgroundColor: '#fff3cd',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#ffc107',
  },
  infoBannerText: {
    color: '#856404',
    fontSize: 15,
    fontWeight: '600',
    textAlign: 'center',
  },
});
