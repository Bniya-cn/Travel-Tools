import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { TripListPage } from './pages/TripListPage';
import { TripPlannerPage } from './pages/TripPlannerPage';

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<TripListPage />} />
        <Route path="/trips/:tripId" element={<TripPlannerPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
