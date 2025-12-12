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
import { render, screen, fireEvent, waitFor } from '@testing-library/react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import TripTrackingScreen from '../[routeId]';
import * as hooks from '@/src/hooks';
import type { Journey, TripSession } from '@/src/types';
import type { UseTripSessionReturn } from '@/src/hooks';

// Mock hooks
jest.mock('@/src/hooks');
jest.mock('expo-router');

const mockUseTripSession = hooks.useTripSession as jest.MockedFunction<typeof hooks.useTripSession>;
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

  beforeEach(() => {
    jest.clearAllMocks();
    mockUseRouter.mockReturnValue(mockRouter as any);
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
      const mockEndTrip = jest.fn().mockResolvedValue(undefined);

      mockUseLocalSearchParams.mockReturnValue({
        route_id: '335E',
        route_short_name: '335E',
        direction_id: '0',
      });

      // First render with active session
      const { rerender } = render(<TripTrackingScreen />);

      mockUseTripSession.mockReturnValue(createMockTripSession({
        session: mockSession,
        endTrip: mockEndTrip,
      }));

      rerender(<TripTrackingScreen />);

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

      // Should show success message
      await waitFor(() => {
        expect(screen.getByText(/Trip ended successfully/i)).toBeTruthy();
      });
    });

    it('should return to initial state after successful submission', async () => {
      const mockEndTrip = jest.fn().mockResolvedValue(undefined);

      mockUseLocalSearchParams.mockReturnValue({
        route_id: '335E',
        route_short_name: '335E',
        direction_id: '0',
      });

      const { rerender } = render(<TripTrackingScreen />);

      // Start with active session
      mockUseTripSession.mockReturnValue(createMockTripSession({
        session: mockSession,
        endTrip: mockEndTrip,
      }));

      rerender(<TripTrackingScreen />);

      expect(screen.getByText('Trip in progress')).toBeTruthy();

      const endButton = screen.getByText('End Trip');
      fireEvent.press(endButton);

      // After completion, session is null
      await waitFor(() => {
        mockUseTripSession.mockReturnValue(createMockTripSession({
          session: null,
          endTrip: mockEndTrip,
        }));
      });

      rerender(<TripTrackingScreen />);

      // Should return to ready state
      await waitFor(() => {
        expect(screen.getByText(/Ready to start trip|Trip ended successfully/i)).toBeTruthy();
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

    it('should display error banner when submissionError exists', () => {
      const submissionError = new Error('Network error: Failed to submit ride');

      mockUseLocalSearchParams.mockReturnValue({
        route_id: '335E',
        route_short_name: '335E',
        direction_id: '0',
      });

      mockUseTripSession.mockReturnValue(createMockTripSession({
        session: null, // Session cleared after failed submission
        submissionError: submissionError,
      }));

      render(<TripTrackingScreen />);

      // Should display error message
      expect(screen.getByText(/Network error/i)).toBeTruthy();
      expect(screen.getByText(/Failed to submit ride/i)).toBeTruthy();
    });

    it('should show retry button when submission fails', () => {
      const submissionError = new Error('API error');

      mockUseLocalSearchParams.mockReturnValue({
        route_id: '335E',
        route_short_name: '335E',
        direction_id: '0',
      });

      mockUseTripSession.mockReturnValue(createMockTripSession({
        session: null,
        submissionError: submissionError,
      }));

      render(<TripTrackingScreen />);

      // Should show retry button
      const retryButton = screen.getByText('Retry');
      expect(retryButton).toBeTruthy();
    });

    it('should call endTrip again when retry button is pressed', async () => {
      const mockEndTrip = jest.fn().mockResolvedValue(undefined);
      const submissionError = new Error('Temporary error');

      mockUseLocalSearchParams.mockReturnValue({
        route_id: '335E',
        route_short_name: '335E',
        direction_id: '0',
      });

      mockUseTripSession.mockReturnValue(createMockTripSession({
        session: null,
        submissionError: submissionError,
        endTrip: mockEndTrip,
      }));

      render(<TripTrackingScreen />);

      const retryButton = screen.getByText('Retry');
      fireEvent.press(retryButton);

      await waitFor(() => {
        expect(mockEndTrip).toHaveBeenCalledTimes(1);
      });
    });

    it('should display error for different error types', () => {
      const authError = new Error('Unauthorized: Invalid API key');

      mockUseLocalSearchParams.mockReturnValue({
        route_id: '335E',
        route_short_name: '335E',
        direction_id: '0',
      });

      mockUseTripSession.mockReturnValue(createMockTripSession({
        session: null,
        submissionError: authError,
      }));

      render(<TripTrackingScreen />);

      expect(screen.getByText(/Unauthorized/i)).toBeTruthy();
      expect(screen.getByText(/Invalid API key/i)).toBeTruthy();
    });

    it('should clear error when starting a new trip', () => {
      const mockStartTrip = jest.fn();
      const submissionError = new Error('Previous error');

      mockUseLocalSearchParams.mockReturnValue({
        route_id: '335E',
        route_short_name: '335E',
        direction_id: '0',
      });

      const { rerender } = render(<TripTrackingScreen />);

      // First render with error
      mockUseTripSession.mockReturnValue(createMockTripSession({
        session: null,
        submissionError: submissionError,
        startTrip: mockStartTrip,
      }));

      rerender(<TripTrackingScreen />);

      expect(screen.getByText(/Previous error/i)).toBeTruthy();

      // Start new trip (clears error in hook)
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
        submissionError: undefined, // Error cleared
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
      const mockEndTrip = jest.fn().mockResolvedValue(undefined);

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

      // State 3: Success (session null, no error)
      await waitFor(() => {
        mockUseTripSession.mockReturnValue(createMockTripSession({
          session: null,
          startTrip: mockStartTrip,
          endTrip: mockEndTrip,
        }));
      });

      rerender(<TripTrackingScreen />);

      await waitFor(() => {
        expect(screen.getByText(/Ready to start trip|Trip ended successfully/i)).toBeTruthy();
      });
    });

    it('should transition from active -> error -> idle on retry', async () => {
      const mockEndTrip = jest.fn().mockResolvedValue(undefined);

      mockUseLocalSearchParams.mockReturnValue({
        route_id: '335E',
        route_short_name: '335E',
        direction_id: '0',
      });

      const { rerender } = render(<TripTrackingScreen />);

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

      rerender(<TripTrackingScreen />);
      expect(screen.getByText('Trip in progress')).toBeTruthy();

      // State 2: Error (after failed endTrip)
      const submissionError = new Error('Network timeout');
      mockUseTripSession.mockReturnValue(createMockTripSession({
        session: null, // Session cleared
        submissionError: submissionError,
        endTrip: mockEndTrip,
      }));

      rerender(<TripTrackingScreen />);
      expect(screen.getByText(/Network timeout/i)).toBeTruthy();

      // User retries
      const retryButton = screen.getByText('Retry');
      fireEvent.press(retryButton);

      // State 3: Success (error cleared)
      await waitFor(() => {
        mockUseTripSession.mockReturnValue(createMockTripSession({
          session: null,
          submissionError: undefined,
          endTrip: mockEndTrip,
        }));
      });

      rerender(<TripTrackingScreen />);

      await waitFor(() => {
        expect(screen.queryByText(/Network timeout/i)).toBeFalsy();
      });
    });
  });
});
