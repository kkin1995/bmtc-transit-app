/**
 * useHomePlanningState Hook
 *
 * Pure state machine for managing the trip planning flow on the Home screen.
 * No side effects, no network calls - just state transitions.
 *
 * Planning Stages:
 * - idle: Default state, showing map with "Where to?" prompt
 * - choosingDestination: User is selecting a destination stop
 * - choosingJourney: User is reviewing journey suggestions
 *
 * State Machine Flow:
 * idle -> beginDestinationSelection() -> choosingDestination
 *      -> setDestination(stop) (stage stays same)
 *      -> beginJourneySelection() -> choosingJourney
 *      -> setSelectedJourney(journey) (stage stays same)
 *      -> cancelPlanning() or reset() -> idle
 */

import { useReducer, useMemo } from 'react';
import type { Stop } from '../api/types';
import type { Journey } from '../types';

/**
 * Planning stage for trip planning flow
 */
export type PlanningStage = 'idle' | 'choosingDestination' | 'choosingJourney';

/**
 * State for trip planning
 */
export interface HomePlanningState {
  planningStage: PlanningStage;
  destinationStop?: Stop;
  selectedJourney?: Journey;
}

/**
 * Actions for state machine transitions
 */
type PlanningAction =
  | { type: 'BEGIN_DESTINATION_SELECTION' }
  | { type: 'SET_DESTINATION'; payload: Stop }
  | { type: 'BEGIN_JOURNEY_SELECTION' }
  | { type: 'SET_SELECTED_JOURNEY'; payload: Journey }
  | { type: 'CANCEL_PLANNING' }
  | { type: 'RESET' };

/**
 * Initial state: idle with no selections
 */
const initialState: HomePlanningState = {
  planningStage: 'idle',
  destinationStop: undefined,
  selectedJourney: undefined,
};

/**
 * Reducer for state machine transitions
 */
function planningReducer(
  state: HomePlanningState,
  action: PlanningAction
): HomePlanningState {
  switch (action.type) {
    case 'BEGIN_DESTINATION_SELECTION':
      return {
        ...state,
        planningStage: 'choosingDestination',
      };

    case 'SET_DESTINATION':
      return {
        ...state,
        destinationStop: action.payload,
      };

    case 'BEGIN_JOURNEY_SELECTION':
      return {
        ...state,
        planningStage: 'choosingJourney',
      };

    case 'SET_SELECTED_JOURNEY':
      return {
        ...state,
        selectedJourney: action.payload,
      };

    case 'CANCEL_PLANNING':
    case 'RESET':
      return initialState;

    default:
      return state;
  }
}

/**
 * Hook return type
 */
export interface UseHomePlanningStateReturn {
  planningStage: PlanningStage;
  destinationStop?: Stop;
  selectedJourney?: Journey;
  actions: {
    beginDestinationSelection: () => void;
    setDestination: (stop: Stop) => void;
    beginJourneySelection: () => void;
    setSelectedJourney: (journey: Journey) => void;
    cancelPlanning: () => void;
    reset: () => void;
  };
}

/**
 * useHomePlanningState - Trip planning state machine
 *
 * @returns Planning state and action functions
 *
 * @example
 * ```tsx
 * const { planningStage, destinationStop, actions } = useHomePlanningState();
 *
 * // Start planning
 * actions.beginDestinationSelection();
 *
 * // User selects destination
 * actions.setDestination(selectedStop);
 *
 * // Move to journey selection
 * actions.beginJourneySelection();
 *
 * // User selects journey
 * actions.setSelectedJourney(suggestedJourney);
 *
 * // Cancel or reset
 * actions.cancelPlanning();
 * ```
 */
export function useHomePlanningState(): UseHomePlanningStateReturn {
  const [state, dispatch] = useReducer(planningReducer, initialState);

  // Memoize actions to prevent unnecessary re-renders
  const actions = useMemo(
    () => ({
      beginDestinationSelection: () => {
        dispatch({ type: 'BEGIN_DESTINATION_SELECTION' });
      },
      setDestination: (stop: Stop) => {
        dispatch({ type: 'SET_DESTINATION', payload: stop });
      },
      beginJourneySelection: () => {
        dispatch({ type: 'BEGIN_JOURNEY_SELECTION' });
      },
      setSelectedJourney: (journey: Journey) => {
        dispatch({ type: 'SET_SELECTED_JOURNEY', payload: journey });
      },
      cancelPlanning: () => {
        dispatch({ type: 'CANCEL_PLANNING' });
      },
      reset: () => {
        dispatch({ type: 'RESET' });
      },
    }),
    []
  );

  return {
    planningStage: state.planningStage,
    destinationStop: state.destinationStop,
    selectedJourney: state.selectedJourney,
    actions,
  };
}
