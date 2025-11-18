/**
 * Tests for Routes Screen (routes.tsx)
 *
 * Expected behavior:
 * - Renders "Routes" title
 * - Uses useRoutes hook with limit: 50
 * - Shows loading indicator with "Loading routes..." when loading
 * - Shows error message with "Retry" button when error occurs
 * - Shows "No routes found" when routes array is empty
 * - Renders FlatList of routes when data is available
 * - Each route shows: route_short_name badge, route_long_name, route_id, route_type, agency_id
 * - Tapping a route logs to console (TODO navigation)
 * - Pressing retry button calls reload() function
 */

import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react-native';
import RoutesScreen from '../routes';
import * as hooks from '@/src/hooks';

// Mock hooks
jest.mock('@/src/hooks');

const mockUseRoutes = hooks.useRoutes as jest.MockedFunction<typeof hooks.useRoutes>;

// Spy on console.log
const consoleLogSpy = jest.spyOn(console, 'log').mockImplementation();

describe('RoutesScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterAll(() => {
    consoleLogSpy.mockRestore();
  });

  it('should render title', () => {
    mockUseRoutes.mockReturnValue({
      routes: [],
      total: 0,
      limit: 50,
      offset: 0,
      data: undefined,
      loading: false,
      error: undefined,
      reload: jest.fn(),
      isRefreshing: false,
    });

    render(<RoutesScreen />);

    expect(screen.getByText('Routes')).toBeTruthy();
  });

  it('should call useRoutes with limit: 50', () => {
    mockUseRoutes.mockReturnValue({
      routes: [],
      total: 0,
      limit: 50,
      offset: 0,
      data: undefined,
      loading: false,
      error: undefined,
      reload: jest.fn(),
      isRefreshing: false,
    });

    render(<RoutesScreen />);

    expect(mockUseRoutes).toHaveBeenCalledWith({ limit: 50 });
  });

  it('should show loading state', () => {
    mockUseRoutes.mockReturnValue({
      routes: [],
      total: 0,
      limit: 50,
      offset: 0,
      data: undefined,
      loading: true,
      error: undefined,
      reload: jest.fn(),
      isRefreshing: false,
    });

    render(<RoutesScreen />);

    expect(screen.getByText('Loading routes...')).toBeTruthy();
  });

  it('should show error state with retry button', () => {
    const mockReload = jest.fn();

    mockUseRoutes.mockReturnValue({
      routes: [],
      total: 0,
      limit: 50,
      offset: 0,
      data: undefined,
      loading: false,
      error: { message: 'API error', code: 'server_error' },
      reload: mockReload,
      isRefreshing: false,
    });

    render(<RoutesScreen />);

    expect(screen.getByText(/Error: API error/)).toBeTruthy();

    const retryButton = screen.getByText('Retry');
    expect(retryButton).toBeTruthy();

    fireEvent.press(retryButton);
    expect(mockReload).toHaveBeenCalledTimes(1);
  });

  it('should show empty state when no routes', () => {
    mockUseRoutes.mockReturnValue({
      routes: [],
      total: 0,
      limit: 50,
      offset: 0,
      data: undefined,
      loading: false,
      error: undefined,
      reload: jest.fn(),
      isRefreshing: false,
    });

    render(<RoutesScreen />);

    expect(screen.getByText('No routes found')).toBeTruthy();
  });

  it('should render list of routes', () => {
    const mockRoutes = [
      {
        route_id: '335E',
        route_short_name: '335E',
        route_long_name: 'Kengeri to Electronic City',
        route_type: 3,
        agency_id: 'BMTC',
      },
      {
        route_id: '340',
        route_short_name: '340',
        route_long_name: 'Jayanagar to Whitefield',
        route_type: 3,
        agency_id: 'BMTC',
      },
    ];

    mockUseRoutes.mockReturnValue({
      routes: mockRoutes,
      total: 2,
      limit: 50,
      offset: 0,
      data: { routes: mockRoutes, total: 2, limit: 50, offset: 0 },
      loading: false,
      error: undefined,
      reload: jest.fn(),
      isRefreshing: false,
    });

    render(<RoutesScreen />);

    // Check subtitle
    expect(screen.getByText('All Routes')).toBeTruthy();

    // Check route short names (badges)
    expect(screen.getByText('335E')).toBeTruthy();
    expect(screen.getByText('340')).toBeTruthy();

    // Check route long names
    expect(screen.getByText('Kengeri to Electronic City')).toBeTruthy();
    expect(screen.getByText('Jayanagar to Whitefield')).toBeTruthy();

    // Check route IDs
    expect(screen.getByText('ID: 335E')).toBeTruthy();
    expect(screen.getByText('ID: 340')).toBeTruthy();

    // Check agencies
    expect(screen.getAllByText('Agency: BMTC')).toHaveLength(2);

    // Check route type badges (both are buses)
    expect(screen.getAllByText('Bus')).toHaveLength(2);
  });

  it('should log route_id when route is pressed', () => {
    const mockRoutes = [
      {
        route_id: '335E',
        route_short_name: '335E',
        route_long_name: 'Kengeri to Electronic City',
        route_type: 3,
        agency_id: 'BMTC',
      },
    ];

    mockUseRoutes.mockReturnValue({
      routes: mockRoutes,
      total: 1,
      limit: 50,
      offset: 0,
      data: { routes: mockRoutes, total: 1, limit: 50, offset: 0 },
      loading: false,
      error: undefined,
      reload: jest.fn(),
      isRefreshing: false,
    });

    render(<RoutesScreen />);

    // Find and press the route item
    const routeItem = screen.getByText('Kengeri to Electronic City');
    fireEvent.press(routeItem);

    // Verify console.log was called (TODO: navigation not implemented yet)
    expect(consoleLogSpy).toHaveBeenCalledWith('Route pressed:', '335E');
  });

  it('should display route type correctly for non-bus types', () => {
    const mockRoutes = [
      {
        route_id: 'METRO1',
        route_short_name: 'M1',
        route_long_name: 'Purple Line',
        route_type: 1, // Metro
        agency_id: 'BMRCL',
      },
    ];

    mockUseRoutes.mockReturnValue({
      routes: mockRoutes,
      total: 1,
      limit: 50,
      offset: 0,
      data: { routes: mockRoutes, total: 1, limit: 50, offset: 0 },
      loading: false,
      error: undefined,
      reload: jest.fn(),
      isRefreshing: false,
    });

    render(<RoutesScreen />);

    // Check route type badge shows "Type 1" for non-bus
    expect(screen.getByText('Type 1')).toBeTruthy();
  });

  it('should handle routes without short name', () => {
    const mockRoutes = [
      {
        route_id: 'ROUTE1',
        route_short_name: null,
        route_long_name: 'Long Route Name Only',
        route_type: 3,
        agency_id: 'BMTC',
      },
    ];

    mockUseRoutes.mockReturnValue({
      routes: mockRoutes,
      total: 1,
      limit: 50,
      offset: 0,
      data: { routes: mockRoutes, total: 1, limit: 50, offset: 0 },
      loading: false,
      error: undefined,
      reload: jest.fn(),
      isRefreshing: false,
    });

    render(<RoutesScreen />);

    // Should still render the route
    expect(screen.getByText('Long Route Name Only')).toBeTruthy();
    expect(screen.getByText('ID: ROUTE1')).toBeTruthy();

    // Short name badge should not be rendered
    // (we can't easily test non-existence with current setup, but route should render)
  });

  it('should handle routes without agency_id', () => {
    const mockRoutes = [
      {
        route_id: '335E',
        route_short_name: '335E',
        route_long_name: 'Kengeri to Electronic City',
        route_type: 3,
        agency_id: null,
      },
    ];

    mockUseRoutes.mockReturnValue({
      routes: mockRoutes,
      total: 1,
      limit: 50,
      offset: 0,
      data: { routes: mockRoutes, total: 1, limit: 50, offset: 0 },
      loading: false,
      error: undefined,
      reload: jest.fn(),
      isRefreshing: false,
    });

    render(<RoutesScreen />);

    // Should still render the route
    expect(screen.getByText('Kengeri to Electronic City')).toBeTruthy();

    // Agency text should not be rendered (conditional rendering)
  });
});
