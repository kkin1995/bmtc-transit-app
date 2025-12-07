/**
 * TripSession Type Definition
 *
 * Represents an active trip session that the user has started.
 * Tracks the journey being taken for later ride submission to the backend.
 *
 * This is in-memory state for the active trip.
 * When the trip ends, this data can be used to submit ride segments
 * to the BMTC Transit API for learning.
 */

/**
 * TripSession represents an active trip in progress
 */
export interface TripSession {
  /**
   * GTFS route_id for this trip
   */
  route_id: string;

  /**
   * GTFS direction_id (0 or 1)
   */
  direction_id: number;

  /**
   * GTFS stop_id where the trip started (boarding stop)
   */
  from_stop_id: string;

  /**
   * GTFS stop_id where the trip will end (destination stop)
   * Optional: user might end trip before reaching planned destination
   */
  to_stop_id?: string;

  /**
   * ISO-8601 timestamp when the trip started
   */
  started_at: string;

  /**
   * Optional: Reference to the Journey.id that was selected
   * Links the session back to the planning data
   */
  journeyId?: string;
}
