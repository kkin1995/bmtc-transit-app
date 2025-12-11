/**
 * Barrel export for all hooks
 *
 * This module re-exports all hooks for convenient importing.
 */

// Generic async data hook
export { useAsyncData } from './useAsyncData';
export type { AsyncDataResult, ErrorLike } from './useAsyncData';

// API data fetching hooks
export { useStops } from './useStops';
export type { UseStopsResult } from './useStops';

export { useRoutes } from './useRoutes';
export type { UseRoutesResult } from './useRoutes';

export { useStopSchedule } from './useStopSchedule';
export type { UseStopScheduleResult } from './useStopSchedule';

export { useEta } from './useEta';
export type { UseEtaResult } from './useEta';

// Domain logic / state management hooks
export { useHomePlanningState } from './useHomePlanningState';
export type {
  UseHomePlanningStateReturn,
  HomePlanningState,
  PlanningStage,
} from './useHomePlanningState';

export { useTripSession } from './useTripSession';
export type { UseTripSessionReturn } from './useTripSession';

export { useStopDetection } from './useStopDetection';
export type {
  UseStopDetectionParams,
  UseStopDetectionReturn,
} from './useStopDetection';

// Location and device hooks
export { useUserLocation } from './useUserLocation';
export type {
  UseUserLocationReturn,
  LocationPermissionStatus,
  UserLocation,
} from './useUserLocation';
