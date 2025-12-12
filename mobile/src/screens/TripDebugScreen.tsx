/**
 * TripDebugScreen
 *
 * Developer-focused debug screen that displays trip session data and API submission details.
 * This is for internal QA and testing, not for end users.
 *
 * Features:
 * - Shows current or last TripSession (route_id, direction_id)
 * - Lists recorded StopEvents with timestamps
 * - Displays segments sent in PostRideSummaryRequest
 * - Shows last PostRideSummaryResponse from API
 * - Handles error states
 *
 * Usage:
 * - Access via dev-only button or navigation menu
 * - Best viewed after completing a trip with stop recording
 */

import React from 'react';
import { View, Text, ScrollView, StyleSheet } from 'react-native';
import { useTripSession } from '../hooks/useTripSession';

export function TripDebugScreen() {
  const { session, lastRequest, lastResponse, submissionError } = useTripSession();

  // Determine if we have any data to display
  const hasData = session || lastRequest || lastResponse;

  if (!hasData) {
    return (
      <View style={styles.container}>
        <Text style={styles.title}>Trip Debug</Text>
        <View style={styles.section}>
          <Text style={styles.emptyText}>No trip data available</Text>
          <Text style={styles.helpText}>
            Start a trip and record stops to see debug information here.
          </Text>
        </View>
      </View>
    );
  }

  // Derive trip info from session or lastRequest
  const routeId = session?.route_id || lastRequest?.route_id;
  const directionId = session?.direction_id ?? lastRequest?.direction_id;
  const stopEvents = session?.stopEvents || [];
  const segments = lastRequest?.segments || [];

  return (
    <ScrollView style={styles.container}>
      <Text style={styles.title}>Trip Debug</Text>

      {/* Trip Info Section */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Trip Info</Text>
        {routeId && (
          <Text style={styles.field}>
            Route ID: <Text style={styles.value}>{routeId}</Text>
          </Text>
        )}
        {directionId !== undefined && (
          <Text style={styles.field}>
            Direction ID: <Text style={styles.value}>{directionId}</Text>
          </Text>
        )}
        {session && (
          <>
            <Text style={styles.field}>
              From Stop: <Text style={styles.value}>{session.from_stop_id}</Text>
            </Text>
            <Text style={styles.field}>
              To Stop: <Text style={styles.value}>{session.to_stop_id || 'N/A'}</Text>
            </Text>
            <Text style={styles.field}>
              Started: <Text style={styles.value}>{session.started_at}</Text>
            </Text>
          </>
        )}
      </View>

      {/* Stop Events Section */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Stop Events ({stopEvents.length})</Text>
        {stopEvents.length === 0 ? (
          <Text style={styles.emptyText}>No stop events recorded</Text>
        ) : (
          stopEvents.map((event, index) => (
            <View key={index} style={styles.listItem}>
              <Text style={styles.field}>
                Stop ID: <Text style={styles.value}>{event.stopId}</Text>
              </Text>
              <Text style={styles.subField}>
                Enter: <Text style={styles.value}>{event.tEnter.toISOString()}</Text>
              </Text>
              <Text style={styles.subField}>
                Leave: <Text style={styles.value}>{event.tLeave.toISOString()}</Text>
              </Text>
            </View>
          ))
        )}
      </View>

      {/* Segments Section */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Segments ({segments.length})</Text>
        {segments.length === 0 ? (
          <Text style={styles.emptyText}>No segments generated</Text>
        ) : (
          segments.map((segment, index) => (
            <View key={index} style={styles.listItem}>
              <Text style={styles.field}>
                {segment.from_stop_id} → {segment.to_stop_id}
              </Text>
              <Text style={styles.subField}>
                Duration: <Text style={styles.value}>{segment.duration_sec}s</Text>
              </Text>
              <Text style={styles.subField}>
                Dwell: <Text style={styles.value}>{segment.dwell_sec}s</Text>
              </Text>
              <Text style={styles.subField}>
                Confidence: <Text style={styles.value}>{segment.mapmatch_conf}</Text>
              </Text>
              <Text style={styles.subField}>
                Observed: <Text style={styles.value}>{segment.observed_at_utc}</Text>
              </Text>
            </View>
          ))
        )}
      </View>

      {/* API Response Section */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>API Response</Text>
        {submissionError ? (
          <View style={styles.errorBox}>
            <Text style={styles.errorTitle}>Error:</Text>
            <Text style={styles.errorText}>{submissionError.message}</Text>
          </View>
        ) : lastResponse ? (
          <>
            <Text style={styles.field}>
              Accepted: <Text style={styles.value}>{lastResponse.accepted_segments}</Text>
            </Text>
            <Text style={styles.field}>
              Rejected: <Text style={styles.value}>{lastResponse.rejected_segments}</Text>
            </Text>
            {lastResponse.rejected_segments > 0 && (
              <View style={styles.subsection}>
                <Text style={styles.subSectionTitle}>Rejection Reasons:</Text>
                {Object.entries(lastResponse.rejected_by_reason).map(([reason, count]) => (
                  count > 0 && (
                    <Text key={reason} style={styles.subField}>
                      {reason}: <Text style={styles.value}>{count}</Text>
                    </Text>
                  )
                ))}
              </View>
            )}
          </>
        ) : (
          <Text style={styles.emptyText}>No submission yet</Text>
        )}
      </View>

      {/* Raw JSON Section (for detailed inspection) */}
      {lastRequest && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Raw Request</Text>
          <View style={styles.jsonBox}>
            <Text style={styles.jsonText}>{JSON.stringify(lastRequest, null, 2)}</Text>
          </View>
        </View>
      )}

      {lastResponse && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Raw Response</Text>
          <View style={styles.jsonBox}>
            <Text style={styles.jsonText}>{JSON.stringify(lastResponse, null, 2)}</Text>
          </View>
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
    padding: 16,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 16,
    color: '#333',
  },
  section: {
    backgroundColor: '#fff',
    borderRadius: 8,
    padding: 12,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 8,
    color: '#333',
  },
  subsection: {
    marginTop: 8,
    paddingLeft: 8,
  },
  subSectionTitle: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 4,
    color: '#666',
  },
  field: {
    fontSize: 14,
    marginBottom: 4,
    color: '#333',
  },
  subField: {
    fontSize: 13,
    marginBottom: 2,
    paddingLeft: 8,
    color: '#666',
  },
  value: {
    fontFamily: 'monospace',
    fontWeight: '600',
    color: '#007AFF',
  },
  listItem: {
    marginBottom: 8,
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  emptyText: {
    fontSize: 14,
    color: '#999',
    fontStyle: 'italic',
  },
  helpText: {
    fontSize: 12,
    color: '#999',
    marginTop: 8,
  },
  errorBox: {
    backgroundColor: '#ffebee',
    padding: 8,
    borderRadius: 4,
    borderLeftWidth: 4,
    borderLeftColor: '#f44336',
  },
  errorTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#c62828',
    marginBottom: 4,
  },
  errorText: {
    fontSize: 13,
    color: '#c62828',
    fontFamily: 'monospace',
  },
  jsonBox: {
    backgroundColor: '#f5f5f5',
    padding: 8,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: '#ddd',
  },
  jsonText: {
    fontSize: 11,
    fontFamily: 'monospace',
    color: '#333',
  },
});
