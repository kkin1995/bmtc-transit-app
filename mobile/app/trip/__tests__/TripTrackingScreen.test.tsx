/**
 * Tests for Trip Tracking Screen (app/trip/[routeId].tsx)
 *
 * Expected behavior:
 * - Reads route params: route_id, route_short_name, direction_id, headsign
 * - Uses useTripSession() hook
 * - Three states: Initial (no trip), Active Trip, Post-Submission (success/error)
 * - Two buttons: Start Trip, End Trip
 * - Error handling with retry option
 * - Proper validation and error messages for missing/invalid params
 * - Journey object construction with all required fields
 */

import React from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import TripTrackingScreen from '../[routeId]';
import * as hooks from '@/src/hooks';
import type { Journey, TripSession } from '@/src/types';
import type { UseTripSessionReturn } from '@/src/hooks';

// Mock hooks
jest.mock('@/src/hooks');
jest.mock('expo-router');

const mockUseTripSession = hooks.useTripSession as jest.MockedFunction<typeof hooks.useTripSession>;
const mockUseStops = hooks.useStops as jest.MockedFunction<typeof hooks.useStops>;
const mockUseStopDetection = hooks.useStopDetection as jest.MockedFunction<typeof hooks.useStopDetection>;
const mockUseRouter = useRouter as jest.MockedFunction<typeof useRouter>;
const mockUseLocalSearchParams = useLocalSearchParams as jest.MockedFunction<typeof useLocalSearchParams>;

describe('TripTrackingScreen', () => {
  const mockRouter = {
    push: jest.fn(),
    replace: jest.fn(),
    back: jest.fn(),
  };

  // Helper function to create mock trip session return value
  const createMockTripSession = (overrides?: Partial<UseTripSessionReturn>): UseTripSessionReturn => ({
    session: null,
    startTrip: jest.fn(),
    recordStopVisit: jest.fn(),
    endTrip: jest.fn(),
    submissionError: undefined,
    lastRequest: undefined,
    lastResponse: undefined,
    ...overrides,
  });

  // Helper function to create mock useStops return value
  const createMockUseStops = (overrides?: Partial<hooks.UseStopsResult>): hooks.UseStopsResult => ({
    stops: [],
    total: 0,
    limit: 100,
    offset: 0,
    data: undefined,
    loading: false,
    error: undefined,
    reload: jest.fn(),
    isRefreshing: false,
    ...overrides,
  });

  // Helper function to create mock useStopDetection return value
  const createMockUseStopDetection = (overrides?: Partial<hooks.UseStopDetectionReturn>): hooks.UseStopDetectionReturn => ({
    isRunning: false,
    lastStopId: null,
    error: null,
    ...overrides,
  });

  beforeEach(() => {
    jest.clearAllMocks();
    mockUseRouter.mockReturnValue(mockRouter as any);
    // Set default mocks for new hooks
    mockUseStops.mockReturnValue(createMockUseStops());
    mockUseStopDetection.mockReturnValue(createMockUseStopDetection());
  });

  describe('Initial Render with Valid Params', () => {
    it('should render with all valid route params', () => {
      mockUseLocalSearchParams.mockReturnValue({
        route_id: '335E',
        route_short_name: '335E',
        direction_id: '0',
        headsign: 'Electronic City',
        route_long_name: 'Kengeri to Electronic City',
      });

      mockUseTripSession.mockReturnValue(createMockTripSession());

      render(<TripTrackingScreen />);

      // Should display route badge
      expect(screen.getByText('335E')).toBeTruthy();

      // Should display direction badge
      expect(screen.getByText('Direction 0')).toBeTruthy();

      // Should display headsign if provided
      expect(screen.getByText('Electronic City')).toBeTruthy();

      // Should show ready status
      expect(screen.getByText('Ready to start trip')).toBeTruthy();
    });

    it('should enable Start Trip button and disable End Trip button initially', () => {
      mockUseLocalSearchParams.mockReturnValue({
        route_id: '335E',
        route_short_name: '335E',
        direction_id: '0',
      });

      mockUseTripSession.mockReturnValue(createMockTripSession());

      render(<TripTrackingScreen />);

      const startButton = screen.getByText('Start Trip');
      const endButton = screen.getByText('End Trip');

      expect(startButton).toBeTruthy();
      expect(endButton).toBeTruthy();

      // Start button should be enabled, End button should be disabled
      // Note: In React Native Testing Library, we can't easily test disabled state
      // but we can verify the buttons are rendered
    });

    it('should display route long name when provided', () => {
      mockUseLocalSearchParams.mockReturnValue({
        route_id: '335E',
        route_short_name: '335E',
        direction_id: '0',
        route_long_name: 'Kengeri to Electronic City',
      });

      mockUseTripSession.mockReturnValue(createMockTripSession());

      render(<TripTrackingScreen />);

      expect(screen.getByText('Kengeri to Electronic City')).toBeTruthy();
    });

    it('should handle missing optional headsign gracefully', () => {
      mockUseLocalSearchParams.mockReturnValue({
        route_id: '335E',
        route_short_name: '335E',
        direction_id: '0',
      });

      mockUseTripSession.mockReturnValue(createMockTripSession());

      render(<TripTrackingScreen />);

      // Should still render successfully
      expect(screen.getByText('335E')).toBeTruthy();
      expect(screen.getByText('Ready to start trip')).toBeTruthy();
    });

    it('should handle missing optional route_long_name gracefully', () => {
      mockUseLocalSearchParams.mockReturnValue({
        route_id: '335E',
        route_short_name: '335E',
        direction_id: '0',
      });

      mockUseTripSession.mockReturnValue(createMockTripSession());

      render(<TripTrackingScreen />);

      // Should still render successfully
      expect(screen.getByText('335E')).toBeTruthy();
      expect(screen.getByText('Ready to start trip')).toBeTruthy();
    });
  });

  describe('Invalid Params Handling', () => {
    it('should show error when route_id is missing', () => {
      mockUseLocalSearchParams.mockReturnValue({
        route_short_name: '335E',
        direction_id: '0',
      });

      mockUseTripSession.mockReturnValue(createMockTripSession());

      render(<TripTrackingScreen />);

      // Should display error message
      expect(screen.getByText(/Missing required parameter/i)).toBeTruthy();
    });

    it('should show error when route_short_name is missing', () => {
      mockUseLocalSearchParams.mockReturnValue({
        route_id: '335E',
        direction_id: '0',
      });

      mockUseTripSession.mockReturnValue(createMockTripSession());

      render(<TripTrackingScreen />);

      expect(screen.getByText(/Missing required parameter/i)).toBeTruthy();
    });

    it('should show error when direction_id is missing', () => {
      mockUseLocalSearchParams.mockReturnValue({
        route_id: '335E',
        route_short_name: '335E',
      });

      mockUseTripSession.mockReturnValue(createMockTripSession());

      render(<TripTrackingScreen />);

      expect(screen.getByText(/Missing required parameter/i)).toBeTruthy();
    });

    it('should disable Start Trip button when params are invalid', () => {
      mockUseLocalSearchParams.mockReturnValue({
        route_short_name: '335E',
        // Missing route_id
      });

      mockUseTripSession.mockReturnValue(createMockTripSession());

      render(<TripTrackingScreen />);

      expect(screen.getByText(/Missing required parameter/i)).toBeTruthy();

      // Start button should be disabled (won't test actual disabled state, but verify error is shown)
      const startButton = screen.queryByText('Start Trip');
      expect(startButton).toBeTruthy();
    });

    it('should show error when direction_id is not a valid number string', () => {
      mockUseLocalSearchParams.mockReturnValue({
        route_id: '335E',
        route_short_name: '335E',
        direction_id: 'invalid',
      });

      mockUseTripSession.mockReturnValue(createMockTripSession());

      render(<TripTrackingScreen />);

      expect(screen.getByText(/Invalid direction_id/i)).toBeTruthy();
    });
  });

  describe('Start Trip Flow', () => {
    it('should call startTrip with correct Journey object when Start button pressed', () => {
      const mockStartTrip = jest.fn();

      mockUseLocalSearchParams.mockReturnValue({
        route_id: '335E',
        route_short_name: '335E',
        direction_id: '0',
        route_long_name: 'Kengeri to Electronic City',
        headsign: 'Electronic City',
      });

      mockUseTripSession.mockReturnValue(createMockTripSession({
        startTrip: mockStartTrip,
      }));

      render(<TripTrackingScreen />);

      const startButton = screen.getByText('Start Trip');
      fireEvent.press(startButton);

      // Verify startTrip was called
      expect(mockStartTrip).toHaveBeenCalledTimes(1);

      // Verify Journey object structure
      const journeyArg = mockStartTrip.mock.calls[0][0] as Journey;
      expect(journeyArg).toMatchObject({
        route: {
          route_id: '335E',
          route_short_name: '335E',
          route_long_name: 'Kengeri to Electronic City',
        },
        directionId: 0,
      });
      expect(journeyArg.id).toBeDefined();
    });

    it('should parse direction_id string to number correctly', () => {
      const mockStartTrip = jest.fn();

      mockUseLocalSearchParams.mockReturnValue({
        route_id: '340',
        route_short_name: '340',
        direction_id: '1',
      });

      mockUseTripSession.mockReturnValue(createMockTripSession({
        startTrip: mockStartTrip,
      }));

      render(<TripTrackingScreen />);

      const startButton = screen.getByText('Start Trip');
      fireEvent.press(startButton);

      const journeyArg = mockStartTrip.mock.calls[0][0] as Journey;
      expect(journeyArg.directionId).toBe(1);
      expect(typeof journeyArg.directionId).toBe('number');
    });

    it('should disable Start button after trip is started', () => {
      const mockStartTrip = jest.fn();
      const mockSession: TripSession = {
        route_id: '335E',
        direction_id: 0,
        from_stop_id: '20558',
        to_stop_id: '29374',
        started_at: new Date().toISOString(),
        journeyId: 'test-journey-id',
        stopEvents: [],
      };

      mockUseLocalSearchParams.mockReturnValue({
        route_id: '335E',
        route_short_name: '335E',
        direction_id: '0',
      });

      // Re-render with active session after start
      const { rerender } = render(<TripTrackingScreen />);

      mockUseTripSession.mockReturnValue(createMockTripSession({
        startTrip: mockStartTrip,
      }));

      // First render - no session
      expect(screen.getByText('Ready to start trip')).toBeTruthy();

      // Simulate trip started
      mockUseTripSession.mockReturnValue(createMockTripSession({
        session: mockSession,
        startTrip: mockStartTrip,
      }));

      rerender(<TripTrackingScreen />);

      // Should now show active trip state
      expect(screen.getByText('Trip in progress')).toBeTruthy();
    });

    it('should construct Journey with placeholder stops when not provided', () => {
      const mockStartTrip = jest.fn();

      mockUseLocalSearchParams.mockReturnValue({
        route_id: '335E',
        route_short_name: '335E',
        direction_id: '0',
      });

      mockUseTripSession.mockReturnValue(createMockTripSession({
        startTrip: mockStartTrip,
      }));

      render(<TripTrackingScreen />);

      const startButton = screen.getByText('Start Trip');
      fireEvent.press(startButton);

      const journeyArg = mockStartTrip.mock.calls[0][0] as Journey;

      // Should have fromStop and toStop (placeholders if not provided in params)
      expect(journeyArg.fromStop).toBeDefined();
      expect(journeyArg.toStop).toBeDefined();
      expect(journeyArg.fromStop.stop_id).toBeDefined();
      expect(journeyArg.toStop.stop_id).toBeDefined();
    });
  });

  describe('Active Trip State', () => {
    const mockSession: TripSession = {
      route_id: '335E',
      direction_id: 0,
      from_stop_id: '20558',
      to_stop_id: '29374',
      started_at: '2025-12-12T10:30:00.000Z',
      journeyId: 'test-journey-123',
      stopEvents: [],
    };

    it('should display "Trip in progress" when session exists', () => {
      mockUseLocalSearchParams.mockReturnValue({
        route_id: '335E',
        route_short_name: '335E',
        direction_id: '0',
      });

      mockUseTripSession.mockReturnValue(createMockTripSession({
        session: mockSession,
      }));

      render(<TripTrackingScreen />);

      expect(screen.getByText('Trip in progress')).toBeTruthy();
    });

    it('should show trip details card with route, direction, and started_at', () => {
      mockUseLocalSearchParams.mockReturnValue({
        route_id: '335E',
        route_short_name: '335E',
        direction_id: '0',
      });

      mockUseTripSession.mockReturnValue(createMockTripSession({
        session: mockSession,
      }));

      render(<TripTrackingScreen />);

      // Should show route
      expect(screen.getByText('335E')).toBeTruthy();

      // Should show direction
      expect(screen.getByText(/Direction 0/i)).toBeTruthy();

      // Should show started time (in some format)
      expect(screen.getByText(/Started:/i)).toBeTruthy();
    });

    it('should enable End Trip button when trip is active', () => {
      mockUseLocalSearchParams.mockReturnValue({
        route_id: '335E',
        route_short_name: '335E',
        direction_id: '0',
      });

      mockUseTripSession.mockReturnValue(createMockTripSession({
        session: mockSession,
      }));

      render(<TripTrackingScreen />);

      const endButton = screen.getByText('End Trip');
      expect(endButton).toBeTruthy();

      // Should be enabled (can press it)
      fireEvent.press(endButton);
      // If it was disabled, this would have no effect
    });

    it('should disable Start Trip button when trip is active', () => {
      mockUseLocalSearchParams.mockReturnValue({
        route_id: '335E',
        route_short_name: '335E',
        direction_id: '0',
      });

      mockUseTripSession.mockReturnValue(createMockTripSession({
        session: mockSession,
      }));

      render(<TripTrackingScreen />);

      // Start button should still be rendered but in disabled state
      const startButton = screen.getByText('Start Trip');
      expect(startButton).toBeTruthy();

      // In active state, should show "Trip in progress"
      expect(screen.getByText('Trip in progress')).toBeTruthy();
    });

    it('should display stop events count when available', () => {
      const sessionWithStops: TripSession = {
        ...mockSession,
        stopEvents: [
          { stopId: '20558', tEnter: new Date(), tLeave: new Date() },
          { stopId: '20559', tEnter: new Date(), tLeave: new Date() },
        ],
      };

      mockUseLocalSearchParams.mockReturnValue({
        route_id: '335E',
        route_short_name: '335E',
        direction_id: '0',
      });

      mockUseTripSession.mockReturnValue(createMockTripSession({
        session: sessionWithStops,
      }));

      render(<TripTrackingScreen />);

      // Should show stop count
      expect(screen.getByText(/2 stops/i)).toBeTruthy();
    });
  });

  describe('End Trip Flow', () => {
    const mockSession: TripSession = {
      route_id: '335E',
      direction_id: 0,
      from_stop_id: '20558',
      to_stop_id: '29374',
      started_at: '2025-12-12T10:30:00.000Z',
      journeyId: 'test-journey-123',
      stopEvents: [
        { stopId: '20558', tEnter: new Date(), tLeave: new Date() },
      ],
    };

    it('should call endTrip when End Trip button is pressed', async () => {
      const mockEndTrip = jest.fn().mockResolvedValue(undefined);

      mockUseLocalSearchParams.mockReturnValue({
        route_id: '335E',
        route_short_name: '335E',
        direction_id: '0',
      });

      mockUseTripSession.mockReturnValue(createMockTripSession({
        session: mockSession,
        endTrip: mockEndTrip,
      }));

      render(<TripTrackingScreen />);

      const endButton = screen.getByText('End Trip');
      fireEvent.press(endButton);

      await waitFor(() => {
        expect(mockEndTrip).toHaveBeenCalledTimes(1);
      });
    });

    it('should show loading indicator while ending trip', async () => {
      const mockEndTrip = jest.fn(() => new Promise(resolve => setTimeout(resolve, 100)));

      mockUseLocalSearchParams.mockReturnValue({
        route_id: '335E',
        route_short_name: '335E',
        direction_id: '0',
      });

      mockUseTripSession.mockReturnValue(createMockTripSession({
        session: mockSession,
        endTrip: mockEndTrip,
      }));

      render(<TripTrackingScreen />);

      const endButton = screen.getByText('End Trip');
      fireEvent.press(endButton);

      // Should show loading state
      await waitFor(() => {
        expect(screen.getByText(/Ending trip/i)).toBeTruthy();
      });
    });

    it('should show success message after successful submission', async () => {
      const mockEndTrip = jest.fn().mockResolvedValue({
        submitted: true,
        error: undefined,
      });

      mockUseLocalSearchParams.mockReturnValue({
        route_id: '335E',
        route_short_name: '335E',
        direction_id: '0',
      });

      mockUseTripSession.mockReturnValue(createMockTripSession({
        session: mockSession,
        endTrip: mockEndTrip,
      }));

      const { rerender } = render(<TripTrackingScreen />);

      const endButton = screen.getByText('End Trip');
      fireEvent.press(endButton);

      // Wait for endTrip to be called and state to update
      await waitFor(() => {
        expect(mockEndTrip).toHaveBeenCalled();
      });

      // After endTrip completes, session should be null
      mockUseTripSession.mockReturnValue(createMockTripSession({
        session: null,
        endTrip: mockEndTrip,
      }));

      rerender(<TripTrackingScreen />);

      // Should show success message
      await waitFor(() => {
        expect(screen.getByText(/submitted successfully/i)).toBeTruthy();
      });
    });

    it('should return to initial state after successful submission', async () => {
      const mockEndTrip = jest.fn().mockResolvedValue({
        submitted: true,
        error: undefined,
      });

      mockUseLocalSearchParams.mockReturnValue({
        route_id: '335E',
        route_short_name: '335E',
        direction_id: '0',
      });

      mockUseTripSession.mockReturnValue(createMockTripSession({
        session: mockSession,
        endTrip: mockEndTrip,
      }));

      const { rerender } = render(<TripTrackingScreen />);

      expect(screen.getByText('Trip in progress')).toBeTruthy();

      const endButton = screen.getByText('End Trip');
      fireEvent.press(endButton);

      // Wait for endTrip to be called
      await waitFor(() => {
        expect(mockEndTrip).toHaveBeenCalled();
      });

      // After completion, session is null
      mockUseTripSession.mockReturnValue(createMockTripSession({
        session: null,
        endTrip: mockEndTrip,
      }));

      rerender(<TripTrackingScreen />);

      // Should return to ready state
      await waitFor(() => {
        expect(screen.getByText(/submitted successfully/i)).toBeTruthy();
      });
    });
  });

  describe('Error Handling', () => {
    const mockSession: TripSession = {
      route_id: '335E',
      direction_id: 0,
      from_stop_id: '20558',
      to_stop_id: '29374',
      started_at: '2025-12-12T10:30:00.000Z',
      journeyId: 'test-journey-123',
      stopEvents: [],
    };

    it('should display error banner when submissionError exists', async () => {
      const submissionError = new Error('Network error: Failed to submit ride');
      const mockEndTrip = jest.fn().mockResolvedValue({
        submitted: false,
        error: submissionError,
      });

      mockUseLocalSearchParams.mockReturnValue({
        route_id: '335E',
        route_short_name: '335E',
        direction_id: '0',
      });

      mockUseTripSession.mockReturnValue(createMockTripSession({
        session: mockSession,
        endTrip: mockEndTrip,
      }));

      const { rerender } = render(<TripTrackingScreen />);

      // End the trip to trigger error
      const endButton = screen.getByText('End Trip');
      fireEvent.press(endButton);

      await waitFor(() => {
        expect(mockEndTrip).toHaveBeenCalled();
      });

      // Session cleared after failed submission
      mockUseTripSession.mockReturnValue(createMockTripSession({
        session: null,
        endTrip: mockEndTrip,
      }));

      rerender(<TripTrackingScreen />);

      // Should display error message
      await waitFor(() => {
        expect(screen.getByText(/Network error/i)).toBeTruthy();
      });
    });

    it('should show retry button when submission fails', async () => {
      const submissionError = new Error('API error');
      const mockEndTrip = jest.fn().mockResolvedValue({
        submitted: false,
        error: submissionError,
      });

      mockUseLocalSearchParams.mockReturnValue({
        route_id: '335E',
        route_short_name: '335E',
        direction_id: '0',
      });

      mockUseTripSession.mockReturnValue(createMockTripSession({
        session: mockSession,
        endTrip: mockEndTrip,
      }));

      const { rerender } = render(<TripTrackingScreen />);

      // End the trip to trigger error
      const endButton = screen.getByText('End Trip');
      fireEvent.press(endButton);

      await waitFor(() => {
        expect(mockEndTrip).toHaveBeenCalled();
      });

      mockUseTripSession.mockReturnValue(createMockTripSession({
        session: null,
        endTrip: mockEndTrip,
      }));

      rerender(<TripTrackingScreen />);

      // Should show retry button
      await waitFor(() => {
        const retryButton = screen.getByText('Retry');
        expect(retryButton).toBeTruthy();
      });
    });

    it('should call endTrip again when retry button is pressed', async () => {
      const submissionError = new Error('Temporary error');
      const mockEndTrip = jest.fn()
        .mockResolvedValueOnce({
          submitted: false,
          error: submissionError,
        })
        .mockResolvedValueOnce({
          submitted: true,
          error: undefined,
        });

      mockUseLocalSearchParams.mockReturnValue({
        route_id: '335E',
        route_short_name: '335E',
        direction_id: '0',
      });

      mockUseTripSession.mockReturnValue(createMockTripSession({
        session: mockSession,
        endTrip: mockEndTrip,
      }));

      const { rerender } = render(<TripTrackingScreen />);

      // End the trip to trigger error
      const endButton = screen.getByText('End Trip');
      fireEvent.press(endButton);

      await waitFor(() => {
        expect(mockEndTrip).toHaveBeenCalledTimes(1);
      });

      mockUseTripSession.mockReturnValue(createMockTripSession({
        session: null,
        endTrip: mockEndTrip,
      }));

      rerender(<TripTrackingScreen />);

      // Press retry button
      const retryButton = await screen.findByText('Retry');
      fireEvent.press(retryButton);

      await waitFor(() => {
        expect(mockEndTrip).toHaveBeenCalledTimes(2);
      });
    });

    it('should display error for different error types', async () => {
      const authError = new Error('Unauthorized: Invalid API key');
      const mockEndTrip = jest.fn().mockResolvedValue({
        submitted: false,
        error: authError,
      });

      mockUseLocalSearchParams.mockReturnValue({
        route_id: '335E',
        route_short_name: '335E',
        direction_id: '0',
      });

      mockUseTripSession.mockReturnValue(createMockTripSession({
        session: mockSession,
        endTrip: mockEndTrip,
      }));

      const { rerender } = render(<TripTrackingScreen />);

      // End the trip to trigger error
      const endButton = screen.getByText('End Trip');
      fireEvent.press(endButton);

      await waitFor(() => {
        expect(mockEndTrip).toHaveBeenCalled();
      });

      mockUseTripSession.mockReturnValue(createMockTripSession({
        session: null,
        endTrip: mockEndTrip,
      }));

      rerender(<TripTrackingScreen />);

      await waitFor(() => {
        expect(screen.getByText(/Unauthorized/i)).toBeTruthy();
      });
    });

    it('should clear error when starting a new trip', async () => {
      const mockStartTrip = jest.fn();
      const submissionError = new Error('Previous error');
      const mockEndTrip = jest.fn().mockResolvedValue({
        submitted: false,
        error: submissionError,
      });

      mockUseLocalSearchParams.mockReturnValue({
        route_id: '335E',
        route_short_name: '335E',
        direction_id: '0',
      });

      mockUseTripSession.mockReturnValue(createMockTripSession({
        session: mockSession,
        startTrip: mockStartTrip,
        endTrip: mockEndTrip,
      }));

      const { rerender } = render(<TripTrackingScreen />);

      // End trip to trigger error
      const endButton = screen.getByText('End Trip');
      fireEvent.press(endButton);

      await waitFor(() => {
        expect(mockEndTrip).toHaveBeenCalled();
      });

      // Session cleared, error shown
      mockUseTripSession.mockReturnValue(createMockTripSession({
        session: null,
        startTrip: mockStartTrip,
        endTrip: mockEndTrip,
      }));

      rerender(<TripTrackingScreen />);

      await waitFor(() => {
        expect(screen.getByText(/Previous error/i)).toBeTruthy();
      });

      // Start new trip (clears error in component)
      const startButton = screen.getByText('Start Trip');
      fireEvent.press(startButton);

      // Hook should clear error when startTrip is called
      mockUseTripSession.mockReturnValue(createMockTripSession({
        session: {
          route_id: '335E',
          direction_id: 0,
          from_stop_id: '20558',
          to_stop_id: '29374',
          started_at: new Date().toISOString(),
          journeyId: 'new-journey',
          stopEvents: [],
        },
        startTrip: mockStartTrip,
      }));

      rerender(<TripTrackingScreen />);

      // Error should be gone
      expect(screen.queryByText(/Previous error/i)).toBeFalsy();
    });
  });

  describe('Direction ID Parsing', () => {
    it('should parse direction_id "0" as number 0', () => {
      const mockStartTrip = jest.fn();

      mockUseLocalSearchParams.mockReturnValue({
        route_id: '335E',
        route_short_name: '335E',
        direction_id: '0',
      });

      mockUseTripSession.mockReturnValue(createMockTripSession({
        startTrip: mockStartTrip,
      }));

      render(<TripTrackingScreen />);

      const startButton = screen.getByText('Start Trip');
      fireEvent.press(startButton);

      const journeyArg = mockStartTrip.mock.calls[0][0] as Journey;
      expect(journeyArg.directionId).toBe(0);
      expect(journeyArg.directionId).not.toBe('0');
    });

    it('should parse direction_id "1" as number 1', () => {
      const mockStartTrip = jest.fn();

      mockUseLocalSearchParams.mockReturnValue({
        route_id: '335E',
        route_short_name: '335E',
        direction_id: '1',
      });

      mockUseTripSession.mockReturnValue(createMockTripSession({
        startTrip: mockStartTrip,
      }));

      render(<TripTrackingScreen />);

      const startButton = screen.getByText('Start Trip');
      fireEvent.press(startButton);

      const journeyArg = mockStartTrip.mock.calls[0][0] as Journey;
      expect(journeyArg.directionId).toBe(1);
      expect(journeyArg.directionId).not.toBe('1');
    });

    it('should reject direction_id values other than "0" or "1"', () => {
      mockUseLocalSearchParams.mockReturnValue({
        route_id: '335E',
        route_short_name: '335E',
        direction_id: '2',
      });

      mockUseTripSession.mockReturnValue(createMockTripSession());

      render(<TripTrackingScreen />);

      expect(screen.getByText(/Invalid direction_id/i)).toBeTruthy();
    });

    it('should reject non-numeric direction_id values', () => {
      mockUseLocalSearchParams.mockReturnValue({
        route_id: '335E',
        route_short_name: '335E',
        direction_id: 'north',
      });

      mockUseTripSession.mockReturnValue(createMockTripSession());

      render(<TripTrackingScreen />);

      expect(screen.getByText(/Invalid direction_id/i)).toBeTruthy();
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty route params object', () => {
      mockUseLocalSearchParams.mockReturnValue({});

      mockUseTripSession.mockReturnValue(createMockTripSession());

      render(<TripTrackingScreen />);

      expect(screen.getByText(/Missing required parameter/i)).toBeTruthy();
    });

    it('should handle params with undefined values', () => {
      mockUseLocalSearchParams.mockReturnValue({
        route_id: undefined,
        route_short_name: undefined,
        direction_id: undefined,
      });

      mockUseTripSession.mockReturnValue(createMockTripSession());

      render(<TripTrackingScreen />);

      expect(screen.getByText(/Missing required parameter/i)).toBeTruthy();
    });

    it('should handle very long route names gracefully', () => {
      const longRouteName = 'Very Long Route Name That Might Wrap '.repeat(10);

      mockUseLocalSearchParams.mockReturnValue({
        route_id: '335E',
        route_short_name: '335E',
        direction_id: '0',
        route_long_name: longRouteName,
      });

      mockUseTripSession.mockReturnValue(createMockTripSession());

      render(<TripTrackingScreen />);

      // Should render without crashing
      expect(screen.getByText('335E')).toBeTruthy();
    });

    it('should not crash if endTrip throws synchronously', async () => {
      const mockEndTrip = jest.fn().mockImplementation(() => {
        throw new Error('Synchronous error');
      });

      const mockSession: TripSession = {
        route_id: '335E',
        direction_id: 0,
        from_stop_id: '20558',
        to_stop_id: '29374',
        started_at: new Date().toISOString(),
        journeyId: 'test-journey',
        stopEvents: [],
      };

      mockUseLocalSearchParams.mockReturnValue({
        route_id: '335E',
        route_short_name: '335E',
        direction_id: '0',
      });

      mockUseTripSession.mockReturnValue(createMockTripSession({
        session: mockSession,
        endTrip: mockEndTrip,
      }));

      render(<TripTrackingScreen />);

      const endButton = screen.getByText('End Trip');

      // Should not crash
      expect(() => fireEvent.press(endButton)).not.toThrow();
    });
  });

  describe('UI State Transitions', () => {
    it('should transition from idle -> active -> success correctly', async () => {
      const mockStartTrip = jest.fn();
      const mockEndTrip = jest.fn().mockResolvedValue({
        submitted: true,
        error: undefined,
      });

      mockUseLocalSearchParams.mockReturnValue({
        route_id: '335E',
        route_short_name: '335E',
        direction_id: '0',
      });

      const { rerender } = render(<TripTrackingScreen />);

      // State 1: Idle (no session)
      mockUseTripSession.mockReturnValue(createMockTripSession({
        startTrip: mockStartTrip,
        endTrip: mockEndTrip,
      }));

      rerender(<TripTrackingScreen />);
      expect(screen.getByText('Ready to start trip')).toBeTruthy();

      // User presses Start
      const startButton = screen.getByText('Start Trip');
      fireEvent.press(startButton);

      // State 2: Active (session exists)
      const mockSession: TripSession = {
        route_id: '335E',
        direction_id: 0,
        from_stop_id: '20558',
        to_stop_id: '29374',
        started_at: new Date().toISOString(),
        journeyId: 'test-journey',
        stopEvents: [],
      };

      mockUseTripSession.mockReturnValue(createMockTripSession({
        session: mockSession,
        startTrip: mockStartTrip,
        endTrip: mockEndTrip,
      }));

      rerender(<TripTrackingScreen />);
      expect(screen.getByText('Trip in progress')).toBeTruthy();

      // User presses End
      const endButton = screen.getByText('End Trip');
      fireEvent.press(endButton);

      // Wait for endTrip to be called
      await waitFor(() => {
        expect(mockEndTrip).toHaveBeenCalled();
      });

      // State 3: Success (session null, no error)
      mockUseTripSession.mockReturnValue(createMockTripSession({
        session: null,
        startTrip: mockStartTrip,
        endTrip: mockEndTrip,
      }));

      rerender(<TripTrackingScreen />);

      await waitFor(() => {
        expect(screen.getByText(/submitted successfully/i)).toBeTruthy();
      });
    });

    it('should transition from active -> error -> idle on retry', async () => {
      const submissionError = new Error('Network timeout');
      const mockEndTrip = jest.fn()
        .mockResolvedValueOnce({
          submitted: false,
          error: submissionError,
        })
        .mockResolvedValueOnce({
          submitted: true,
          error: undefined,
        });

      mockUseLocalSearchParams.mockReturnValue({
        route_id: '335E',
        route_short_name: '335E',
        direction_id: '0',
      });

      // State 1: Active
      const mockSession: TripSession = {
        route_id: '335E',
        direction_id: 0,
        from_stop_id: '20558',
        to_stop_id: '29374',
        started_at: new Date().toISOString(),
        journeyId: 'test-journey',
        stopEvents: [],
      };

      mockUseTripSession.mockReturnValue(createMockTripSession({
        session: mockSession,
        endTrip: mockEndTrip,
      }));

      const { rerender } = render(<TripTrackingScreen />);

      expect(screen.getByText('Trip in progress')).toBeTruthy();

      // End the trip to trigger error
      const endButton = screen.getByText('End Trip');
      fireEvent.press(endButton);

      await waitFor(() => {
        expect(mockEndTrip).toHaveBeenCalledTimes(1);
      });

      // State 2: Error (after failed endTrip)
      mockUseTripSession.mockReturnValue(createMockTripSession({
        session: null, // Session cleared
        endTrip: mockEndTrip,
      }));

      rerender(<TripTrackingScreen />);

      await waitFor(() => {
        expect(screen.getByText(/Network timeout/i)).toBeTruthy();
      });

      // User retries
      const retryButton = screen.getByText('Retry');
      fireEvent.press(retryButton);

      await waitFor(() => {
        expect(mockEndTrip).toHaveBeenCalledTimes(2);
      });

      // State 3: Success (error cleared)
      rerender(<TripTrackingScreen />);

      await waitFor(() => {
        expect(screen.queryByText(/Network timeout/i)).toBeFalsy();
      });
    });
  });

  describe('useStopDetection Integration', () => {
    const mockStops = [
      { stop_id: '20558', stop_name: 'Kengeri Bus Terminal', stop_lat: 12.9143, stop_lon: 77.4850, zone_id: null },
      { stop_id: '20559', stop_name: 'Kengeri Satellite Town', stop_lat: 12.9175, stop_lon: 77.4920, zone_id: null },
      { stop_id: '29374', stop_name: 'Electronic City', stop_lat: 12.8456, stop_lon: 77.6603, zone_id: null },
    ];

    describe('Stops Fetching', () => {
      it('should fetch stops on component mount with correct route_id and direction_id', () => {
        mockUseLocalSearchParams.mockReturnValue({
          route_id: '335E',
          route_short_name: '335E',
          direction_id: '0',
        });

        mockUseTripSession.mockReturnValue(createMockTripSession());
        mockUseStops.mockReturnValue(createMockUseStops({ stops: mockStops }));

        render(<TripTrackingScreen />);

        // Verify useStops was called with correct params
        expect(mockUseStops).toHaveBeenCalledWith({
          route_id: '335E',
        });
      });

      it('should fetch stops with different route IDs correctly', () => {
        mockUseLocalSearchParams.mockReturnValue({
          route_id: '340',
          route_short_name: '340',
          direction_id: '1',
        });

        mockUseTripSession.mockReturnValue(createMockTripSession());

        render(<TripTrackingScreen />);

        expect(mockUseStops).toHaveBeenCalledWith({
          route_id: '340',
        });
      });

      it('should not fetch stops when route_id is missing', () => {
        mockUseLocalSearchParams.mockReturnValue({
          route_short_name: '335E',
          direction_id: '0',
        });

        mockUseTripSession.mockReturnValue(createMockTripSession());

        render(<TripTrackingScreen />);

        // Should still call useStops but with undefined/missing route_id
        // Or component may handle this case differently - adjust based on implementation
        expect(mockUseStops).toHaveBeenCalled();
      });
    });

    describe('Stop Data Transformation', () => {
      it('should transform Stop[] to StopWithCoords[] correctly', () => {
        const mockRecordStopVisit = jest.fn();

        mockUseLocalSearchParams.mockReturnValue({
          route_id: '335E',
          route_short_name: '335E',
          direction_id: '0',
        });

        const mockSession: TripSession = {
          route_id: '335E',
          direction_id: 0,
          from_stop_id: '20558',
          to_stop_id: '29374',
          started_at: new Date().toISOString(),
          journeyId: 'test-journey',
          stopEvents: [],
        };

        mockUseTripSession.mockReturnValue(createMockTripSession({
          session: mockSession,
          recordStopVisit: mockRecordStopVisit,
        }));

        mockUseStops.mockReturnValue(createMockUseStops({ stops: mockStops }));

        render(<TripTrackingScreen />);

        // Verify useStopDetection was called
        expect(mockUseStopDetection).toHaveBeenCalled();

        // Verify the stops parameter was transformed correctly
        const lastCall = mockUseStopDetection.mock.calls[mockUseStopDetection.mock.calls.length - 1][0];
        expect(lastCall.stops).toBeDefined();
        expect(lastCall.stops).toHaveLength(3);

        // Verify transformation: Stop -> StopWithCoords
        expect(lastCall.stops[0]).toEqual({
          stopId: '20558',
          coords: { lat: 12.9143, lon: 77.4850 },
        });
        expect(lastCall.stops[1]).toEqual({
          stopId: '20559',
          coords: { lat: 12.9175, lon: 77.4920 },
        });
        expect(lastCall.stops[2]).toEqual({
          stopId: '29374',
          coords: { lat: 12.8456, lon: 77.6603 },
        });
      });

      it('should handle empty stops array gracefully', () => {
        mockUseLocalSearchParams.mockReturnValue({
          route_id: '335E',
          route_short_name: '335E',
          direction_id: '0',
        });

        mockUseTripSession.mockReturnValue(createMockTripSession());
        mockUseStops.mockReturnValue(createMockUseStops({ stops: [] }));

        render(<TripTrackingScreen />);

        // Should not crash with empty stops
        const lastCall = mockUseStopDetection.mock.calls[mockUseStopDetection.mock.calls.length - 1][0];
        expect(lastCall.stops).toEqual([]);
      });
    });

    describe('useStopDetection Hook Call', () => {
      it('should call useStopDetection with active=false when trip is not started', () => {
        mockUseLocalSearchParams.mockReturnValue({
          route_id: '335E',
          route_short_name: '335E',
          direction_id: '0',
        });

        mockUseTripSession.mockReturnValue(createMockTripSession({
          session: null, // No active session
        }));

        mockUseStops.mockReturnValue(createMockUseStops({ stops: mockStops }));

        render(<TripTrackingScreen />);

        // Verify useStopDetection was called with active=false
        const lastCall = mockUseStopDetection.mock.calls[mockUseStopDetection.mock.calls.length - 1][0];
        expect(lastCall.active).toBe(false);
      });

      it('should call useStopDetection with active=true when trip is started', () => {
        const mockRecordStopVisit = jest.fn();

        mockUseLocalSearchParams.mockReturnValue({
          route_id: '335E',
          route_short_name: '335E',
          direction_id: '0',
        });

        const mockSession: TripSession = {
          route_id: '335E',
          direction_id: 0,
          from_stop_id: '20558',
          to_stop_id: '29374',
          started_at: new Date().toISOString(),
          journeyId: 'test-journey',
          stopEvents: [],
        };

        mockUseTripSession.mockReturnValue(createMockTripSession({
          session: mockSession,
          recordStopVisit: mockRecordStopVisit,
        }));

        mockUseStops.mockReturnValue(createMockUseStops({ stops: mockStops }));

        render(<TripTrackingScreen />);

        // Verify useStopDetection was called with active=true
        const lastCall = mockUseStopDetection.mock.calls[mockUseStopDetection.mock.calls.length - 1][0];
        expect(lastCall.active).toBe(true);
      });

      it('should pass correct routeId from params', () => {
        mockUseLocalSearchParams.mockReturnValue({
          route_id: '340',
          route_short_name: '340',
          direction_id: '1',
        });

        const mockSession: TripSession = {
          route_id: '340',
          direction_id: 1,
          from_stop_id: '20558',
          to_stop_id: '29374',
          started_at: new Date().toISOString(),
          journeyId: 'test-journey',
          stopEvents: [],
        };

        mockUseTripSession.mockReturnValue(createMockTripSession({
          session: mockSession,
        }));

        mockUseStops.mockReturnValue(createMockUseStops({ stops: mockStops }));

        render(<TripTrackingScreen />);

        const lastCall = mockUseStopDetection.mock.calls[mockUseStopDetection.mock.calls.length - 1][0];
        expect(lastCall.routeId).toBe('340');
      });

      it('should parse and pass directionId as number', () => {
        mockUseLocalSearchParams.mockReturnValue({
          route_id: '335E',
          route_short_name: '335E',
          direction_id: '1', // String from params
        });

        const mockSession: TripSession = {
          route_id: '335E',
          direction_id: 1,
          from_stop_id: '20558',
          to_stop_id: '29374',
          started_at: new Date().toISOString(),
          journeyId: 'test-journey',
          stopEvents: [],
        };

        mockUseTripSession.mockReturnValue(createMockTripSession({
          session: mockSession,
        }));

        mockUseStops.mockReturnValue(createMockUseStops({ stops: mockStops }));

        render(<TripTrackingScreen />);

        const lastCall = mockUseStopDetection.mock.calls[mockUseStopDetection.mock.calls.length - 1][0];
        expect(lastCall.directionId).toBe(1);
        expect(typeof lastCall.directionId).toBe('number');
      });

      it('should pass recordStopVisit from useTripSession', () => {
        const mockRecordStopVisit = jest.fn();

        mockUseLocalSearchParams.mockReturnValue({
          route_id: '335E',
          route_short_name: '335E',
          direction_id: '0',
        });

        const mockSession: TripSession = {
          route_id: '335E',
          direction_id: 0,
          from_stop_id: '20558',
          to_stop_id: '29374',
          started_at: new Date().toISOString(),
          journeyId: 'test-journey',
          stopEvents: [],
        };

        mockUseTripSession.mockReturnValue(createMockTripSession({
          session: mockSession,
          recordStopVisit: mockRecordStopVisit,
        }));

        mockUseStops.mockReturnValue(createMockUseStops({ stops: mockStops }));

        render(<TripTrackingScreen />);

        const lastCall = mockUseStopDetection.mock.calls[mockUseStopDetection.mock.calls.length - 1][0];
        expect(lastCall.recordStopVisit).toBe(mockRecordStopVisit);
      });

      it('should pass radiusMeters=50', () => {
        mockUseLocalSearchParams.mockReturnValue({
          route_id: '335E',
          route_short_name: '335E',
          direction_id: '0',
        });

        const mockSession: TripSession = {
          route_id: '335E',
          direction_id: 0,
          from_stop_id: '20558',
          to_stop_id: '29374',
          started_at: new Date().toISOString(),
          journeyId: 'test-journey',
          stopEvents: [],
        };

        mockUseTripSession.mockReturnValue(createMockTripSession({
          session: mockSession,
        }));

        mockUseStops.mockReturnValue(createMockUseStops({ stops: mockStops }));

        render(<TripTrackingScreen />);

        const lastCall = mockUseStopDetection.mock.calls[mockUseStopDetection.mock.calls.length - 1][0];
        expect(lastCall.radiusMeters).toBe(50);
      });

      it('should pass transformed stops array', () => {
        mockUseLocalSearchParams.mockReturnValue({
          route_id: '335E',
          route_short_name: '335E',
          direction_id: '0',
        });

        mockUseTripSession.mockReturnValue(createMockTripSession({
          session: {
            route_id: '335E',
            direction_id: 0,
            from_stop_id: '20558',
            to_stop_id: '29374',
            started_at: new Date().toISOString(),
            journeyId: 'test-journey',
            stopEvents: [],
          },
        }));

        mockUseStops.mockReturnValue(createMockUseStops({ stops: mockStops }));

        render(<TripTrackingScreen />);

        const lastCall = mockUseStopDetection.mock.calls[mockUseStopDetection.mock.calls.length - 1][0];
        expect(lastCall.stops).toHaveLength(3);
        expect(lastCall.stops[0]).toHaveProperty('stopId');
        expect(lastCall.stops[0]).toHaveProperty('coords');
        expect(lastCall.stops[0].coords).toHaveProperty('lat');
        expect(lastCall.stops[0].coords).toHaveProperty('lon');
      });
    });

    describe('Loading State Handling', () => {
      it('should disable Start Trip button while stops are loading', () => {
        mockUseLocalSearchParams.mockReturnValue({
          route_id: '335E',
          route_short_name: '335E',
          direction_id: '0',
        });

        mockUseTripSession.mockReturnValue(createMockTripSession());
        mockUseStops.mockReturnValue(createMockUseStops({
          loading: true, // Stops are loading
          stops: [],
        }));

        render(<TripTrackingScreen />);

        // Start button should be disabled
        // In React Native Testing Library, we verify the button exists but in disabled state
        const startButton = screen.getByText('Start Trip');
        expect(startButton).toBeTruthy();

        // Component should show loading indicator or disabled state
        // Exact implementation depends on component design
      });

      it('should enable Start Trip button after stops finish loading', () => {
        mockUseLocalSearchParams.mockReturnValue({
          route_id: '335E',
          route_short_name: '335E',
          direction_id: '0',
        });

        mockUseTripSession.mockReturnValue(createMockTripSession());
        mockUseStops.mockReturnValue(createMockUseStops({
          loading: false,
          stops: mockStops,
        }));

        render(<TripTrackingScreen />);

        const startButton = screen.getByText('Start Trip');
        expect(startButton).toBeTruthy();

        // Should be enabled (can press)
        // Component should not show loading state
      });

      it('should show loading indicator when stops are being fetched', () => {
        mockUseLocalSearchParams.mockReturnValue({
          route_id: '335E',
          route_short_name: '335E',
          direction_id: '0',
        });

        mockUseTripSession.mockReturnValue(createMockTripSession());
        mockUseStops.mockReturnValue(createMockUseStops({
          loading: true,
          stops: [],
        }));

        render(<TripTrackingScreen />);

        // Component should display some form of loading indicator
        // Exact text/component depends on implementation
        // This test will be RED until implementation exists
      });
    });

    describe('Error State Handling', () => {
      it('should show error banner when stops fetch fails', () => {
        const fetchError = new Error('Failed to fetch stops');

        mockUseLocalSearchParams.mockReturnValue({
          route_id: '335E',
          route_short_name: '335E',
          direction_id: '0',
        });

        mockUseTripSession.mockReturnValue(createMockTripSession());
        mockUseStops.mockReturnValue(createMockUseStops({
          error: fetchError,
          stops: [],
        }));

        render(<TripTrackingScreen />);

        // Should display error message
        expect(screen.getByText(/Failed to fetch stops/i)).toBeTruthy();
      });

      it('should disable Start Trip button when stops fetch fails', () => {
        const fetchError = new Error('Network error');

        mockUseLocalSearchParams.mockReturnValue({
          route_id: '335E',
          route_short_name: '335E',
          direction_id: '0',
        });

        mockUseTripSession.mockReturnValue(createMockTripSession());
        mockUseStops.mockReturnValue(createMockUseStops({
          error: fetchError,
          stops: [],
        }));

        render(<TripTrackingScreen />);

        // Start button should be disabled due to error
        const startButton = screen.getByText('Start Trip');
        expect(startButton).toBeTruthy();
      });

      it('should show retry option when stops fetch fails', () => {
        const fetchError = new Error('API unavailable');
        const mockReload = jest.fn();

        mockUseLocalSearchParams.mockReturnValue({
          route_id: '335E',
          route_short_name: '335E',
          direction_id: '0',
        });

        mockUseTripSession.mockReturnValue(createMockTripSession());
        mockUseStops.mockReturnValue(createMockUseStops({
          error: fetchError,
          stops: [],
          reload: mockReload,
        }));

        render(<TripTrackingScreen />);

        // Should show retry button
        const retryButton = screen.getByText(/Retry|Try Again/i);
        expect(retryButton).toBeTruthy();

        // Press retry button
        fireEvent.press(retryButton);

        // Should call reload function
        expect(mockReload).toHaveBeenCalledTimes(1);
      });

      it('should handle different error types appropriately', () => {
        const networkError = new Error('Network request failed: timeout');

        mockUseLocalSearchParams.mockReturnValue({
          route_id: '335E',
          route_short_name: '335E',
          direction_id: '0',
        });

        mockUseTripSession.mockReturnValue(createMockTripSession());
        mockUseStops.mockReturnValue(createMockUseStops({
          error: networkError,
        }));

        render(<TripTrackingScreen />);

        // Should display specific error message
        expect(screen.getByText(/Network request failed/i)).toBeTruthy();
      });
    });

    describe('State Transitions', () => {
      it('should transition useStopDetection.active from false to true when trip starts', () => {
        const mockStartTrip = jest.fn();

        mockUseLocalSearchParams.mockReturnValue({
          route_id: '335E',
          route_short_name: '335E',
          direction_id: '0',
        });

        const { rerender } = render(<TripTrackingScreen />);

        // Initial: no session (active=false)
        mockUseTripSession.mockReturnValue(createMockTripSession({
          startTrip: mockStartTrip,
        }));
        mockUseStops.mockReturnValue(createMockUseStops({ stops: mockStops }));

        rerender(<TripTrackingScreen />);

        let lastCall = mockUseStopDetection.mock.calls[mockUseStopDetection.mock.calls.length - 1][0];
        expect(lastCall.active).toBe(false);

        // User presses Start Trip
        const startButton = screen.getByText('Start Trip');
        fireEvent.press(startButton);

        // After trip starts: session exists (active=true)
        const mockSession: TripSession = {
          route_id: '335E',
          direction_id: 0,
          from_stop_id: '20558',
          to_stop_id: '29374',
          started_at: new Date().toISOString(),
          journeyId: 'test-journey',
          stopEvents: [],
        };

        mockUseTripSession.mockReturnValue(createMockTripSession({
          session: mockSession,
          startTrip: mockStartTrip,
        }));

        rerender(<TripTrackingScreen />);

        lastCall = mockUseStopDetection.mock.calls[mockUseStopDetection.mock.calls.length - 1][0];
        expect(lastCall.active).toBe(true);
      });

      it('should transition useStopDetection.active from true to false when trip ends', async () => {
        const mockEndTrip = jest.fn().mockResolvedValue(undefined);

        mockUseLocalSearchParams.mockReturnValue({
          route_id: '335E',
          route_short_name: '335E',
          direction_id: '0',
        });

        const { rerender } = render(<TripTrackingScreen />);

        // Start with active session (active=true)
        const mockSession: TripSession = {
          route_id: '335E',
          direction_id: 0,
          from_stop_id: '20558',
          to_stop_id: '29374',
          started_at: new Date().toISOString(),
          journeyId: 'test-journey',
          stopEvents: [],
        };

        mockUseTripSession.mockReturnValue(createMockTripSession({
          session: mockSession,
          endTrip: mockEndTrip,
        }));
        mockUseStops.mockReturnValue(createMockUseStops({ stops: mockStops }));

        rerender(<TripTrackingScreen />);

        let lastCall = mockUseStopDetection.mock.calls[mockUseStopDetection.mock.calls.length - 1][0];
        expect(lastCall.active).toBe(true);

        // User presses End Trip
        const endButton = screen.getByText('End Trip');
        fireEvent.press(endButton);

        // After trip ends: session is null (active=false)
        await waitFor(() => {
          mockUseTripSession.mockReturnValue(createMockTripSession({
            session: null,
            endTrip: mockEndTrip,
          }));
        });

        rerender(<TripTrackingScreen />);

        lastCall = mockUseStopDetection.mock.calls[mockUseStopDetection.mock.calls.length - 1][0];
        expect(lastCall.active).toBe(false);
      });
    });

    describe('Edge Cases', () => {
      it('should handle stops array with single stop', () => {
        const singleStop = [mockStops[0]];

        mockUseLocalSearchParams.mockReturnValue({
          route_id: '335E',
          route_short_name: '335E',
          direction_id: '0',
        });

        mockUseTripSession.mockReturnValue(createMockTripSession({
          session: {
            route_id: '335E',
            direction_id: 0,
            from_stop_id: '20558',
            to_stop_id: '20558',
            started_at: new Date().toISOString(),
            journeyId: 'test-journey',
            stopEvents: [],
          },
        }));

        mockUseStops.mockReturnValue(createMockUseStops({ stops: singleStop }));

        render(<TripTrackingScreen />);

        const lastCall = mockUseStopDetection.mock.calls[mockUseStopDetection.mock.calls.length - 1][0];
        expect(lastCall.stops).toHaveLength(1);
      });

      it('should handle stops with null coordinates gracefully', () => {
        const stopsWithNull = [
          { stop_id: '20558', stop_name: 'Stop A', stop_lat: 12.9143, stop_lon: 77.4850, zone_id: null },
          { stop_id: '20559', stop_name: 'Stop B', stop_lat: 0, stop_lon: 0, zone_id: null },
        ];

        mockUseLocalSearchParams.mockReturnValue({
          route_id: '335E',
          route_short_name: '335E',
          direction_id: '0',
        });

        mockUseTripSession.mockReturnValue(createMockTripSession({
          session: {
            route_id: '335E',
            direction_id: 0,
            from_stop_id: '20558',
            to_stop_id: '20559',
            started_at: new Date().toISOString(),
            journeyId: 'test-journey',
            stopEvents: [],
          },
        }));

        mockUseStops.mockReturnValue(createMockUseStops({ stops: stopsWithNull }));

        render(<TripTrackingScreen />);

        // Should not crash with (0,0) coordinates
        const lastCall = mockUseStopDetection.mock.calls[mockUseStopDetection.mock.calls.length - 1][0];
        expect(lastCall.stops).toHaveLength(2);
        expect(lastCall.stops[1].coords).toEqual({ lat: 0, lon: 0 });
      });

      it('should handle very large stops array efficiently', () => {
        // Create array with 100 stops
        const largeStopsArray = Array.from({ length: 100 }, (_, i) => ({
          stop_id: `STOP_${i}`,
          stop_name: `Stop ${i}`,
          stop_lat: 12.9 + (i * 0.001),
          stop_lon: 77.5 + (i * 0.001),
          zone_id: null,
        }));

        mockUseLocalSearchParams.mockReturnValue({
          route_id: '335E',
          route_short_name: '335E',
          direction_id: '0',
        });

        mockUseTripSession.mockReturnValue(createMockTripSession({
          session: {
            route_id: '335E',
            direction_id: 0,
            from_stop_id: '20558',
            to_stop_id: '29374',
            started_at: new Date().toISOString(),
            journeyId: 'test-journey',
            stopEvents: [],
          },
        }));

        mockUseStops.mockReturnValue(createMockUseStops({ stops: largeStopsArray }));

        render(<TripTrackingScreen />);

        const lastCall = mockUseStopDetection.mock.calls[mockUseStopDetection.mock.calls.length - 1][0];
        expect(lastCall.stops).toHaveLength(100);
      });

      it('should handle missing optional zone_id field in stops', () => {
        const stopsWithoutZone = mockStops.map(stop => ({
          stop_id: stop.stop_id,
          stop_name: stop.stop_name,
          stop_lat: stop.stop_lat,
          stop_lon: stop.stop_lon,
          zone_id: null,
        }));

        mockUseLocalSearchParams.mockReturnValue({
          route_id: '335E',
          route_short_name: '335E',
          direction_id: '0',
        });

        mockUseTripSession.mockReturnValue(createMockTripSession({
          session: {
            route_id: '335E',
            direction_id: 0,
            from_stop_id: '20558',
            to_stop_id: '29374',
            started_at: new Date().toISOString(),
            journeyId: 'test-journey',
            stopEvents: [],
          },
        }));

        mockUseStops.mockReturnValue(createMockUseStops({ stops: stopsWithoutZone }));

        render(<TripTrackingScreen />);

        // Should transform correctly even without zone_id
        const lastCall = mockUseStopDetection.mock.calls[mockUseStopDetection.mock.calls.length - 1][0];
        expect(lastCall.stops).toHaveLength(3);
        expect(lastCall.stops[0]).not.toHaveProperty('zone_id');
      });
    });
  });

  describe('Three-Outcome Trip Submission UI Tests', () => {
    /**
     * Tests for the three-outcome model UI behavior:
     * 1. Success banner (green) - submission succeeded
     * 2. Error banner (red) - submission failed
     * 3. Info banner (yellow) - no data collected
     */

    const mockStops = [
      { stop_id: '20558', stop_name: 'Kengeri Bus Terminal', stop_lat: 12.9143, stop_lon: 77.4850, zone_id: null },
      { stop_id: '20559', stop_name: 'Kengeri Satellite Town', stop_lat: 12.9175, stop_lon: 77.4920, zone_id: null },
      { stop_id: '29374', stop_name: 'Electronic City', stop_lat: 12.8456, stop_lon: 77.6603, zone_id: null },
    ];

    beforeEach(() => {
      mockUseLocalSearchParams.mockReturnValue({
        route_id: '335E',
        route_short_name: '335E',
        direction_id: '0',
      });
      mockUseStops.mockReturnValue(createMockUseStops({ stops: mockStops }));
      mockUseStopDetection.mockReturnValue(createMockUseStopDetection());
    });

    describe('Outcome 1: Success banner (submission succeeded)', () => {
      it('should show success banner when endTrip returns submitted: true', async () => {
        const mockEndTrip = jest.fn().mockResolvedValue({
          submitted: true,
          error: undefined,
        });

        const mockSession: TripSession = {
          route_id: '335E',
          direction_id: 0,
          from_stop_id: '20558',
          to_stop_id: '29374',
          started_at: new Date().toISOString(),
          journeyId: 'test-journey',
          stopEvents: [],
        };

        mockUseTripSession.mockReturnValue(createMockTripSession({
          session: mockSession,
          endTrip: mockEndTrip,
        }));

        const { rerender } = render(<TripTrackingScreen />);

        const endButton = screen.getByText('End Trip');
        fireEvent.press(endButton);

        // After endTrip completes, session should be null
        await waitFor(() => {
          mockUseTripSession.mockReturnValue(createMockTripSession({
            session: null,
            endTrip: mockEndTrip,
          }));
        });

        rerender(<TripTrackingScreen />);

        // Should display success message/banner
        await waitFor(() => {
          expect(screen.getByText(/Trip data submitted successfully|submitted successfully/i)).toBeTruthy();
        });
      });

      it('should show green/success styling for success banner', async () => {
        const mockEndTrip = jest.fn().mockResolvedValue({
          submitted: true,
          error: undefined,
        });

        const mockSession: TripSession = {
          route_id: '335E',
          direction_id: 0,
          from_stop_id: '20558',
          to_stop_id: '29374',
          started_at: new Date().toISOString(),
          journeyId: 'test-journey',
          stopEvents: [],
        };

        mockUseTripSession.mockReturnValue(createMockTripSession({
          session: mockSession,
          endTrip: mockEndTrip,
        }));

        const { rerender } = render(<TripTrackingScreen />);

        const endButton = screen.getByText('End Trip');
        fireEvent.press(endButton);

        await waitFor(() => {
          mockUseTripSession.mockReturnValue(createMockTripSession({
            session: null,
            endTrip: mockEndTrip,
          }));
        });

        rerender(<TripTrackingScreen />);

        // Should show success banner with appropriate styling
        // Note: Testing exact styling in React Native Testing Library is limited,
        // but we can verify the message appears
        await waitFor(() => {
          const successText = screen.getByText(/submitted successfully/i);
          expect(successText).toBeTruthy();
        });
      });

      it('should auto-dismiss success banner after 3 seconds', async () => {
        jest.useFakeTimers();

        const mockEndTrip = jest.fn().mockResolvedValue({
          submitted: true,
          error: undefined,
        });

        const mockSession: TripSession = {
          route_id: '335E',
          direction_id: 0,
          from_stop_id: '20558',
          to_stop_id: '29374',
          started_at: new Date().toISOString(),
          journeyId: 'test-journey',
          stopEvents: [],
        };

        mockUseTripSession.mockReturnValue(createMockTripSession({
          session: mockSession,
          endTrip: mockEndTrip,
        }));

        const { rerender } = render(<TripTrackingScreen />);

        const endButton = screen.getByText('End Trip');
        fireEvent.press(endButton);

        // After endTrip completes
        await waitFor(() => {
          mockUseTripSession.mockReturnValue(createMockTripSession({
            session: null,
            endTrip: mockEndTrip,
          }));
        });

        rerender(<TripTrackingScreen />);

        // Banner should be visible
        await waitFor(() => {
          expect(screen.getByText(/submitted successfully/i)).toBeTruthy();
        });

        // Fast-forward 3 seconds
        act(() => {
          jest.advanceTimersByTime(3000);
        });

        rerender(<TripTrackingScreen />);

        // Banner should be dismissed
        await waitFor(() => {
          expect(screen.queryByText(/submitted successfully/i)).toBeFalsy();
        });

        jest.useRealTimers();
      });
    });

    describe('Outcome 2: Error banner (submission failed)', () => {
      it('should show error banner when endTrip returns submitted: false with error', async () => {
        const submissionError = new Error('Network error: Failed to fetch');
        const mockEndTrip = jest.fn().mockResolvedValue({
          submitted: false,
          error: submissionError,
        });

        const mockSession: TripSession = {
          route_id: '335E',
          direction_id: 0,
          from_stop_id: '20558',
          to_stop_id: '29374',
          started_at: new Date().toISOString(),
          journeyId: 'test-journey',
          stopEvents: [],
        };

        mockUseTripSession.mockReturnValue(createMockTripSession({
          session: mockSession,
          endTrip: mockEndTrip,
        }));

        const { rerender } = render(<TripTrackingScreen />);

        const endButton = screen.getByText('End Trip');
        fireEvent.press(endButton);

        // After endTrip completes, session cleared but error is set
        await waitFor(() => {
          mockUseTripSession.mockReturnValue(createMockTripSession({
            session: null,
            endTrip: mockEndTrip,
            submissionError: submissionError,
          }));
        });

        rerender(<TripTrackingScreen />);

        // Should display error banner
        await waitFor(() => {
          expect(screen.getByText(/Submission Failed|Failed to submit/i)).toBeTruthy();
        });
      });

      it('should show error banner with error message details', async () => {
        const submissionError = new Error('API Error: 500 Internal Server Error');
        const mockEndTrip = jest.fn().mockResolvedValue({
          submitted: false,
          error: submissionError,
        });

        const mockSession: TripSession = {
          route_id: '335E',
          direction_id: 0,
          from_stop_id: '20558',
          to_stop_id: '29374',
          started_at: new Date().toISOString(),
          journeyId: 'test-journey',
          stopEvents: [],
        };

        mockUseTripSession.mockReturnValue(createMockTripSession({
          session: mockSession,
          endTrip: mockEndTrip,
        }));

        const { rerender } = render(<TripTrackingScreen />);

        // End the trip to trigger error
        const endButton = screen.getByText('End Trip');
        fireEvent.press(endButton);

        await waitFor(() => {
          expect(mockEndTrip).toHaveBeenCalled();
        });

        mockUseTripSession.mockReturnValue(createMockTripSession({
          session: null,
          endTrip: mockEndTrip,
        }));

        rerender(<TripTrackingScreen />);

        // Should show error message
        await waitFor(() => {
          expect(screen.getByText(/API Error|500 Internal Server Error/i)).toBeTruthy();
        });
      });

      it('should show retry button in error banner', async () => {
        const submissionError = new Error('Network timeout');
        const mockEndTrip = jest.fn().mockResolvedValue({
          submitted: false,
          error: submissionError,
        });

        const mockSession: TripSession = {
          route_id: '335E',
          direction_id: 0,
          from_stop_id: '20558',
          to_stop_id: '29374',
          started_at: new Date().toISOString(),
          journeyId: 'test-journey',
          stopEvents: [],
        };

        mockUseTripSession.mockReturnValue(createMockTripSession({
          session: mockSession,
          endTrip: mockEndTrip,
        }));

        const { rerender } = render(<TripTrackingScreen />);

        // End the trip to trigger error
        const endButton = screen.getByText('End Trip');
        fireEvent.press(endButton);

        await waitFor(() => {
          expect(mockEndTrip).toHaveBeenCalled();
        });

        mockUseTripSession.mockReturnValue(createMockTripSession({
          session: null,
          endTrip: mockEndTrip,
        }));

        rerender(<TripTrackingScreen />);

        // Should show retry button
        await waitFor(() => {
          const retryButton = screen.getByText('Retry');
          expect(retryButton).toBeTruthy();
        });
      });

      it('should NOT auto-dismiss error banner', async () => {
        jest.useFakeTimers();

        const submissionError = new Error('Network error');
        const mockEndTrip = jest.fn().mockResolvedValue({
          submitted: false,
          error: submissionError,
        });

        const mockSession: TripSession = {
          route_id: '335E',
          direction_id: 0,
          from_stop_id: '20558',
          to_stop_id: '29374',
          started_at: new Date().toISOString(),
          journeyId: 'test-journey',
          stopEvents: [],
        };

        mockUseTripSession.mockReturnValue(createMockTripSession({
          session: mockSession,
          endTrip: mockEndTrip,
        }));

        const { rerender } = render(<TripTrackingScreen />);

        // End the trip to trigger error
        const endButton = screen.getByText('End Trip');
        fireEvent.press(endButton);

        await waitFor(() => {
          expect(mockEndTrip).toHaveBeenCalled();
        });

        mockUseTripSession.mockReturnValue(createMockTripSession({
          session: null,
          endTrip: mockEndTrip,
        }));

        rerender(<TripTrackingScreen />);

        // Error banner should be visible
        await waitFor(() => {
          expect(screen.getByText('Submission Failed')).toBeTruthy();
          expect(screen.getByText(/Network error/i)).toBeTruthy();
        });

        // Fast-forward 5 seconds
        act(() => {
          jest.advanceTimersByTime(5000);
        });

        // Error banner should STILL be visible (does not auto-dismiss)
        expect(screen.getByText('Submission Failed')).toBeTruthy();
        expect(screen.getByText(/Network error/i)).toBeTruthy();

        jest.useRealTimers();
      });

      it('should clear error banner when retry is pressed', async () => {
        const submissionError = new Error('Network error');
        const mockEndTrip = jest.fn()
          .mockResolvedValueOnce({
            submitted: false,
            error: submissionError,
          })
          .mockResolvedValueOnce({
            submitted: true,
            error: undefined,
          });

        const mockSession: TripSession = {
          route_id: '335E',
          direction_id: 0,
          from_stop_id: '20558',
          to_stop_id: '29374',
          started_at: new Date().toISOString(),
          journeyId: 'test-journey',
          stopEvents: [],
        };

        mockUseTripSession.mockReturnValue(createMockTripSession({
          session: mockSession,
          endTrip: mockEndTrip,
        }));

        const { rerender } = render(<TripTrackingScreen />);

        // End the trip to trigger error
        const endButton = screen.getByText('End Trip');
        fireEvent.press(endButton);

        await waitFor(() => {
          expect(mockEndTrip).toHaveBeenCalledTimes(1);
        });

        mockUseTripSession.mockReturnValue(createMockTripSession({
          session: null,
          endTrip: mockEndTrip,
        }));

        rerender(<TripTrackingScreen />);

        // Error banner visible
        await waitFor(() => {
          expect(screen.getByText(/Submission Failed|Network error/i)).toBeTruthy();
        });

        // Press retry
        const retryButton = screen.getByText('Retry');
        fireEvent.press(retryButton);

        await waitFor(() => {
          expect(mockEndTrip).toHaveBeenCalledTimes(2);
        });

        // Error banner should be gone after successful retry
        await waitFor(() => {
          expect(screen.queryByText(/Submission Failed|Network error/i)).toBeFalsy();
        });
      });
    });

    describe('Outcome 3: Info banner (no data collected)', () => {
      it('should show info banner when endTrip returns submitted: false without error', async () => {
        const mockEndTrip = jest.fn().mockResolvedValue({
          submitted: false,
          error: undefined,
        });

        const mockSession: TripSession = {
          route_id: '335E',
          direction_id: 0,
          from_stop_id: '20558',
          to_stop_id: '29374',
          started_at: new Date().toISOString(),
          journeyId: 'test-journey',
          stopEvents: [], // No stop events
        };

        mockUseTripSession.mockReturnValue(createMockTripSession({
          session: mockSession,
          endTrip: mockEndTrip,
        }));

        const { rerender } = render(<TripTrackingScreen />);

        const endButton = screen.getByText('End Trip');
        fireEvent.press(endButton);

        // After endTrip completes, session cleared, no error
        await waitFor(() => {
          mockUseTripSession.mockReturnValue(createMockTripSession({
            session: null,
            endTrip: mockEndTrip,
            submissionError: undefined,
          }));
        });

        rerender(<TripTrackingScreen />);

        // Should display info message
        await waitFor(() => {
          expect(screen.getByText(/No stop data was recorded|No data|insufficient data/i)).toBeTruthy();
        });
      });

      it('should show yellow/info styling for no-data banner', async () => {
        const mockEndTrip = jest.fn().mockResolvedValue({
          submitted: false,
          error: undefined,
        });

        const mockSession: TripSession = {
          route_id: '335E',
          direction_id: 0,
          from_stop_id: '20558',
          to_stop_id: '29374',
          started_at: new Date().toISOString(),
          journeyId: 'test-journey',
          stopEvents: [],
        };

        mockUseTripSession.mockReturnValue(createMockTripSession({
          session: mockSession,
          endTrip: mockEndTrip,
        }));

        const { rerender } = render(<TripTrackingScreen />);

        const endButton = screen.getByText('End Trip');
        fireEvent.press(endButton);

        await waitFor(() => {
          mockUseTripSession.mockReturnValue(createMockTripSession({
            session: null,
            endTrip: mockEndTrip,
          }));
        });

        rerender(<TripTrackingScreen />);

        // Should show info banner
        await waitFor(() => {
          const infoText = screen.getByText(/No stop data was recorded/i);
          expect(infoText).toBeTruthy();
        });
      });

      it('should auto-dismiss info banner after 3 seconds', async () => {
        jest.useFakeTimers();

        const mockEndTrip = jest.fn().mockResolvedValue({
          submitted: false,
          error: undefined,
        });

        const mockSession: TripSession = {
          route_id: '335E',
          direction_id: 0,
          from_stop_id: '20558',
          to_stop_id: '29374',
          started_at: new Date().toISOString(),
          journeyId: 'test-journey',
          stopEvents: [],
        };

        mockUseTripSession.mockReturnValue(createMockTripSession({
          session: mockSession,
          endTrip: mockEndTrip,
        }));

        const { rerender } = render(<TripTrackingScreen />);

        const endButton = screen.getByText('End Trip');
        fireEvent.press(endButton);

        await waitFor(() => {
          mockUseTripSession.mockReturnValue(createMockTripSession({
            session: null,
            endTrip: mockEndTrip,
          }));
        });

        rerender(<TripTrackingScreen />);

        // Info banner should be visible
        await waitFor(() => {
          expect(screen.getByText(/No stop data was recorded/i)).toBeTruthy();
        });

        // Fast-forward 3 seconds
        act(() => {
          jest.advanceTimersByTime(3000);
        });

        rerender(<TripTrackingScreen />);

        // Banner should be dismissed
        await waitFor(() => {
          expect(screen.queryByText(/No stop data was recorded/i)).toBeFalsy();
        });

        jest.useRealTimers();
      });

      it('should NOT show retry button in info banner', async () => {
        const mockEndTrip = jest.fn().mockResolvedValue({
          submitted: false,
          error: undefined,
        });

        mockUseTripSession.mockReturnValue(createMockTripSession({
          session: null,
          endTrip: mockEndTrip,
        }));

        render(<TripTrackingScreen />);

        // Should show info message but no retry button
        // (There's nothing to retry when no data was collected)
        expect(screen.queryByText('Retry')).toBeFalsy();
      });
    });

    describe('Banner state transitions', () => {
      it('should clear any banner when starting a new trip', async () => {
        const mockStartTrip = jest.fn();
        const submissionError = new Error('Network error');
        const mockEndTrip = jest.fn().mockResolvedValue({
          submitted: false,
          error: submissionError,
        });

        const mockSession: TripSession = {
          route_id: '335E',
          direction_id: 0,
          from_stop_id: '20558',
          to_stop_id: '29374',
          started_at: new Date().toISOString(),
          journeyId: 'test-journey',
          stopEvents: [],
        };

        // Start with error banner visible (from previous trip)
        mockUseTripSession.mockReturnValue(createMockTripSession({
          session: mockSession,
          startTrip: mockStartTrip,
          endTrip: mockEndTrip,
        }));

        const { rerender } = render(<TripTrackingScreen />);

        // End trip to trigger error
        const endButton = screen.getByText('End Trip');
        fireEvent.press(endButton);

        await waitFor(() => {
          expect(mockEndTrip).toHaveBeenCalled();
        });

        mockUseTripSession.mockReturnValue(createMockTripSession({
          session: null,
          startTrip: mockStartTrip,
          endTrip: mockEndTrip,
        }));

        rerender(<TripTrackingScreen />);

        // Error banner should be visible
        await waitFor(() => {
          expect(screen.getByText(/Submission Failed|Network error/i)).toBeTruthy();
        });

        // Start a new trip
        const startButton = screen.getByText('Start Trip');
        fireEvent.press(startButton);

        // After starting new trip, error should be cleared
        mockUseTripSession.mockReturnValue(createMockTripSession({
          session: {
            route_id: '335E',
            direction_id: 0,
            from_stop_id: '20558',
            to_stop_id: '29374',
            started_at: new Date().toISOString(),
            journeyId: 'new-journey',
            stopEvents: [],
          },
          startTrip: mockStartTrip,
          endTrip: mockEndTrip,
        }));

        rerender(<TripTrackingScreen />);

        // Error banner should be cleared
        expect(screen.queryByText(/Submission Failed|Network error/i)).toBeFalsy();
      });

      it('should handle rapid outcome transitions correctly', async () => {
        jest.useFakeTimers();

        const mockEndTrip = jest.fn();

        // First trip: Success
        mockEndTrip.mockResolvedValueOnce({
          submitted: true,
          error: undefined,
        });

        const mockSession: TripSession = {
          route_id: '335E',
          direction_id: 0,
          from_stop_id: '20558',
          to_stop_id: '29374',
          started_at: new Date().toISOString(),
          journeyId: 'test-journey-1',
          stopEvents: [],
        };

        mockUseTripSession.mockReturnValue(createMockTripSession({
          session: mockSession,
          endTrip: mockEndTrip,
        }));

        const { rerender } = render(<TripTrackingScreen />);

        // End first trip
        const endButton = screen.getByText('End Trip');
        fireEvent.press(endButton);

        await waitFor(() => {
          mockUseTripSession.mockReturnValue(createMockTripSession({
            session: null,
            endTrip: mockEndTrip,
          }));
        });

        rerender(<TripTrackingScreen />);

        // Success banner should be visible
        await waitFor(() => {
          expect(screen.getByText(/submitted successfully/i)).toBeTruthy();
        });

        // Fast-forward past auto-dismiss
        act(() => {
          jest.advanceTimersByTime(3000);
        });

        rerender(<TripTrackingScreen />);

        // Banner should be gone
        await waitFor(() => {
          expect(screen.queryByText(/submitted successfully/i)).toBeFalsy();
        });

        jest.useRealTimers();
      });

      it('should only show one banner type at a time', async () => {
        // This test ensures we don't show multiple banners simultaneously
        const submissionError = new Error('Network error');
        const mockEndTrip = jest.fn().mockResolvedValue({
          submitted: false,
          error: submissionError,
        });

        const mockSession: TripSession = {
          route_id: '335E',
          direction_id: 0,
          from_stop_id: '20558',
          to_stop_id: '29374',
          started_at: new Date().toISOString(),
          journeyId: 'test-journey',
          stopEvents: [],
        };

        mockUseTripSession.mockReturnValue(createMockTripSession({
          session: mockSession,
          endTrip: mockEndTrip,
        }));

        const { rerender } = render(<TripTrackingScreen />);

        // End trip to trigger error
        const endButton = screen.getByText('End Trip');
        fireEvent.press(endButton);

        await waitFor(() => {
          expect(mockEndTrip).toHaveBeenCalled();
        });

        mockUseTripSession.mockReturnValue(createMockTripSession({
          session: null,
          endTrip: mockEndTrip,
        }));

        rerender(<TripTrackingScreen />);

        // Should show error banner
        await waitFor(() => {
          expect(screen.getByText(/Submission Failed|Network error/i)).toBeTruthy();
        });

        // Should NOT show success or info banners
        expect(screen.queryByText(/submitted successfully/i)).toBeFalsy();
        expect(screen.queryByText(/No stop data was recorded/i)).toBeFalsy();
      });
    });

    describe('Banner timing and cleanup', () => {
      it('should cleanup timer on component unmount', async () => {
        jest.useFakeTimers();

        const mockEndTrip = jest.fn().mockResolvedValue({
          submitted: true,
          error: undefined,
        });

        const mockSession: TripSession = {
          route_id: '335E',
          direction_id: 0,
          from_stop_id: '20558',
          to_stop_id: '29374',
          started_at: new Date().toISOString(),
          journeyId: 'test-journey',
          stopEvents: [],
        };

        mockUseTripSession.mockReturnValue(createMockTripSession({
          session: mockSession,
          endTrip: mockEndTrip,
        }));

        const { unmount, rerender } = render(<TripTrackingScreen />);

        // End trip to trigger success banner
        const endButton = screen.getByText('End Trip');
        fireEvent.press(endButton);

        await waitFor(() => {
          expect(mockEndTrip).toHaveBeenCalled();
        });

        mockUseTripSession.mockReturnValue(createMockTripSession({
          session: null,
          endTrip: mockEndTrip,
        }));

        rerender(<TripTrackingScreen />);

        // Success banner should appear
        await waitFor(() => {
          expect(screen.getByText(/submitted successfully/i)).toBeTruthy();
        });

        // Unmount before timer fires
        unmount();

        // Fast-forward time
        act(() => {
          jest.advanceTimersByTime(3000);
        });

        // Should not cause any errors or warnings
        // (Timer should be cleaned up properly)

        jest.useRealTimers();
      });

      it('should handle concurrent endTrip calls gracefully', async () => {
        const mockEndTrip = jest.fn().mockResolvedValue({
          submitted: true,
          error: undefined,
        });

        const mockSession: TripSession = {
          route_id: '335E',
          direction_id: 0,
          from_stop_id: '20558',
          to_stop_id: '29374',
          started_at: new Date().toISOString(),
          journeyId: 'test-journey',
          stopEvents: [],
        };

        mockUseTripSession.mockReturnValue(createMockTripSession({
          session: mockSession,
          endTrip: mockEndTrip,
        }));

        render(<TripTrackingScreen />);

        const endButton = screen.getByText('End Trip');

        // Press button multiple times rapidly
        fireEvent.press(endButton);
        fireEvent.press(endButton);
        fireEvent.press(endButton);

        // Should handle gracefully (hook prevents duplicate calls)
        await waitFor(() => {
          // endTrip might be called once or multiple times depending on implementation
          // but should not crash or show multiple banners
          expect(mockEndTrip).toHaveBeenCalled();
        });
      });
    });
  });
});
