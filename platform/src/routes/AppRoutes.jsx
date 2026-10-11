import { Navigate, Route, Routes } from "react-router-dom";
import { PERMISSIONS } from "../auth/permissions";
import { AppShell } from "../components/layout/AppShell";
import { ProtectedRoute } from "../components/ProtectedRoute";
import { AdminCouponsPage } from "../pages/AdminCouponsPage.jsx";
import { UsersPage } from "../pages/UsersPage.jsx";
import { LoginPage } from "../pages/LoginPage";
import { ProfilePage } from "../pages/ProfilePage.jsx";
import { SetPasswordPage } from "../pages/SetPasswordPage.jsx";
import { SignupPage } from "../pages/SignupPage";
import { ExecutiveDashboardPage } from "../pages/dashboard/ExecutiveDashboardPage.jsx";
import { SuppliersPage } from "../pages/suppliers/SuppliersPage.jsx";
import { EntityExplorerPage } from "../pages/data/EntityExplorerPage.jsx";
import { ClientsPage } from "../pages/clients/ClientsPage.jsx";
import { MasterCatalogDashboardPage } from "../pages/master/MasterCatalogDashboardPage.jsx";
import { BrandsPage } from "../pages/master/BrandsPage.jsx";
import { BrandWorkspacePage } from "../pages/master/BrandWorkspacePage.jsx";
import { MasterCampaignsPage } from "../pages/master/MasterCampaignsPage.jsx";
import { AssignCampaignsPage } from "../pages/master/AssignCampaignsPage.jsx";
import { AssignmentReviewPage } from "../pages/master/AssignmentReviewPage.jsx";
import { NewCodeAlertsPage } from "../pages/master/NewCodeAlertsPage.jsx";
import { MasterCatalogGuidePage } from "../pages/master/MasterCatalogGuidePage.jsx";
import { ClientSetupPage } from "../pages/clients/ClientSetupPage.jsx";
import { ClientAgreementPage } from "../pages/clients/ClientAgreementPage.jsx";
import { ClientApiPage } from "../pages/clients/ClientApiPage.jsx";
import { ClientPortalPage } from "../pages/clients/ClientPortalPage.jsx";
import { ClientCatalogPage } from "../pages/clients/ClientCatalogPage.jsx";
import { ClientActivationPage } from "../pages/clients/ClientActivationPage.jsx";
import { ActivationReviewPage } from "../pages/clients/ActivationReviewPage.jsx";
import { ClientOpsGuidePage } from "../pages/clients/ClientOpsGuidePage.jsx";
import { ClientCampaignsPage } from "../pages/clients/ClientCampaignsPage.jsx";
import { AssignmentsPage } from "../pages/clients/AssignmentsPage.jsx";
import { PortalOverviewPage } from "../pages/portal/PortalOverviewPage.jsx";
import { PortalCampaignsPage } from "../pages/portal/PortalCampaignsPage.jsx";
import { PortalPerformancePage } from "../pages/portal/PortalPerformancePage.jsx";
import { PortalPaymentsPage } from "../pages/portal/PortalPaymentsPage.jsx";
import { PortalPayableStatementsPage } from "../pages/portal/PortalPayableStatementsPage.jsx";
import { PortalWithdrawalRequestsPage } from "../pages/portal/PortalWithdrawalRequestsPage.jsx";
import { PortalOrdersPage } from "../pages/portal/PortalOrdersPage.jsx";
import { PortalProductsPage } from "../pages/portal/PortalProductsPage.jsx";
import { PortalPaymentStatusPage } from "../pages/portal/PortalPaymentStatusPage.jsx";
import { PortalSupportPage } from "../pages/portal/PortalSupportPage.jsx";
import { PortalSettingsPage } from "../pages/portal/PortalSettingsPage.jsx";
import { TrackingLinksPage } from "../pages/commercial/TrackingLinksPage.jsx";
import { CommissionRulesPage } from "../pages/commercial/CommissionRulesPage.jsx";
import { AccessLogsPage } from "../pages/platform/AccessLogsPage.jsx";
import { IntegrationsPage } from "../pages/platform/IntegrationsPage.jsx";
import { ExceptionQueuePage } from "../pages/ops/ExceptionQueuePage.jsx";
import { MappingReviewPage } from "../pages/ops/MappingReviewPage.jsx";
import { FinanceOpsPage } from "../pages/ops/FinanceOpsPage.jsx";
import { ReconciliationPage } from "../pages/ops/ReconciliationPage.jsx";
import { ProductAdminPage } from "../pages/ops/ProductAdminPage.jsx";
import { AdminPerformancePage } from "../pages/ops/AdminPerformancePage.jsx";
import { AdminReportingOverviewPage } from "../pages/ops/AdminReportingOverviewPage.jsx";
import { AdminClientOverviewPage } from "../pages/ops/AdminClientOverviewPage.jsx";
import { AdminClientRawPerformancePage } from "../pages/ops/AdminClientRawPerformancePage.jsx";
import { AdminConfirmedOrdersPage } from "../pages/ops/AdminConfirmedOrdersPage.jsx";
import { AdminClientPerformancePage } from "../pages/ops/AdminClientPerformancePage.jsx";
import { AdminClientConfirmedOrdersPage } from "../pages/ops/AdminClientConfirmedOrdersPage.jsx";
import { AdminOrdersPage } from "../pages/ops/AdminOrdersPage.jsx";
import { AdminPaymentStatusPage } from "../pages/ops/AdminPaymentStatusPage.jsx";
import { AdminNetworkBillingPage } from "../pages/ops/AdminNetworkBillingPage.jsx";
import { AdminNetworkPaymentsReceivedPage } from "../pages/ops/AdminNetworkPaymentsReceivedPage.jsx";
import { AdminMboReceiptsPage } from "../pages/ops/AdminMboReceiptsPage.jsx";
import { AdminClientSettlementsPage } from "../pages/ops/AdminClientSettlementsPage.jsx";
import { SourceSchemaPage } from "../pages/ops/SourceSchemaPage.jsx";
import { MappingRulesPage } from "../pages/ops/MappingRulesPage.jsx";
import { MboNamingStandardPage } from "../pages/ops/MboNamingStandardPage.jsx";
import { OffersPromotionsPage } from "../pages/ops/OffersPromotionsPage.jsx";
import { DataQualityPage } from "../pages/ops/SystemHealthPage.jsx";
import { NetworkCouponPoolPage } from "../pages/ops/NetworkCouponPoolPage.jsx";
import { NetworkConfirmedOrdersPage } from "../pages/ops/NetworkConfirmedOrdersPage.jsx";
import { NetworkPaidOrdersPage } from "../pages/ops/NetworkPaidOrdersPage.jsx";
import { NetworkGuidePage } from "../pages/ops/NetworkGuidePage.jsx";
import { AllNetworkDataPage } from "../pages/ops/AllNetworkDataPage.jsx";
import { SupplierCommissionRulesPage } from "../pages/ops/SupplierCommissionRulesPage.jsx";
import { NetworkTrackingLinksPage } from "../pages/ops/NetworkTrackingLinksPage.jsx";
import { FullRawPayloadPage } from "../pages/ops/FullRawPayloadPage.jsx";
import { SyncRunHistoryPage } from "../pages/ops/SyncRunHistoryPage.jsx";
import { NetworkAccountsPage } from "../pages/network/NetworkAccountsPage.jsx";
import { NetworkAccountDetailPage } from "../pages/network/NetworkAccountDetailPage.jsx";
import { ApiCredentialsPage } from "../pages/integrity/ApiCredentialsPage.jsx";
import { CampaignsPage as NetworkCampaignsPage } from "../pages/network/campaigns/CampaignsPage.jsx";
import { CampaignDetailPage as NetworkCampaignDetailPage } from "../pages/network/campaigns/CampaignDetailPage.jsx";
import { CommissionRulesPage as NetworkCommissionRulesPage } from "../pages/network/commissionRules/CommissionRulesPage.jsx";
import { NetworkCouponsPage } from "../pages/network/couponsVouchers/NetworkCouponsPage.jsx";
import { NetworkProductsFeedsPage } from "../pages/network/productsFeeds/NetworkProductsFeedsPage.jsx";
import { NetworkPerformanceReportsPage } from "../pages/network/performance/NetworkPerformanceReportsPage.jsx";
import { NetworkOrdersPage } from "../pages/network/orders/NetworkOrdersPage.jsx";
import { AllNetworkDataPage as NetworkAllDataPage } from "../pages/network/allNetworkData/AllNetworkDataPage.jsx";
import { NetworkTrackingLinksPage as NetworkTrackingLinksRegistryPage } from "../pages/network/trackingLinks/NetworkTrackingLinksPage.jsx";
import { SupplierTrackingLinksPage } from "../pages/network/supplierTrackingLinks/SupplierTrackingLinksPage.jsx";

function Protected({ permissions = [], element }) {
  return <ProtectedRoute permissions={permissions}>{element}</ProtectedRoute>;
}

const portalPerm = [PERMISSIONS.PORTAL_CAMPAIGNS_READ];

export function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/signup" element={<SignupPage />} />
      <Route path="/set-password" element={<SetPasswordPage />} />

      <Route element={<ProtectedRoute />}>
        <Route element={<AppShell />}>
        <Route index element={<ExecutiveDashboardPage />} />
        <Route
          path="master/dashboard"
          element={<Protected permissions={[PERMISSIONS.CAMPAIGNS_READ]} element={<MasterCatalogDashboardPage />} />}
        />
        <Route
          path="master/brands"
          element={<Protected permissions={[PERMISSIONS.CAMPAIGNS_READ]} element={<BrandsPage />} />}
        />
        <Route
          path="master/brands/:brandKey"
          element={<Protected permissions={[PERMISSIONS.CAMPAIGNS_READ]} element={<BrandWorkspacePage />} />}
        />
        <Route
          path="master/campaigns"
          element={<Protected permissions={[PERMISSIONS.CAMPAIGNS_READ]} element={<MasterCampaignsPage />} />}
        />
        <Route
          path="master/sources"
          element={<Navigate to="/master/campaigns" replace />}
        />
        <Route
          path="master/assign"
          element={<Protected permissions={[PERMISSIONS.CLIENTS_READ]} element={<AssignCampaignsPage />} />}
        />
        <Route
          path="master/review"
          element={<Protected permissions={[PERMISSIONS.CLIENTS_READ]} element={<AssignmentReviewPage />} />}
        />
        <Route
          path="master/code-alerts"
          element={<Protected permissions={[PERMISSIONS.COUPONS_READ]} element={<NewCodeAlertsPage />} />}
        />
        <Route
          path="master/guide"
          element={<Protected permissions={[PERMISSIONS.CAMPAIGNS_READ]} element={<MasterCatalogGuidePage />} />}
        />
        <Route path="suppliers" element={<Protected permissions={[PERMISSIONS.CAMPAIGNS_READ]} element={<SuppliersPage />} />} />
        {/* Network Operations. Gates mirror the backend route guards:
            GET /suppliers + /suppliers/:key = campaigns:read, GET /marketplace/accounts = integrations:read. */}
        <Route path="network/accounts" element={<Protected permissions={[PERMISSIONS.CAMPAIGNS_READ]} element={<NetworkAccountsPage />} />} />
        <Route path="network/accounts/:key" element={<Protected permissions={[PERMISSIONS.CAMPAIGNS_READ]} element={<NetworkAccountDetailPage />} />} />
        <Route path="integrity/api-credentials" element={<Protected permissions={[PERMISSIONS.INTEGRATIONS_READ]} element={<ApiCredentialsPage />} />} />
        {/* GET /ops/admin/campaigns and /ops/admin/campaigns/:id = catalog:read. */}
        <Route path="network/campaigns" element={<Protected permissions={[PERMISSIONS.CATALOG_READ]} element={<NetworkCampaignsPage />} />} />
        <Route path="network/campaigns/:id" element={<Protected permissions={[PERMISSIONS.CATALOG_READ]} element={<NetworkCampaignDetailPage />} />} />
        {/* GET /ops/admin/supplier-commission-rules = commission:read. */}
        <Route path="network/commission-rules" element={<Protected permissions={[PERMISSIONS.COMMISSION_READ]} element={<NetworkCommissionRulesPage />} />} />
        {/* GET /supplier-coupons = coupons:read. */}
        <Route path="network/coupons" element={<Protected permissions={[PERMISSIONS.COUPONS_READ]} element={<NetworkCouponsPage />} />} />
        {/* GET /ops/admin/tracking-links = tracking:read. */}
        <Route path="network/tracking-links" element={<Protected permissions={[PERMISSIONS.TRACKING_READ]} element={<NetworkTrackingLinksRegistryPage />} />} />
        <Route path="network/supplier-tracking-links" element={<Protected permissions={[PERMISSIONS.TRACKING_READ]} element={<SupplierTrackingLinksPage />} />} />
        {/* GET /ops/admin/product-feeds = products:read. GET /ops/products writes during a GET and is never called. */}
        <Route path="network/products" element={<Protected permissions={[PERMISSIONS.PRODUCTS_READ]} element={<NetworkProductsFeedsPage />} />} />
        {/* GET /ops/admin/performance?grain=network = performance:read. */}
        <Route path="network/performance" element={<Protected permissions={[PERMISSIONS.PERFORMANCE_READ]} element={<NetworkPerformanceReportsPage />} />} />
        {/* GET /ops/admin/orders = conversions:read. */}
        <Route path="network/orders" element={<Protected permissions={[PERMISSIONS.CONVERSIONS_READ]} element={<NetworkOrdersPage />} />} />
        {/* GET /ops/imported-records only. campaigns:read is the route baseline (campaign is the default
            record type); the backend enforces the per-type permission on every request. */}
        <Route path="network/data" element={<Protected permissions={[PERMISSIONS.CAMPAIGNS_READ]} element={<NetworkAllDataPage />} />} />
        {/* Network Operations paths that resolve to the existing built pages. */}
        <Route path="network" element={<Navigate to="/" replace />} />
        <Route path="network/offers" element={<Navigate to="/ops/network/offers" replace />} />
        <Route path="finance/payment-status" element={<Navigate to="/ops/admin/payment-status" replace />} />
        <Route path="finance/invoices" element={<Navigate to="/ops/admin/network-billing" replace />} />
        <Route path="finance/payments" element={<Navigate to="/ops/admin/network-payments-received" replace />} />
        <Route path="finance/receipts" element={<Navigate to="/ops/admin/mbo-receipts" replace />} />
        <Route path="finance/reconciliation" element={<Navigate to="/ops/reconciliation" replace />} />
        <Route path="integrity/exceptions" element={<Navigate to="/ops/exceptions" replace />} />
        <Route path="integrity/raw-payloads" element={<Navigate to="/ops/network/raw-payload" replace />} />
        <Route path="integrity/sync-runs" element={<Navigate to="/ops/sync-runs" replace />} />
        <Route path="integrity/source-schema" element={<Navigate to="/ops/network/source-schema" replace />} />
        <Route path="integrity/mapping-rules" element={<Navigate to="/ops/network/mapping-rules" replace />} />
        <Route path="integrity/naming-standard" element={<Navigate to="/ops/network/naming-standard" replace />} />
        <Route path="integrity/tech-guide" element={<Navigate to="/ops/network/guide" replace />} />
        <Route path="catalog/brands" element={<Navigate to="/master/brands" replace />} />
        <Route path="catalog/campaigns" element={<Navigate to="/master/campaigns" replace />} />
        <Route path="catalog/assign" element={<Navigate to="/master/assign" replace />} />
        <Route path="catalog/assignment-review" element={<Navigate to="/master/review" replace />} />
        <Route path="catalog/new-code-alerts" element={<Navigate to="/master/code-alerts" replace />} />
        <Route path="data/entities" element={<Protected permissions={[PERMISSIONS.CAMPAIGNS_READ]} element={<EntityExplorerPage />} />} />
        <Route path="clients" element={<Protected permissions={[PERMISSIONS.CLIENTS_READ]} element={<ClientsPage />} />} />
        <Route
          path="clients/setup"
          element={<Protected permissions={[PERMISSIONS.CLIENTS_READ]} element={<ClientSetupPage />} />}
        />
        <Route
          path="clients/:clientId/setup"
          element={<Protected permissions={[PERMISSIONS.CLIENTS_READ]} element={<ClientSetupPage />} />}
        />
        <Route
          path="clients/:clientId/agreement"
          element={<Protected permissions={[PERMISSIONS.CLIENTS_READ]} element={<ClientAgreementPage />} />}
        />
        <Route
          path="clients/:clientId/api"
          element={<Protected permissions={[PERMISSIONS.CLIENTS_READ]} element={<ClientApiPage />} />}
        />
        <Route
          path="clients/:clientId/portal"
          element={<Protected permissions={[PERMISSIONS.CLIENTS_READ]} element={<ClientPortalPage />} />}
        />
        <Route
          path="clients/:clientId/catalog"
          element={<Protected permissions={[PERMISSIONS.CLIENTS_READ]} element={<ClientCatalogPage />} />}
        />
        <Route
          path="clients/:clientId/activation"
          element={<Protected permissions={[PERMISSIONS.CLIENTS_READ]} element={<ClientActivationPage />} />}
        />
        <Route path="clients/:clientId" element={<Navigate to="setup" replace />} />
        <Route path="assignments" element={<Protected permissions={[PERMISSIONS.CLIENTS_READ]} element={<ClientCampaignsPage />} />} />
        <Route
          path="activation-review"
          element={<Protected permissions={[PERMISSIONS.CLIENTS_READ]} element={<ActivationReviewPage />} />}
        />
        <Route
          path="clients/guide"
          element={<Protected permissions={[PERMISSIONS.CLIENTS_READ]} element={<ClientOpsGuidePage />} />}
        />
        <Route path="assignments/ledger" element={<Protected permissions={[PERMISSIONS.CLIENTS_READ]} element={<AssignmentsPage />} />} />
        <Route path="portal" element={<Protected permissions={portalPerm} element={<PortalOverviewPage />} />} />
        <Route path="portal/campaigns" element={<Protected permissions={portalPerm} element={<PortalCampaignsPage />} />} />
        <Route
          path="portal/performance"
          element={<Protected permissions={[PERMISSIONS.PORTAL_PERFORMANCE_READ, PERMISSIONS.PORTAL_CAMPAIGNS_READ]} element={<PortalPerformancePage />} />}
        />
        <Route
          path="portal/orders"
          element={<Protected permissions={[PERMISSIONS.PORTAL_CAMPAIGNS_READ]} element={<PortalOrdersPage />} />}
        />
        <Route
          path="portal/products"
          element={<Protected permissions={[PERMISSIONS.PORTAL_CAMPAIGNS_READ]} element={<PortalProductsPage />} />}
        />
        <Route
          path="portal/payment-status"
          element={<Protected permissions={[PERMISSIONS.PORTAL_PAYMENTS_READ, PERMISSIONS.PORTAL_CAMPAIGNS_READ]} element={<PortalPaymentStatusPage />} />}
        />
        <Route
          path="portal/payments"
          element={<Protected permissions={[PERMISSIONS.PORTAL_PAYMENTS_READ, PERMISSIONS.PORTAL_CAMPAIGNS_READ]} element={<PortalPaymentsPage />} />}
        />
        <Route
          path="portal/payable-statements"
          element={<Protected permissions={[PERMISSIONS.PORTAL_PAYMENTS_READ, PERMISSIONS.PORTAL_CAMPAIGNS_READ]} element={<PortalPayableStatementsPage />} />}
        />
        <Route
          path="portal/withdrawal-requests"
          element={<Protected permissions={[PERMISSIONS.PORTAL_PAYMENTS_READ, PERMISSIONS.PORTAL_CAMPAIGNS_READ]} element={<PortalWithdrawalRequestsPage />} />}
        />
        <Route
          path="portal/support"
          element={<Protected permissions={[PERMISSIONS.PORTAL_SUPPORT, PERMISSIONS.PORTAL_CAMPAIGNS_READ]} element={<PortalSupportPage />} />}
        />
        <Route
          path="portal/settings"
          element={<Protected permissions={[PERMISSIONS.PORTAL_SETTINGS_READ, PERMISSIONS.PORTAL_CAMPAIGNS_READ]} element={<PortalSettingsPage />} />}
        />
        <Route path="tracking-links" element={<Protected permissions={[PERMISSIONS.TRACKING_READ]} element={<TrackingLinksPage />} />} />
        <Route path="ops/exceptions" element={<Protected permissions={[PERMISSIONS.EXCEPTIONS_READ]} element={<ExceptionQueuePage />} />} />
        <Route path="ops/mapping-review" element={<Protected permissions={[PERMISSIONS.EXCEPTIONS_READ]} element={<MappingReviewPage />} />} />
        <Route path="ops/sync-runs" element={<Protected permissions={[PERMISSIONS.OPS_READ]} element={<SyncRunHistoryPage />} />} />
        <Route path="ops/finance" element={<Protected permissions={[PERMISSIONS.FINANCE_OPS_READ]} element={<FinanceOpsPage />} />} />
        <Route path="ops/reconciliation" element={<Protected permissions={[PERMISSIONS.FINANCE_OPS_READ]} element={<ReconciliationPage />} />} />
        <Route path="ops/products" element={<Protected permissions={[PERMISSIONS.PRODUCTS_READ]} element={<ProductAdminPage />} />} />
        <Route
          path="ops/admin/performance"
          element={<Protected permissions={[PERMISSIONS.PERFORMANCE_READ]} element={<AdminPerformancePage />} />}
        />
        <Route
          path="ops/admin/reporting-overview"
          element={
            <Protected permissions={[PERMISSIONS.PERFORMANCE_READ]} element={<AdminReportingOverviewPage />} />
          }
        />
        <Route
          path="ops/admin/client-raw-performance"
          element={
            <Protected permissions={[PERMISSIONS.PERFORMANCE_READ]} element={<AdminClientRawPerformancePage />} />
          }
        />
        <Route
          path="ops/admin/confirmed-orders"
          element={
            <Protected permissions={[PERMISSIONS.CONVERSIONS_READ]} element={<AdminConfirmedOrdersPage />} />
          }
        />
        <Route
          path="ops/admin/client-overview"
          element={<Protected permissions={[PERMISSIONS.PERFORMANCE_READ]} element={<AdminClientOverviewPage />} />}
        />
        <Route
          path="ops/admin/client-performance"
          element={<Protected permissions={[PERMISSIONS.PERFORMANCE_READ]} element={<AdminClientPerformancePage />} />}
        />
        <Route
          path="ops/admin/client-confirmed-orders"
          element={
            <Protected permissions={[PERMISSIONS.CONVERSIONS_READ]} element={<AdminClientConfirmedOrdersPage />} />
          }
        />
        <Route path="ops/admin/orders" element={<Protected permissions={[PERMISSIONS.CONVERSIONS_READ]} element={<AdminOrdersPage />} />} />
        <Route
          path="ops/admin/payment-status"
          element={<Protected permissions={[PERMISSIONS.FINANCE_OPS_READ]} element={<AdminPaymentStatusPage />} />}
        />
        <Route
          path="ops/admin/network-billing"
          element={<Protected permissions={[PERMISSIONS.FINANCE_OPS_READ]} element={<AdminNetworkBillingPage />} />}
        />
        <Route
          path="ops/admin/network-payments-received"
          element={<Protected permissions={[PERMISSIONS.FINANCE_OPS_READ]} element={<AdminNetworkPaymentsReceivedPage />} />}
        />
        <Route
          path="ops/admin/mbo-receipts"
          element={<Protected permissions={[PERMISSIONS.FINANCE_OPS_READ]} element={<AdminMboReceiptsPage />} />}
        />
        <Route
          path="ops/admin/client-settlements"
          element={<Protected permissions={[PERMISSIONS.FINANCE_OPS_READ]} element={<AdminClientSettlementsPage />} />}
        />
        <Route path="ops/health" element={<Navigate to="/suppliers" replace />} />
        <Route path="ops/data-quality" element={<Protected permissions={[PERMISSIONS.OPS_READ]} element={<DataQualityPage />} />} />
        <Route
          path="ops/network/coupon-pool"
          element={
            <Protected
              permissions={[PERMISSIONS.COUPONS_READ, PERMISSIONS.COUPONS_WRITE]}
              element={<NetworkCouponPoolPage />}
            />
          }
        />
        <Route
          path="ops/network/tracking-links"
          element={
            <Protected permissions={[PERMISSIONS.TRACKING_READ]} element={<NetworkTrackingLinksPage />} />
          }
        />
        <Route
          path="ops/network/offers"
          element={<Protected permissions={[PERMISSIONS.COUPONS_READ]} element={<OffersPromotionsPage />} />}
        />
        <Route
          path="ops/network/source-schema"
          element={<Protected permissions={[PERMISSIONS.OPS_READ]} element={<SourceSchemaPage />} />}
        />
        <Route
          path="ops/network/naming-standard"
          element={<Protected permissions={[PERMISSIONS.OPS_READ]} element={<MboNamingStandardPage />} />}
        />
        <Route
          path="ops/network/confirmed-orders"
          element={<Protected permissions={[PERMISSIONS.CONVERSIONS_READ]} element={<NetworkConfirmedOrdersPage />} />}
        />
        <Route
          path="ops/network/paid-orders"
          element={<Protected permissions={[PERMISSIONS.CONVERSIONS_READ]} element={<NetworkPaidOrdersPage />} />}
        />
        <Route
          path="ops/network/guide"
          element={<Protected permissions={[PERMISSIONS.CAMPAIGNS_READ]} element={<NetworkGuidePage />} />}
        />
        <Route
          path="ops/network/all-data"
          element={<Protected permissions={[PERMISSIONS.CAMPAIGNS_READ]} element={<AllNetworkDataPage />} />}
        />
        <Route
          path="ops/network/supplier-commission-rules"
          element={
            <Protected permissions={[PERMISSIONS.COMMISSION_READ]} element={<SupplierCommissionRulesPage />} />
          }
        />
        <Route
          path="ops/network/raw-payload"
          element={<Protected permissions={[PERMISSIONS.OPS_READ]} element={<FullRawPayloadPage />} />}
        />
        <Route path="commission-rules" element={<Protected permissions={[PERMISSIONS.COMMISSION_MANAGE]} element={<CommissionRulesPage />} />} />
        <Route
          path="ops/network/mapping-rules"
          element={<Protected permissions={[PERMISSIONS.OPS_READ]} element={<MappingRulesPage />} />}
        />
        <Route path="ops/network/confirmed-orders" element={<Navigate to="/ops/admin/orders" replace />} />
        <Route path="ops/network/paid-orders" element={<Navigate to="/ops/admin/orders" replace />} />
        <Route path="platform/logs" element={<Protected permissions={[PERMISSIONS.LOGS_READ]} element={<AccessLogsPage />} />} />
        <Route path="integrations" element={<Protected permissions={[PERMISSIONS.INTEGRATIONS_READ]} element={<IntegrationsPage />} />} />
        <Route path="admin/coupons" element={<Protected permissions={[PERMISSIONS.COUPONS_WRITE]} element={<AdminCouponsPage />} />} />
        <Route path="users" element={<Protected permissions={[PERMISSIONS.USERS_MANAGE]} element={<UsersPage />} />} />
        <Route path="profile" element={<ProfilePage />} />
        <Route path="dashboard" element={<Navigate to="/" replace />} />
        <Route path="dashboard/integrations" element={<Navigate to="/integrations" replace />} />
        <Route path="admin/users" element={<Navigate to="/users" replace />} />
        </Route>
      </Route>

      <Route path="*" element={<Navigate to="/login" replace />} />
    </Routes>
  );
}
