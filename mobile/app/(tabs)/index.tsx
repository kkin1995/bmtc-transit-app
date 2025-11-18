import { useEffect, useState } from 'react';
import { StyleSheet, ScrollView, ActivityIndicator } from 'react-native';

import { Text, View } from '@/components/Themed';
import { fetchStops } from '@/src/api';
import type { Stop } from '@/src/api';
import { getUserErrorMessage } from '@/src/api';

export default function HomeScreen() {
  const [stops, setStops] = useState<Stop[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Example: Fetch first 5 stops on mount
    async function loadStops() {
      try {
        setLoading(true);
        setError(null);

        const response = await fetchStops({ limit: 5 });
        setStops(response.stops);

        console.log('Successfully fetched stops:', response.total);
      } catch (err) {
        const errorMessage = getUserErrorMessage(err);
        setError(errorMessage);
        console.error('Error fetching stops:', err);
      } finally {
        setLoading(false);
      }
    }

    loadStops();
  }, []);

  return (
    <View style={styles.container}>
      <Text style={styles.title}>BMTC Transit</Text>
      <View style={styles.separator} lightColor="#eee" darkColor="rgba(255,255,255,0.1)" />

      {loading && <ActivityIndicator size="large" />}

      {error && (
        <View style={styles.errorContainer}>
          <Text style={styles.errorText}>Error: {error}</Text>
          <Text style={styles.helpText}>
            Make sure the backend is running at the configured API URL.
          </Text>
        </View>
      )}

      {!loading && !error && (
        <ScrollView style={styles.stopsList}>
          <Text style={styles.subtitle}>Nearby Stops (Sample)</Text>
          {stops.map((stop) => (
            <View key={stop.stop_id} style={styles.stopItem}>
              <Text style={styles.stopName}>{stop.stop_name}</Text>
              <Text style={styles.stopId}>ID: {stop.stop_id}</Text>
              <Text style={styles.stopCoords}>
                {stop.stop_lat.toFixed(5)}, {stop.stop_lon.toFixed(5)}
              </Text>
            </View>
          ))}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'flex-start',
    padding: 20,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    marginTop: 20,
  },
  subtitle: {
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 10,
  },
  separator: {
    marginVertical: 20,
    height: 1,
    width: '80%',
  },
  stopsList: {
    width: '100%',
  },
  stopItem: {
    padding: 12,
    marginBottom: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#ddd',
  },
  stopName: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 4,
  },
  stopId: {
    fontSize: 12,
    color: '#666',
    marginBottom: 2,
  },
  stopCoords: {
    fontSize: 11,
    color: '#999',
  },
  errorContainer: {
    padding: 16,
    backgroundColor: '#fee',
    borderRadius: 8,
    marginVertical: 10,
  },
  errorText: {
    color: '#c00',
    fontWeight: '600',
    marginBottom: 8,
  },
  helpText: {
    fontSize: 12,
    color: '#666',
  },
});
