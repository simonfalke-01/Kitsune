import { Navigate, Route, Routes } from 'react-router';

import { KitchenSinkPage } from '@/pages/kitchen-sink';

export function App() {
  return (
    <Routes>
      <Route element={<KitchenSinkPage />} path="/_kitchen" />
      <Route element={<Navigate replace to="/_kitchen" />} path="*" />
    </Routes>
  );
}
