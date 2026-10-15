import { Alert, Box, Link, Typography } from "@mui/material";
import { Link as RouterLink } from "@tanstack/react-router";
import { useProxyHealth } from "~/hooks/useProxyHealth";
import { getProxiedRequestsTodayCount } from "~/utils/article/tools";
import { getStoredCorsProxy, SELF_HOST_PROXY_URL } from "~/utils/net/corsProxy";
import { proxyProblemMessage } from "~/utils/net/proxyHealth";

/**
 * Non-blocking notice that the CORS proxy itself has stopped working (#86).
 * Says only what was observed; clears when a fetch or probe succeeds.
 */
export default function ProxyHealthBanner() {
  const health = useProxyHealth();
  if (!health.problem) return null;

  const usingDefaultProxy = !getStoredCorsProxy();
  const requestsToday = getProxiedRequestsTodayCount();

  return (
    <Alert severity="warning" data-testid="proxy-health-banner" sx={{ mb: 2, width: "100%" }}>
      <Typography variant="body2" data-testid="proxy-health-message">
        {proxyProblemMessage(health.problem, health.status)}
      </Typography>
      <Box sx={{ display: "flex", flexWrap: "wrap", gap: 2, mt: 0.5 }}>
        <Link component={RouterLink} to="/prefs" hash="cors-proxy" variant="body2">
          Proxy settings
        </Link>
        {usingDefaultProxy && (
          <Link href={SELF_HOST_PROXY_URL} target="_blank" rel="noopener noreferrer" variant="body2">
            Set up your own proxy
          </Link>
        )}
      </Box>
      {requestsToday > 0 && (
        <Typography variant="caption" color="text.secondary" component="div" sx={{ mt: 0.5 }}>
          This device sent ~{requestsToday} requests to the proxy today.
        </Typography>
      )}
    </Alert>
  );
}
