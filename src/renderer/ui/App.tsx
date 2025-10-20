import React from 'react';
import { Sidebar } from './Sidebar';
import { RouterProvider, createBrowserRouter } from 'react-router-dom';
import { Clients } from './pages/Clients';
import { Projects } from './pages/Projects';
import { Services } from './pages/Services';
import { Analytics } from './pages/Analytics';
import { Settings } from './pages/Settings';

const router = createBrowserRouter([
  { path: '/', element: <Projects /> },
  { path: '/clients', element: <Clients /> },
  { path: '/projects', element: <Projects /> },
  { path: '/services', element: <Services /> },
  { path: '/analytics', element: <Analytics /> },
  { path: '/settings', element: <Settings /> },
]);

export function App(): JSX.Element {
  return (
    <div className="layout">
      <Sidebar />
      <main>
        <RouterProvider router={router} />
      </main>
    </div>
  );
}
