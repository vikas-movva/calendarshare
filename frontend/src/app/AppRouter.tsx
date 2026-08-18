import { createBrowserRouter, RouterProvider } from 'react-router-dom'
import AppLayout from './AppLayout'
import LandingPage from '../pages/LandingPage'
import DashboardPage from '../pages/DashboardPage'
import NewSharePage from '../pages/NewSharePage'
import SharesPage from '../pages/SharesPage'
import PublicSharePage from '../pages/PublicSharePage'
import HowPage from '../pages/HowPage'

const router = createBrowserRouter([
  {
    path: '/',
    element: <AppLayout />,
    children: [
      { index: true, element: <LandingPage /> },
      { path: 'how', element: <HowPage /> },
      { path: 'dashboard', element: <DashboardPage /> },
      { path: 'shares/new', element: <NewSharePage /> },
      { path: 'shares', element: <SharesPage /> },
      { path: 's/:token', element: <PublicSharePage /> },
    ],
  },
])

export default function App() {
  return <RouterProvider router={router} />
}