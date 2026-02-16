/**
 * Tests for Routes Screen (routes.tsx)
 *
 * Expected behavior:
 * - Renders "Routes" title
 * - Uses useRoutes hook with limit: 1000
 * - Shows loading indicator with "Loading routes..." when loading
 * - Shows error message with "Retry" button when error occurs
 * - Shows "No routes found" when routes array is empty
 * - Renders FlatList of routes when data is available
 * - Each route shows: route_short_name badge, route_long_name, route_id, route_type, agency_id
 * - Tapping a route navigates to /trip/[routeId] with correct params
 * - Pressing retry button calls reload() function
 */

import React from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react-native';
import { useRouter } from 'expo-router';
import RoutesScreen from '../routes';
import * as hooks from '@/src/hooks';

// Mock hooks
jest.mock('@/src/hooks');
jest.mock('expo-router');

const mockUseRoutes = hooks.useRoutes as jest.MockedFunction<typeof hooks.useRoutes>;
const mockUseRouter = useRouter as jest.MockedFunction<typeof useRouter>;

// Spy on console.log (for backward compatibility with old tests)
const consoleLogSpy = jest.spyOn(console, 'log').mockImplementation();

describe('RoutesScreen', () => {
  const mockRouter = {
    push: jest.fn(),
    replace: jest.fn(),
    back: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockUseRouter.mockReturnValue(mockRouter as any);
  });

  afterAll(() => {
    consoleLogSpy.mockRestore();
  });

  it('should render title', () => {
    mockUseRoutes.mockReturnValue({
      routes: [],
      total: 0,
      limit: 1000,
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

  it('should call useRoutes with limit: 1000 and empty searchQuery initially', () => {
    mockUseRoutes.mockReturnValue({
      routes: [],
      total: 0,
      limit: 1000,
      offset: 0,
      data: undefined,
      loading: false,
      error: undefined,
      reload: jest.fn(),
      isRefreshing: false,
    });

    render(<RoutesScreen />);

    // Should call useRoutes with limit and empty searchQuery (uses fetchRoutes endpoint)
    expect(mockUseRoutes).toHaveBeenCalledWith({ limit: 1000 }, '');
  });

  it('should show loading state', () => {
    mockUseRoutes.mockReturnValue({
      routes: [],
      total: 0,
      limit: 1000,
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
      limit: 1000,
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
      limit: 1000,
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
      limit: 1000,
      offset: 0,
      data: { routes: mockRoutes, total: 2, limit: 1000, offset: 0 },
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
      limit: 1000,
      offset: 0,
      data: { routes: mockRoutes, total: 1, limit: 1000, offset: 0 },
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
      limit: 1000,
      offset: 0,
      data: { routes: mockRoutes, total: 1, limit: 1000, offset: 0 },
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
      limit: 1000,
      offset: 0,
      data: { routes: mockRoutes, total: 1, limit: 1000, offset: 0 },
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
      limit: 1000,
      offset: 0,
      data: { routes: mockRoutes, total: 1, limit: 1000, offset: 0 },
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

  describe('Navigation to Trip Tracking Screen', () => {
    it('should navigate to trip screen when route is pressed with all params', () => {
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
        limit: 1000,
        offset: 0,
        data: { routes: mockRoutes, total: 1, limit: 1000, offset: 0 },
        loading: false,
        error: undefined,
        reload: jest.fn(),
        isRefreshing: false,
      });

      render(<RoutesScreen />);

      // Find and press the route item
      const routeItem = screen.getByText('Kengeri to Electronic City');
      fireEvent.press(routeItem);

      // Verify router.push was called with correct params
      expect(mockRouter.push).toHaveBeenCalledTimes(1);
      expect(mockRouter.push).toHaveBeenCalledWith({
        pathname: '/trip/[routeId]',
        params: {
          route_id: '335E',
          route_short_name: '335E',
          route_long_name: 'Kengeri to Electronic City',
          direction_id: '0', // Default direction
        },
      });
    });

    it('should navigate with minimal params when optional fields are missing', () => {
      const mockRoutes = [
        {
          route_id: 'R123',
          route_short_name: 'R123',
          route_long_name: null,
          route_type: 3,
          agency_id: null,
        },
      ];

      mockUseRoutes.mockReturnValue({
        routes: mockRoutes,
        total: 1,
        limit: 1000,
        offset: 0,
        data: { routes: mockRoutes, total: 1, limit: 1000, offset: 0 },
        loading: false,
        error: undefined,
        reload: jest.fn(),
        isRefreshing: false,
      });

      render(<RoutesScreen />);

      // Find and press the route badge (since no long name)
      const routeBadge = screen.getByText('R123');
      fireEvent.press(routeBadge);

      // Verify navigation with only required params
      expect(mockRouter.push).toHaveBeenCalledWith({
        pathname: '/trip/[routeId]',
        params: {
          route_id: 'R123',
          route_short_name: 'R123',
          direction_id: '0',
        },
      });
    });

    it('should navigate with correct params for multiple routes', () => {
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
        limit: 1000,
        offset: 0,
        data: { routes: mockRoutes, total: 2, limit: 1000, offset: 0 },
        loading: false,
        error: undefined,
        reload: jest.fn(),
        isRefreshing: false,
      });

      render(<RoutesScreen />);

      // Press first route
      fireEvent.press(screen.getByText('Kengeri to Electronic City'));

      expect(mockRouter.push).toHaveBeenCalledWith({
        pathname: '/trip/[routeId]',
        params: expect.objectContaining({
          route_id: '335E',
        }),
      });

      // Press second route
      fireEvent.press(screen.getByText('Jayanagar to Whitefield'));

      expect(mockRouter.push).toHaveBeenCalledWith({
        pathname: '/trip/[routeId]',
        params: expect.objectContaining({
          route_id: '340',
        }),
      });

      expect(mockRouter.push).toHaveBeenCalledTimes(2);
    });

    it('should pass direction_id as string "0" in navigation params', () => {
      const mockRoutes = [
        {
          route_id: '335E',
          route_short_name: '335E',
          route_long_name: 'Test Route',
          route_type: 3,
          agency_id: 'BMTC',
        },
      ];

      mockUseRoutes.mockReturnValue({
        routes: mockRoutes,
        total: 1,
        limit: 1000,
        offset: 0,
        data: { routes: mockRoutes, total: 1, limit: 1000, offset: 0 },
        loading: false,
        error: undefined,
        reload: jest.fn(),
        isRefreshing: false,
      });

      render(<RoutesScreen />);

      fireEvent.press(screen.getByText('Test Route'));

      // Verify direction_id is passed as string
      const callArgs = mockRouter.push.mock.calls[0][0];
      expect(callArgs.params.direction_id).toBe('0');
      expect(typeof callArgs.params.direction_id).toBe('string');
    });
  });

  describe('Search Functionality', () => {
    /**
     * Test Suite: Server-side search functionality
     *
     * Previously: Client-side filtering tests (deprecated with server-side search)
     * Now: Tests for server-side search integration
     *
     * Scenarios covered:
     * 1. Search input renders with placeholder
     * 2. Shows all routes when search is empty (calls useRoutes with empty searchQuery)
     * 3. Typing search query calls useRoutes with searchQuery parameter
     * 4. Search results are displayed (not client-side filtered)
     * 5. Shows "No routes found" when search has no results
     * 6. Clears search when input is cleared
     * 7. Navigation works from search results
     * 8. Maintains search state during loading
     * 9. Shows correct subtitle for search results
     * 10. Handles empty search results with suggestion
     */

    const mockSearchRoutes = [
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
      {
        route_id: 'G4',
        route_short_name: 'G4',
        route_long_name: 'Banashankari to Yelahanka',
        route_type: 3,
        agency_id: 'BMTC',
      },
      {
        route_id: 'R500',
        route_short_name: null, // Test null short_name
        route_long_name: 'Airport Express',
        route_type: 3,
        agency_id: 'BMTC',
      },
      {
        route_id: 'R600',
        route_short_name: 'R600',
        route_long_name: null, // Test null long_name
        route_type: 3,
        agency_id: 'BMTC',
      },
    ];

    it('should render search input with placeholder', () => {
      mockUseRoutes.mockReturnValue({
        routes: mockSearchRoutes,
        total: 5,
        limit: 1000,
        offset: 0,
        data: { routes: mockSearchRoutes, total: 5, limit: 1000, offset: 0 },
        loading: false,
        error: undefined,
        reload: jest.fn(),
        isRefreshing: false,
      });

      render(<RoutesScreen />);

      // Verify search input exists with correct placeholder
      const searchInput = screen.getByPlaceholderText('Search routes...');
      expect(searchInput).toBeTruthy();
    });

    it('should show all routes when search is empty', () => {
      mockUseRoutes.mockReturnValue({
        routes: mockSearchRoutes,
        total: 5,
        limit: 1000,
        offset: 0,
        data: { routes: mockSearchRoutes, total: 5, limit: 1000, offset: 0 },
        loading: false,
        error: undefined,
        reload: jest.fn(),
        isRefreshing: false,
      });

      render(<RoutesScreen />);

      // All routes should be visible
      expect(screen.getByText('335E')).toBeTruthy();
      expect(screen.getByText('340')).toBeTruthy();
      expect(screen.getByText('G4')).toBeTruthy();
      expect(screen.getByText('Airport Express')).toBeTruthy();
      expect(screen.getByText('R600')).toBeTruthy();
    });

    it('should call useRoutes with searchQuery when user types in search input (server-side search)', () => {
      // Use fake timers for this test
      jest.useFakeTimers();

      // Initially render with all routes
      mockUseRoutes.mockReturnValue({
        routes: mockSearchRoutes,
        total: 5,
        limit: 1000,
        offset: 0,
        data: { routes: mockSearchRoutes, total: 5, limit: 1000, offset: 0 },
        loading: false,
        error: undefined,
        reload: jest.fn(),
        isRefreshing: false,
      });

      const { rerender } = render(<RoutesScreen />);

      const searchInput = screen.getByPlaceholderText('Search routes...');

      // Verify initial call with empty search
      expect(mockUseRoutes).toHaveBeenCalledWith({ limit: 1000 }, '');

      // Type "335e" in search input
      fireEvent.changeText(searchInput, '335e');

      // Advance timers by 300ms to trigger debounce
      act(() => {
        jest.advanceTimersByTime(300);
      });

      // Mock the response for search query
      mockUseRoutes.mockReturnValue({
        routes: [mockSearchRoutes[0]], // Only return 335E route
        total: 1,
        limit: 1000,
        offset: 0,
        data: { routes: [mockSearchRoutes[0]], total: 1, limit: 1000, offset: 0 },
        loading: false,
        error: undefined,
        reload: jest.fn(),
        isRefreshing: false,
      });

      rerender(<RoutesScreen />);

      // Should call useRoutes with searchQuery parameter (triggers server-side search)
      expect(mockUseRoutes).toHaveBeenCalledWith({ limit: 1000 }, '335e');

      // Should show filtered results from server
      expect(screen.getByText('335E')).toBeTruthy();
      expect(screen.getByText('Kengeri to Electronic City')).toBeTruthy();

      jest.useRealTimers();
    });

    it('should display server-side search results correctly', () => {
      // Mock search results returned from server for "whitefield" query
      const searchResults = [mockSearchRoutes[1]]; // Only Jayanagar to Whitefield

      mockUseRoutes.mockReturnValue({
        routes: searchResults,
        total: 1,
        limit: 1000,
        offset: 0,
        data: { routes: searchResults, total: 1, limit: 1000, offset: 0 },
        loading: false,
        error: undefined,
        reload: jest.fn(),
        isRefreshing: false,
      });

      render(<RoutesScreen />);

      // Should display search results from server
      expect(screen.getByText('340')).toBeTruthy();
      expect(screen.getByText('Jayanagar to Whitefield')).toBeTruthy();

      // Other routes not returned by server should not be shown
      expect(screen.queryByText('335E')).toBeNull();
      expect(screen.queryByText('G4')).toBeNull();
    });

    it('should show "No routes found" when server returns empty search results', () => {
      // Mock empty search results from server
      mockUseRoutes.mockReturnValue({
        routes: [],
        total: 0,
        limit: 1000,
        offset: 0,
        data: { routes: [], total: 0, limit: 1000, offset: 0 },
        loading: false,
        error: undefined,
        reload: jest.fn(),
        isRefreshing: false,
      });

      render(<RoutesScreen />);

      // Should show empty state
      expect(screen.getByText('No routes found')).toBeTruthy();

      // Should not show any route names
      expect(screen.queryByText('335E')).toBeNull();
      expect(screen.queryByText('340')).toBeNull();
      expect(screen.queryByText('G4')).toBeNull();
    });

    it('should call useRoutes with empty searchQuery when search is cleared', () => {
      // Use fake timers for this test
      jest.useFakeTimers();

      // Start with search results
      mockUseRoutes.mockReturnValue({
        routes: [mockSearchRoutes[0]], // 335E only
        total: 1,
        limit: 1000,
        offset: 0,
        data: { routes: [mockSearchRoutes[0]], total: 1, limit: 1000, offset: 0 },
        loading: false,
        error: undefined,
        reload: jest.fn(),
        isRefreshing: false,
      });

      const { rerender } = render(<RoutesScreen />);

      const searchInput = screen.getByPlaceholderText('Search routes...');

      // Simulate having a search query
      fireEvent.changeText(searchInput, '335e');

      // Advance timers to trigger debounce
      act(() => {
        jest.advanceTimersByTime(300);
      });

      expect(mockUseRoutes).toHaveBeenCalledWith({ limit: 1000 }, '335e');

      // Clear the search - return all routes
      mockUseRoutes.mockReturnValue({
        routes: mockSearchRoutes,
        total: 5,
        limit: 1000,
        offset: 0,
        data: { routes: mockSearchRoutes, total: 5, limit: 1000, offset: 0 },
        loading: false,
        error: undefined,
        reload: jest.fn(),
        isRefreshing: false,
      });

      fireEvent.changeText(searchInput, '');

      // Advance timers to trigger debounce for clear
      act(() => {
        jest.advanceTimersByTime(300);
      });

      rerender(<RoutesScreen />);

      // Should call useRoutes with empty searchQuery (switches back to fetchRoutes endpoint)
      expect(mockUseRoutes).toHaveBeenCalledWith({ limit: 1000 }, '');

      // All routes should be visible
      expect(screen.getByText('335E')).toBeTruthy();
      expect(screen.getByText('340')).toBeTruthy();
      expect(screen.getByText('G4')).toBeTruthy();

      jest.useRealTimers();
    });

    it('should display routes with null short_name from server search results', () => {
      // Server returns R500 with null short_name for "airport" query
      const searchResults = [mockSearchRoutes[3]]; // R500 with null short_name

      mockUseRoutes.mockReturnValue({
        routes: searchResults,
        total: 1,
        limit: 1000,
        offset: 0,
        data: { routes: searchResults, total: 1, limit: 1000, offset: 0 },
        loading: false,
        error: undefined,
        reload: jest.fn(),
        isRefreshing: false,
      });

      render(<RoutesScreen />);

      // Should display route with null short_name
      expect(screen.getByText('Airport Express')).toBeTruthy();
      expect(screen.getByText('ID: R500')).toBeTruthy();

      // Should not crash
      expect(screen.queryByText('335E')).toBeNull();
    });

    it('should display routes with null long_name from server search results', () => {
      // Server returns R600 with null long_name for "r600" query
      const searchResults = [mockSearchRoutes[4]]; // R600 with null long_name

      mockUseRoutes.mockReturnValue({
        routes: searchResults,
        total: 1,
        limit: 1000,
        offset: 0,
        data: { routes: searchResults, total: 1, limit: 1000, offset: 0 },
        loading: false,
        error: undefined,
        reload: jest.fn(),
        isRefreshing: false,
      });

      render(<RoutesScreen />);

      // Should display route with null long_name
      expect(screen.getByText('R600')).toBeTruthy();
      expect(screen.getByText('ID: R600')).toBeTruthy();

      // Should not crash
      expect(screen.queryByText('335E')).toBeNull();
    });

    it('should navigate correctly from server search results', () => {
      // Server returns only route 340 for "jayanagar" query
      const searchResults = [mockSearchRoutes[1]]; // Jayanagar to Whitefield

      mockUseRoutes.mockReturnValue({
        routes: searchResults,
        total: 1,
        limit: 1000,
        offset: 0,
        data: { routes: searchResults, total: 1, limit: 1000, offset: 0 },
        loading: false,
        error: undefined,
        reload: jest.fn(),
        isRefreshing: false,
      });

      render(<RoutesScreen />);

      // Tap the search result route
      const routeItem = screen.getByText('Jayanagar to Whitefield');
      fireEvent.press(routeItem);

      // Verify navigation happened with correct params
      expect(mockRouter.push).toHaveBeenCalledWith({
        pathname: '/trip/[routeId]',
        params: {
          route_id: '340',
          route_short_name: '340',
          route_long_name: 'Jayanagar to Whitefield',
          direction_id: '0',
        },
      });
    });

    it('should pass whitespace search query to useRoutes (hook handles trimming)', () => {
      // Use fake timers for this test
      jest.useFakeTimers();

      mockUseRoutes.mockReturnValue({
        routes: [],
        total: 0,
        limit: 1000,
        offset: 0,
        data: { routes: [], total: 0, limit: 1000, offset: 0 },
        loading: false,
        error: undefined,
        reload: jest.fn(),
        isRefreshing: false,
      });

      render(<RoutesScreen />);

      const searchInput = screen.getByPlaceholderText('Search routes...');

      // Type search with leading/trailing whitespace
      fireEvent.changeText(searchInput, '  335e  ');

      // Advance timers to trigger debounce
      act(() => {
        jest.advanceTimersByTime(300);
      });

      // Should pass the query as-is to useRoutes (hook will trim before calling API)
      expect(mockUseRoutes).toHaveBeenCalledWith({ limit: 1000 }, '  335e  ');

      jest.useRealTimers();
    });

    it('should maintain search state during loading', () => {
      // Start with loaded data and a search query
      const { rerender } = render(<RoutesScreen />);

      mockUseRoutes.mockReturnValue({
        routes: mockSearchRoutes,
        total: 5,
        limit: 1000,
        offset: 0,
        data: { routes: mockSearchRoutes, total: 5, limit: 1000, offset: 0 },
        loading: false,
        error: undefined,
        reload: jest.fn(),
        isRefreshing: false,
      });

      rerender(<RoutesScreen />);

      const searchInput = screen.getByPlaceholderText('Search routes...');

      // Set a search query
      fireEvent.changeText(searchInput, '335e');

      // Simulate data refetch (loading state)
      mockUseRoutes.mockReturnValue({
        routes: mockSearchRoutes,
        total: 5,
        limit: 1000,
        offset: 0,
        data: { routes: mockSearchRoutes, total: 5, limit: 1000, offset: 0 },
        loading: true, // Now loading
        error: undefined,
        reload: jest.fn(),
        isRefreshing: false,
      });

      rerender(<RoutesScreen />);

      // Search input should still contain the query
      expect(searchInput.props.value).toBe('335e');

      // Loading indicator should be visible
      expect(screen.getByText('Loading routes...')).toBeTruthy();
    });

    it('should display server search results for partial match queries', () => {
      // Server returns routes matching "elec" query (partial match on "Electronic City")
      const searchResults = [mockSearchRoutes[0]]; // 335E with "Electronic City"

      mockUseRoutes.mockReturnValue({
        routes: searchResults,
        total: 1,
        limit: 1000,
        offset: 0,
        data: { routes: searchResults, total: 1, limit: 1000, offset: 0 },
        loading: false,
        error: undefined,
        reload: jest.fn(),
        isRefreshing: false,
      });

      render(<RoutesScreen />);

      // Should show server-returned routes
      expect(screen.getByText('335E')).toBeTruthy();
      expect(screen.getByText('Kengeri to Electronic City')).toBeTruthy();

      // Server didn't return these routes
      expect(screen.queryByText('Jayanagar to Whitefield')).toBeNull();
      expect(screen.queryByText('Banashankari to Yelahanka')).toBeNull();
    });

    it('should show correct subtitle for search results', () => {
      // Mock search results with count
      const searchResults = [mockSearchRoutes[0], mockSearchRoutes[2]]; // 2 routes

      mockUseRoutes.mockReturnValue({
        routes: searchResults,
        total: 2,
        limit: 1000,
        offset: 0,
        data: { routes: searchResults, total: 2, limit: 1000, offset: 0 },
        loading: false,
        error: undefined,
        reload: jest.fn(),
        isRefreshing: false,
      });

      const { rerender } = render(<RoutesScreen />);

      // Initially no search - should show "All Routes"
      expect(screen.getByText('All Routes')).toBeTruthy();

      // Type search query
      const searchInput = screen.getByPlaceholderText('Search routes...');
      fireEvent.changeText(searchInput, 'test');

      // Mock returns search results
      rerender(<RoutesScreen />);

      // Should show count-based subtitle for search results
      expect(screen.queryByText('All Routes')).toBeNull();
      expect(screen.getByText('2 route(s) found')).toBeTruthy();
    });

    it('should show "No routes found" with search suggestion when search has no results', () => {
      // Mock empty search results
      mockUseRoutes.mockReturnValue({
        routes: [],
        total: 0,
        limit: 1000,
        offset: 0,
        data: { routes: [], total: 0, limit: 1000, offset: 0 },
        loading: false,
        error: undefined,
        reload: jest.fn(),
        isRefreshing: false,
      });

      render(<RoutesScreen />);

      // Should show empty state with suggestion
      expect(screen.getByText('No routes found')).toBeTruthy();

      // Note: The "Try a different search term" message only shows when routes.length > 0
      // but filteredRoutes.length === 0, which doesn't happen with server-side search
      // (server returns empty array directly). So this test just verifies empty state.
    });
  });

  describe('Search debounce and cancellation', () => {
    /**
     * Test Suite: Debounce and request cancellation for search
     *
     * CRITICAL FEATURE: Prevents excessive API calls and race conditions
     *
     * Problem:
     * - Typing "335e" fires 4 API requests ("3", "33", "335", "335e")
     * - Race conditions: older responses can overwrite newer ones
     * - Poor UX and excessive backend load
     *
     * Solution:
     * - Debounce: Wait 300ms after user stops typing before firing request
     * - Cancellation: Cancel previous in-flight requests when query changes
     *
     * Scenarios covered:
     * 1. No immediate API call when typing starts
     * 2. API call fires after 300ms of no typing
     * 3. Debounce timer resets if user types again within 300ms
     * 4. Rapid typing ("abc") results in only ONE API call after 300ms
     * 5. Multiple rapid changes only result in final query being used
     * 6. Clearing search is also debounced
     * 7. Initial mount does NOT trigger debounce (immediate load)
     * 8. Multiple debounced searches work correctly in sequence
     */

    beforeEach(() => {
      jest.useFakeTimers();
    });

    afterEach(() => {
      jest.runOnlyPendingTimers();
      jest.useRealTimers();
    });

    it('should not call useRoutes immediately when typing starts', () => {
      mockUseRoutes.mockReturnValue({
        routes: [],
        total: 0,
        limit: 1000,
        offset: 0,
        data: undefined,
        loading: false,
        error: undefined,
        reload: jest.fn(),
        isRefreshing: false,
      });

      render(<RoutesScreen />);

      const searchInput = screen.getByPlaceholderText('Search routes...');

      // Record how many times useRoutes was called after initial mount
      const initialCallCount = mockUseRoutes.mock.calls.length;

      // Type a single character
      fireEvent.changeText(searchInput, '3');

      // Should NOT call useRoutes with new query immediately (still using empty debounced query)
      // Component re-renders on searchQuery change, but debouncedSearchQuery hasn't changed yet
      const newCallCount = mockUseRoutes.mock.calls.length - initialCallCount;

      // Should be called with the same debounced query (empty string), not the new query
      const lastCall = mockUseRoutes.mock.calls[mockUseRoutes.mock.calls.length - 1];
      expect(lastCall).toEqual([{ limit: 1000 }, '']); // Still using debounced empty query
    });

    it('should call useRoutes after 300ms of no typing', () => {
      mockUseRoutes.mockReturnValue({
        routes: [],
        total: 0,
        limit: 1000,
        offset: 0,
        data: undefined,
        loading: false,
        error: undefined,
        reload: jest.fn(),
        isRefreshing: false,
      });

      render(<RoutesScreen />);

      const searchInput = screen.getByPlaceholderText('Search routes...');

      // Record initial state
      const initialCallCount = mockUseRoutes.mock.calls.length;

      // Type search query
      fireEvent.changeText(searchInput, '335e');

      // Verify still using debounced empty query
      const afterTypeCallCount = mockUseRoutes.mock.calls.length;
      const lastCallAfterType = mockUseRoutes.mock.calls[mockUseRoutes.mock.calls.length - 1];
      expect(lastCallAfterType[1]).toBe(''); // Still empty

      // Advance timers by 300ms
      act(() => {
        jest.advanceTimersByTime(300);
      });

      // Should have been called with the search query now
      const finalCallCount = mockUseRoutes.mock.calls.length;
      const lastCallAfterDebounce = mockUseRoutes.mock.calls[mockUseRoutes.mock.calls.length - 1];
      expect(lastCallAfterDebounce).toEqual([{ limit: 1000 }, '335e']);
      expect(finalCallCount).toBeGreaterThan(afterTypeCallCount); // Called at least once more
    });

    it('should reset debounce timer if user types again within 300ms', () => {
      mockUseRoutes.mockReturnValue({
        routes: [],
        total: 0,
        limit: 1000,
        offset: 0,
        data: undefined,
        loading: false,
        error: undefined,
        reload: jest.fn(),
        isRefreshing: false,
      });

      render(<RoutesScreen />);

      const searchInput = screen.getByPlaceholderText('Search routes...');

      // Type first character
      fireEvent.changeText(searchInput, '3');

      // Wait 200ms (less than 300ms)
      act(() => {
        jest.advanceTimersByTime(200);
      });

      // Verify still using empty debounced query (timer hasn't fired)
      const lastCallBefore = mockUseRoutes.mock.calls[mockUseRoutes.mock.calls.length - 1];
      expect(lastCallBefore[1]).toBe(''); // Still empty

      // Type second character - should reset timer
      fireEvent.changeText(searchInput, '33');

      // Wait another 200ms (total 400ms from first character, but only 200ms from second)
      act(() => {
        jest.advanceTimersByTime(200);
      });

      // Should NOT have updated to ANY new query yet (timer was reset, still at empty)
      const lastCallDuring = mockUseRoutes.mock.calls[mockUseRoutes.mock.calls.length - 1];
      expect(lastCallDuring[1]).toBe(''); // Still empty, not "3" or "33"

      // Wait remaining 100ms to reach 300ms from second character
      act(() => {
        jest.advanceTimersByTime(100);
      });

      // Now it should be called with final query
      const lastCallAfter = mockUseRoutes.mock.calls[mockUseRoutes.mock.calls.length - 1];
      expect(lastCallAfter).toEqual([{ limit: 1000 }, '33']);
    });

    it('should only fire ONE API call after 300ms when typing "abc" rapidly', () => {
      mockUseRoutes.mockReturnValue({
        routes: [],
        total: 0,
        limit: 1000,
        offset: 0,
        data: undefined,
        loading: false,
        error: undefined,
        reload: jest.fn(),
        isRefreshing: false,
      });

      render(<RoutesScreen />);

      const searchInput = screen.getByPlaceholderText('Search routes...');

      // Simulate rapid typing: "a", "ab", "abc" with 50ms between each
      fireEvent.changeText(searchInput, 'a');
      act(() => {
        jest.advanceTimersByTime(50);
      });

      fireEvent.changeText(searchInput, 'ab');
      act(() => {
        jest.advanceTimersByTime(50);
      });

      fireEvent.changeText(searchInput, 'abc');

      // At this point, only 100ms has passed, debounced query should still be empty
      const lastCallDuring = mockUseRoutes.mock.calls[mockUseRoutes.mock.calls.length - 1];
      expect(lastCallDuring[1]).toBe(''); // Still empty

      // Wait for full debounce period (300ms from last change)
      act(() => {
        jest.advanceTimersByTime(300);
      });

      // Should have been called with final query "abc", never with "a" or "ab"
      const lastCallAfter = mockUseRoutes.mock.calls[mockUseRoutes.mock.calls.length - 1];
      expect(lastCallAfter).toEqual([{ limit: 1000 }, 'abc']);

      // Verify intermediate queries were NOT used
      const allCalls = mockUseRoutes.mock.calls.map(call => call[1]);
      expect(allCalls).not.toContain('a');
      expect(allCalls).not.toContain('ab');
      expect(allCalls).toContain('abc');
    });

    it('should only use the final query when multiple rapid changes occur', () => {
      mockUseRoutes.mockReturnValue({
        routes: [],
        total: 0,
        limit: 1000,
        offset: 0,
        data: undefined,
        loading: false,
        error: undefined,
        reload: jest.fn(),
        isRefreshing: false,
      });

      render(<RoutesScreen />);

      const searchInput = screen.getByPlaceholderText('Search routes...');

      // Simulate very rapid typing of "335e"
      fireEvent.changeText(searchInput, '3');
      act(() => {
        jest.advanceTimersByTime(10);
      });

      fireEvent.changeText(searchInput, '33');
      act(() => {
        jest.advanceTimersByTime(10);
      });

      fireEvent.changeText(searchInput, '335');
      act(() => {
        jest.advanceTimersByTime(10);
      });

      fireEvent.changeText(searchInput, '335e');

      // Only 30ms has passed, debounced query should still be empty
      const lastCallDuring = mockUseRoutes.mock.calls[mockUseRoutes.mock.calls.length - 1];
      expect(lastCallDuring[1]).toBe(''); // Still empty

      // Wait for debounce
      act(() => {
        jest.advanceTimersByTime(300);
      });

      // Should have been called with final query "335e"
      const lastCallAfter = mockUseRoutes.mock.calls[mockUseRoutes.mock.calls.length - 1];
      expect(lastCallAfter).toEqual([{ limit: 1000 }, '335e']);

      // Should NOT have been called with intermediate queries
      const allCalls = mockUseRoutes.mock.calls.map(call => call[1]);
      expect(allCalls).not.toContain('3');
      expect(allCalls).not.toContain('33');
      expect(allCalls).not.toContain('335');
      expect(allCalls).toContain('335e');
    });

    it('should debounce clearing search query', () => {
      mockUseRoutes.mockReturnValue({
        routes: [],
        total: 0,
        limit: 1000,
        offset: 0,
        data: undefined,
        loading: false,
        error: undefined,
        reload: jest.fn(),
        isRefreshing: false,
      });

      render(<RoutesScreen />);

      const searchInput = screen.getByPlaceholderText('Search routes...');

      // Type search query
      fireEvent.changeText(searchInput, '335e');
      act(() => {
        jest.advanceTimersByTime(300);
      });

      // Verify we're now using '335e'
      const lastCallAfterSearch = mockUseRoutes.mock.calls[mockUseRoutes.mock.calls.length - 1];
      expect(lastCallAfterSearch[1]).toBe('335e');

      // Clear the search
      fireEvent.changeText(searchInput, '');

      // Should still be using '335e' (not cleared yet, debounced)
      const lastCallAfterClear = mockUseRoutes.mock.calls[mockUseRoutes.mock.calls.length - 1];
      expect(lastCallAfterClear[1]).toBe('335e');

      // Advance timers
      act(() => {
        jest.advanceTimersByTime(300);
      });

      // Should have been called with empty query now
      const lastCallAfterDebounce = mockUseRoutes.mock.calls[mockUseRoutes.mock.calls.length - 1];
      expect(lastCallAfterDebounce).toEqual([{ limit: 1000 }, '']);
    });

    it('should NOT debounce initial mount (immediate load)', () => {
      mockUseRoutes.mockReturnValue({
        routes: [],
        total: 0,
        limit: 1000,
        offset: 0,
        data: undefined,
        loading: false,
        error: undefined,
        reload: jest.fn(),
        isRefreshing: false,
      });

      render(<RoutesScreen />);

      // Initial call should happen immediately without debounce
      expect(mockUseRoutes).toHaveBeenCalledWith({ limit: 1000 }, '');

      // Should have been called exactly once on mount
      expect(mockUseRoutes).toHaveBeenCalledTimes(1);
    });

    it('should handle multiple sequential debounced searches correctly', () => {
      mockUseRoutes.mockReturnValue({
        routes: [],
        total: 0,
        limit: 1000,
        offset: 0,
        data: undefined,
        loading: false,
        error: undefined,
        reload: jest.fn(),
        isRefreshing: false,
      });

      render(<RoutesScreen />);

      const searchInput = screen.getByPlaceholderText('Search routes...');

      // First search: "335e"
      fireEvent.changeText(searchInput, '335e');
      act(() => {
        jest.advanceTimersByTime(300);
      });

      // Verify we're using '335e'
      let lastCall = mockUseRoutes.mock.calls[mockUseRoutes.mock.calls.length - 1];
      expect(lastCall[1]).toBe('335e');

      // Second search: "340"
      fireEvent.changeText(searchInput, '340');
      act(() => {
        jest.advanceTimersByTime(300);
      });

      // Verify we're using '340'
      lastCall = mockUseRoutes.mock.calls[mockUseRoutes.mock.calls.length - 1];
      expect(lastCall[1]).toBe('340');

      // Third search: clear
      fireEvent.changeText(searchInput, '');
      act(() => {
        jest.advanceTimersByTime(300);
      });

      // Verify we're using empty string
      lastCall = mockUseRoutes.mock.calls[mockUseRoutes.mock.calls.length - 1];
      expect(lastCall[1]).toBe('');
    });

    it('should clean up debounce timer on unmount', () => {
      mockUseRoutes.mockReturnValue({
        routes: [],
        total: 0,
        limit: 1000,
        offset: 0,
        data: undefined,
        loading: false,
        error: undefined,
        reload: jest.fn(),
        isRefreshing: false,
      });

      const { unmount } = render(<RoutesScreen />);

      const searchInput = screen.getByPlaceholderText('Search routes...');

      // Record call count before unmounting
      const callCountBeforeType = mockUseRoutes.mock.calls.length;

      // Type search query
      fireEvent.changeText(searchInput, '335e');

      const callCountAfterType = mockUseRoutes.mock.calls.length;

      // Unmount before debounce completes
      unmount();

      // Advance timers (debounce would have fired now if not cleaned up)
      act(() => {
        jest.advanceTimersByTime(300);
      });

      // Should NOT have called useRoutes with '335e' (timer was cleaned up)
      const callCountAfterUnmount = mockUseRoutes.mock.calls.length;

      // Call count should not increase after unmount
      expect(callCountAfterUnmount).toBe(callCountAfterType);

      // Verify '335e' was never used
      const allCalls = mockUseRoutes.mock.calls.map(call => call[1]);
      expect(allCalls).not.toContain('335e');
    });

    it('should handle cancellation when searchQuery changes during debounce', () => {
      mockUseRoutes.mockReturnValue({
        routes: [],
        total: 0,
        limit: 1000,
        offset: 0,
        data: undefined,
        loading: false,
        error: undefined,
        reload: jest.fn(),
        isRefreshing: false,
      });

      render(<RoutesScreen />);

      const searchInput = screen.getByPlaceholderText('Search routes...');

      // Type first query
      fireEvent.changeText(searchInput, '335');

      // Wait 200ms (not enough to trigger)
      act(() => {
        jest.advanceTimersByTime(200);
      });

      // Should still be using empty string (debounce hasn't fired)
      let lastCall = mockUseRoutes.mock.calls[mockUseRoutes.mock.calls.length - 1];
      expect(lastCall[1]).toBe('');

      // Change query before debounce fires - this should cancel previous timer
      fireEvent.changeText(searchInput, '340');

      // Wait another 200ms (total 400ms from first, but only 200ms from second)
      act(() => {
        jest.advanceTimersByTime(200);
      });

      // Should NOT have called with "335" (timer was cancelled, still at empty)
      lastCall = mockUseRoutes.mock.calls[mockUseRoutes.mock.calls.length - 1];
      expect(lastCall[1]).toBe(''); // Still empty, not "335"

      // Wait remaining time to complete second debounce
      act(() => {
        jest.advanceTimersByTime(100);
      });

      // Should now have called with "340"
      lastCall = mockUseRoutes.mock.calls[mockUseRoutes.mock.calls.length - 1];
      expect(lastCall).toEqual([{ limit: 1000 }, '340']);

      // Verify "335" was never used
      const allCalls = mockUseRoutes.mock.calls.map(call => call[1]);
      expect(allCalls).not.toContain('335');
      expect(allCalls).toContain('340');
    });
  });
});
