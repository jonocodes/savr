import { Alert, Box, Link, Typography } from "@mui/material";
import { Link as RouterLink } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { useProxyHealth } from "~/hooks/useProxyHealth";
import { getProxiedRequestsTodayCount } from "~/utils/article/tools";
import { getExtensionUrls } from "~/config/environment";
import { getStoredCorsProxy, SELF_HOST_PROXY_URL } from "~/utils/net/corsProxy";
import { isPWAMode, isTouchOnlyDevice } from "~/utils/net/network";
import { proxyProblemMessage } from "~/utils/net/proxyHealth";

/**
 * Non-blocking notice that the CORS proxy itself has stopped working (#86).
 * Says only what was observed; clears when a fetch or probe succeeds.
 */
export default function ProxyHealthBanner() {
  const health = useProxyHealth();
  const { t } = useTranslation();
  if (!health.problem) return null;

  const usingDefaultProxy = !getStoredCorsProxy();
  const requestsToday = getProxiedRequestsTodayCount();
  // Same gate as the extension row in Preferences: desktop browsers only.
  const extensionUrls = getExtensionUrls();
  const offerExtension =
    !isPWAMode() && !isTouchOnlyDevice() && !!(extensionUrls.firefoxUrl || extensionUrls.chromeUrl);

  return (
    <Alert severity="warning" data-testid="proxy-health-banner" sx={{ mb: 2, width: "100%" }}>
      <Typography variant="body2" data-testid="proxy-health-message">
        {proxyProblemMessage(t, health.problem, health.status)}
      </Typography>
      <Box sx={{ display: "flex", flexWrap: "wrap", gap: 2, mt: 0.5 }}>
        <Link component={RouterLink} to="/prefs" hash="cors-proxy" variant="body2">
          {t("common.proxyHealth.proxySettings")}
        </Link>
        {usingDefaultProxy && (
          <Link href={SELF_HOST_PROXY_URL} target="_blank" rel="noopener noreferrer" variant="body2">
            {t("common.proxyHealth.selfHost")}
          </Link>
        )}
      </Box>
      {offerExtension && (
        <Typography variant="body2" sx={{ mt: 0.5 }} data-testid="proxy-health-extension-hint">
          {t("common.proxyHealth.extensionHintBefore")}{" "}
          <Link component={RouterLink} to="/prefs" hash="browser-extension">
            {t("common.proxyHealth.extensionHintLink")}
          </Link>{" "}
          {t("common.proxyHealth.extensionHintAfter")}
        </Typography>
      )}
      {requestsToday > 0 && (
        <Typography variant="caption" color="text.secondary" component="div" sx={{ mt: 0.5 }}>
          {t("common.proxyHealth.bannerRequestsToday", { count: requestsToday })}
        </Typography>
      )}
    </Alert>
  );
}
