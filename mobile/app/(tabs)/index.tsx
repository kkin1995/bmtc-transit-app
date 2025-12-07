import { StyleSheet } from 'react-native';
import { YStack, Text } from 'tamagui';

import { HomeLayout } from '@/src/components/layout';
import { TransitMap } from '@/src/components/map';
import {
  WhereToBox,
  LocationPermissionBanner,
  DestinationSearchSheet,
} from '@/src/components/home';
import {
  useStops,
  useHomePlanningState,
  useTripSession,
} from '@/src/hooks';
import { useUserLocation } from '@/src/hooks/useUserLocation';

export default function HomeScreen() {
  // Keep useStops for backward compatibility with existing tests
  const { stops, loading, error, reload } = useStops({ limit: 20 });

  // New map-first UX hooks
  const userLocationResult = useUserLocation();
  const { status = 'unknown', location } = userLocationResult || {};
  const planningResult = useHomePlanningState();
  const { planningStage = 'idle', destinationStop, selectedJourney, actions = {} } =
    planningResult || {};
  const tripResult = useTripSession();
  const { session } = tripResult || {};

  return (
    <HomeLayout>
      <YStack flex={1} position="relative">
        {/* Title - kept for backward compatibility with existing tests */}
        <YStack
          position="absolute"
          top={0}
          left={0}
          right={0}
          zIndex={100}
          backgroundColor="$background"
          paddingTop="$6"
          paddingBottom="$2"
          paddingHorizontal="$4"
          borderBottomWidth={1}
          borderBottomColor="$gray5"
        >
          <Text fontSize="$7" fontWeight="bold" textAlign="center">
            BMTC Transit
          </Text>
        </YStack>

        {/* Main Map - fills the screen */}
        <YStack flex={1} marginTop={80}>
          <TransitMap
            userLocation={location}
            destinationStop={destinationStop}
            selectedJourney={selectedJourney}
          />
        </YStack>

        {/* Location Permission Banner - shown when permission denied */}
        {status === 'denied' && <LocationPermissionBanner />}

        {/* WhereToBox - shown in idle state */}
        {planningStage === 'idle' && actions.beginDestinationSelection && (
          <WhereToBox onPress={actions.beginDestinationSelection} />
        )}

        {/* DestinationSearchSheet - shown when choosing destination */}
        {planningStage === 'choosingDestination' && (
          <DestinationSearchSheet
            visible={true}
            stops={stops}
            isLoading={loading}
            error={error?.message || null}
            onSelect={(stop) => {
              actions.setDestination(stop);
              actions.beginJourneySelection();
            }}
            onClose={() => {
              actions.cancelPlanning();
            }}
          />
        )}
      </YStack>
    </HomeLayout>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
});
