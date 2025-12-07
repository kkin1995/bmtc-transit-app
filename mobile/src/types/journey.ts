/**
 * Journey Type Definition
 *
 * Represents a candidate journey from origin to destination,
 * including route, stops, and prediction metadata.
 *
 * Used by the trip planning state machine to represent
 * suggested journeys before the user starts a trip.
 */

import type { Route, Stop } from '../api/types';

/**
 * Confidence level for journey prediction/suggestion
 */
export type JourneyConfidence = 'low' | 'medium' | 'high';

/**
 * Journey represents a suggested trip from one stop to another
 * via a specific route and direction.
 */
export interface Journey {
  /**
   * Unique identifier for this journey suggestion
   */
  id: string;

  /**
   * GTFS route for this journey
   */
  route: Route;

  /**
   * Boarding stop (where the user gets on)
   */
  fromStop: Stop;

  /**
   * Destination stop (where the user gets off)
   */
  toStop: Stop;

  /**
   * GTFS direction_id (0 or 1)
   */
  directionId: number;

  /**
   * Confidence level for this journey suggestion
   * Based on data availability, prediction accuracy, etc.
   */
  confidence: JourneyConfidence;

  /**
   * Optional: Walking distance from user's location to fromStop (meters)
   */
  walkingDistanceM?: number;

  /**
   * Optional: Predicted travel time from fromStop to toStop (seconds)
   * From ML ETA predictions if available
   */
  predictedTravelSec?: number;
}
