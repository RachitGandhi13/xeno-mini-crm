import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import AppShell from '@/components/layout/AppShell';
import DashboardPage from '@/pages/DashboardPage';
import CampaignsPage from '@/pages/CampaignsPage';
import CustomersPage from '@/pages/CustomersPage';
import SegmentsPage from '@/pages/SegmentsPage';

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<AppShell />}>
          <Route index element={<DashboardPage />} />
          <Route path="campaigns" element={<CampaignsPage />} />
          <Route path="customers" element={<CustomersPage />} />
          <Route path="segments" element={<SegmentsPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
