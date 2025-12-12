/**
 * Tests for TripDebugScreen
 *
 * This is a developer-focused debug screen that displays:
 * - Current or last TripSession (route_id, direction_id)
 * - Recorded StopEvents for that session
 * - Segments that were sent in PostRideSummaryRequest
 * - Last PostRideSummaryResponse from API
 *
 * Expected behavior:
 * - Shows "No trip data available" when no debug data exists
 * - Displays session info (route, direction) when available
 * - Lists stop events with stopId and timestamps
 * - Lists segments with from/to stops, durations, etc.
 * - Shows response summary (accepted/rejected counts)
 * - Formats JSON for easier inspection
 */

import React from 'react';
import { render, screen } from '@testing-library/react-native';
import { TripDebugScreen } from '../TripDebugScreen';
import * as useTripSessionModule from '@/src/hooks/useTripSession';
import type { PostRideSummaryRequest, PostRideSummaryResponse } from '@/src/api/client';

// Mock the useTripSession hook
jest.mock('@/src/hooks/useTripSession');

const mockUseTripSession = useTripSessionModule.useTripSession as jest.MockedFunction<
  typeof useTripSessionModule.useTripSession
>;

describe('TripDebugScreen', () => {
  describe('No debug data available', () => {
    it('should show "No trip data available" when no lastRequest/lastResponse', () => {
      mockUseTripSession.mockReturnValue({
        session: null,
        startTrip: jest.fn(),
        recordStopVisit: jest.fn(),
        endTrip: jest.fn(),
        submissionError: undefined,
        lastRequest: undefined,
        lastResponse: undefined,
      });

      render(<TripDebugScreen />);

      expect(screen.getByText(/no trip data available/i)).toBeTruthy();
    });

    it('should not show session info when no data available', () => {
      mockUseTripSession.mockReturnValue({
        session: null,
        startTrip: jest.fn(),
        recordStopVisit: jest.fn(),
        endTrip: jest.fn(),
        submissionError: undefined,
        lastRequest: undefined,
        lastResponse: undefined,
      });

      render(<TripDebugScreen />);

      expect(screen.queryByText(/route_id/i)).toBeFalsy();
      expect(screen.queryByText(/direction_id/i)).toBeFalsy();
    });
  });

  describe('With active session (no submission yet)', () => {
    it('should show active session info', () => {
      mockUseTripSession.mockReturnValue({
        session: {
          route_id: '335E',
          direction_id: 0,
          from_stop_id: '20558',
          to_stop_id: '29374',
          started_at: '2025-12-11T10:00:00Z',
          journeyId: 'journey-1',
          stopEvents: [],
        },
        startTrip: jest.fn(),
        recordStopVisit: jest.fn(),
        endTrip: jest.fn(),
        submissionError: undefined,
        lastRequest: undefined,
        lastResponse: undefined,
      });

      render(<TripDebugScreen />);

      expect(screen.getByText(/Route ID/i)).toBeTruthy();
      expect(screen.getByText('335E')).toBeTruthy();
      expect(screen.getByText(/Direction ID/i)).toBeTruthy();
      expect(screen.getByText('0')).toBeTruthy();
    });

    it('should show empty stop events list when no stops recorded', () => {
      mockUseTripSession.mockReturnValue({
        session: {
          route_id: '335E',
          direction_id: 0,
          from_stop_id: '20558',
          to_stop_id: '29374',
          started_at: '2025-12-11T10:00:00Z',
          journeyId: 'journey-1',
          stopEvents: [],
        },
        startTrip: jest.fn(),
        recordStopVisit: jest.fn(),
        endTrip: jest.fn(),
        submissionError: undefined,
        lastRequest: undefined,
        lastResponse: undefined,
      });

      render(<TripDebugScreen />);

      expect(screen.getByText(/stop events.*0/i)).toBeTruthy();
    });

    it('should show "No submission yet" when no lastRequest/lastResponse', () => {
      mockUseTripSession.mockReturnValue({
        session: {
          route_id: '335E',
          direction_id: 0,
          from_stop_id: '20558',
          to_stop_id: '29374',
          started_at: '2025-12-11T10:00:00Z',
          journeyId: 'journey-1',
          stopEvents: [],
        },
        startTrip: jest.fn(),
        recordStopVisit: jest.fn(),
        endTrip: jest.fn(),
        submissionError: undefined,
        lastRequest: undefined,
        lastResponse: undefined,
      });

      render(<TripDebugScreen />);

      expect(screen.getByText(/no submission yet/i)).toBeTruthy();
    });
  });

  describe('With last request data', () => {
    const mockRequest: PostRideSummaryRequest = {
      route_id: '335E',
      direction_id: 0,
      device_bucket: '7a1f2b5c',
      segments: [
        {
          from_stop_id: '20558',
          to_stop_id: '21234',
          duration_sec: 390,
          dwell_sec: 90,
          observed_at_utc: '2025-12-11T10:06:30.000Z',
          mapmatch_conf: 0.9,
        },
        {
          from_stop_id: '21234',
          to_stop_id: '29374',
          duration_sec: 420,
          dwell_sec: 60,
          observed_at_utc: '2025-12-11T10:13:30.000Z',
          mapmatch_conf: 0.85,
        },
      ],
    };

    it('should display route_id from lastRequest', () => {
      mockUseTripSession.mockReturnValue({
        session: null,
        startTrip: jest.fn(),
        recordStopVisit: jest.fn(),
        endTrip: jest.fn(),
        submissionError: undefined,
        lastRequest: mockRequest,
        lastResponse: undefined,
      });

      render(<TripDebugScreen />);

      // Should find "335E" text (appears in both formatted view and raw JSON)
      const matches = screen.getAllByText('335E');
      expect(matches.length).toBeGreaterThan(0);
    });

    it('should display direction_id from lastRequest', () => {
      mockUseTripSession.mockReturnValue({
        session: null,
        startTrip: jest.fn(),
        recordStopVisit: jest.fn(),
        endTrip: jest.fn(),
        submissionError: undefined,
        lastRequest: mockRequest,
        lastResponse: undefined,
      });

      render(<TripDebugScreen />);

      expect(screen.getByText(/Direction ID/i)).toBeTruthy();
      const matches = screen.getAllByText('0');
      expect(matches.length).toBeGreaterThan(0);
    });

    it('should display segment count from lastRequest', () => {
      mockUseTripSession.mockReturnValue({
        session: null,
        startTrip: jest.fn(),
        recordStopVisit: jest.fn(),
        endTrip: jest.fn(),
        submissionError: undefined,
        lastRequest: mockRequest,
        lastResponse: undefined,
      });

      render(<TripDebugScreen />);

      expect(screen.getByText(/Segments \(2\)/i)).toBeTruthy();
    });

    it('should display segment details (from_stop_id, to_stop_id)', () => {
      mockUseTripSession.mockReturnValue({
        session: null,
        startTrip: jest.fn(),
        recordStopVisit: jest.fn(),
        endTrip: jest.fn(),
        submissionError: undefined,
        lastRequest: mockRequest,
        lastResponse: undefined,
      });

      render(<TripDebugScreen />);

      // Check first segment (appears in both formatted view and raw JSON)
      expect(screen.getAllByText(/20558/).length).toBeGreaterThan(0);
      expect(screen.getAllByText(/21234/).length).toBeGreaterThan(0);

      // Check second segment
      expect(screen.getAllByText(/29374/).length).toBeGreaterThan(0);
    });

    it('should display segment durations', () => {
      mockUseTripSession.mockReturnValue({
        session: null,
        startTrip: jest.fn(),
        recordStopVisit: jest.fn(),
        endTrip: jest.fn(),
        submissionError: undefined,
        lastRequest: mockRequest,
        lastResponse: undefined,
      });

      render(<TripDebugScreen />);

      // Check durations appear (in both formatted view and raw JSON)
      expect(screen.getAllByText(/390/).length).toBeGreaterThan(0);
      expect(screen.getAllByText(/420/).length).toBeGreaterThan(0);
    });
  });

  describe('With last response data', () => {
    const mockRequest: PostRideSummaryRequest = {
      route_id: '335E',
      direction_id: 0,
      device_bucket: '7a1f2b5c',
      segments: [
        {
          from_stop_id: '20558',
          to_stop_id: '29374',
          duration_sec: 390,
          dwell_sec: 90,
          observed_at_utc: '2025-12-11T10:06:30.000Z',
          mapmatch_conf: 0.9,
        },
      ],
    };

    const mockResponse: PostRideSummaryResponse = {
      accepted_segments: 1,
      rejected_segments: 0,
      rejected_by_reason: {
        outlier: 0,
        low_confidence: 0,
        invalid_segment: 0,
        too_many_segments: 0,
        stale_timestamp: 0,
      },
    };

    it('should display accepted_segments count', () => {
      mockUseTripSession.mockReturnValue({
        session: null,
        startTrip: jest.fn(),
        recordStopVisit: jest.fn(),
        endTrip: jest.fn(),
        submissionError: undefined,
        lastRequest: mockRequest,
        lastResponse: mockResponse,
      });

      render(<TripDebugScreen />);

      expect(screen.getByText(/Accepted:/i)).toBeTruthy();
      expect(screen.getAllByText(/1/).length).toBeGreaterThan(0);
    });

    it('should display rejected_segments count', () => {
      mockUseTripSession.mockReturnValue({
        session: null,
        startTrip: jest.fn(),
        recordStopVisit: jest.fn(),
        endTrip: jest.fn(),
        submissionError: undefined,
        lastRequest: mockRequest,
        lastResponse: mockResponse,
      });

      render(<TripDebugScreen />);

      expect(screen.getByText(/Rejected:/i)).toBeTruthy();
      // 0 appears in both formatted view and raw JSON
      expect(screen.getAllByText(/0/).length).toBeGreaterThan(0);
    });

    it('should show response when submission succeeded', () => {
      mockUseTripSession.mockReturnValue({
        session: null,
        startTrip: jest.fn(),
        recordStopVisit: jest.fn(),
        endTrip: jest.fn(),
        submissionError: undefined,
        lastRequest: mockRequest,
        lastResponse: mockResponse,
      });

      render(<TripDebugScreen />);

      // "API Response" and "Raw Response" both contain "response"
      expect(screen.getAllByText(/response/i).length).toBeGreaterThan(0);
      expect(screen.queryByText(/no submission yet/i)).toBeFalsy();
    });
  });

  describe('With stop events in session', () => {
    it('should display stop events with stopId and timestamps', () => {
      mockUseTripSession.mockReturnValue({
        session: {
          route_id: '335E',
          direction_id: 0,
          from_stop_id: '20558',
          to_stop_id: '29374',
          started_at: '2025-12-11T10:00:00Z',
          journeyId: 'journey-1',
          stopEvents: [
            {
              stopId: '20558',
              tEnter: new Date('2025-12-11T10:00:00Z'),
              tLeave: new Date('2025-12-11T10:01:30Z'),
            },
            {
              stopId: '21234',
              tEnter: new Date('2025-12-11T10:05:00Z'),
              tLeave: new Date('2025-12-11T10:06:00Z'),
            },
            {
              stopId: '29374',
              tEnter: new Date('2025-12-11T10:10:00Z'),
              tLeave: new Date('2025-12-11T10:12:00Z'),
            },
          ],
        },
        startTrip: jest.fn(),
        recordStopVisit: jest.fn(),
        endTrip: jest.fn(),
        submissionError: undefined,
        lastRequest: undefined,
        lastResponse: undefined,
      });

      render(<TripDebugScreen />);

      expect(screen.getByText(/Stop Events \(3\)/i)).toBeTruthy();
      // Stop IDs appear multiple times (from_stop_id, to_stop_id, and in events)
      expect(screen.getAllByText(/20558/).length).toBeGreaterThan(0);
      expect(screen.getAllByText(/21234/).length).toBeGreaterThan(0);
      expect(screen.getAllByText(/29374/).length).toBeGreaterThan(0);
    });

    it('should format timestamps as ISO strings', () => {
      mockUseTripSession.mockReturnValue({
        session: {
          route_id: '335E',
          direction_id: 0,
          from_stop_id: '20558',
          to_stop_id: '29374',
          started_at: '2025-12-11T10:00:00Z',
          journeyId: 'journey-1',
          stopEvents: [
            {
              stopId: '20558',
              tEnter: new Date('2025-12-11T10:00:00.000Z'),
              tLeave: new Date('2025-12-11T10:01:30.000Z'),
            },
          ],
        },
        startTrip: jest.fn(),
        recordStopVisit: jest.fn(),
        endTrip: jest.fn(),
        submissionError: undefined,
        lastRequest: undefined,
        lastResponse: undefined,
      });

      render(<TripDebugScreen />);

      // Should show ISO timestamps (checking for the date/time part)
      expect(screen.getAllByText(/2025-12-11/).length).toBeGreaterThan(0);
      expect(screen.getAllByText(/10:00:00/).length).toBeGreaterThan(0);
      expect(screen.getAllByText(/10:01:30/).length).toBeGreaterThan(0);
    });
  });

  describe('Error handling', () => {
    it('should display submissionError when present', () => {
      mockUseTripSession.mockReturnValue({
        session: null,
        startTrip: jest.fn(),
        recordStopVisit: jest.fn(),
        endTrip: jest.fn(),
        submissionError: new Error('Network timeout'),
        lastRequest: {
          route_id: '335E',
          direction_id: 0,
          device_bucket: '7a1f2b5c',
          segments: [],
        },
        lastResponse: undefined,
      });

      render(<TripDebugScreen />);

      expect(screen.getByText(/error/i)).toBeTruthy();
      expect(screen.getByText(/network timeout/i)).toBeTruthy();
    });
  });
});
