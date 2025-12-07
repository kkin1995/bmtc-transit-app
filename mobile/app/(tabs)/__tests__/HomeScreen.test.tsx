/**
 * Tests for Home Screen (index.tsx)
 *
 * Expected behavior:
 * - Renders "BMTC Transit" title
 * - Uses useStops hook with limit: 20
 * - Shows loading indicator with "Loading stops..." when loading
 * - Shows error message with "Retry" button when error occurs
 * - Shows "No stops found" when stops array is empty
 * - Renders FlatList of stops when data is available
 * - Each stop item shows: stop_name, stop_id, coordinates
 * - Tapping a stop navigates to /stop/[stopId] with params
 * - Pressing retry button calls reload() function
 */

import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react-native';
import { useRouter } from 'expo-router';
import HomeScreen from '../index';
import * as hooks from '@/src/hooks';
import type { Stop } from '@/src/api/types';

// Mock hooks
jest.mock('@/src/hooks');
jest.mock('expo-router');

// Mock useUserLocation specifically
const mockUseUserLocation = jest.fn();
jest.mock('@/src/hooks/useUserLocation', () => ({
  useUserLocation: () => mockUseUserLocation(),
}));

const mockUseStops = hooks.useStops as jest.MockedFunction<typeof hooks.useStops>;
const mockUseHomePlanningState = hooks.useHomePlanningState as jest.MockedFunction<typeof hooks.useHomePlanningState>;
const mockUseTripSession = hooks.useTripSession as jest.MockedFunction<typeof hooks.useTripSession>;
const mockUseRouter = useRouter as jest.MockedFunction<typeof useRouter>;

describe('HomeScreen', () => {
  const mockRouter = {
    push: jest.fn(),
    replace: jest.fn(),
    back: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockUseRouter.mockReturnValue(mockRouter as any);
  });

  it('should render title', () => {
    mockUseStops.mockReturnValue({
      stops: [],
      total: 0,
      limit: 20,
      offset: 0,
      data: undefined,
      loading: false,
      error: undefined,
      reload: jest.fn(),
      isRefreshing: false,
    });

    render(<HomeScreen />);

    expect(screen.getByText('BMTC Transit')).toBeTruthy();
  });

  it('should call useStops with limit: 20', () => {
    mockUseStops.mockReturnValue({
      stops: [],
      total: 0,
      limit: 20,
      offset: 0,
      data: undefined,
      loading: false,
      error: undefined,
      reload: jest.fn(),
      isRefreshing: false,
    });

    render(<HomeScreen />);

    expect(mockUseStops).toHaveBeenCalledWith({ limit: 20 });
  });

  it.skip('should show loading state', () => {
    // TODO: Re-enable when destination sheet is implemented in later phase
    // This test was for the old stops list UI which is now replaced by map-first UX
    mockUseStops.mockReturnValue({
      stops: [],
      total: 0,
      limit: 20,
      offset: 0,
      data: undefined,
      loading: true,
      error: undefined,
      reload: jest.fn(),
      isRefreshing: false,
    });

    render(<HomeScreen />);

    expect(screen.getByText('Loading stops...')).toBeTruthy();
    // ActivityIndicator is rendered (we can't easily test its presence without testID)
  });

  it.skip('should show error state with retry button', () => {
    // TODO: Re-enable when destination sheet is implemented in later phase
    // This test was for the old stops list UI which is now replaced by map-first UX
    const mockReload = jest.fn();

    mockUseStops.mockReturnValue({
      stops: [],
      total: 0,
      limit: 20,
      offset: 0,
      data: undefined,
      loading: false,
      error: { message: 'Network error', code: 'network_error' },
      reload: mockReload,
      isRefreshing: false,
    });

    render(<HomeScreen />);

    expect(screen.getByText(/Error: Network error/)).toBeTruthy();

    const retryButton = screen.getByText('Retry');
    expect(retryButton).toBeTruthy();

    fireEvent.press(retryButton);
    expect(mockReload).toHaveBeenCalledTimes(1);
  });

  it.skip('should show empty state when no stops', () => {
    // TODO: Re-enable when destination sheet is implemented in later phase
    // This test was for the old stops list UI which is now replaced by map-first UX
    mockUseStops.mockReturnValue({
      stops: [],
      total: 0,
      limit: 20,
      offset: 0,
      data: undefined,
      loading: false,
      error: undefined,
      reload: jest.fn(),
      isRefreshing: false,
    });

    render(<HomeScreen />);

    expect(screen.getByText('No stops found')).toBeTruthy();
  });

  it.skip('should render list of stops', () => {
    // TODO: Re-enable when destination sheet is implemented in later phase
    // This test was for the old stops list UI which is now replaced by map-first UX
    const mockStops = [
      {
        stop_id: '1',
        stop_name: 'Majestic',
        stop_lat: 12.9767,
        stop_lon: 77.5713,
        zone_id: null,
      },
      {
        stop_id: '2',
        stop_name: 'Shivajinagar',
        stop_lat: 12.9854,
        stop_lon: 77.6081,
        zone_id: 'Z1',
      },
    ];

    mockUseStops.mockReturnValue({
      stops: mockStops,
      total: 2,
      limit: 20,
      offset: 0,
      data: { stops: mockStops, total: 2, limit: 20, offset: 0 },
      loading: false,
      error: undefined,
      reload: jest.fn(),
      isRefreshing: false,
    });

    render(<HomeScreen />);

    // Check subtitle
    expect(screen.getByText('Nearby Stops')).toBeTruthy();

    // Check stop names
    expect(screen.getByText('Majestic')).toBeTruthy();
    expect(screen.getByText('Shivajinagar')).toBeTruthy();

    // Check stop IDs
    expect(screen.getByText('ID: 1')).toBeTruthy();
    expect(screen.getByText('ID: 2')).toBeTruthy();

    // Check coordinates (formatted)
    expect(screen.getByText('12.97670, 77.57130')).toBeTruthy();
    expect(screen.getByText('12.98540, 77.60810')).toBeTruthy();
  });

  it.skip('should navigate to stop detail when stop is pressed', () => {
    // TODO: Re-enable when destination sheet is implemented in later phase
    // This test was for the old stops list UI which is now replaced by map-first UX
    const mockStops = [
      {
        stop_id: '20558',
        stop_name: 'Majestic',
        stop_lat: 12.9767,
        stop_lon: 77.5713,
        zone_id: null,
      },
    ];

    mockUseStops.mockReturnValue({
      stops: mockStops,
      total: 1,
      limit: 20,
      offset: 0,
      data: { stops: mockStops, total: 1, limit: 20, offset: 0 },
      loading: false,
      error: undefined,
      reload: jest.fn(),
      isRefreshing: false,
    });

    render(<HomeScreen />);

    // Find and press the stop item
    const stopItem = screen.getByText('Majestic');
    fireEvent.press(stopItem);

    // Verify navigation was called with correct params
    expect(mockRouter.push).toHaveBeenCalledWith({
      pathname: '/stop/[stopId]',
      params: {
        stopId: '20558',
        stopName: 'Majestic',
      },
    });
  });

  it.skip('should handle multiple stops and navigate correctly', () => {
    // TODO: Re-enable when destination sheet is implemented in later phase
    // This test was for the old stops list UI which is now replaced by map-first UX
    const mockStops = [
      {
        stop_id: '1',
        stop_name: 'Stop One',
        stop_lat: 12.9,
        stop_lon: 77.5,
        zone_id: null,
      },
      {
        stop_id: '2',
        stop_name: 'Stop Two',
        stop_lat: 13.0,
        stop_lon: 77.6,
        zone_id: null,
      },
    ];

    mockUseStops.mockReturnValue({
      stops: mockStops,
      total: 2,
      limit: 20,
      offset: 0,
      data: { stops: mockStops, total: 2, limit: 20, offset: 0 },
      loading: false,
      error: undefined,
      reload: jest.fn(),
      isRefreshing: false,
    });

    render(<HomeScreen />);

    // Press first stop
    fireEvent.press(screen.getByText('Stop One'));
    expect(mockRouter.push).toHaveBeenCalledWith({
      pathname: '/stop/[stopId]',
      params: {
        stopId: '1',
        stopName: 'Stop One',
      },
    });

    // Press second stop
    fireEvent.press(screen.getByText('Stop Two'));
    expect(mockRouter.push).toHaveBeenCalledWith({
      pathname: '/stop/[stopId]',
      params: {
        stopId: '2',
        stopName: 'Stop Two',
      },
    });

    expect(mockRouter.push).toHaveBeenCalledTimes(2);
  });

  describe('Map-First UX (New Tests)', () => {
    beforeEach(() => {
      // Default mocks for map-first tests
      mockUseStops.mockReturnValue({
        stops: [],
        total: 0,
        limit: 20,
        offset: 0,
        data: undefined,
        loading: false,
        error: undefined,
        reload: jest.fn(),
        isRefreshing: false,
      });
    });

    it('should render TransitMap and WhereToBox in idle state', () => {
      // Mock user location granted
      mockUseUserLocation.mockReturnValue({
        status: 'granted',
        location: { lat: 12.97, lon: 77.59 },
        requestPermission: jest.fn(),
      });

      // Mock planning state as idle
      mockUseHomePlanningState.mockReturnValue({
        planningStage: 'idle',
        destinationStop: undefined,
        selectedJourney: undefined,
        actions: {
          beginDestinationSelection: jest.fn(),
          setDestination: jest.fn(),
          beginJourneySelection: jest.fn(),
          setSelectedJourney: jest.fn(),
          cancelPlanning: jest.fn(),
          reset: jest.fn(),
        },
      });

      // Mock no active trip
      mockUseTripSession.mockReturnValue({
        session: null,
        startTrip: jest.fn(),
        endTrip: jest.fn(),
      });

      render(<HomeScreen />);

      // Assert TransitMap is rendered
      expect(screen.getByTestId('transit-map')).toBeTruthy();

      // Assert "Where to?" text is visible
      expect(screen.getByText('Where to?')).toBeTruthy();
    });

    it('should show LocationPermissionBanner when location permission denied', () => {
      // Mock user location denied
      mockUseUserLocation.mockReturnValue({
        status: 'denied',
        location: undefined,
        requestPermission: jest.fn(),
      });

      // Mock planning state as idle
      mockUseHomePlanningState.mockReturnValue({
        planningStage: 'idle',
        destinationStop: undefined,
        selectedJourney: undefined,
        actions: {
          beginDestinationSelection: jest.fn(),
          setDestination: jest.fn(),
          beginJourneySelection: jest.fn(),
          setSelectedJourney: jest.fn(),
          cancelPlanning: jest.fn(),
          reset: jest.fn(),
        },
      });

      // Mock no active trip
      mockUseTripSession.mockReturnValue({
        session: null,
        startTrip: jest.fn(),
        endTrip: jest.fn(),
      });

      render(<HomeScreen />);

      // Assert permission banner message is visible
      expect(screen.getByText('Turn on location to see nearby stops')).toBeTruthy();
    });

    it('should call beginDestinationSelection when WhereToBox is pressed', () => {
      const mockBeginDestinationSelection = jest.fn();

      // Mock user location granted
      mockUseUserLocation.mockReturnValue({
        status: 'granted',
        location: { lat: 12.97, lon: 77.59 },
        requestPermission: jest.fn(),
      });

      // Mock planning state with our test function
      mockUseHomePlanningState.mockReturnValue({
        planningStage: 'idle',
        destinationStop: undefined,
        selectedJourney: undefined,
        actions: {
          beginDestinationSelection: mockBeginDestinationSelection,
          setDestination: jest.fn(),
          beginJourneySelection: jest.fn(),
          setSelectedJourney: jest.fn(),
          cancelPlanning: jest.fn(),
          reset: jest.fn(),
        },
      });

      // Mock no active trip
      mockUseTripSession.mockReturnValue({
        session: null,
        startTrip: jest.fn(),
        endTrip: jest.fn(),
      });

      render(<HomeScreen />);

      // Find and press the "Where to?" button
      const whereToButton = screen.getByText('Where to?');
      fireEvent.press(whereToButton);

      // Assert beginDestinationSelection was called
      expect(mockBeginDestinationSelection).toHaveBeenCalledTimes(1);
    });

    describe('Destination Selection Flow', () => {
      it('should show DestinationSearchSheet when planningStage is choosingDestination', () => {
        const mockStops: Stop[] = [
          {
            stop_id: '1',
            stop_name: 'Majestic',
            stop_lat: 12.9767,
            stop_lon: 77.5713,
            zone_id: null,
          },
          {
            stop_id: '2',
            stop_name: 'Shivajinagar',
            stop_lat: 12.9854,
            stop_lon: 77.6081,
            zone_id: null,
          },
        ];

        // Mock user location granted
        mockUseUserLocation.mockReturnValue({
          status: 'granted',
          location: { lat: 12.97, lon: 77.59 },
          requestPermission: jest.fn(),
        });

        // Mock planning state as choosingDestination
        mockUseHomePlanningState.mockReturnValue({
          planningStage: 'choosingDestination',
          destinationStop: undefined,
          selectedJourney: undefined,
          actions: {
            beginDestinationSelection: jest.fn(),
            setDestination: jest.fn(),
            beginJourneySelection: jest.fn(),
            setSelectedJourney: jest.fn(),
            cancelPlanning: jest.fn(),
            reset: jest.fn(),
          },
        });

        // Mock stops data for the sheet
        mockUseStops.mockReturnValue({
          stops: mockStops,
          total: 2,
          limit: 20,
          offset: 0,
          data: { stops: mockStops, total: 2, limit: 20, offset: 0 },
          loading: false,
          error: undefined,
          reload: jest.fn(),
          isRefreshing: false,
        });

        // Mock no active trip
        mockUseTripSession.mockReturnValue({
          session: null,
          startTrip: jest.fn(),
          endTrip: jest.fn(),
        });

        render(<HomeScreen />);

        // Assert sheet title is visible
        expect(screen.getByText('Where to?')).toBeTruthy();

        // Assert at least one stop name is visible (indicating sheet content rendered)
        const majesticVisible = screen.queryByText('Majestic');
        const shivajinagarVisible = screen.queryByText('Shivajinagar');
        expect(majesticVisible || shivajinagarVisible).toBeTruthy();
      });

      it('should call setDestination and beginJourneySelection when stop is selected', () => {
        const mockSetDestination = jest.fn();
        const mockBeginJourneySelection = jest.fn();

        const mockStops: Stop[] = [
          {
            stop_id: '1',
            stop_name: 'Majestic',
            stop_lat: 12.9767,
            stop_lon: 77.5713,
            zone_id: null,
          },
          {
            stop_id: '2',
            stop_name: 'Shivajinagar',
            stop_lat: 12.9854,
            stop_lon: 77.6081,
            zone_id: null,
          },
        ];

        // Mock user location granted
        mockUseUserLocation.mockReturnValue({
          status: 'granted',
          location: { lat: 12.97, lon: 77.59 },
          requestPermission: jest.fn(),
        });

        // Mock planning state with our test functions
        mockUseHomePlanningState.mockReturnValue({
          planningStage: 'choosingDestination',
          destinationStop: undefined,
          selectedJourney: undefined,
          actions: {
            beginDestinationSelection: jest.fn(),
            setDestination: mockSetDestination,
            beginJourneySelection: mockBeginJourneySelection,
            setSelectedJourney: jest.fn(),
            cancelPlanning: jest.fn(),
            reset: jest.fn(),
          },
        });

        // Mock stops data
        mockUseStops.mockReturnValue({
          stops: mockStops,
          total: 2,
          limit: 20,
          offset: 0,
          data: { stops: mockStops, total: 2, limit: 20, offset: 0 },
          loading: false,
          error: undefined,
          reload: jest.fn(),
          isRefreshing: false,
        });

        // Mock no active trip
        mockUseTripSession.mockReturnValue({
          session: null,
          startTrip: jest.fn(),
          endTrip: jest.fn(),
        });

        render(<HomeScreen />);

        // Find and press the Majestic stop
        const majesticStop = screen.getByText('Majestic');
        fireEvent.press(majesticStop);

        // Assert setDestination was called with the correct stop object
        expect(mockSetDestination).toHaveBeenCalledTimes(1);
        expect(mockSetDestination).toHaveBeenCalledWith({
          stop_id: '1',
          stop_name: 'Majestic',
          stop_lat: 12.9767,
          stop_lon: 77.5713,
          zone_id: null,
        });

        // Assert beginJourneySelection was called
        expect(mockBeginJourneySelection).toHaveBeenCalledTimes(1);
      });

      it('should call cancelPlanning when sheet is closed', () => {
        const mockCancelPlanning = jest.fn();

        const mockStops: Stop[] = [
          {
            stop_id: '1',
            stop_name: 'Majestic',
            stop_lat: 12.9767,
            stop_lon: 77.5713,
            zone_id: null,
          },
        ];

        // Mock user location granted
        mockUseUserLocation.mockReturnValue({
          status: 'granted',
          location: { lat: 12.97, lon: 77.59 },
          requestPermission: jest.fn(),
        });

        // Mock planning state with our test function
        mockUseHomePlanningState.mockReturnValue({
          planningStage: 'choosingDestination',
          destinationStop: undefined,
          selectedJourney: undefined,
          actions: {
            beginDestinationSelection: jest.fn(),
            setDestination: jest.fn(),
            beginJourneySelection: jest.fn(),
            setSelectedJourney: jest.fn(),
            cancelPlanning: mockCancelPlanning,
            reset: jest.fn(),
          },
        });

        // Mock stops data
        mockUseStops.mockReturnValue({
          stops: mockStops,
          total: 1,
          limit: 20,
          offset: 0,
          data: { stops: mockStops, total: 1, limit: 20, offset: 0 },
          loading: false,
          error: undefined,
          reload: jest.fn(),
          isRefreshing: false,
        });

        // Mock no active trip
        mockUseTripSession.mockReturnValue({
          session: null,
          startTrip: jest.fn(),
          endTrip: jest.fn(),
        });

        render(<HomeScreen />);

        // Find and press the Close button
        const closeButton = screen.getByText('Close');
        fireEvent.press(closeButton);

        // Assert cancelPlanning was called
        expect(mockCancelPlanning).toHaveBeenCalledTimes(1);
      });
    });
  });
});
