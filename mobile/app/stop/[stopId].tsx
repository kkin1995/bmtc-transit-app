import { StyleSheet, FlatList, ActivityIndicator, Pressable } from 'react-native';
import { useLocalSearchParams, useRouter, Stack } from 'expo-router';

import { Text, View } from '@/components/Themed';
import { useStopSchedule } from '@/src/hooks';
import type { Departure } from '@/src/api/types';

export default function StopDetailScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{
    stopId: string;
    stopName?: string;
  }>();

  const { stopId, stopName } = params;

  // Fetch schedule with 60-minute window
  const { stop, departures, queryTime, loading, error, reload } = useStopSchedule(stopId, {
    time_window_minutes: 60,
  });

  // Format departure time (HH:MM:SS -> HH:MM)
  const formatDepartureTime = (timeString: string): string => {
    const [hours, minutes] = timeString.split(':');
    return `${hours}:${minutes}`;
  };

  // Render individual departure item
  const renderDepartureItem = ({ item }: { item: Departure }) => (
    <Pressable
      style={({ pressed }) => [
        styles.departureItem,
        pressed && styles.departureItemPressed
      ]}
      onPress={() => {
        // TODO: In a real app, we should compute to_stop_id from the trip's stop sequence
        // For now, using the same stop as both from and to (which will show 0 duration)
        // This is a placeholder for demonstration purposes
        router.push({
          pathname: '/eta',
          params: {
            route_id: item.trip.route_id,
            direction_id: String(item.trip.direction_id ?? 0),
            from_stop_id: stop?.stop_id || stopId,
            to_stop_id: stop?.stop_id || stopId, // TODO: Get actual destination stop from trip
            from_name: stop?.stop_name || stopName || 'Unknown',
            to_name: item.trip.trip_headsign || 'Unknown',
          },
        });
      }}
    >
      <View style={styles.departureHeader}>
        <View style={styles.routeBadge}>
          <Text style={styles.routeBadgeText}>{item.trip.route_id}</Text>
        </View>
        <Text style={styles.departureTime}>
          {formatDepartureTime(item.stop_time.departure_time)}
        </Text>
      </View>

      {item.trip.trip_headsign && (
        <Text style={styles.headsign} numberOfLines={1}>
          → {item.trip.trip_headsign}
        </Text>
      )}

      <View style={styles.departureFooter}>
        <Text style={styles.serviceId}>Service: {item.trip.service_id}</Text>
        <Text style={styles.directionId}>
          Direction: {item.trip.direction_id ?? 'N/A'}
        </Text>
      </View>
    </Pressable>
  );

  return (
    <>
      <Stack.Screen
        options={{
          title: stopName || stop?.stop_name || `Stop ${stopId}`,
          headerBackTitle: 'Back',
        }}
      />
      <View style={styles.container}>
        {/* Stop header */}
        {stop && (
          <View style={styles.stopHeader}>
            <Text style={styles.stopName}>{stop.stop_name}</Text>
            <Text style={styles.stopId}>Stop ID: {stop.stop_id}</Text>
            <Text style={styles.stopCoords}>
              {stop.stop_lat.toFixed(5)}, {stop.stop_lon.toFixed(5)}
            </Text>
          </View>
        )}

        {loading && (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" />
            <Text style={styles.loadingText}>Loading departures...</Text>
          </View>
        )}

        {error && (
          <View style={styles.errorContainer}>
            <Text style={styles.errorText}>Error: {error.message}</Text>
            <Pressable style={styles.retryButton} onPress={reload}>
              <Text style={styles.retryButtonText}>Retry</Text>
            </Pressable>
          </View>
        )}

        {!loading && !error && departures.length === 0 && (
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyText}>No departures scheduled in the next hour</Text>
            <Pressable style={styles.retryButton} onPress={reload}>
              <Text style={styles.retryButtonText}>Refresh</Text>
            </Pressable>
          </View>
        )}

        {!loading && !error && departures.length > 0 && (
          <View style={styles.listContainer}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Upcoming Departures</Text>
              {queryTime && (
                <Text style={styles.queryTime}>
                  As of {new Date(queryTime).toLocaleTimeString()}
                </Text>
              )}
            </View>
            <FlatList
              data={departures}
              renderItem={renderDepartureItem}
              keyExtractor={(item, index) => `${item.trip.trip_id}-${index}`}
              contentContainerStyle={styles.listContent}
              showsVerticalScrollIndicator={true}
            />
          </View>
        )}
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 16,
  },
  stopHeader: {
    marginBottom: 20,
    padding: 16,
    backgroundColor: '#f8f8f8',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  stopName: {
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 6,
    color: '#000',
  },
  stopId: {
    fontSize: 13,
    color: '#666',
    marginBottom: 4,
  },
  stopCoords: {
    fontSize: 12,
    color: '#999',
  },
  sectionHeader: {
    marginBottom: 12,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#000',
  },
  queryTime: {
    fontSize: 11,
    color: '#666',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 12,
  },
  loadingText: {
    fontSize: 14,
    color: '#666',
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
    gap: 12,
  },
  errorText: {
    color: '#c00',
    fontWeight: '600',
    textAlign: 'center',
    fontSize: 15,
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
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 16,
  },
  emptyText: {
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
  },
  listContainer: {
    flex: 1,
  },
  listContent: {
    paddingBottom: 20,
  },
  departureItem: {
    padding: 14,
    marginBottom: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#ddd',
    backgroundColor: '#fff',
    gap: 8,
  },
  departureItemPressed: {
    backgroundColor: '#f0f0f0',
    borderColor: '#007AFF',
  },
  departureHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  routeBadge: {
    backgroundColor: '#007AFF',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 4,
  },
  routeBadgeText: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 14,
  },
  departureTime: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#000',
  },
  headsign: {
    fontSize: 15,
    color: '#333',
    fontWeight: '500',
  },
  departureFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
  },
  serviceId: {
    fontSize: 11,
    color: '#666',
  },
  directionId: {
    fontSize: 11,
    color: '#666',
  },
});
