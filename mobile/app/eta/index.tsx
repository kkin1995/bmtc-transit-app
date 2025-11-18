import { StyleSheet, ActivityIndicator, Pressable, ScrollView } from 'react-native';
import { useLocalSearchParams, Stack } from 'expo-router';

import { Text, View } from '@/components/Themed';
import { useEta } from '@/src/hooks';

export default function EtaScreen() {
  const params = useLocalSearchParams<{
    route_id?: string;
    direction_id?: string;
    from_stop_id?: string;
    to_stop_id?: string;
    from_name?: string;
    to_name?: string;
  }>();

  const {
    route_id,
    direction_id,
    from_stop_id,
    to_stop_id,
    from_name,
    to_name,
  } = params;

  // Convert direction_id to number
  const directionIdNum = direction_id ? Number(direction_id) : undefined;

  // Fetch ETA
  const {
    segment,
    scheduled,
    prediction,
    queryTime,
    loading,
    error,
    reload,
    missingParams,
  } = useEta({
    route_id,
    direction_id: directionIdNum,
    from_stop_id,
    to_stop_id,
  });

  // Format duration in seconds to human-readable format
  const formatDuration = (seconds: number): string => {
    if (seconds < 60) {
      return `${seconds}s`;
    }
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    if (minutes < 60) {
      return remainingSeconds > 0 ? `${minutes}m ${remainingSeconds}s` : `${minutes}m`;
    }
    const hours = Math.floor(minutes / 60);
    const remainingMinutes = minutes % 60;
    return remainingMinutes > 0 ? `${hours}h ${remainingMinutes}m` : `${hours}h`;
  };

  // Get confidence color
  const getConfidenceColor = (confidence?: string): string => {
    switch (confidence) {
      case 'high':
        return '#28a745';
      case 'medium':
        return '#ffc107';
      case 'low':
        return '#dc3545';
      default:
        return '#6c757d';
    }
  };

  return (
    <>
      <Stack.Screen
        options={{
          title: route_id ? `ETA - Route ${route_id}` : 'ETA',
          headerBackTitle: 'Back',
        }}
      />
      <ScrollView style={styles.container} contentContainerStyle={styles.content}>
        {/* Segment header */}
        <View style={styles.segmentHeader}>
          <Text style={styles.sectionTitle}>Segment</Text>
          {route_id && (
            <View style={styles.routeBadge}>
              <Text style={styles.routeBadgeText}>{route_id}</Text>
            </View>
          )}
        </View>

        <View style={styles.card}>
          <View style={styles.stopInfo}>
            <Text style={styles.stopLabel}>From:</Text>
            <Text style={styles.stopValue}>
              {from_name || from_stop_id || 'Unknown'}
            </Text>
          </View>
          <Text style={styles.arrow}>↓</Text>
          <View style={styles.stopInfo}>
            <Text style={styles.stopLabel}>To:</Text>
            <Text style={styles.stopValue}>
              {to_name || to_stop_id || 'Unknown'}
            </Text>
          </View>
          <View style={styles.stopInfo}>
            <Text style={styles.stopLabel}>Direction:</Text>
            <Text style={styles.stopValue}>{directionIdNum ?? 'N/A'}</Text>
          </View>
        </View>

        {/* Missing params warning */}
        {missingParams && (
          <View style={styles.warningContainer}>
            <Text style={styles.warningText}>
              Missing required parameters. Please provide route_id, direction_id, from_stop_id, and to_stop_id.
            </Text>
          </View>
        )}

        {/* Loading state */}
        {loading && (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" />
            <Text style={styles.loadingText}>Fetching ETA...</Text>
          </View>
        )}

        {/* Error state */}
        {error && (
          <View style={styles.errorContainer}>
            <Text style={styles.errorText}>Error: {error.message}</Text>
            <Pressable style={styles.retryButton} onPress={reload}>
              <Text style={styles.retryButtonText}>Retry</Text>
            </Pressable>
          </View>
        )}

        {/* Scheduled duration */}
        {!loading && !error && scheduled && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Scheduled (GTFS)</Text>
            <View style={styles.card}>
              <View style={styles.metricRow}>
                <Text style={styles.metricLabel}>Duration:</Text>
                <Text style={styles.metricValueLarge}>
                  {formatDuration(scheduled.duration_sec)}
                </Text>
              </View>
              {scheduled.service_id && (
                <View style={styles.metricRow}>
                  <Text style={styles.metricLabel}>Service:</Text>
                  <Text style={styles.metricValue}>{scheduled.service_id}</Text>
                </View>
              )}
              <View style={styles.metricRow}>
                <Text style={styles.metricLabel}>Source:</Text>
                <Text style={styles.metricValue}>{scheduled.source}</Text>
              </View>
            </View>
          </View>
        )}

        {/* ML Prediction */}
        {!loading && !error && prediction && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>ML Prediction</Text>
            <View style={styles.card}>
              <View style={styles.metricRow}>
                <Text style={styles.metricLabel}>Predicted Duration:</Text>
                <Text style={[styles.metricValueLarge, styles.primaryValue]}>
                  {formatDuration(prediction.predicted_duration_sec)}
                </Text>
              </View>

              <View style={styles.percentileRow}>
                <View style={styles.percentileBox}>
                  <Text style={styles.percentileLabel}>P50 (Median)</Text>
                  <Text style={styles.percentileValue}>
                    {formatDuration(prediction.p50_sec)}
                  </Text>
                </View>
                <View style={styles.percentileBox}>
                  <Text style={styles.percentileLabel}>P90</Text>
                  <Text style={styles.percentileValue}>
                    {formatDuration(prediction.p90_sec)}
                  </Text>
                </View>
              </View>

              <View style={styles.confidenceBadgeContainer}>
                <Text style={styles.metricLabel}>Confidence:</Text>
                <View
                  style={[
                    styles.confidenceBadge,
                    { backgroundColor: getConfidenceColor(prediction.confidence) },
                  ]}
                >
                  <Text style={styles.confidenceBadgeText}>
                    {prediction.confidence.toUpperCase()}
                  </Text>
                </View>
              </View>

              <View style={styles.metricRow}>
                <Text style={styles.metricLabel}>Blend Weight:</Text>
                <Text style={styles.metricValue}>
                  {(prediction.blend_weight * 100).toFixed(1)}%
                </Text>
              </View>

              <View style={styles.metricRow}>
                <Text style={styles.metricLabel}>Samples Used:</Text>
                <Text style={styles.metricValue}>{prediction.samples_used}</Text>
              </View>

              <View style={styles.metricRow}>
                <Text style={styles.metricLabel}>Time Bin ID:</Text>
                <Text style={styles.metricValue}>{prediction.bin_id}</Text>
              </View>

              <View style={styles.metricRow}>
                <Text style={styles.metricLabel}>Last Updated:</Text>
                <Text style={styles.metricValue}>
                  {new Date(prediction.last_updated).toLocaleString()}
                </Text>
              </View>

              <View style={styles.metricRow}>
                <Text style={styles.metricLabel}>Model Version:</Text>
                <Text style={styles.metricValue}>{prediction.model_version}</Text>
              </View>
            </View>
          </View>
        )}

        {/* Query metadata */}
        {queryTime && (
          <View style={styles.queryMetadata}>
            <Text style={styles.queryMetadataText}>
              Query time: {new Date(queryTime).toLocaleString()}
            </Text>
          </View>
        )}
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    padding: 16,
    paddingBottom: 32,
  },
  segmentHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 12,
    color: '#000',
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
  card: {
    backgroundColor: '#fff',
    padding: 16,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e0e0e0',
    marginBottom: 20,
    gap: 12,
  },
  stopInfo: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  stopLabel: {
    fontSize: 14,
    color: '#666',
    fontWeight: '600',
  },
  stopValue: {
    fontSize: 15,
    color: '#000',
    fontWeight: '500',
    flex: 1,
    textAlign: 'right',
  },
  arrow: {
    fontSize: 24,
    textAlign: 'center',
    color: '#007AFF',
    marginVertical: 4,
  },
  section: {
    marginBottom: 20,
  },
  metricRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  metricLabel: {
    fontSize: 14,
    color: '#666',
    fontWeight: '500',
  },
  metricValue: {
    fontSize: 14,
    color: '#000',
    fontWeight: '600',
  },
  metricValueLarge: {
    fontSize: 18,
    color: '#000',
    fontWeight: 'bold',
  },
  primaryValue: {
    color: '#007AFF',
  },
  percentileRow: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 8,
  },
  percentileBox: {
    flex: 1,
    backgroundColor: '#f8f8f8',
    padding: 12,
    borderRadius: 6,
    alignItems: 'center',
  },
  percentileLabel: {
    fontSize: 11,
    color: '#666',
    marginBottom: 4,
  },
  percentileValue: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#000',
  },
  confidenceBadgeContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  confidenceBadge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
  },
  confidenceBadgeText: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 12,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 40,
  },
  loadingText: {
    fontSize: 14,
    color: '#666',
  },
  errorContainer: {
    padding: 16,
    backgroundColor: '#fee',
    borderRadius: 8,
    alignItems: 'center',
    gap: 12,
    marginVertical: 20,
  },
  errorText: {
    color: '#c00',
    fontWeight: '600',
    textAlign: 'center',
    fontSize: 15,
  },
  warningContainer: {
    padding: 16,
    backgroundColor: '#fff3cd',
    borderRadius: 8,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: '#ffc107',
  },
  warningText: {
    color: '#856404',
    fontSize: 14,
    textAlign: 'center',
  },
  retryButton: {
    backgroundColor: '#007AFF',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 6,
  },
  retryButtonText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 14,
  },
  queryMetadata: {
    marginTop: 20,
    padding: 12,
    backgroundColor: '#f8f8f8',
    borderRadius: 6,
  },
  queryMetadataText: {
    fontSize: 11,
    color: '#666',
    textAlign: 'center',
  },
});
