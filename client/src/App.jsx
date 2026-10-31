// Main React application: handles navigation and page routing.
import {BrowserRouter,Routes,Route} from 'react-router-dom';
import {AuthProvider} from './context/AuthContext';
import DashboardLayout from './components/layout/DashboardLayout';
import Dashboard from './pages/Dashboard';
import Login from './pages/Login';
import Register from './pages/Register';
import ResourcePage from './pages/ResourcePage';
import Subscriptions from './pages/Subscriptions';
import Invoices from './pages/Invoices';
import Payments from './pages/Payments';
import CustomerPortal from './pages/CustomerPortal';
import Quotations from './pages/Quotations';
import QuotationTemplates from './pages/QuotationTemplates';
import Discounts from './pages/Discounts';

export default function App(){return <AuthProvider><BrowserRouter><Routes><Route path="/login" element={<Login/>}/><Route path="/register" element={<Register/>}/><Route element={<DashboardLayout/>}><Route index element={<Dashboard/>}/><Route path="customers" element={<ResourcePage type="customers"/>}/><Route path="products" element={<ResourcePage type="products"/>}/><Route path="plans" element={<ResourcePage type="plans"/>}/><Route path="subscriptions" element={<Subscriptions/>}/><Route path="invoices" element={<Invoices/>}/><Route path="payments" element={<Payments/>}/><Route path="portal" element={<CustomerPortal/>}/><Route path="quotations" element={<Quotations/>}/><Route path="quotation-templates" element={<QuotationTemplates/>}/><Route path="discounts" element={<Discounts/>}/></Route><Route path="*" element={<div className="state full">Page not found</div>}/></Routes></BrowserRouter></AuthProvider>}
