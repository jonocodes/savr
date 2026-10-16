import { Link } from "@tanstack/react-router";
import { ReactNode } from "react";
import { useTranslation } from "react-i18next";

export function NotFound({ children }: { children?: ReactNode }) {
  const { t } = useTranslation();
  return (
    <div className="space-y-2 p-2">
      <div className="text-gray-600 dark:text-gray-400">
        {children || <p>{t("common.notFoundMessage")}</p>}
        <p>{t("common.currentUrl", { url: window.location.href })}</p>
      </div>
      <p className="flex items-center gap-2 flex-wrap">
        <button
          onClick={() => window.history.back()}
          className="bg-emerald-500 text-white px-2 py-1 rounded uppercase font-black text-sm"
        >
          {t("common.goBack")}
        </button>
        <Link
          to="/"
          className="bg-cyan-600 text-white px-2 py-1 rounded uppercase font-black text-sm"
        >
          {t("common.startOver")}
        </Link>
      </p>
    </div>
  );
}
