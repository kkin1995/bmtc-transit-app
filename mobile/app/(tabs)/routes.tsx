import { StyleSheet, FlatList, ActivityIndicator, Pressable } from 'react-native';

import { Text, View } from '@/components/Themed';
import { HomeLayout } from '@/src/components/layout';
import { useRoutes } from '@/src/hooks';
import type { Route } from '@/src/api/types';

export default function RoutesScreen() {
  const { routes, loading, error, reload } = useRoutes({ limit: 50 });

  // Render individual route item
  const renderRouteItem = ({ item }: { item: Route }) => (
    <Pressable
      style={({ pressed }) => [
        styles.routeItem,
        pressed && styles.routeItemPressed
      ]}
      onPress={() => {
        // TODO: Navigate to route detail screen showing stops on this route
        console.log('Route pressed:', item.route_id);
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

      {!loading && !error && routes.length > 0 && (
        <View style={styles.listContainer}>
          <Text style={styles.subtitle}>All Routes</Text>
          <FlatList
            data={routes}
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
