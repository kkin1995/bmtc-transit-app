import { StyleSheet, FlatList, ActivityIndicator, Pressable, TextInput } from 'react-native';
import { useRouter } from 'expo-router';
import { useState, useEffect, useRef } from 'react';

import { Text, View } from '@/components/Themed';
import { HomeLayout } from '@/src/components/layout';
import { useRoutes } from '@/src/hooks';
import type { Route } from '@/src/api/types';
import { apiConfig } from '@/src/config/api';

export default function RoutesScreen() {
  const router = useRouter();
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState('');
  const isFirstMount = useRef(true);

  // Debounce search query changes
  useEffect(() => {
    // On first mount, set debounced query immediately (no debounce)
    if (isFirstMount.current) {
      isFirstMount.current = false;
      setDebouncedSearchQuery(searchQuery);
      return;
    }

    // On subsequent changes, debounce for 300ms
    const timeoutId = setTimeout(() => {
      setDebouncedSearchQuery(searchQuery);
    }, 300);

    // Cleanup: cancel timeout on new change or unmount
    return () => clearTimeout(timeoutId);
  }, [searchQuery]);

  // Use server-side search when query is non-empty, otherwise fetch all routes
  const { routes, loading, error, reload } = useRoutes(
    { limit: apiConfig.routesListLimit },
    debouncedSearchQuery
  );

  // Server-side search handles filtering, so filteredRoutes is just routes
  const filteredRoutes = routes;

  // Render individual route item
  const renderRouteItem = ({ item }: { item: Route }) => (
    <Pressable
      style={({ pressed }) => [
        styles.routeItem,
        pressed && styles.routeItemPressed
      ]}
      onPress={() => {
        // Navigate to trip tracking screen
        console.log('Route pressed:', item.route_id);
        router.push({
          pathname: '/trip/[routeId]',
          params: {
            route_id: item.route_id,
            route_short_name: item.route_short_name || item.route_id,
            route_long_name: item.route_long_name || undefined,
            direction_id: '0', // Default direction
          },
        });
      }}
    >
      <View style={styles.routeHeader}>
        {item.route_short_name && (
          <View style={styles.routeBadge}>
            <Text style={styles.routeBadgeText}>{item.route_short_name}</Text>
          </View>
        )}
        <View style={styles.routeTypeBadge}>
          <Text style={styles.routeTypeBadgeText}>
            {item.route_type === 3 ? 'Bus' : `Type ${item.route_type}`}
          </Text>
        </View>
      </View>

      {item.route_long_name && (
        <Text style={styles.routeLongName} numberOfLines={2}>
          {item.route_long_name}
        </Text>
      )}

      <Text style={styles.routeId}>ID: {item.route_id}</Text>
      {item.agency_id && (
        <Text style={styles.routeAgency}>Agency: {item.agency_id}</Text>
      )}
    </Pressable>
  );

  return (
    <HomeLayout>
      <View style={styles.container}>
        <Text style={styles.title}>Routes</Text>
        <View style={styles.separator} lightColor="#eee" darkColor="rgba(255,255,255,0.1)" />

        <TextInput
          style={styles.searchInput}
          placeholder="Search routes..."
          value={searchQuery}
          onChangeText={setSearchQuery}
          autoCapitalize="none"
          autoCorrect={false}
          testID="route-search-input"
        />

      {loading && (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" />
          <Text style={styles.loadingText}>Loading routes...</Text>
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

      {!loading && !error && routes.length === 0 && (
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyText}>No routes found</Text>
        </View>
      )}

      {!loading && !error && routes.length > 0 && filteredRoutes.length === 0 && (
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyText}>No routes found</Text>
          <Text style={styles.emptySubtext}>Try a different search term</Text>
        </View>
      )}

      {!loading && !error && filteredRoutes.length > 0 && (
        <View style={styles.listContainer}>
          <Text style={styles.subtitle}>
            {searchQuery.trim() ? `${filteredRoutes.length} route(s) found` : 'All Routes'}
          </Text>
          <FlatList
            data={filteredRoutes}
            renderItem={renderRouteItem}
            keyExtractor={(item) => item.route_id}
            contentContainerStyle={styles.listContent}
            showsVerticalScrollIndicator={true}
          />
        </View>
      )}
      </View>
    </HomeLayout>
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
    marginBottom: 12,
  },
  separator: {
    marginVertical: 20,
    height: 1,
    width: '80%',
  },
  searchInput: {
    width: '100%',
    height: 44,
    paddingHorizontal: 16,
    paddingVertical: 10,
    fontSize: 16,
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    backgroundColor: '#fff',
    marginBottom: 16,
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
    padding: 16,
    backgroundColor: '#fee',
    borderRadius: 8,
    marginVertical: 10,
    alignItems: 'center',
    gap: 12,
  },
  errorText: {
    color: '#c00',
    fontWeight: '600',
    textAlign: 'center',
  },
  retryButton: {
    backgroundColor: '#007AFF',
    paddingHorizontal: 16,
    paddingVertical: 8,
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
  },
  emptyText: {
    fontSize: 16,
    color: '#999',
  },
  emptySubtext: {
    fontSize: 14,
    color: '#999',
    marginTop: 8,
  },
  listContainer: {
    flex: 1,
    width: '100%',
  },
  listContent: {
    paddingBottom: 20,
  },
  routeItem: {
    padding: 14,
    marginBottom: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#ddd',
    backgroundColor: '#fff',
    gap: 8,
  },
  routeItemPressed: {
    backgroundColor: '#f0f0f0',
    borderColor: '#007AFF',
  },
  routeHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap',
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
  routeTypeBadge: {
    backgroundColor: '#e0e0e0',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 4,
  },
  routeTypeBadgeText: {
    color: '#666',
    fontSize: 11,
    fontWeight: '600',
  },
  routeLongName: {
    fontSize: 15,
    fontWeight: '500',
    color: '#000',
    lineHeight: 20,
  },
  routeId: {
    fontSize: 11,
    color: '#666',
  },
  routeAgency: {
    fontSize: 11,
    color: '#999',
  },
});
