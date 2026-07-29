import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { useAuth } from './auth/useAuth';
import { AuthPage } from './pages/AuthPage';
import { TripListPage } from './pages/TripListPage';
import { TripPlannerPage } from './pages/TripPlannerPage';
import { SavedItineraryPage } from './pages/SavedItineraryPage';

export default function App() {
  const { user, isLoading } = useAuth();
  if (isLoading) return <div className="md-empty page-pad">加载账号…</div>;
  if (!user) return <AuthPage />;

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
