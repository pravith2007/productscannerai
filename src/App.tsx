import { useState } from 'react';
import Layout, { type Page } from './components/Layout';
import Dashboard from './components/Dashboard';
import ScanProduct from './components/ScanProduct';
import InspectionsList from './components/InspectionsList';
import InspectionDetail from './components/InspectionDetail';
import CorrectiveActions from './components/CorrectiveActions';
import ProductHistory from './components/ProductHistory';
import RuleManager from './components/RuleManager';

type View =
  | { page: Page }
  | { page: 'inspection_detail'; passportId: string };

export default function App() {
  const [view, setView] = useState<View>({ page: 'dashboard' });

  const handleNavigate = (page: Page) => setView({ page });

  const handleOpenInspection = (passportId: string) => {
    setView({ page: 'inspection_detail', passportId });
  };

  const handleBackToList = () => setView({ page: 'inspections' });

  const handleInspectionComplete = (passportId: string) => {
    setView({ page: 'inspection_detail', passportId });
  };

  return (
    <Layout
      currentPage={view.page === 'inspection_detail' ? 'inspections' : view.page}
      onNavigate={handleNavigate}
    >
      {view.page === 'dashboard' && (
        <Dashboard onNavigate={handleNavigate} onOpenInspection={handleOpenInspection} />
      )}
      {view.page === 'scan' && (
        <ScanProduct onInspectionComplete={handleInspectionComplete} />
      )}
      {view.page === 'inspections' && (
        <InspectionsList onOpenInspection={handleOpenInspection} />
      )}
      {view.page === 'inspection_detail' && (
        <InspectionDetail passportId={view.passportId} onBack={handleBackToList} />
      )}
      {view.page === 'corrective' && (
        <CorrectiveActions onOpenInspection={handleOpenInspection} />
      )}
      {view.page === 'history' && (
        <ProductHistory onOpenInspection={handleOpenInspection} />
      )}
      {view.page === 'rules' && <RuleManager />}
    </Layout>
  );
}
