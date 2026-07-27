import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { TripListPage } from './pages/TripListPage';
import { TripPlannerPage } from './pages/TripPlannerPage';
import { SavedItineraryPage } from './pages/SavedItineraryPage';

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<TripListPage />} />
        <Route path="/trips/:tripId" element={<TripPlannerPage />} />
        <Route path="/trips/:tripId/saved" element={<SavedItineraryPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
