import { Route, Routes } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import PublicLayout from './components/PublicLayout';
import RequireSession from './components/RequireSession';
import HomePage from './pages/HomePage';
import DirectoryPage from './pages/DirectoryPage';
import ContactPage from './pages/ContactPage';
import RegisterPage from './pages/RegisterPage';
import LoginPage from './pages/LoginPage';
import PanelPage from './pages/PanelPage';
import NotFoundPage from './pages/NotFoundPage';
import AdminModule from './admin/AdminModule';

export default function App() {
  return (
    <Routes>
      <Route path="/admin/*" element={<AdminModule />} />
      <Route element={<AuthProvider><PublicLayout /></AuthProvider>}>
        <Route path="/" element={<HomePage />} />
        <Route path="/directorio" element={<DirectoryPage />} />
        <Route path="/contacto" element={<ContactPage />} />
        <Route path="/acceso" element={<LoginPage />} />
        <Route path="/registro" element={<RegisterPage />} />
        <Route element={<RequireSession />}>
          <Route path="/panel" element={<PanelPage />} />
        </Route>
        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  );
}