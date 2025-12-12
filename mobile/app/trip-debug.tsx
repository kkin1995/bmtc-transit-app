/**
 * Trip Debug Route
 *
 * Developer-only screen for inspecting trip session data and API submissions.
 * Access via __DEV__ button on Home screen.
 */

import { Stack } from 'expo-router';
import { TripDebugScreen } from '@/src/screens/TripDebugScreen';

export default function TripDebugRoute() {
  return (
    <>
      <Stack.Screen
        options={{
          title: 'Trip Debug',
          presentation: 'modal',
        }}
      />
      <TripDebugScreen />
    </>
  );
}
