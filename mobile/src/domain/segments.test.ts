/**
 * Tests for segment builder
 *
 * Tests the conversion of stop-level GPS events (with enter/leave timestamps)
 * into segments for ride summary submission to the backend API.
 *
 * Expected behavior:
 * - buildSegmentsFromStopEvents() converts ordered stop events to RideSegment[]
 * - duration_sec: time between consecutive tEnter timestamps
 * - dwell_sec: time spent at FROM stop (tLeave - tEnter)
 * - observed_at_utc: ISO-8601 timestamp of TO stop's tEnter
 * - Edge cases: <2 events → empty array
 */

import { buildSegmentsFromStopEvents, StopEvent } from './segments';
import type { RideSegment } from '@/src/api/types';

describe('buildSegmentsFromStopEvents', () => {
  describe('basic functionality', () => {
    it('should convert 2 stop events into 1 segment', () => {
      // Setup: Two stops with known timestamps
      // Stop A: enter at 10:00:00, leave at 10:01:30 (90 sec dwell)
      // Stop B: enter at 10:06:30 (390 sec after Stop A enter)
      const events: StopEvent[] = [
        {
          stopId: '20558',
          tEnter: new Date('2025-12-11T10:00:00.000Z'),
          tLeave: new Date('2025-12-11T10:01:30.000Z'),
        },
        {
          stopId: '29374',
          tEnter: new Date('2025-12-11T10:06:30.000Z'),
          tLeave: new Date('2025-12-11T10:08:00.000Z'),
        },
      ];

      const segments = buildSegmentsFromStopEvents(events, 0.85);

      // Verify: Exactly 1 segment
      expect(segments).toHaveLength(1);

      const segment = segments[0];
      expect(segment.from_stop_id).toBe('20558');
      expect(segment.to_stop_id).toBe('29374');
      expect(segment.duration_sec).toBe(390); // 10:06:30 - 10:00:00 = 390 seconds
      expect(segment.dwell_sec).toBe(90); // 10:01:30 - 10:00:00 = 90 seconds
      expect(segment.observed_at_utc).toBe('2025-12-11T10:06:30.000Z');
      expect(segment.mapmatch_conf).toBe(0.85);
    });

    it('should convert 3 stop events into 2 segments', () => {
      // Setup: Three stops (S1 → S2 → S3)
      // S1: enter 10:00:00, leave 10:01:00 (60 sec dwell)
      // S2: enter 10:05:00 (300 sec from S1), leave 10:06:00 (60 sec dwell)
      // S3: enter 10:10:00 (300 sec from S2)
      const events: StopEvent[] = [
        {
          stopId: 'S1',
          tEnter: new Date('2025-12-11T10:00:00.000Z'),
          tLeave: new Date('2025-12-11T10:01:00.000Z'),
        },
        {
          stopId: 'S2',
          tEnter: new Date('2025-12-11T10:05:00.000Z'),
          tLeave: new Date('2025-12-11T10:06:00.000Z'),
        },
        {
          stopId: 'S3',
          tEnter: new Date('2025-12-11T10:10:00.000Z'),
          tLeave: new Date('2025-12-11T10:12:00.000Z'),
        },
      ];

      const segments = buildSegmentsFromStopEvents(events, 0.92);

      // Verify: Exactly 2 segments
      expect(segments).toHaveLength(2);

      // Segment 1: S1 → S2
      expect(segments[0].from_stop_id).toBe('S1');
      expect(segments[0].to_stop_id).toBe('S2');
      expect(segments[0].duration_sec).toBe(300); // 10:05:00 - 10:00:00
      expect(segments[0].dwell_sec).toBe(60); // 10:01:00 - 10:00:00
      expect(segments[0].observed_at_utc).toBe('2025-12-11T10:05:00.000Z');
      expect(segments[0].mapmatch_conf).toBe(0.92);

      // Segment 2: S2 → S3
      expect(segments[1].from_stop_id).toBe('S2');
      expect(segments[1].to_stop_id).toBe('S3');
      expect(segments[1].duration_sec).toBe(300); // 10:10:00 - 10:05:00
      expect(segments[1].dwell_sec).toBe(60); // 10:06:00 - 10:05:00
      expect(segments[1].observed_at_utc).toBe('2025-12-11T10:10:00.000Z');
      expect(segments[1].mapmatch_conf).toBe(0.92);
    });

    it('should handle realistic multi-stop journey', () => {
      // Setup: 5-stop journey with variable dwell times
      const events: StopEvent[] = [
        {
          stopId: 'STOP_A',
          tEnter: new Date('2025-12-11T08:00:00.000Z'),
          tLeave: new Date('2025-12-11T08:02:00.000Z'), // 120 sec dwell
        },
        {
          stopId: 'STOP_B',
          tEnter: new Date('2025-12-11T08:08:00.000Z'), // 480 sec from A
          tLeave: new Date('2025-12-11T08:08:30.000Z'), // 30 sec dwell
        },
        {
          stopId: 'STOP_C',
          tEnter: new Date('2025-12-11T08:15:00.000Z'), // 420 sec from B (7 minutes)
          tLeave: new Date('2025-12-11T08:16:00.000Z'), // 60 sec dwell
        },
        {
          stopId: 'STOP_D',
          tEnter: new Date('2025-12-11T08:22:00.000Z'), // 420 sec from C (7 minutes)
          tLeave: new Date('2025-12-11T08:22:15.000Z'), // 15 sec dwell
        },
        {
          stopId: 'STOP_E',
          tEnter: new Date('2025-12-11T08:30:00.000Z'), // 480 sec from D
          tLeave: new Date('2025-12-11T08:32:00.000Z'),
        },
      ];

      const segments = buildSegmentsFromStopEvents(events, 0.88);

      expect(segments).toHaveLength(4);

      // Verify each segment
      expect(segments[0]).toEqual({
        from_stop_id: 'STOP_A',
        to_stop_id: 'STOP_B',
        duration_sec: 480,
        dwell_sec: 120,
        observed_at_utc: '2025-12-11T08:08:00.000Z',
        mapmatch_conf: 0.88,
      });

      expect(segments[1]).toEqual({
        from_stop_id: 'STOP_B',
        to_stop_id: 'STOP_C',
        duration_sec: 420,
        dwell_sec: 30,
        observed_at_utc: '2025-12-11T08:15:00.000Z',
        mapmatch_conf: 0.88,
      });

      expect(segments[2]).toEqual({
        from_stop_id: 'STOP_C',
        to_stop_id: 'STOP_D',
        duration_sec: 420,
        dwell_sec: 60,
        observed_at_utc: '2025-12-11T08:22:00.000Z',
        mapmatch_conf: 0.88,
      });

      expect(segments[3]).toEqual({
        from_stop_id: 'STOP_D',
        to_stop_id: 'STOP_E',
        duration_sec: 480,
        dwell_sec: 15,
        observed_at_utc: '2025-12-11T08:30:00.000Z',
        mapmatch_conf: 0.88,
      });
    });
  });

  describe('edge cases', () => {
    it('should return empty array for empty input', () => {
      const segments = buildSegmentsFromStopEvents([], 0.9);
      expect(segments).toEqual([]);
    });

    it('should return empty array for single event', () => {
      const events: StopEvent[] = [
        {
          stopId: '20558',
          tEnter: new Date('2025-12-11T10:00:00.000Z'),
          tLeave: new Date('2025-12-11T10:01:00.000Z'),
        },
      ];

      const segments = buildSegmentsFromStopEvents(events, 0.9);
      expect(segments).toEqual([]);
    });
  });

  describe('time calculations', () => {
    it('should handle zero dwell time (instant departure)', () => {
      const events: StopEvent[] = [
        {
          stopId: 'S1',
          tEnter: new Date('2025-12-11T10:00:00.000Z'),
          tLeave: new Date('2025-12-11T10:00:00.000Z'), // Same time = 0 dwell
        },
        {
          stopId: 'S2',
          tEnter: new Date('2025-12-11T10:05:00.000Z'),
          tLeave: new Date('2025-12-11T10:05:00.000Z'),
        },
      ];

      const segments = buildSegmentsFromStopEvents(events, 0.9);

      expect(segments).toHaveLength(1);
      expect(segments[0].dwell_sec).toBe(0);
      expect(segments[0].duration_sec).toBe(300);
    });

    it('should handle fractional seconds in timestamps', () => {
      const events: StopEvent[] = [
        {
          stopId: 'S1',
          tEnter: new Date('2025-12-11T10:00:00.500Z'), // .500 ms
          tLeave: new Date('2025-12-11T10:00:45.750Z'), // .750 ms, 45.25 sec dwell
        },
        {
          stopId: 'S2',
          tEnter: new Date('2025-12-11T10:05:30.250Z'), // 329.75 sec from S1
          tLeave: new Date('2025-12-11T10:06:00.000Z'),
        },
      ];

      const segments = buildSegmentsFromStopEvents(events, 0.9);

      expect(segments).toHaveLength(1);
      // Duration: 330250ms - 500ms = 329750ms = 329.75 seconds
      expect(segments[0].duration_sec).toBe(329.75);
      // Dwell: 45750ms - 500ms = 45250ms = 45.25 seconds
      expect(segments[0].dwell_sec).toBe(45.25);
    });

    it('should convert duration and dwell to seconds with proper precision', () => {
      const events: StopEvent[] = [
        {
          stopId: 'S1',
          tEnter: new Date('2025-12-11T10:00:00.123Z'),
          tLeave: new Date('2025-12-11T10:01:30.456Z'), // 90.333 sec dwell
        },
        {
          stopId: 'S2',
          tEnter: new Date('2025-12-11T10:06:30.789Z'), // 390.666 sec from S1
          tLeave: new Date('2025-12-11T10:08:00.000Z'),
        },
      ];

      const segments = buildSegmentsFromStopEvents(events, 0.9);

      expect(segments).toHaveLength(1);
      expect(segments[0].duration_sec).toBeCloseTo(390.666, 2);
      expect(segments[0].dwell_sec).toBeCloseTo(90.333, 2);
    });
  });

  describe('ISO-8601 UTC format', () => {
    it('should format observed_at_utc as ISO-8601 with Z suffix', () => {
      const events: StopEvent[] = [
        {
          stopId: 'S1',
          tEnter: new Date('2025-12-11T10:00:00.000Z'),
          tLeave: new Date('2025-12-11T10:01:00.000Z'),
        },
        {
          stopId: 'S2',
          tEnter: new Date('2025-12-11T10:05:00.000Z'),
          tLeave: new Date('2025-12-11T10:06:00.000Z'),
        },
      ];

      const segments = buildSegmentsFromStopEvents(events, 0.9);

      expect(segments[0].observed_at_utc).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
      expect(segments[0].observed_at_utc).toBe('2025-12-11T10:05:00.000Z');
    });

    it('should preserve milliseconds in observed_at_utc', () => {
      const events: StopEvent[] = [
        {
          stopId: 'S1',
          tEnter: new Date('2025-12-11T10:00:00.000Z'),
          tLeave: new Date('2025-12-11T10:01:00.000Z'),
        },
        {
          stopId: 'S2',
          tEnter: new Date('2025-12-11T10:05:00.123Z'), // Has milliseconds
          tLeave: new Date('2025-12-11T10:06:00.000Z'),
        },
      ];

      const segments = buildSegmentsFromStopEvents(events, 0.9);

      expect(segments[0].observed_at_utc).toBe('2025-12-11T10:05:00.123Z');
    });
  });

  describe('mapmatch confidence', () => {
    it('should use the provided mapmatch_conf for all segments', () => {
      const events: StopEvent[] = [
        {
          stopId: 'S1',
          tEnter: new Date('2025-12-11T10:00:00.000Z'),
          tLeave: new Date('2025-12-11T10:01:00.000Z'),
        },
        {
          stopId: 'S2',
          tEnter: new Date('2025-12-11T10:05:00.000Z'),
          tLeave: new Date('2025-12-11T10:06:00.000Z'),
        },
        {
          stopId: 'S3',
          tEnter: new Date('2025-12-11T10:10:00.000Z'),
          tLeave: new Date('2025-12-11T10:12:00.000Z'),
        },
      ];

      const segments = buildSegmentsFromStopEvents(events, 0.73);

      expect(segments).toHaveLength(2);
      expect(segments[0].mapmatch_conf).toBe(0.73);
      expect(segments[1].mapmatch_conf).toBe(0.73);
    });

    it('should handle different mapmatch confidence values', () => {
      const events: StopEvent[] = [
        {
          stopId: 'S1',
          tEnter: new Date('2025-12-11T10:00:00.000Z'),
          tLeave: new Date('2025-12-11T10:01:00.000Z'),
        },
        {
          stopId: 'S2',
          tEnter: new Date('2025-12-11T10:05:00.000Z'),
          tLeave: new Date('2025-12-11T10:06:00.000Z'),
        },
      ];

      // Test with confidence = 1.0
      let segments = buildSegmentsFromStopEvents(events, 1.0);
      expect(segments[0].mapmatch_conf).toBe(1.0);

      // Test with confidence = 0.0
      segments = buildSegmentsFromStopEvents(events, 0.0);
      expect(segments[0].mapmatch_conf).toBe(0.0);

      // Test with confidence = 0.5
      segments = buildSegmentsFromStopEvents(events, 0.5);
      expect(segments[0].mapmatch_conf).toBe(0.5);
    });
  });
});
